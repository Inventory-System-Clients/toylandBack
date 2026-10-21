// Cálculos das páginas "Horários de pico" e "Ranking das máquinas" (Machine Pay).
// Funções puras, sem banco, para poderem ser testadas isoladamente.

const FUSO = "America/Sao_Paulo";
const DIA_MS = 24 * 60 * 60 * 1000;

const formatoData = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatoHora = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  hour: "2-digit",
  hourCycle: "h23",
});

export const dataBrasilDe = (data) => formatoData.format(new Date(data));
export const horaBrasilDe = (data) => Number(formatoHora.format(new Date(data))) % 24;

export const somarDias = (dataIso, dias) =>
  new Date(new Date(`${dataIso}T12:00:00Z`).getTime() + dias * DIA_MS).toISOString().slice(0, 10);

// Todas as datas (YYYY-MM-DD) de inicio a fim, inclusive.
export function listarDatas(inicio, fim) {
  const datas = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) datas.push(d);
  return datas;
}

// Dias da semana na ordem das linhas do heatmap (Seg … Dom); "indice" = getUTCDay().
export const DIAS_SEMANA = [
  { indice: 1, curto: "Seg", nome: "segunda" },
  { indice: 2, curto: "Ter", nome: "terça" },
  { indice: 3, curto: "Qua", nome: "quarta" },
  { indice: 4, curto: "Qui", nome: "quinta" },
  { indice: 5, curto: "Sex", nome: "sexta" },
  { indice: 6, curto: "Sáb", nome: "sábado" },
  { indice: 0, curto: "Dom", nome: "domingo" },
];

const diaDaSemana = (dataIso) => new Date(`${dataIso}T12:00:00Z`).getUTCDay();
const arred = (n) => Math.round(n * 100) / 100;
const horasVazias = () => Array.from({ length: 24 }, () => [0, 0]);

// Extrato (lista de vendas do painel) → resumo por dia e hora. Todos os dias de
// "datas" saem no resultado, mesmo sem venda (zero é um dado real). Ficam de fora
// devoluções e créditos manuais, que não são venda de verdade.
export function resumirVendasPorHora(vendas, datas) {
  const porData = new Map(datas.map((d) => [d, { horas: horasVazias(), qtd: 0, valor: 0 }]));
  for (const venda of vendas || []) {
    if (!venda?.data || venda.devolvido || venda.pagamentoReal === false) continue;
    const dia = porData.get(dataBrasilDe(venda.data));
    if (!dia) continue;
    const valor = Number(venda.valor) || 0;
    const hora = horaBrasilDe(venda.data);
    dia.horas[hora][0] += 1;
    dia.horas[hora][1] = arred(dia.horas[hora][1] + valor);
    dia.qtd += 1;
    dia.valor = arred(dia.valor + valor);
  }
  return porData;
}

// Datas em sequência agrupadas em blocos de no máximo "tamanho" dias (uma consulta
// ao extrato por bloco).
export function blocosDeDias(datas, tamanho) {
  const blocos = [];
  for (const data of [...datas].sort()) {
    const atual = blocos[blocos.length - 1];
    if (atual && atual.length < tamanho && somarDias(atual[atual.length - 1], 1) === data) {
      atual.push(data);
    } else {
      blocos.push([data]);
    }
  }
  return blocos.map((b) => ({ inicio: b[0], fim: b[b.length - 1], datas: b }));
}

// linhas: [{ data, horas: [[qtd, valor] x24] }] de um ou mais leitores.
// Médias por dia: cada célula é dividida pelo número de dias daquele dia da semana
// que têm dados no período (dias ainda não lidos do extrato não puxam a média para baixo).
export function montarPicos(linhas, { inicio, fim }) {
  const datasComDados = new Set();
  const soma = Array.from({ length: 7 }, () => horasVazias());
  for (const linha of linhas) {
    if (linha.data < inicio || linha.data > fim) continue;
    datasComDados.add(linha.data);
    const dia = diaDaSemana(linha.data);
    (linha.horas || []).forEach(([qtd, valor], hora) => {
      if (hora > 23) return;
      soma[dia][hora][0] += Number(qtd) || 0;
      soma[dia][hora][1] += Number(valor) || 0;
    });
  }

  const diasPorSemana = Array(7).fill(0);
  for (const data of datasComDados) diasPorSemana[diaDaSemana(data)] += 1;
  const totalDias = datasComDados.size;

  const heatmap = DIAS_SEMANA.map(({ indice, curto, nome }) => {
    const n = diasPorSemana[indice];
    return {
      dia: curto,
      nome,
      dias: n,
      horas: soma[indice].map(([qtd, valor], hora) => ({
        hora,
        qtd: n ? arred(qtd / n) : 0,
        valor: n ? arred(valor / n) : 0,
      })),
    };
  });

  const porHora = Array.from({ length: 24 }, (_, hora) => {
    let qtd = 0;
    let valor = 0;
    for (const dia of soma) {
      qtd += dia[hora][0];
      valor += dia[hora][1];
    }
    return {
      hora,
      qtd: totalDias ? arred(qtd / totalDias) : 0,
      valor: totalDias ? arred(valor / totalDias) : 0,
    };
  });

  const porDiaSemana = DIAS_SEMANA.map(({ indice, curto, nome }) => {
    const n = diasPorSemana[indice];
    const qtd = soma[indice].reduce((acc, h) => acc + h[0], 0);
    const valor = soma[indice].reduce((acc, h) => acc + h[1], 0);
    return {
      dia: curto,
      nome,
      dias: n,
      qtd: n ? arred(qtd / n) : 0,
      valor: n ? arred(valor / n) : 0,
    };
  });

  // Três células mais fortes de cada métrica (só as que tiveram algum movimento)
  const destaquesPor = (campo) =>
    heatmap
      .flatMap((linha) => linha.horas.map((h) => ({ dia: linha.dia, nome: linha.nome, hora: h.hora, media: h[campo] })))
      .filter((c) => c.media > 0)
      .sort((a, b) => b.media - a.media)
      .slice(0, 3);

  const datasOrdenadas = [...datasComDados].sort();
  return {
    periodo: { inicio, fim, dias: listarDatas(inicio, fim).length },
    diasComDados: totalDias,
    primeiroDiaComDados: datasOrdenadas[0] || null,
    heatmap,
    porHora,
    porDiaSemana,
    destaques: { qtd: destaquesPor("qtd"), valor: destaquesPor("valor") },
  };
}

const mediana = (valores) => {
  if (!valores.length) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
};

export const LIMITE_RANKING = 10;

// maquinas: [{ posId, ... }] com vendasQtd, vendasValor, quedas e pelucias já somados
// no período. verValores: sem permissão de R$, "mais faturam" ordena por quantidade e
// o payout (R$ por pelúcia) não é calculado.
export function montarRankingMaquinas(maquinas, { verValores = true } = {}) {
  const maisFaturam = maquinas
    .filter((m) => m.vendasQtd > 0 || m.vendasValor > 0)
    .sort((a, b) =>
      verValores
        ? b.vendasValor - a.vendasValor || b.vendasQtd - a.vendasQtd
        : b.vendasQtd - a.vendasQtd,
    )
    .slice(0, LIMITE_RANKING);

  const maisCaem = maquinas
    .filter((m) => m.quedas > 0)
    .sort((a, b) => b.quedas - a.quedas)
    .slice(0, LIMITE_RANKING);

  return {
    maisFaturam,
    maisCaem,
    payout: verValores ? montarPayout(maquinas) : null,
  };
}

// Payout = R$ que entra para cada pelúcia que sai. "Normal da frota" = mediana das
// máquinas que tiveram venda e pelúcia no período. Fora do normal: menos da metade
// ou mais do dobro. Sem pelúcia nenhuma só entra quem faturou pelo menos o dobro do
// normal (abaixo disso, zero pelúcia ainda é esperado).
export function montarPayout(maquinas) {
  const comBase = maquinas.filter((m) => m.vendasValor > 0 && m.pelucias > 0);
  const normal = mediana(comBase.map((m) => m.vendasValor / m.pelucias));
  if (!normal) return { normalPorPelucia: null, maquinasNaBase: 0, maquinas: [] };

  const fora = [];
  for (const m of maquinas) {
    // pelucias null = leitor sem máquina no sistema: não há como saber
    if (!(m.vendasValor > 0) || m.pelucias == null) continue;
    if (!m.pelucias) {
      if (m.vendasValor >= 2 * normal) {
        fora.push({ ...m, porPelucia: null, situacao: "SEGURANDO", desvio: Infinity });
      }
      continue;
    }
    const porPelucia = m.vendasValor / m.pelucias;
    if (porPelucia > 2 * normal || porPelucia < normal / 2) {
      fora.push({
        ...m,
        porPelucia: arred(porPelucia),
        situacao: porPelucia > normal ? "SEGURANDO" : "SOLTANDO",
        desvio: Math.abs(Math.log(porPelucia / normal)),
      });
    }
  }

  fora.sort((a, b) => b.desvio - a.desvio || b.vendasValor - a.vendasValor);
  return {
    normalPorPelucia: arred(normal),
    maquinasNaBase: comBase.length,
    maquinas: fora.map(({ desvio: _desvio, ...m }) => m),
  };
}
