import WebSocketClient from "ws";
import { parsearVendasStats } from "./machinePayVendasParser.js";

// Cópia do serviço Machine Pay do Club Kids, usada só pela página "Machine Pay
// detalhado" (a página original continua usando machinePayService.js).
// Integração com o painel Machine Pay (Cyberpix) — não existe API pública documentada,
// então a integração é feita via scraping autenticado do painel administrativo web
// (cyberpix.com.br/pix-adesivo-clientes/): login por cookie de sessão + parsing de HTML.

export class MachinePayServiceError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "MachinePayServiceError";
    this.status = status;
  }
}

const base64 = (value) =>
  Buffer.from(String(value ?? ""), "utf8").toString("base64");

// Mesmo padrão do machinePayService.js: MACHINE_PAY_LOGIN_URL é opcional.
export const URL_PADRAO_MACHINE_PAY = "https://www.cyberpix.com.br/pix-adesivo-clientes/";

const baseUrl = () => {
  const url = process.env.MACHINE_PAY_LOGIN_URL || URL_PADRAO_MACHINE_PAY;
  return url.endsWith("/") ? url : `${url}/`;
};

// Mimetiza os headers que o navegador manda numa sessão real logada — o painel
// deles pode se comportar de forma diferente (ou instável) sem Referer/Accept-Language.
const construirHeaders = (cookie, extra = {}) => ({
  Cookie: cookie,
  "X-Requested-With": "XMLHttpRequest",
  Referer: baseUrl(),
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  ...extra,
});

// O ORM devolve datas como objetos Date nativos. String(Date) produz o formato verboso
// do toString() (ex: "Mon Jul 06 2026 ..."), não ISO — a Machine Pay não reconhece isso
// como data válida e retorna 0 silenciosamente (sem erro). Sempre normalizar para ISO antes.
export const paraTextoIso = (value) => {
  if (value instanceof Date) return value.toISOString();
  return String(value || "");
};

export const formatInicio = (value) => paraTextoIso(value).slice(0, 10);

export const formatFim = (value) => {
  const texto = paraTextoIso(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return `${texto}T23:59`;
  return texto.slice(0, 16);
};

// ---- Cookies ----

const extrairSetCookieHeaders = (headers) => {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const bruto = headers.get("set-cookie");
  return bruto ? [bruto] : [];
};

const mesclarCookies = (cookieMap, setCookieHeaders) => {
  for (const linha of setCookieHeaders) {
    const [par] = linha.split(";");
    const separador = par.indexOf("=");
    if (separador === -1) continue;
    const nome = par.slice(0, separador).trim();
    const valor = par.slice(separador + 1).trim();
    if (nome) cookieMap[nome] = valor;
  }
};

const cookiesParaHeader = (cookieMap) =>
  Object.entries(cookieMap)
    .map(([nome, valor]) => `${nome}=${valor}`)
    .join("; ");

const PADRAO_FALHA_LOGIN = /senha|login incorreto|acesso negado/i;

// Login por cookie de sessão, refeito a cada operação (sem cache entre chamadas —
// evita lidar com expiração de sessão, ao custo de 1 requisição extra por operação).
async function login() {
  const usuarioLogin = process.env.MACHINE_PAY_LOGIN;
  const senha = process.env.MACHINE_PAY_PASSWORD;

  if (!usuarioLogin || !senha) {
    throw new MachinePayServiceError(
      500,
      "Credenciais da Machine Pay não configuradas (MACHINE_PAY_LOGIN / MACHINE_PAY_PASSWORD)",
    );
  }

  const cookieMap = {};

  const respostaInicial = await fetch(baseUrl(), { redirect: "manual" });
  mesclarCookies(cookieMap, extrairSetCookieHeaders(respostaInicial.headers));

  const urlLogin = `${baseUrl()}index.php?acao=login&usr=${encodeURIComponent(
    base64(usuarioLogin),
  )}&snh=${encodeURIComponent(base64(senha))}`;

  const respostaLogin = await fetch(urlLogin, {
    headers: construirHeaders(cookiesParaHeader(cookieMap)),
  });

  mesclarCookies(cookieMap, extrairSetCookieHeaders(respostaLogin.headers));

  const texto = await respostaLogin.text();
  if (PADRAO_FALHA_LOGIN.test(texto)) {
    throw new MachinePayServiceError(502, "Falha ao autenticar na Machine Pay");
  }

  // "Aquecimento" da sessão: numa sessão de navegador real, o login é seguido de
  // uma navegação pelo dashboard antes de qualquer consulta — isso pode configurar
  // variáveis de sessão no PHP deles que uma sessão "recém-nascida" (só login, sem
  // navegação) não tem. Reproduz esse passo para evitar estados de sessão incompletos.
  try {
    const respostaHome = await fetch(baseUrl(), {
      headers: construirHeaders(cookiesParaHeader(cookieMap)),
    });
    mesclarCookies(cookieMap, extrairSetCookieHeaders(respostaHome.headers));

    const respostaEquipamentos = await fetch(
      `${baseUrl()}maquinas.php`,
      { headers: construirHeaders(cookiesParaHeader(cookieMap)) },
    );
    mesclarCookies(
      cookieMap,
      extrairSetCookieHeaders(respostaEquipamentos.headers),
    );
  } catch (error) {
    console.error(
      "[MachinePay] Falha no aquecimento de sessão (não bloqueante):",
      error.message,
    );
  }

  return cookiesParaHeader(cookieMap);
}

// ---- Parsing de HTML ----

const stripHtml = (html) =>
  String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

// O painel às vezes devolve UTF-8 mal decodificado (ex: "ComissÃƒÂ£o" em vez de "Comissão").
const SUBSTITUICOES_ACENTUACAO = [
  [/ComissÃƒÂ£o/gi, "Comissão"],
  [/LÃƒÂ­quido/gi, "Líquido"],
  [/DÃƒÂ©bito/gi, "Débito"],
  [/CrÃƒÂ©dito/gi, "Crédito"],
];

const normalizarTexto = (texto) => {
  let normalizado = String(texto || "");
  for (const [padrao, substituto] of SUBSTITUICOES_ACENTUACAO) {
    normalizado = normalizado.replace(padrao, substituto);
  }
  return normalizado.normalize("NFD").replace(/\p{Diacritic}/gu, "");
};

const parseMoney = (valorTexto) => {
  if (!valorTexto) return 0;
  const limpo = String(valorTexto)
    .replace(/[^\d.,-]/g, "")
    .trim();
  if (!limpo) return 0;
  const numero = limpo.replace(/\./g, "").replace(",", ".");
  const resultado = parseFloat(numero);
  return Number.isNaN(resultado) ? 0 : resultado;
};

// Alguns rótulos têm texto extra entre o nome do campo e o ":" — ex: "Taxas MP:",
// "Liquido (bruto - taxas):". Permite até 20 caracteres quaisquer (exceto ":") ali no meio.
const extrairValor = (texto, label) => {
  const regex = new RegExp(
    `${label}[^:]{0,20}:\\s*(?:R\\$)?\\s*([\\d.,]+)`,
    "i",
  );
  const match = texto.match(regex);
  return match ? parseMoney(match[1]) : 0;
};

// Extrato/fechamento (acao=stats). Sem MACHINE_PAY_API_TEMPLATE no .env, usa o
// mesmo endereço padrão da página Machine Pay original.
export const templateStats = () =>
  process.env.MACHINE_PAY_API_TEMPLATE ||
  `${baseUrl()}maquinas.php?acao=stats&posid={posid}&dataini={inicio64}&datafim={fim64}&chave={chave}`;

const construirUrlTemplate = (template, substituicoes) =>
  Object.entries(substituicoes).reduce(
    (url, [placeholder, valor]) =>
      url.replace(`{${placeholder}}`, encodeURIComponent(valor ?? "")),
    template,
  );

// ---- acao=stats: faturamento/fechamento de um posId em um período ----

export async function consultarFechamentoMachinePay({ posId, inicio, fim, chave }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }

  const template = templateStats();

  const cookie = await login();
  const url = construirUrlTemplate(template, {
    posid: posId,
    inicio64: base64(formatInicio(inicio)),
    fim64: base64(formatFim(fim)),
    chave: chave ?? process.env.MACHINE_PAY_CHAVE ?? "",
  });

  const resposta = await fetch(url, {
    headers: construirHeaders(cookie),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao consultar fechamento`,
    );
  }

  const htmlBruto = await resposta.text();
  const texto = normalizarTexto(stripHtml(htmlBruto));

  // O PHP do painel deles pode estourar uma exceção não tratada (ex: erro de
  // collation no MySQL) e devolver a página quebrada — isso é um bug do lado
  // da Machine Pay, não algo recuperável por parsing. Detectar e sinalizar
  // isso separadamente evita confundir com "layout mudou" ou "sessão expirou".
  const erroFatalPhp = texto.match(
    /Fatal error:?\s*(Uncaught\s+)?([\s\S]{0,200})/i,
  );
  if (erroFatalPhp) {
    console.error(
      "[MachinePay] Painel retornou erro fatal do PHP. HTML bruto recebido:",
      htmlBruto,
    );
    throw new MachinePayServiceError(
      502,
      `O painel Machine Pay retornou um erro interno do servidor deles ao processar esta consulta (não é um problema no nosso código). Detalhe: "${erroFatalPhp[0].trim()}"`,
    );
  }

  // Guarda de sanidade: se o campo âncora não aparecer, o painel mudou de layout
  // ou a sessão expirou silenciosamente — melhor falhar alto do que devolver zeros falsos.
  if (!/Bruto com Taxas MP/i.test(texto)) {
    console.error(
      "[MachinePay] Guarda de sanidade falhou. HTML bruto recebido:",
      htmlBruto,
    );
    throw new MachinePayServiceError(
      502,
      `Resposta da Machine Pay não contém os dados esperados (layout alterado ou sessão expirada). Trecho recebido: "${texto.slice(0, 300)}"`,
    );
  }

  const pix = extrairValor(texto, "PIX");
  const debito = extrairValor(texto, "Debito");
  const credito = extrairValor(texto, "Credito");
  const brutoComTaxasMp = extrairValor(texto, "Bruto com Taxas MP");
  const taxas =
    extrairValor(texto, "Taxas MP") || extrairValor(texto, "Taxas");
  const liquido = extrairValor(texto, "Liquido");

  const cartao = debito + credito;
  const cartaoPix = brutoComTaxasMp || cartao + pix;
  const percentualTaxaMedia = brutoComTaxasMp
    ? (taxas / brutoComTaxasMp) * 100
    : 0;

  return {
    pix,
    debito,
    credito,
    cartao,
    brutoComTaxasMp,
    cartaoPix,
    taxas,
    liquido,
    percentualTaxaMedia,
  };
}

// ---- acao=stats: vendas (pagamentos) individuais de um posId no período ----
// Mesma página do fechamento; aqui interessam as linhas de pagamento, que
// trazem o idwebhook usado para pedir devolução.
// inicio/fim: "YYYY-MM-DDTHH:MM" no horário de Brasília.

// Sessão do painel para várias consultas seguidas (ex: job de vendas por hora),
// evitando um login por consulta.
export const abrirSessaoMachinePay = () => login();

// sessao: cookie de abrirSessaoMachinePay (opcional). conferirPagina: falha se a
// página não tiver o bloco de totais (sessão expirada / layout mudou), para não
// tomar "nenhuma venda" por verdade.
export async function listarVendasMachinePay({ posId, inicio, fim, chave, sessao, conferirPagina = false }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }

  const template = templateStats();

  const cookie = sessao || (await login());
  const url = construirUrlTemplate(template, {
    posid: posId,
    inicio64: base64(formatInicio(inicio)),
    fim64: base64(formatFim(fim)),
    chave: chave ?? process.env.MACHINE_PAY_CHAVE ?? "",
  });

  const resposta = await fetch(url, { headers: construirHeaders(cookie) });
  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao consultar vendas`,
    );
  }

  const htmlBruto = await resposta.text();
  if (conferirPagina && !/Bruto com Taxas MP/i.test(stripHtml(htmlBruto))) {
    throw new MachinePayServiceError(
      502,
      "Extrato da Machine Pay sem os dados esperados (layout alterado ou sessão expirada)",
    );
  }
  const inicioData = new Date(`${inicio}-03:00`);
  const fimData = new Date(`${fim}-03:00`);

  // O painel arredonda o período para o dia: filtra pelo horário exato pedido
  return parsearVendasStats(htmlBruto)
    .filter((venda) => {
      if (!venda.data) return true;
      const data = new Date(venda.data);
      return data >= inicioData && data <= fimData;
    })
    .sort((a, b) => new Date(b.data || 0) - new Date(a.data || 0));
}

// Pede a devolução e confere a resposta do painel (o HTTP 200 sozinho não garante nada)
export async function devolverPagamentoConfirmado({ idwebhook }) {
  const { respostaBruta } = await solicitarDevolucao({ idwebhook });
  const texto = String(respostaBruta || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const mensagem = String(respostaBruta || "").match(/alert\("([^"]*)"\)/i)?.[1] || "";

  if (!(texto.includes("solicitacao de devolucao") && texto.includes(String(idwebhook)))) {
    throw new MachinePayServiceError(
      502,
      mensagem || "A Machine Pay não confirmou a devolução deste pagamento.",
    );
  }
  return { sucesso: true, mensagem };
}

// ---- acao=fechamento&tipo=maq: fecha/zera o caixa da máquina no período ----

export async function fecharFechamentoMachinePay({ posId, inicio, fim, valor, chave }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }

  const template =
    process.env.MACHINE_PAY_FECHAMENTO_TEMPLATE ||
    `${baseUrl()}maquinas.php?acao=fechamento&tipo=maq&posid={posid}&dataini={inicio64}&datafim={fim64}&valor={valor64}&chave={chave}`;

  const cookie = await login();
  const url = construirUrlTemplate(template, {
    posid: posId,
    inicio64: base64(formatInicio(inicio)),
    fim64: base64(formatFim(fim)),
    valor64: base64(Number(valor || 0).toFixed(2)),
    chave: chave ?? process.env.MACHINE_PAY_CHAVE ?? "",
  });

  const resposta = await fetch(url, {
    headers: construirHeaders(cookie),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao fechar caixa`,
    );
  }

  return { respostaBruta: await resposta.text() };
}

// ---- acao=filtro: status online/offline (exige idusr) ----

export async function consultarStatusMaquina({ posId, usrId }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }
  if (!usrId) {
    throw new MachinePayServiceError(
      400,
      "machinePayUsrId não configurado para esta máquina",
    );
  }

  const cookie = await login();
  const chavePosId = base64(posId);
  const url = `${baseUrl()}maquinas.php?acao=filtro&idusr=${encodeURIComponent(
    usrId,
  )}&chave=${encodeURIComponent(chavePosId)}`;

  const resposta = await fetch(url, {
    headers: construirHeaders(cookie),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao consultar status`,
    );
  }

  const texto = stripHtml(await resposta.text());
  const online = /online/i.test(texto) && !/offline/i.test(texto);

  return { online };
}

// ---- acao=maquinas: listagem "Dispositivos Cadastrados" ----

export async function listarMaquinasCadastradas({ usrId } = {}) {
  const cookie = await login();
  const query = usrId ? `&usr=${encodeURIComponent(usrId)}` : "";
  const url = `${baseUrl()}maquinas.php?acao=maquinas${query}`;

  const resposta = await fetch(url, {
    headers: construirHeaders(cookie),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao listar máquinas`,
    );
  }

  return resposta.text();
}

// Descoberta best-effort do usrId dono de um posId — só relevante para a feature
// secundária de status online/offline; nunca deve travar a busca de faturamento.
async function descobrirAdminUsr(posId) {
  try {
    const html = await listarMaquinasCadastradas();
    const regex = new RegExp(
      `copiarDadosMaquina\\(['"]?${posId}['"]?\\s*,\\s*['"]?(\\w+)['"]?`,
      "i",
    );
    const match = html.match(regex);
    return match ? match[1] : null;
  } catch (error) {
    console.error("[MachinePay] Falha ao descobrir admin usr:", error.message);
    return null;
  }
}

// O extrato de um caixa (acao=stats&posid=) lista os pagamentos com
// mostrar_mp('<idPagamento>', <usrDoCliente>) — dá o dono do posId sem saber
// o usr de antemão. Só funciona se o caixa teve pagamento no período padrão.
export async function descobrirUsrPorExtrato(posId) {
  if (!posId) return null;
  const cookie = await login();
  const resposta = await fetch(
    `${baseUrl()}maquinas.php?acao=stats&posid=${encodeURIComponent(posId)}`,
    { headers: construirHeaders(cookie) },
  );
  if (!resposta.ok) return null;
  const match = (await resposta.text()).match(/mostrar_mp\('[^']*'\s*,\s*(\d+)\s*\)/);
  return match ? match[1] : null;
}

export async function descobrirUsrDePosId(posId) {
  if (!posId) return null;

  try {
    const usrId = await descobrirUsrPorExtrato(posId);
    if (usrId) return usrId;
  } catch (error) {
    console.error("[MachinePay] Falha ao descobrir usr pelo extrato:", error.message);
  }

  const candidatos = String(process.env.MACHINE_PAY_USR || "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);

  for (const usrId of candidatos) {
    try {
      await consultarStatusMaquina({ posId, usrId });
      return usrId;
    } catch {
      continue;
    }
  }

  return descobrirAdminUsr(posId);
}

// ---- acao=devolver: solicita estorno de uma transação ----

export async function solicitarDevolucao({ idwebhook }) {
  if (!idwebhook) {
    throw new MachinePayServiceError(400, "idwebhook é obrigatório");
  }

  const cookie = await login();
  const url = `${baseUrl()}maquinas.php?acao=devolver&idwebhook=${encodeURIComponent(
    idwebhook,
  )}`;

  const resposta = await fetch(url, {
    headers: construirHeaders(cookie),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao solicitar devolução`,
    );
  }

  return { respostaBruta: await resposta.text() };
}

// ---- salvar_credito_mqtt.php: credita saldo manualmente numa máquina ----

export async function creditarSaldoManual({ posId, creditos }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }

  const url =
    process.env.MACHINE_PAY_MQTT_TEMPLATE || `${baseUrl()}salvar_credito_mqtt.php`;
  const method = process.env.MACHINE_PAY_MQTT_METHOD || "POST";

  const cookie = await login();
  const corpo = new URLSearchParams({
    acao: process.env.MACHINE_PAY_MQTT_ACAO || "creditar",
    posid: String(posId),
    creditos: String(creditos),
    origem: process.env.MACHINE_PAY_MQTT_ORIGEM || "1",
    tpagto: process.env.MACHINE_PAY_MQTT_TPAGTO || "Manual",
    banco: process.env.MACHINE_PAY_MQTT_BANCO || "Pagto manual criado",
  });

  const resposta = await fetch(url, {
    method,
    headers: construirHeaders(cookie, {
      "Content-Type": "application/x-www-form-urlencoded",
    }),
    body: corpo.toString(),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao creditar saldo`,
    );
  }

  return { respostaBruta: await resposta.text() };
}

// ---- Vouchers: envio de crédito igual ao do Agarra Mais ----
// Além de gravar o crédito manual (salvar_credito_mqtt.php, com os mesmos
// nomes de campo do painel: pos_id/valor/idwebhook), publica o crédito no
// WebSocket do painel — é isso que faz a máquina receber na hora. Só é
// considerado sucesso se as duas partes derem certo.

const publicarCreditoWebSocket = async (posId, valorFinal, idwebhook) => {
  const dominio = process.env.MACHINE_PAY_WS_DOMINIO || "cyberpix.com.br";
  const token = process.env.MACHINE_PAY_WS_TOKEN || "1";
  const usuario = process.env.MACHINE_PAY_WS_USUARIO || "1";
  const wsUrl = `wss://${dominio}:65501/?token=${encodeURIComponent(token)}&scope=panel`;

  const cookie = await login();

  return new Promise((resolve, reject) => {
    const ws = new WebSocketClient(wsUrl, {
      headers: {
        Cookie: cookie,
        Origin: baseUrl().replace(/\/$/, ""),
      },
      rejectUnauthorized: false,
    });

    let finalizado = false;
    const finalizar = (ok, erro) => {
      if (finalizado) return;
      finalizado = true;
      try {
        ws.close();
      } catch {}
      ok ? resolve() : reject(erro);
    };

    const timeout = setTimeout(
      () => finalizar(false, new Error("Timeout ao conectar WebSocket Machine Pay")),
      10000,
    );

    ws.on("open", () => {
      ws.send(JSON.stringify({ acao: "inscrever", canal: String(posId) }));
      ws.send(
        JSON.stringify({
          acao: "publicar",
          canal: String(posId),
          mensagem: {
            origem: usuario,
            dados: JSON.stringify({ retorno: valorFinal, idwebhook }),
          },
        }),
      );
      clearTimeout(timeout);
      setTimeout(() => finalizar(true), 1500);
    });

    ws.on("error", (erro) =>
      finalizar(false, new Error(`WebSocket Machine Pay: ${erro.message}`)),
    );
  });
};

export async function enviarCreditosMqttMachinePay({ posId, creditos = 1 }) {
  if (!posId) {
    throw new MachinePayServiceError(400, "posId da Machine Pay é obrigatório");
  }

  const idwebhook = Math.floor(
    Math.random() * 900000000000 + 100000000000,
  ).toString();
  const numero = Number(creditos || 0);
  const valorFinal = (Number.isFinite(numero) ? numero : 0).toFixed(2);

  let wsOk = false;
  let wsErro = null;
  try {
    await publicarCreditoWebSocket(posId, valorFinal, idwebhook);
    wsOk = true;
  } catch (erro) {
    wsErro = erro.message;
  }

  const url =
    process.env.MACHINE_PAY_MQTT_TEMPLATE || `${baseUrl()}salvar_credito_mqtt.php`;
  const method = (process.env.MACHINE_PAY_MQTT_METHOD || "POST").toUpperCase();

  const cookie = await login();
  const corpo = new URLSearchParams({
    acao: process.env.MACHINE_PAY_MQTT_ACAO || "creditar",
    pos_id: String(posId),
    valor: valorFinal,
    idwebhook,
    origem: process.env.MACHINE_PAY_MQTT_ORIGEM || "1",
    tpagto: process.env.MACHINE_PAY_MQTT_TPAGTO || "Manual",
    banco: process.env.MACHINE_PAY_MQTT_BANCO || "Pagto manual criado",
  });

  const resposta = await fetch(url, {
    method,
    headers: construirHeaders(cookie, {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }),
    body: corpo.toString(),
  });

  if (!resposta.ok) {
    throw new MachinePayServiceError(
      502,
      `Machine Pay retornou status ${resposta.status} ao creditar saldo`,
    );
  }

  const corpoResposta = await resposta.text();
  let json = null;
  try {
    json = JSON.parse(corpoResposta);
  } catch {}
  const texto = normalizarTexto(stripHtml(corpoResposta)).toLowerCase();
  const dbOk =
    json?.ok === true ||
    json?.status === "ok" ||
    json?.success === true ||
    /gravado com sucesso|sucesso|enviado|credito|mqtt/.test(texto);

  return {
    httpStatus: resposta.status,
    sucesso: wsOk && dbOk,
    wsOk,
    wsErro,
    creditos: numero,
    idwebhook: json?.idwebhook || idwebhook,
    resposta: json || texto.slice(0, 500),
  };
}
