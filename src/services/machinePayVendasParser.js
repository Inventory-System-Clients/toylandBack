// Parser do extrato de vendas (pagamentos) da página de estatísticas do painel
// Machine Pay (maquinas.php?acao=stats). Função pura: recebe o HTML e devolve
// a lista de vendas. Mesma lógica já validada no projeto Toyland.

const stripHtml = (html) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

// O extrato linha a linha usa ponto como separador decimal (ex: "R$ 30.00"),
// ao contrário do bloco de totais (PIX/Débito/Crédito), que usa vírgula.
const parseMoneyPontoDecimal = (value) => {
  const numero = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(numero) ? numero : 0;
};

// "09/10/2026-14:32:10" (horário de Brasília)
const parseDataHoraTabela = (texto) => {
  const match = String(texto || "").match(/(\d{2})\/(\d{2})\/(\d{4})-(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, dia, mes, ano, hora, min, seg] = match;
  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:${seg}-03:00`);
  return Number.isNaN(data.getTime()) ? null : data;
};

// No HTML o <b>valor</b> e o <span>rótulo</span> são irmãos, sem <br> entre eles.
const capturarValorPorLabel = (linhaHtml, label) => {
  const regex = new RegExp(`<b[^>]*>([^<]*)<\\/b>\\s*<span[^>]*>\\s*${label}\\s*<\\/span>`, "i");
  const match = linhaHtml.match(regex);
  return match ? parseMoneyPontoDecimal(stripHtml(match[1])) : 0;
};

export function parsearLinhaVenda(linhaHtml) {
  const dataHoraTexto = linhaHtml.match(/✅\s*(\d{2}\/\d{2}\/\d{4}-\d{2}:\d{2}:\d{2})/u)?.[1];
  if (!dataHoraTexto) return null;

  // devolve('idpg') é o botão "Devolver" (ID do pagamento). apagarRegistro2(id)
  // é o "Excluir" e usa outro ID: só serve de último recurso para identificar a linha.
  const idwebhook = (
    linhaHtml.match(/devolve\('(\d+)'\)/) ||
    linhaHtml.match(/devolver\((\d+)\)/) ||
    linhaHtml.match(/id="dv(\d+)"/) ||
    linhaHtml.match(/change_pagto\((\d+)\)/) ||
    linhaHtml.match(/apagarRegistro2\((\d+)\)/)
  )?.[1] || null;

  // Método/banco: div que começa com ✅ (Pix) ou 💳 (cartão)
  const metodoMatch = linhaHtml.match(/white-space:\s*nowrap;\s*text-shadow:[^"]*;">\s*([\s\S]*?)<\/div>/);
  const tipo = metodoMatch ? stripHtml(metodoMatch[1]) : "";

  // Selo de situação (ex: "Venda Aprovada")
  const statusMatch =
    linhaHtml.match(/background-color:#e8f5e9;color:#28a745;[\s\S]*?>\s*(?:<img[^>]*>\s*)?([^<]+?)\s*<\/span>/) ||
    linhaHtml.match(/>(Venda [^<]+?)</);
  const status = statusMatch ? statusMatch[1].trim() : "";

  const referencia = linhaHtml.match(/\u{1F50D}\s*ID PG:\s*<strong[^>]*>([^<]+)<\/strong>/u)?.[1]?.trim() || "";
  const dataHora = parseDataHoraTabela(dataHoraTexto);

  const aprovada = /aprova/i.test(status);
  const devolvido = /devolv/i.test(status);
  const pagamentoReal = !/manual/i.test(tipo);

  return {
    idwebhook,
    data: dataHora ? dataHora.toISOString() : null,
    tipo: tipo || "Transação",
    status: status || "-",
    referencia,
    valor: capturarValorPorLabel(linhaHtml, "Cliente Pagou"),
    taxa: capturarValorPorLabel(linhaHtml, "Banco Retirou"),
    liquido: capturarValorPorLabel(linhaHtml, "Voc[eê] Recebeu"),
    pagamentoReal,
    devolvido,
    // Só pagamento real (não manual), aprovado e ainda não devolvido
    podeDevolver: Boolean(idwebhook && pagamentoReal && aprovada && !devolvido),
  };
}

export function parsearVendasStats(html) {
  return [...String(html || "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((linha) => {
      try {
        return parsearLinhaVenda(linha[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}
