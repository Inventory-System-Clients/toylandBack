// Posição das lojas para o mapa Machine Pay detalhado (ver models/LojaLocalizacao.js).
//
// Duas fontes: correção manual (link do Google Maps / coordenadas) e o endereço
// cadastrado da loja. O campo de GPS do modelo fica sem uso por enquanto.
//
// Endereço: Google Geocoding se a chave tiver a API ativada (GOOGLE_GEOCODING_API_KEY,
// ou a GOOGLE_GEOLOCATION_API_KEY), senão OpenStreetMap/Nominatim (grátis, 1 consulta/s).
// Desligue a geocodificação com LOJA_GEOCODIFICACAO_ATIVA=false.
import { Loja, LojaLocalizacao } from "../models/index.js";

const MAX_GEOCODIFICACOES_POR_RODADA = 40;
const MAX_GEOCODIFICACOES_GOOGLE = 500;
const NOVA_TENTATIVA_ERRO_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 10000;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Toyland-MapaMachinePay/1.0";

let rodadaEmAndamento = null;
// Pedido feito durante uma rodada (ex.: loja salva): roda de novo no fim,
// porque a rodada atual pode ter lido o endereço antigo.
let rodadaPendente = false;
let googleRecusado = false; // chave sem a Geocoding API: usa só o OSM até reiniciar

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
  const geocodificadas = await geocodificarLojas();
  if (geocodificadas > 0) {
    console.log(`[Mapa lojas] ${geocodificadas} loja(s) localizada(s) pelo endereço`);
  }
  return { geocodificadas };
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
}

// Tira a correção: volta à posição pelo endereço.
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
  atualizarLocalizacoesLojas();
}
