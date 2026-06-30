const DEFAULT_LOGIN_URL =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/";
const DEFAULT_API_TEMPLATE =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/maquinas.php?acao=stats&posid={posid}&dataini={inicio64}&datafim={fim64}&chave={chave}";
const DEFAULT_FECHAMENTO_TEMPLATE =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/maquinas.php?acao=fechamento&tipo=maq&dataini={inicio64}&datafim={fim64}&valor={valor64}&id={id}&pos_id={posid}";
const DEFAULT_TABELA_DINAMICA_TEMPLATE =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/tabela_dinamica.php?filtro=todos";
const DEFAULT_MQTT_TEMPLATE =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/salvar_credito_mqtt.php";

const required = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Configure ${name} no ambiente do backend`);
  }
  return value;
};

const encodeBase64 = (value) =>
  Buffer.from(String(value || ""), "utf8").toString("base64");

const extractCookies = (response) => {
  const getSetCookie = response.headers.getSetCookie;
  const values =
    typeof getSetCookie === "function"
      ? getSetCookie.call(response.headers)
      : [response.headers.get("set-cookie")].filter(Boolean);

  return values.map((cookie) => cookie.split(";")[0]).join("; ");
};

const mergeCookies = (...cookieHeaders) => {
  const cookies = new Map();

  for (const header of cookieHeaders.filter(Boolean)) {
    for (const item of header.split(/;\s*/)) {
      const separator = item.indexOf("=");
      if (separator <= 0) continue;
      cookies.set(item.slice(0, separator), item.slice(separator + 1));
    }
  }

  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
};

const parseMoney = (value) => {
  if (!value) return 0;

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
};

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractValue = (text, pattern) => text.match(pattern)?.[1]?.trim() || "";

const parseStats = (html) => {
  const block =
    html.match(
      /<div class="custom-text-right">([\s\S]*?Soma das categorias:[\s\S]*?)<\/div>/i,
    )?.[1] || html;
  const text = stripHtml(block)
    .replace(/ComissÃƒÂ£o|ComissÃ£o/g, "Comissao")
    .replace(/LÃƒÂ­quido|LÃ­quido/g, "Liquido")
    .replace(/DÃƒÂ©bito|DÃ©bito/g, "Debito")
    .replace(/CrÃƒÂ©dito|CrÃ©dito/g, "Credito")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const pix = parseMoney(extractValue(text, /PIX:\s*(R\$\s*[\d.,]+)/i));
  const debito = parseMoney(
    extractValue(text, /Debito:\s*(R\$\s*[\d.,]+)/i),
  );
  const credito = parseMoney(
    extractValue(text, /Credito:\s*(R\$\s*[\d.,]+)/i),
  );
  const taxas = parseMoney(
    extractValue(text, /Taxas MP:\s*(R\$\s*[\d.,]+)/i),
  );
  const liquido = parseMoney(
    extractValue(text, /Liquido \(bruto - taxas\):\s*(R\$\s*[\d.,]+)/i),
  );
  const brutoComTaxasMp = parseMoney(
    extractValue(text, /Bruto com Taxas MP:\s*(R\$\s*[\d.,]+)/i),
  );

  if (
    !/Bruto com Taxas MP:/i.test(text)
  ) {
    throw new Error(
      "A Machine Pay não devolveu o campo Bruto com Taxas MP esperado",
    );
  }

  return {
    pix,
    debito,
    credito,
    cartao: Number((debito + credito).toFixed(2)),
    brutoComTaxasMp,
    cartaoPix: brutoComTaxasMp,
    taxas,
    liquido,
    percentualTaxaMedia:
      debito + credito > 0
        ? Number(((taxas / (debito + credito)) * 100).toFixed(4))
        : 0,
  };
};

const formatInicio = (value) => String(value || "").slice(0, 10);
const formatFim = (value) => String(value || "").slice(0, 16);

const formatMoneyBr = (value) => {
  const number = Number(value || 0);
  return `R$ ${(Number.isFinite(number) ? number : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDecimalMachinePay = (value) => {
  const number = Number(value || 0);
  return (Number.isFinite(number) ? number : 0).toFixed(2);
};

const buildStatsUrl = ({ posId, inicio, fim }) => {
  const inicioFormatado = formatInicio(inicio);
  const fimFormatado = formatFim(fim);

  return (
  (process.env.MACHINE_PAY_API_TEMPLATE || DEFAULT_API_TEMPLATE)
    .replaceAll("{posid}", encodeURIComponent(posId))
    .replaceAll("{inicio}", encodeURIComponent(inicioFormatado))
    .replaceAll("{fim}", encodeURIComponent(fimFormatado))
    .replaceAll("{dataInicio}", encodeURIComponent(inicioFormatado))
    .replaceAll("{dataFim}", encodeURIComponent(fimFormatado))
    .replaceAll("{inicio64}", encodeURIComponent(encodeBase64(inicioFormatado)))
    .replaceAll("{fim64}", encodeURIComponent(encodeBase64(fimFormatado)))
    .replaceAll(
      "{dataInicio64}",
      encodeURIComponent(encodeBase64(inicioFormatado)),
    )
    .replaceAll(
      "{dataFim64}",
      encodeURIComponent(encodeBase64(fimFormatado)),
    )
    .replaceAll(
      "{chave}",
      encodeURIComponent(process.env.MACHINE_PAY_CHAVE || ""),
    )
  );
};

const replaceMachinePayTokens = ({
  template,
  posId,
  inicio,
  fim,
  creditos = 1,
}) => {
  const inicioFormatado = formatInicio(inicio);
  const fimFormatado = formatFim(fim);

  return template
    .replaceAll("{posid}", encodeURIComponent(posId))
    .replaceAll("{pos_id}", encodeURIComponent(posId))
    .replaceAll("{inicio}", encodeURIComponent(inicioFormatado))
    .replaceAll("{fim}", encodeURIComponent(fimFormatado))
    .replaceAll("{dataInicio}", encodeURIComponent(inicioFormatado))
    .replaceAll("{dataFim}", encodeURIComponent(fimFormatado))
    .replaceAll("{inicio64}", encodeURIComponent(encodeBase64(inicioFormatado)))
    .replaceAll("{fim64}", encodeURIComponent(encodeBase64(fimFormatado)))
    .replaceAll(
      "{dataInicio64}",
      encodeURIComponent(encodeBase64(inicioFormatado)),
    )
    .replaceAll(
      "{dataFim64}",
      encodeURIComponent(encodeBase64(fimFormatado)),
    )
    .replaceAll("{creditos}", encodeURIComponent(creditos))
    .replaceAll("{creditos64}", encodeURIComponent(encodeBase64(creditos)))
    .replaceAll(
      "{chave}",
      encodeURIComponent(process.env.MACHINE_PAY_CHAVE || ""),
    );
};

const fetchMachinePay = async (url, options = {}) => {
  const { cookies, loginUrl } = await login();
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Accept: "*/*",
      Cookie: cookies,
      Referer: loginUrl,
      "X-Requested-With": "XMLHttpRequest",
      ...(options.headers || {}),
    },
    body: options.body,
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Machine Pay respondeu com status ${response.status}`);
  }

  return { status: response.status, body };
};

const tryParseJson = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const normalizarTexto = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const parseDataHoraTabela = (texto) => {
  const match = String(texto || "").match(
    /(\d{2})\/(\d{2})\/(\d{4})-(\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return null;

  const [, dia, mes, ano, hora, min, seg] = match;
  const data = new Date(`${ano}-${mes}-${dia}T${hora}:${min}:${seg}`);
  return Number.isNaN(data.getTime()) ? null : data;
};

const parseValorOuZero = (texto) => {
  if (!texto || /zero/i.test(texto)) return 0;
  const match = String(texto).match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
};

const parseLinhaTabelaDinamica = (rowHtml) => {
  const queueId = extractValue(rowHtml, /&#128193;\s*(\d+)/);
  if (!queueId) return null;

  const posId = extractValue(rowHtml, /onclick="stats\((\d+)\)/);
  const pointName = extractValue(
    rowHtml,
    /background-color:\s*#0095CD[^>]*>([^<]+)<\/span>/,
  );
  const clienteNome = extractValue(
    rowHtml,
    /onclick="abrirMaquinas\('([^']*)'\)/,
  ).trim();

  const valores = {};
  for (const match of rowHtml.matchAll(
    /<b[^>]*>&nbsp;([\s\S]*?)&nbsp;<\/b>\s*<br>\s*<span[^>]*>([^<]+)<\/span>/g,
  )) {
    const valorTexto = stripHtml(match[1]);
    const label = stripHtml(match[2]);
    if (/cliente pagou/i.test(label)) valores.valorPago = parseValorOuZero(valorTexto);
    else if (/banco retirou|valor vazio/i.test(label)) valores.taxa = parseValorOuZero(valorTexto);
    else if (/voc[eê] recebeu/i.test(label)) valores.liquido = parseValorOuZero(valorTexto);
  }

  const bancoMetodoBloco = rowHtml.match(/class="hide-print">([\s\S]*?)<\/td>/)?.[1] || "";
  const bancoMetodo = stripHtml(
    bancoMetodoBloco.match(
      /font-weight:\s*bold;\s*font-size:\s*13px[^"]*">([\s\S]*?)<\/div>/,
    )?.[1] || "",
  );

  const statusVenda = extractValue(rowHtml, /<strong>([^<]*Venda[^<]*)<\/strong>/);
  const referenciaVenda = extractValue(rowHtml, /\u{1F50D}\s*<span[^>]*>([^<]+)<\/span>/u);
  const dataHoraTexto = extractValue(
    rowHtml,
    /✅\s*(\d{2}\/\d{2}\/\d{4}-\d{2}:\d{2}:\d{2})/u,
  );
  const dataHora = parseDataHoraTabela(dataHoraTexto);
  const deviceStatus = extractValue(
    rowHtml,
    /<i class="fa fa-wifi"[^>]*><\/i>\s*<span[^>]*>([^<]+)<\/span>/,
  );
  const deviceSerial = extractValue(
    rowHtml,
    /font-size:\s*12px;\s*font-weight:\s*bold;\s*color:\s*#444;[^"]*">(\d+)<\/div>/,
  );

  return {
    id: queueId,
    posId,
    pointName,
    clienteNome,
    valorPago: valores.valorPago || 0,
    taxa: valores.taxa || 0,
    liquido: valores.liquido ?? valores.valorPago ?? 0,
    bancoMetodo,
    statusVenda: statusVenda || "",
    referenciaVenda: referenciaVenda || "",
    data: dataHora ? dataHora.toISOString() : null,
    deviceStatus: deviceStatus || "",
    deviceSerial: deviceSerial || "",
  };
};

const parseTabelaDinamica = (html) => {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || html;
  const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  return rows
    .map((row) => {
      try {
        return parseLinhaTabelaDinamica(row[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const buildFechamentoUrl = ({ posId, inicio, fim, valor = 0 }) => {
  const inicioFormatado = formatInicio(inicio);
  const fimFormatado = formatFim(fim);
  const loginMachinePay = required("MACHINE_PAY_LOGIN");

  return (
    (process.env.MACHINE_PAY_FECHAMENTO_TEMPLATE ||
      DEFAULT_FECHAMENTO_TEMPLATE)
      .replaceAll("{posid}", encodeURIComponent(posId))
      .replaceAll("{pos_id}", encodeURIComponent(posId))
      .replaceAll("{inicio}", encodeURIComponent(inicioFormatado))
      .replaceAll("{fim}", encodeURIComponent(fimFormatado))
      .replaceAll("{dataInicio}", encodeURIComponent(inicioFormatado))
      .replaceAll("{dataFim}", encodeURIComponent(fimFormatado))
      .replaceAll(
        "{inicio64}",
        encodeURIComponent(encodeBase64(inicioFormatado)),
      )
      .replaceAll("{fim64}", encodeURIComponent(encodeBase64(fimFormatado)))
      .replaceAll(
        "{dataInicio64}",
        encodeURIComponent(encodeBase64(inicioFormatado)),
      )
      .replaceAll(
        "{dataFim64}",
        encodeURIComponent(encodeBase64(fimFormatado)),
      )
      .replaceAll("{valor}", encodeURIComponent(formatMoneyBr(valor)))
      .replaceAll(
        "{valor64}",
        encodeURIComponent(encodeBase64(formatMoneyBr(valor))),
      )
      .replaceAll("{id}", encodeURIComponent(loginMachinePay))
      .replaceAll("{usr}", encodeURIComponent(loginMachinePay))
  );
};

const login = async () => {
  const loginUrl = process.env.MACHINE_PAY_LOGIN_URL || DEFAULT_LOGIN_URL;
  const initialResponse = await fetch(loginUrl, { redirect: "manual" });
  let cookies = extractCookies(initialResponse);

  const url = new URL("index.php", loginUrl);
  url.searchParams.set("acao", "login");
  url.searchParams.set("usr", encodeBase64(required("MACHINE_PAY_LOGIN")));
  url.searchParams.set("snh", encodeBase64(required("MACHINE_PAY_PASSWORD")));

  const loginResponse = await fetch(url, {
    headers: {
      Accept: "*/*",
      Cookie: cookies,
      Referer: loginUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
    redirect: "manual",
  });

  cookies = mergeCookies(cookies, extractCookies(loginResponse));
  const body = await loginResponse.text();

  if (!loginResponse.ok || /senha|login incorreto|acesso negado/i.test(body)) {
    throw new Error("Falha ao autenticar na Machine Pay");
  }

  return { cookies, loginUrl };
};

export const consultarFechamentoMachinePay = async ({
  posId,
  inicio,
  fim,
}) => {
  const { cookies, loginUrl } = await login();
  const url = buildStatsUrl({ posId, inicio, fim });
  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      Cookie: cookies,
      Referer: loginUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Machine Pay respondeu com status ${response.status}`);
  }

  return parseStats(body);
};

export const fecharFechamentoMachinePay = async ({
  posId,
  inicio,
  fim,
  valor = 0,
}) => {
  const { cookies, loginUrl } = await login();
  const url = buildFechamentoUrl({ posId, inicio, fim, valor });
  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      Cookie: cookies,
      Referer: loginUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
  });
  const body = await response.text();

  if (!response.ok) {
    throw new Error(`Machine Pay respondeu com status ${response.status}`);
  }

  const concluido =
    /maquinasFechamentoConcluido|fechamento\s+conclu/i.test(body);

  return {
    concluido,
    status: response.status,
  };
};

export const consultarStatusMachinePay = async ({ posId }) => {
  const url =
    process.env.MACHINE_PAY_TABELA_TEMPLATE || DEFAULT_TABELA_DINAMICA_TEMPLATE;
  const { body, status } = await fetchMachinePay(url);
  const registro = parseTabelaDinamica(body).find(
    (item) => String(item.posId) === String(posId),
  );

  if (!registro) {
    return {
      httpStatus: status,
      consultadoEm: new Date().toISOString(),
      online: false,
      status: "desconhecido",
      bruto: null,
    };
  }

  const online = /online/i.test(registro.deviceStatus);

  return {
    httpStatus: status,
    consultadoEm: new Date().toISOString(),
    online,
    status: online ? "online" : "offline",
    ultimaTransacaoEm: registro.data,
    bruto: registro.deviceStatus,
  };
};

export const consultarTransacoesMachinePay = async ({ posId, inicio, fim }) => {
  const url =
    process.env.MACHINE_PAY_TABELA_TEMPLATE || DEFAULT_TABELA_DINAMICA_TEMPLATE;
  const { body, status } = await fetchMachinePay(url);
  const registros = parseTabelaDinamica(body);

  const inicioData = inicio ? new Date(inicio) : null;
  const fimData = fim ? new Date(fim) : null;

  const transacoes = registros
    .filter((registro) => String(registro.posId) === String(posId))
    .filter((registro) => {
      if (!registro.data) return true;
      const dataRegistro = new Date(registro.data);
      if (inicioData && dataRegistro < inicioData) return false;
      if (fimData && dataRegistro > fimData) return false;
      return true;
    })
    .map((registro) => ({
      id: registro.id,
      data: registro.data,
      tipo: registro.bancoMetodo || "Transacao",
      status: registro.statusVenda || "-",
      valor: registro.valorPago,
      taxa: registro.taxa,
      liquido: registro.liquido,
      referencia: registro.referenciaVenda,
    }));

  return {
    httpStatus: status,
    inicio,
    fim,
    transacoes,
    total: Number(
      transacoes.reduce((sum, item) => sum + Number(item.valor || 0), 0).toFixed(2),
    ),
    quantidade: transacoes.length,
  };
};

export const enviarCreditosMqttMachinePay = async ({ posId, creditos = 1 }) => {
  const method = (process.env.MACHINE_PAY_MQTT_METHOD || "POST").toUpperCase();
  const url = replaceMachinePayTokens({
    template: process.env.MACHINE_PAY_MQTT_TEMPLATE || DEFAULT_MQTT_TEMPLATE,
    posId,
    creditos,
  });
  const idwebhook = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
  const formData = new URLSearchParams({
    acao: process.env.MACHINE_PAY_MQTT_ACAO || "creditar",
    pos_id: String(posId),
    valor: formatDecimalMachinePay(creditos),
    idwebhook,
    origem: process.env.MACHINE_PAY_MQTT_ORIGEM || "1",
    tpagto: process.env.MACHINE_PAY_MQTT_TPAGTO || "Manual",
    banco: process.env.MACHINE_PAY_MQTT_BANCO || "Pagto manual criado",
  });

  const { body, status } = await fetchMachinePay(url, {
    method,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: formData,
  });
  const json = tryParseJson(body);
  const text = normalizarTexto(stripHtml(body));
  const sucesso =
    json?.ok === true ||
    json?.status === "ok" ||
    json?.success === true ||
    /gravado com sucesso|sucesso|enviado|credito|mqtt/.test(text);

  return {
    httpStatus: status,
    sucesso,
    creditos: Number(creditos || 1),
    online: json?.stsock ? normalizarTexto(json.stsock) === "online" : null,
    idwebhook: json?.idwebhook || null,
    resposta: json || text.slice(0, 500),
  };
};
