// Posição das lojas para o mapa Machine Pay (ver models/LojaLocalizacao.js).
//
// GPS: o RoteiroLocationTracker manda a posição do celular a cada ~10 s durante
// o roteiro, mas roteiros_localizacoes guarda só a ÚLTIMA posição de cada
// funcionário. Por isso o ponto é capturado na hora em que a movimentação é
// registrada (registrarGpsDaMovimentacao) - UMA VEZ por loja: depois que a loja
// tem posição por GPS (ou corrigida à mão) as próximas movimentações nem
// consultam o banco. "Tirar correção" apaga o GPS e a próxima visita grava de novo.
// A rodada periódica também aproveita as últimas posições gravadas que coincidem
// com uma movimentação, só para lojas ainda sem GPS.
//
// Endereço: Google Geocoding se a chave tiver a API ativada (GOOGLE_GEOCODING_API_KEY,
// ou a GOOGLE_GEOLOCATION_API_KEY), senão OpenStreetMap/Nominatim (grátis, 1 consulta/s).
// Desligue a geocodificação com LOJA_GEOCODIFICACAO_ATIVA=false.
import { Op, QueryTypes } from "sequelize";
import { Loja, LojaLocalizacao, RoteiroLocalizacao, sequelize } from "../models/index.js";

const JANELA_ANTES_MS = 3 * 60 * 1000; // posição até 3 min antes da movimentação
const JANELA_DEPOIS_MS = 60 * 1000;
const PRECISAO_MAXIMA_M = 100; // GPS pior que isso (dentro de prédio) é ignorado
const VELOCIDADE_MAXIMA_MS = 3; // andando de carro não está na loja
const INTERVALO_APROVEITAR_MS = 30 * 60 * 1000;
const MAX_GEOCODIFICACOES_POR_RODADA = 40;
const MAX_GEOCODIFICACOES_GOOGLE = 500;
const NOVA_TENTATIVA_ERRO_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 10000;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "ClubKids-MapaMachinePay/1.0";

let rodadaEmAndamento = null;
// Pedido feito durante uma rodada (ex.: loja salva): roda de novo no fim,
// porque a rodada atual pode ter lido o endereço antigo.
let rodadaPendente = false;
let ultimoAproveitamento = 0;
let googleRecusado = false; // chave sem a Geocoding API: usa só o OSM até reiniciar
// Lojas que já têm GPS ou correção manual (carregado do banco uma vez).
let lojasPosicionadas = null;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Posição final da loja: manual > GPS > endereço.
export function posicaoDaLoja(linha) {
  if (!linha) return null;
  if (linha.manualLat != null && linha.manualLng != null) {
    return { lat: linha.manualLat, lng: linha.manualLng, origem: "manual", em: linha.manualEm };
  }
  if (linha.gpsLat != null && linha.gpsLng != null) {
    return {
      lat: linha.gpsLat,
      lng: linha.gpsLng,
      origem: "gps",
      em: linha.gpsEm,
    };
  }
  if (linha.enderecoStatus === "ok" && linha.enderecoLat != null && linha.enderecoLng != null) {
    return {
      lat: linha.enderecoLat,
      lng: linha.enderecoLng,
      origem: linha.enderecoPrecisao === "cidade" ? "cidade" : "endereco",
      em: linha.enderecoEm,
    };
  }
  return null;
}

export async function mapaPosicoesLojas() {
  const linhas = await LojaLocalizacao.findAll({ raw: true });
  return new Map(linhas.map((l) => [l.lojaId, posicaoDaLoja(l)]));
}

// ---- GPS ----

async function carregarLojasPosicionadas() {
  if (!lojasPosicionadas) {
    const linhas = await LojaLocalizacao.findAll({
      where: { [Op.or]: [{ gpsLat: { [Op.ne]: null } }, { manualLat: { [Op.ne]: null } }] },
      attributes: ["lojaId"],
      raw: true,
    });
    lojasPosicionadas = new Set(linhas.map((l) => l.lojaId));
  }
  return lojasPosicionadas;
}

// Grava o GPS da loja só se ela ainda não tiver (nunca troca um já gravado).
async function gravarPrimeiroGps(lojaId, ponto) {
  const [linha] = await LojaLocalizacao.findOrCreate({ where: { lojaId } });
  const posicionadas = await carregarLojasPosicionadas();
  if (linha.gpsLat != null || linha.manualLat != null) {
    posicionadas.add(lojaId);
    return false;
  }
  await linha.update({
    gpsLat: ponto.lat,
    gpsLng: ponto.lng,
    gpsPontos: [ponto], // de qual movimentação/precisão veio, para conferência
    gpsEm: new Date(ponto.em),
  });
  posicionadas.add(lojaId);
  return true;
}

const pontoValido = (r) =>
  r &&
  Number.isFinite(Number(r.latitude)) &&
  Number.isFinite(Number(r.longitude)) &&
  r.accuracy != null &&
  Number(r.accuracy) <= PRECISAO_MAXIMA_M &&
  (r.speed == null || Number(r.speed) <= VELOCIDADE_MAXIMA_MS);

// Chamado logo depois de criar a movimentação. Não lança erro.
export async function registrarGpsDaMovimentacao({ movimentacaoId, usuarioId, lojaId, em = new Date() }) {
  try {
    if (!usuarioId || !lojaId) return false;
    // Loja já posicionada: nada a fazer (nem consulta o banco).
    if ((await carregarLojasPosicionadas()).has(lojaId)) return false;
    const momento = new Date(em).getTime();
    const posicao = await RoteiroLocalizacao.findOne({
      where: {
        usuarioId,
        capturedAt: {
          [Op.between]: [new Date(momento - JANELA_ANTES_MS), new Date(momento + JANELA_DEPOIS_MS)],
        },
      },
      order: [["capturedAt", "DESC"]],
      raw: true,
    });
    if (!pontoValido(posicao)) return false;
    return await gravarPrimeiroGps(lojaId, {
      lat: Number(posicao.latitude),
      lng: Number(posicao.longitude),
      precisao: Math.round(Number(posicao.accuracy)),
      em: posicao.capturedAt,
      movimentacaoId,
    });
  } catch (error) {
    console.error("[Mapa lojas] Falha ao guardar o GPS da movimentação:", error.message);
    return false;
  }
}

// Últimas posições gravadas que caem perto de uma movimentação do mesmo
// funcionário, só para lojas ainda sem GPS/correção (o ponto mais preciso de cada).
async function aproveitarPosicoesGravadas() {
  const linhas = await sequelize.query(
    `SELECT DISTINCT ON (m.loja_id)
            m.id AS "movimentacaoId", m.loja_id AS "lojaId",
            r.latitude::float AS lat, r.longitude::float AS lng,
            r.accuracy, r.captured_at AS em
       FROM roteiros_localizacoes r
       JOIN movimentacoes m
         ON m.usuario_id = r.usuario_id
        AND m.created_at BETWEEN r.captured_at - INTERVAL '1 minute'
                             AND r.captured_at + INTERVAL '3 minutes'
      WHERE r.accuracy IS NOT NULL AND r.accuracy <= :precisao
        AND (r.speed IS NULL OR r.speed <= :velocidade)
        AND NOT EXISTS (
              SELECT 1 FROM loja_localizacoes l
               WHERE l.loja_id = m.loja_id
                 AND (l.gps_lat IS NOT NULL OR l.manual_lat IS NOT NULL))
      ORDER BY m.loja_id, r.accuracy ASC`,
    {
      replacements: { precisao: PRECISAO_MAXIMA_M, velocidade: VELOCIDADE_MAXIMA_MS },
      type: QueryTypes.SELECT,
    },
  );
  let lojas = 0;
  for (const l of linhas) {
    const gravou = await gravarPrimeiroGps(l.lojaId, {
      lat: l.lat,
      lng: l.lng,
      precisao: Math.round(Number(l.accuracy)),
      em: l.em,
      movimentacaoId: l.movimentacaoId,
    });
    if (gravou) lojas += 1;
  }
  return lojas;
}

// ---- Endereço ----

// Só vírgulas: "Cidade - UF" confunde o OpenStreetMap (acha rodovias com o nome).
export const textoEnderecoLoja = (loja) =>
  [loja.endereco?.trim(), loja.cidade?.trim(), loja.estado?.trim(), "Brasil"].filter(Boolean).join(", ");

const textoCidadeLoja = (loja) =>
  loja.cidade?.trim() ? [loja.cidade.trim(), loja.estado?.trim(), "Brasil"].filter(Boolean).join(", ") : null;

async function geocodificarGoogle(texto, chave) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.search = new URLSearchParams({ address: texto, region: "br", language: "pt-BR", key: chave });
  const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const dados = await resposta.json();
  if (dados.status === "REQUEST_DENIED") {
    googleRecusado = true;
    console.warn(
      "[Mapa lojas] Google recusou a geocodificação (ative a Geocoding API na chave). Usando OpenStreetMap até reiniciar:",
      dados.error_message || "",
    );
    return undefined; // tenta no OSM
  }
  if (dados.status === "ZERO_RESULTS") return null;
  if (dados.status !== "OK") throw new Error(`Google respondeu ${dados.status}`);
  const local = dados.results[0].geometry.location;
  return { lat: local.lat, lng: local.lng };
}

async function geocodificarOsm(texto) {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: texto, format: "json", limit: "1", countrycodes: "br" })}`;
  const resposta = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  await esperar(1100); // política de uso do Nominatim: no máximo 1 consulta por segundo
  if (!resposta.ok) throw new Error(`OpenStreetMap respondeu ${resposta.status}`);
  const [achou] = await resposta.json();
  return achou ? { lat: Number(achou.lat), lng: Number(achou.lon) } : null;
}

const chaveGoogle = () => process.env.GOOGLE_GEOCODING_API_KEY || process.env.GOOGLE_GEOLOCATION_API_KEY;

// soGoogle: não cai no OpenStreetMap (loja que só seria refeita para trocar pelo Google)
async function geocodificar(texto, { soGoogle = false } = {}) {
  const chave = chaveGoogle();
  if (chave && !googleRecusado) {
    const resultado = await geocodificarGoogle(texto, chave);
    if (resultado !== undefined) return { ...resultado, geocodificador: "google", achou: resultado !== null };
  }
  if (soGoogle) return { recusado: true };
  const resultado = await geocodificarOsm(texto);
  return { ...resultado, geocodificador: "osm", achou: resultado !== null };
}

const geocodificacaoAtiva = () => process.env.LOJA_GEOCODIFICACAO_ATIVA !== "false";

async function geocodificarLojas() {
  if (!geocodificacaoAtiva()) return 0;
  const [lojas, salvas] = await Promise.all([
    Loja.findAll({ where: { ativo: true }, attributes: ["id", "endereco", "cidade", "estado"], raw: true }),
    LojaLocalizacao.findAll({ raw: true }),
  ]);
  const porLoja = new Map(salvas.map((l) => [l.lojaId, l]));
  const agora = Date.now();

  // Com o Google disponível, as lojas achadas pelo OpenStreetMap (ou não achadas)
  // são refeitas uma vez pelo Google. Depois disso, só consulta de novo quando o
  // endereço da loja muda (ou após um erro passageiro).
  const googleDisponivel = Boolean(chaveGoogle()) && !googleRecusado;
  const soParaTrocarPorGoogle = new Set();

  // Só lojas que ainda não têm posição melhor (manual ou GPS).
  const pendentes = lojas
    .filter((loja) => {
      if (!loja.endereco?.trim() && !loja.cidade?.trim()) return false;
      const atual = porLoja.get(loja.id);
      if (atual && (atual.manualLat != null || atual.gpsLat != null)) return false;
      if (!atual || atual.enderecoConsultado !== textoEnderecoLoja(loja)) return true;
      if (
        atual.enderecoStatus === "erro" &&
        agora - new Date(atual.enderecoEm || 0).getTime() > NOVA_TENTATIVA_ERRO_MS
      ) {
        return true;
      }
      if (googleDisponivel && atual.geocodificador !== "google" && atual.enderecoStatus !== "erro") {
        soParaTrocarPorGoogle.add(loja.id);
        return true;
      }
      return false;
    })
    // Google não tem o limite de 1 consulta/s do OpenStreetMap
    .slice(0, googleDisponivel ? MAX_GEOCODIFICACOES_GOOGLE : MAX_GEOCODIFICACOES_POR_RODADA);

  let feitas = 0;
  for (const loja of pendentes) {
    // O Google recusou no meio da rodada: não refaz pelo OpenStreetMap o que já tinha
    if (googleRecusado && soParaTrocarPorGoogle.has(loja.id)) continue;
    const texto = textoEnderecoLoja(loja);
    const dados = { enderecoConsultado: texto, enderecoEm: new Date() };
    const opcoes = { soGoogle: soParaTrocarPorGoogle.has(loja.id) };
    try {
      let resultado = loja.endereco?.trim() ? await geocodificar(texto, opcoes) : { achou: false };
      let precisao = "rua";
      const cidade = textoCidadeLoja(loja);
      if (!resultado.achou && !resultado.recusado && cidade) {
        resultado = await geocodificar(cidade, opcoes);
        precisao = "cidade";
      }
      // Google recusou: mantém a posição que já tinha
      if (resultado.recusado) continue;
      Object.assign(
        dados,
        resultado.achou
          ? {
              enderecoLat: resultado.lat,
              enderecoLng: resultado.lng,
              enderecoPrecisao: precisao,
              enderecoStatus: "ok",
              geocodificador: resultado.geocodificador,
            }
          : { enderecoLat: null, enderecoLng: null, enderecoStatus: "nao_encontrado" },
      );
    } catch (error) {
      console.error(`[Mapa lojas] Falha ao geocodificar a loja ${loja.id}:`, error.message);
      dados.enderecoStatus = "erro";
    }
    const [linha] = await LojaLocalizacao.findOrCreate({ where: { lojaId: loja.id } });
    // Erro passageiro não apaga a posição que já existia.
    if (dados.enderecoStatus === "erro" && linha.enderecoStatus === "ok") {
      await linha.update({ enderecoEm: dados.enderecoEm });
    } else {
      await linha.update(dados);
    }
    feitas += 1;
  }
  return feitas;
}

// ---- Rodada (uma por vez, nunca lança erro) ----

async function executarRodada() {
  let lojasGps = 0;
  if (Date.now() - ultimoAproveitamento > INTERVALO_APROVEITAR_MS) {
    ultimoAproveitamento = Date.now();
    lojasGps = await aproveitarPosicoesGravadas();
  }
  const geocodificadas = await geocodificarLojas();
  if (geocodificadas > 0) {
    console.log(`[Mapa lojas] ${geocodificadas} loja(s) localizada(s) pelo endereço`);
  }
  return { lojasGps, geocodificadas };
}

export function atualizarLocalizacoesLojas() {
  if (rodadaEmAndamento) {
    rodadaPendente = true;
    return rodadaEmAndamento;
  }
  rodadaEmAndamento = executarRodada()
    .catch((error) => {
      console.error("[Mapa lojas] Falha:", error.message);
      return null;
    })
    .finally(() => {
      rodadaEmAndamento = null;
      if (rodadaPendente) {
        rodadaPendente = false;
        atualizarLocalizacoesLojas();
      }
    });
  return rodadaEmAndamento;
}

export const localizacaoLojasEmAndamento = () => Boolean(rodadaEmAndamento);

// ---- Correção manual ----

export async function salvarLocalizacaoManualLoja(lojaId, { lat, lng }) {
  const [linha] = await LojaLocalizacao.findOrCreate({ where: { lojaId } });
  await linha.update({ manualLat: lat, manualLng: lng, manualEm: new Date() });
  (await carregarLojasPosicionadas()).add(lojaId);
}

// Tira a correção e o GPS: volta ao endereço até a próxima movimentação com GPS.
export async function limparLocalizacaoManualLoja(lojaId) {
  await LojaLocalizacao.update(
    {
      manualLat: null,
      manualLng: null,
      manualEm: null,
      gpsLat: null,
      gpsLng: null,
      gpsPontos: null,
      gpsEm: null,
    },
    { where: { lojaId } },
  );
  (await carregarLojasPosicionadas()).delete(lojaId);
  atualizarLocalizacoesLojas();
}

// ---- Ponto de saída do mapa de manutenções (sede Club Kids) ----
// Endereço em MANUTENCAO_SAIDA_ENDERECO; posição fixa opcional em
// MANUTENCAO_SAIDA_LAT / MANUTENCAO_SAIDA_LNG (pula a geocodificação).

// Posição já conferida do endereço padrão: não depende do geocodificador
// (no Render o OpenStreetMap pode recusar a consulta).
const SAIDA_PADRAO = {
  nome: "Club Kids",
  endereco: "Av. Conde Francisco Matarazzo, 799 - Fundação, São Caetano do Sul - SP",
  lat: -23.604528,
  lng: -46.5706131,
};
const SAIDA_NOVA_TENTATIVA_MS = 10 * 60 * 1000;
let saidaCache = null;
let saidaFalhouEm = 0;
let saidaEmAndamento = null;

export async function pontoSaidaManutencoes() {
  const nome = process.env.MANUTENCAO_SAIDA_NOME || SAIDA_PADRAO.nome;
  const endereco = process.env.MANUTENCAO_SAIDA_ENDERECO || SAIDA_PADRAO.endereco;
  const lat = Number.parseFloat(process.env.MANUTENCAO_SAIDA_LAT);
  const lng = Number.parseFloat(process.env.MANUTENCAO_SAIDA_LNG);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { nome, endereco, lat, lng };
  if (endereco === SAIDA_PADRAO.endereco) {
    return { nome, endereco, lat: SAIDA_PADRAO.lat, lng: SAIDA_PADRAO.lng };
  }

  if (saidaCache?.endereco === endereco) return saidaCache;
  if (!geocodificacaoAtiva() || Date.now() - saidaFalhouEm < SAIDA_NOVA_TENTATIVA_MS) {
    return { nome, endereco, lat: null, lng: null };
  }
  if (!saidaEmAndamento) {
    saidaEmAndamento = geocodificar(`${endereco}, Brasil`)
      .then((resultado) => {
        if (!resultado.achou) throw new Error("endereço não encontrado");
        saidaCache = { nome, endereco, lat: resultado.lat, lng: resultado.lng };
        return saidaCache;
      })
      .catch((error) => {
        console.error("[Mapa manutenções] Falha ao localizar o ponto de saída:", error.message);
        saidaFalhouEm = Date.now();
        return { nome, endereco, lat: null, lng: null };
      })
      .finally(() => {
        saidaEmAndamento = null;
      });
  }
  return saidaEmAndamento;
}
