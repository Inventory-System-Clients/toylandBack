const DEFAULT_LOGIN_URL =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/";
const DEFAULT_API_TEMPLATE =
  "https://www.cyberpix.com.br/pix-adesivo-clientes/maquinas.php?acao=stats&posid={posid}&dataini={inicio64}&datafim={fim64}&chave={chave}";

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
      brutoComTaxasMp > 0
        ? Number(((taxas / brutoComTaxasMp) * 100).toFixed(4))
        : 0,
  };
};

const formatInicio = (value) => String(value || "").slice(0, 10);
const formatFim = (value) => String(value || "").slice(0, 16);

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
