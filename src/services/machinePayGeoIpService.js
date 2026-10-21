// Localização dos leitores Machine Pay pelo IP que o painel mostra.
//
// - Provedor: ipinfo.io. Funciona sem chave (limite baixo, ~1.000/dia); com o
//   token grátis em IPINFO_TOKEN o limite vai para 50.000/mês.
// - O IP mostra a central do provedor de internet, não o endereço exato: a
//   precisão é de bairro/cidade. Para o ponto exato, cadastre à mão (link do
//   Google Maps ou coordenadas) — a posição manual nunca é trocada pelo IP.
// - Consulta de novo só quando o IP do leitor muda (erro: tenta de novo depois de 1 h).
// - Desligue com MACHINE_PAY_GEOIP_ATIVO=false.
import { Op } from "sequelize";
import { MachinePayLocalizacao, MachinePayStatus } from "../models/index.js";
import { whereContasCadastradas } from "./machinePayMonitorService.js";

const MAX_IPS_POR_RODADA = 200; // o resto fica para a próxima coleta
const CONSULTAS_SIMULTANEAS = 5;
const TIMEOUT_MS = 10000;
const NOVA_TENTATIVA_ERRO_MS = 60 * 60 * 1000;

const HOSTS_LINK_CURTO = new Set(["maps.app.goo.gl", "goo.gl", "g.co"]);
const PADROES_COORDENADAS = [
  /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
  /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  /[?&](?:q|query|ll|destination)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/,
  /^\s*(-?\d{1,3}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/,
];

let rodadaEmAndamento = null;

export const geoIpAtivo = () => process.env.MACHINE_PAY_GEOIP_ATIVO !== "false";

// IPs de rede interna/reservados não têm localização pública.
export function ipPublico(ip) {
  const partes = String(ip || "").split(".").map(Number);
  if (partes.length !== 4 || partes.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = partes;
  if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 169 && b === 254) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  return true;
}

// Coordenadas de "lat, lng" ou de um link do Google Maps (inclusive link curto
// maps.app.goo.gl, que é aberto para achar o endereço final).
export async function extrairCoordenadas(texto) {
  let valor = String(texto || "").trim();
  try {
    valor = decodeURIComponent(valor);
  } catch {
    // texto com % solto: usa como veio
  }
  if (!valor) return null;
  const candidatos = [valor];
  if (/^https?:\/\//i.test(valor)) {
    let host = "";
    try {
      host = new URL(valor).hostname.toLowerCase();
    } catch {
      host = "";
    }
    if (HOSTS_LINK_CURTO.has(host)) {
      try {
        const resposta = await fetch(valor, {
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
        });
        candidatos.push(decodeURIComponent(resposta.url));
        candidatos.push((await resposta.text()).slice(0, 20000));
      } catch {
        // link fora do ar: tenta só com o texto colado
      }
    }
  }
  for (const candidato of candidatos) {
    for (const padrao of PADROES_COORDENADAS) {
      const achou = candidato.match(padrao);
      if (achou) {
        const lat = Number(achou[1]);
        const lng = Number(achou[2]);
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
      }
    }
  }
  return null;
}

async function consultarIpinfo(ip, token) {
  const resposta = await fetch(`https://ipinfo.io/${ip}/json`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw new Error(`ipinfo respondeu ${resposta.status}`);
  const d = await resposta.json();
  const [lat, lng] = String(d.loc || "").split(",").map(Number);
  if (d.bogon || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, cidade: d.city, uf: d.region, provedor: d.org };
}

const cortar = (texto, tamanho) => (texto ? String(texto).slice(0, tamanho) : null);

async function executarRodada() {
  const [status, salvas] = await Promise.all([
    MachinePayStatus.findAll({
      where: await whereContasCadastradas(),
      attributes: ["posId", "ip"],
      raw: true,
    }),
    MachinePayLocalizacao.findAll({ raw: true }),
  ]);
  const porPosId = new Map(salvas.map((l) => [l.posId, l]));
  const agora = Date.now();

  // Leitores que precisam de consulta: sem posição pelo IP atual (manual nunca entra).
  const pendentes = status.filter((s) => {
    if (!s.ip) return false;
    const atual = porPosId.get(s.posId);
    if (!atual) return true;
    if (atual.origem === "manual") return false;
    if (atual.ip !== s.ip) return true;
    return (
      atual.statusIp === "erro" &&
      agora - new Date(atual.consultadoEm || 0).getTime() > NOVA_TENTATIVA_ERRO_MS
    );
  });
  if (!pendentes.length) return { consultados: 0, localizados: 0 };

  const privados = pendentes.filter((s) => !ipPublico(s.ip));
  const publicos = pendentes.filter((s) => ipPublico(s.ip));
  const ipsUnicos = [...new Set(publicos.map((s) => s.ip))].slice(0, MAX_IPS_POR_RODADA);

  const respostas = new Map();
  let falhou = false;
  const token = process.env.IPINFO_TOKEN;
  for (let i = 0; i < ipsUnicos.length && !falhou; i += CONSULTAS_SIMULTANEAS) {
    const lote = ipsUnicos.slice(i, i + CONSULTAS_SIMULTANEAS);
    const resultados = await Promise.allSettled(lote.map((ip) => consultarIpinfo(ip, token)));
    resultados.forEach((r, j) => {
      if (r.status === "fulfilled") respostas.set(lote[j], r.value);
      else {
        // limite estourado (429) ou fora do ar: para e tenta na próxima rodada
        console.error("[MachinePay GeoIP] Falha na consulta:", r.reason?.message);
        falhou = true;
      }
    });
  }

  const consultadoEm = new Date();
  const linhas = [];
  for (const s of privados) {
    linhas.push({ posId: s.posId, ip: s.ip, statusIp: "privado", latitude: null, longitude: null });
  }
  for (const s of publicos) {
    if (!ipsUnicos.includes(s.ip)) continue; // fica para a próxima rodada
    if (!respostas.has(s.ip)) {
      linhas.push({ posId: s.posId, ip: s.ip, statusIp: "erro" });
      continue;
    }
    const geo = respostas.get(s.ip);
    linhas.push(
      geo
        ? {
            posId: s.posId,
            ip: s.ip,
            statusIp: "ok",
            latitude: geo.lat,
            longitude: geo.lng,
            cidade: cortar(geo.cidade, 120),
            uf: cortar(geo.uf, 60),
            provedor: cortar(geo.provedor, 150),
          }
        : { posId: s.posId, ip: s.ip, statusIp: "nao_encontrado", latitude: null, longitude: null },
    );
  }

  for (const linha of linhas) {
    const anterior = porPosId.get(linha.posId);
    const dados = { ...linha, origem: "ip", consultadoEm };
    // Erro passageiro não apaga a posição que já existia.
    if (linha.statusIp === "erro" && anterior) {
      await MachinePayLocalizacao.update(
        { statusIp: "erro", consultadoEm },
        { where: { posId: linha.posId, origem: "ip" } },
      );
    } else {
      await MachinePayLocalizacao.upsert(dados);
    }
  }

  return {
    consultados: ipsUnicos.length,
    localizados: linhas.filter((l) => l.statusIp === "ok").length,
  };
}

// Atualiza as posições pelo IP (uma rodada por vez). Não lança erro.
export function atualizarLocalizacoesPorIp() {
  if (!geoIpAtivo()) return Promise.resolve(null);
  if (!rodadaEmAndamento) {
    rodadaEmAndamento = executarRodada()
      .catch((error) => {
        console.error("[MachinePay GeoIP] Falha:", error.message);
        return null;
      })
      .finally(() => {
        rodadaEmAndamento = null;
      });
  }
  return rodadaEmAndamento;
}

export const localizacaoEmAndamento = () => Boolean(rodadaEmAndamento);

// Posição cadastrada à mão. `limpar` volta a usar o IP.
export async function salvarLocalizacaoManual(posId, { lat, lng }) {
  await MachinePayLocalizacao.upsert({
    posId,
    latitude: lat,
    longitude: lng,
    origem: "manual",
    consultadoEm: new Date(),
  });
}

export async function voltarParaIp(posId) {
  await MachinePayLocalizacao.destroy({ where: { posId } });
  atualizarLocalizacoesPorIp();
}

export async function mapaLocalizacoes(posIds) {
  const linhas = await MachinePayLocalizacao.findAll({
    where: posIds ? { posId: { [Op.in]: posIds } } : undefined,
    raw: true,
  });
  return new Map(linhas.map((l) => [l.posId, l]));
}
