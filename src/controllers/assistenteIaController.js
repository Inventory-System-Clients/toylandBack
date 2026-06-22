import { Op } from "sequelize";
import { Loja, Maquina, EstoqueLoja, Produto } from "../models/index.js";
import { gerarRelatorioImpressaoPorLoja } from "./relatorioController.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MODELO_PADRAO = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const TODAS_AS_LOJAS = "__TODAS_AS_LOJAS__";
const ASSISTENTE = {
  nome: "IAgarra",
  icone: "garra",
};
const MEMORIA_ASSISTENTE_TTL_MS = 1000 * 60 * 60 * 6;
const memoriasAssistentePorUsuario = new Map();

const MESES_PT_BR = [
  ["janeiro", 0],
  ["fevereiro", 1],
  ["marco", 2],
  ["marco", 2],
  ["abril", 3],
  ["maio", 4],
  ["junho", 5],
  ["julho", 6],
  ["agosto", 7],
  ["setembro", 8],
  ["outubro", 9],
  ["novembro", 10],
  ["dezembro", 11],
];

const TERMOS_LOJA_IGNORADOS = new Set([
  "agarra",
  "agarramais",
  "mais",
  "shopping",
  "loja",
  "quiosque",
  "self",
  "machine",
]);

const normalizar = (valor) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const formatarMoeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const hojeIso = () => new Date().toISOString().slice(0, 10);

const isoLocal = (data) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
};

const primeiroDiaMes = (ano, mesIndex) => isoLocal(new Date(ano, mesIndex, 1));

const ultimoDiaMes = (ano, mesIndex) =>
  isoLocal(new Date(ano, mesIndex + 1, 0));

const extrairTextoResposta = (resposta) => {
  if (typeof resposta?.output_text === "string") return resposta.output_text;

  const textos = [];
  for (const item of resposta?.output || []) {
    for (const conteudo of item?.content || []) {
      if (conteudo?.type === "output_text" && conteudo?.text) {
        textos.push(conteudo.text);
      }
    }
  }

  return textos.join("\n").trim();
};

const schemaComandoVoz = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "lojaId",
    "lojaNome",
    "maquinaId",
    "maquinaNome",
    "contadorIn",
    "contadorOut",
    "quantidadeAbastecida",
    "periodo",
    "respostaCurta",
    "precisaConfirmacao",
    "camposFaltantes",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "CONSULTAR_ESTOQUE",
        "GERAR_RELATORIO_LOJA",
        "ABRIR_MOVIMENTACOES",
        "AJUDA",
        "DESCONHECIDO",
      ],
    },
    lojaId: { type: ["string", "null"] },
    lojaNome: { type: ["string", "null"] },
    maquinaId: { type: ["string", "null"] },
    maquinaNome: { type: ["string", "null"] },
    contadorIn: { type: ["integer", "null"] },
    contadorOut: { type: ["integer", "null"] },
    quantidadeAbastecida: { type: ["integer", "null"] },
    periodo: {
      type: "object",
      additionalProperties: false,
      required: ["dataInicio", "dataFim", "descricao"],
      properties: {
        dataInicio: { type: ["string", "null"] },
        dataFim: { type: ["string", "null"] },
        descricao: { type: ["string", "null"] },
      },
    },
    respostaCurta: { type: "string" },
    precisaConfirmacao: { type: "boolean" },
    camposFaltantes: {
      type: "array",
      items: { type: "string" },
    },
  },
};

const schemaLeituraContadores = {
  type: "object",
  additionalProperties: false,
  required: ["contadorIn", "contadorOut", "confianca", "observacao"],
  properties: {
    contadorIn: { type: ["integer", "null"] },
    contadorOut: { type: ["integer", "null"] },
    confianca: {
      type: "string",
      enum: ["alta", "media", "baixa"],
    },
    observacao: { type: "string" },
  },
};

const chamarOpenAIParaInterpretar = async ({ texto, lojas, maquinas }) => {
  if (!process.env.OPENAI_API_KEY) {
    const erro = new Error("OPENAI_API_KEY nao configurada no backend");
    erro.status = 500;
    throw erro;
  }

  if (typeof fetch !== "function") {
    const erro = new Error(
      "fetch nativo indisponivel. Execute o backend em Node.js 18 ou superior.",
    );
    erro.status = 500;
    throw erro;
  }

  const listaLojas = lojas
    .map((loja) => `- ${loja.nome} | id: ${loja.id}`)
    .join("\n");
  const listaMaquinas = maquinas
    .map(
      (maquina) =>
        `- ${maquina.nome || maquina.codigo} | codigo: ${maquina.codigo} | id: ${maquina.id} | lojaId: ${maquina.lojaId}`,
    )
    .join("\n");

  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_PADRAO,
      instructions: [
        "Voce interpreta comandos de voz em portugues para um dashboard operacional.",
        "Retorne apenas JSON estruturado conforme o schema.",
        "Seu nome e IAgarra. Voce usa um icone de garra no frontend.",
        "Use as lojas disponiveis para resolver lojaId quando o nome bater, for muito parecido, ou quando o usuario disser apenas uma parte unica do nome da loja.",
        "Exemplo: se existir 'AgarraMais shopping Interlagos' e o usuario disser 'loja de Interlagos', use essa loja.",
        "Se o usuario pedir estoque de cada loja, todas as lojas ou geral, use lojaId \"__TODAS_AS_LOJAS__\".",
        "Para relatorio de loja, dataInicio e dataFim devem estar em YYYY-MM-DD.",
        "Quando o usuario disser 'mes de abril', 'em abril' ou equivalente, use o primeiro e o ultimo dia desse mes. Abril tem 30 dias; meses com 31 devem terminar em 31.",
        "Se o usuario disser um mes sem ano, use o ano atual.",
        `A data de hoje e ${hojeIso()}.`,
        "Se faltar loja ou periodo para relatorio, marque precisaConfirmacao e liste camposFaltantes.",
        "Abrir aba de movimentacoes ou fazer uma movimentacao deve ser intent ABRIR_MOVIMENTACOES.",
        "Quando o usuario disser que quer fazer uma movimentacao em determinada loja e maquina, preencha lojaId e maquinaId se conseguir identificar.",
        "Para movimentacoes, entenda entrada como IN e saida como OUT. Se o usuario disser entrada, contador entrada, in ou contador IN, preencha contadorIn com o numero informado.",
        "Para movimentacoes, se o usuario disser saida, contador saida, out ou contador OUT, preencha contadorOut com o numero informado.",
        "Para movimentacoes, quando o usuario disser que vai abastecer, colocar, adicionar, repor, completar ou inserir uma quantidade de pelucias/produtos, preencha quantidadeAbastecida com esse numero.",
        "Se o comando parecer complemento do comando anterior, preserve o contexto que vier no input, principalmente loja, maquina e movimentacao.",
        `Lojas disponiveis:\n${listaLojas || "- nenhuma loja cadastrada"}`,
        `Maquinas disponiveis:\n${listaMaquinas || "- nenhuma maquina cadastrada"}`,
      ].join("\n"),
      input: texto,
      text: {
        format: {
          type: "json_schema",
          name: "comando_dashboard",
          strict: true,
          schema: schemaComandoVoz,
        },
      },
      max_output_tokens: 700,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem =
      payload?.error?.message || "Falha ao interpretar comando com OpenAI";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }

  const textoJson = extrairTextoResposta(payload);
  if (!textoJson) {
    const erro = new Error("OpenAI nao retornou uma interpretacao valida");
    erro.status = 502;
    throw erro;
  }

  return JSON.parse(textoJson);
};

const chamarOpenAIParaLerContadores = async ({ imagemBase64, mimeType }) => {
  if (!process.env.OPENAI_API_KEY) {
    const erro = new Error("OPENAI_API_KEY nao configurada no backend");
    erro.status = 500;
    throw erro;
  }

  if (typeof fetch !== "function") {
    const erro = new Error(
      "fetch nativo indisponivel. Execute o backend em Node.js 18 ou superior.",
    );
    erro.status = 500;
    throw erro;
  }

  const dataUrl = `data:${mimeType};base64,${imagemBase64}`;
  const resposta = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODELO_PADRAO,
      instructions: [
        "Voce le fotos de dois contadores mecanicos numericos de maquina.",
        "Retorne apenas JSON conforme o schema.",
        "Leia somente os numeros brancos dentro das janelas pretas dos contadores mecanicos.",
        "Ignore voltimetro, regua, parafusos, cabos, madeira, etiquetas e qualquer outro numero fora dos contadores.",
        "Normalmente existem dois contadores. O maior numero sempre e contadorIn. O menor numero sempre e contadorOut.",
        "Se nao conseguir ler os dois com seguranca, retorne contadorIn null, contadorOut null e confianca baixa.",
        "Nao chute. Prefira null se estiver em duvida.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Leia os dois contadores mecanicos da foto. O maior numero e IN e o menor e OUT.",
            },
            {
              type: "input_image",
              image_url: dataUrl,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "leitura_contadores",
          strict: true,
          schema: schemaLeituraContadores,
        },
      },
      max_output_tokens: 300,
    }),
  });

  const payload = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    const mensagem =
      payload?.error?.message || "Falha ao ler contadores com OpenAI";
    const erro = new Error(mensagem);
    erro.status = resposta.status;
    throw erro;
  }

  const textoJson = extrairTextoResposta(payload);
  if (!textoJson) {
    const erro = new Error("OpenAI nao retornou uma leitura valida");
    erro.status = 502;
    throw erro;
  }

  return JSON.parse(textoJson);
};

const buscarLojasAtivas = () =>
  Loja.findAll({
    where: { ativo: true },
    attributes: ["id", "nome", "cidade", "estado", "endereco"],
    order: [["nome", "ASC"]],
    raw: true,
  });

const buscarMaquinasAtivas = () =>
  Maquina.findAll({
    where: { ativo: true },
    attributes: ["id", "codigo", "nome", "tipo", "lojaId"],
    order: [
      ["lojaId", "ASC"],
      ["codigo", "ASC"],
    ],
    raw: true,
  });

const calcularPontuacaoLojaNoTexto = (textoNormalizado, loja) => {
  const nomeNormalizado = normalizar(loja.nome);
  if (!nomeNormalizado) return 0;
  if (textoNormalizado.includes(nomeNormalizado)) return 100;

  const tokens = nomeNormalizado
    .split(" ")
    .filter((token) => token.length >= 4 && !TERMOS_LOJA_IGNORADOS.has(token));

  return tokens.reduce((score, token) => {
    if (!textoNormalizado.includes(token)) return score;
    return score + Math.min(token.length, 12);
  }, 0);
};

const inferirLojaPeloTexto = (texto, lojas) => {
  const textoNormalizado = normalizar(texto);
  if (!textoNormalizado) return null;

  const candidatas = lojas
    .map((loja) => ({
      loja,
      score: calcularPontuacaoLojaNoTexto(textoNormalizado, loja),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidatas.length) return null;
  if (candidatas.length === 1) return candidatas[0].loja;

  return candidatas[0].score > candidatas[1].score
    ? candidatas[0].loja
    : null;
};

const calcularPontuacaoMaquinaNoTexto = (textoNormalizado, maquina) => {
  const partes = [maquina.codigo, maquina.nome, maquina.tipo]
    .filter(Boolean)
    .map(normalizar)
    .filter(Boolean);

  let score = 0;
  const codigoNormalizado = normalizar(maquina.codigo);
  const numeroCodigo = codigoNormalizado.match(/\d+/)?.[0] || null;

  if (
    codigoNormalizado &&
    new RegExp(`\\b${codigoNormalizado}\\b`).test(textoNormalizado)
  ) {
    score += 140;
  }

  if (
    numeroCodigo &&
    new RegExp(`\\bmaquina\\s+${Number(numeroCodigo)}\\b`).test(
      textoNormalizado,
    )
  ) {
    score += 120;
  }

  for (const parte of partes) {
    if (new RegExp(`\\b${parte}\\b`).test(textoNormalizado)) score += 80;

    const tokens = parte
      .split(" ")
      .filter((token) => token.length >= 2 && token !== "maquina");

    for (const token of tokens) {
      if (/^\d+$/.test(token)) continue;
      const limite = Math.min(token.length, 12);
      if (new RegExp(`\\b${token}\\b`).test(textoNormalizado)) score += limite;
    }
  }

  return score;
};

const inferirMaquinaPeloTexto = ({ texto, maquinas, lojaResolvida }) => {
  const textoNormalizado = normalizar(texto);
  if (!textoNormalizado) return null;

  const maquinasElegiveis =
    lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS
      ? maquinas.filter((maquina) => maquina.lojaId === lojaResolvida.id)
      : maquinas;

  const candidatas = maquinasElegiveis
    .map((maquina) => ({
      maquina,
      score: calcularPontuacaoMaquinaNoTexto(textoNormalizado, maquina),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!candidatas.length) return null;
  if (candidatas.length === 1) return candidatas[0].maquina;

  return candidatas[0].score > candidatas[1].score
    ? candidatas[0].maquina
    : null;
};

const resolverLoja = (interpretacao, lojas) => {
  if (interpretacao.lojaId === TODAS_AS_LOJAS) return TODAS_AS_LOJAS;

  const lojaPorId = lojas.find((loja) => loja.id === interpretacao.lojaId);
  if (lojaPorId) return lojaPorId;

  const alvo = normalizar(interpretacao.lojaNome);
  if (!alvo) return null;

  return (
    lojas.find((loja) => normalizar(loja.nome) === alvo) ||
    lojas.find((loja) => normalizar(loja.nome).includes(alvo)) ||
    lojas.find((loja) => alvo.includes(normalizar(loja.nome))) ||
    null
  );
};

const resolverMaquina = ({ interpretacao, maquinas, lojaResolvida }) => {
  const maquinasElegiveis =
    lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS
      ? maquinas.filter((maquina) => maquina.lojaId === lojaResolvida.id)
      : maquinas;

  const maquinaPorId = maquinasElegiveis.find(
    (maquina) => maquina.id === interpretacao.maquinaId,
  );
  if (maquinaPorId) return maquinaPorId;

  const alvo = normalizar(interpretacao.maquinaNome);
  if (!alvo) return null;

  return (
    maquinasElegiveis.find((maquina) => normalizar(maquina.codigo) === alvo) ||
    maquinasElegiveis.find((maquina) => normalizar(maquina.nome) === alvo) ||
    maquinasElegiveis.find((maquina) =>
      normalizar(`${maquina.codigo} ${maquina.nome} ${maquina.tipo}`).includes(
        alvo,
      ),
    ) ||
    null
  );
};

const obterAnoParaMesFalado = (textoNormalizado, mesNome, anoAtual) => {
  const matchAnoDepois = textoNormalizado.match(
    new RegExp(`${mesNome}\\s+de\\s+(20\\d{2})`),
  );
  if (matchAnoDepois) return Number(matchAnoDepois[1]);

  const matchAnoAntes = textoNormalizado.match(
    new RegExp(`(20\\d{2}).{0,20}${mesNome}`),
  );
  if (matchAnoAntes) return Number(matchAnoAntes[1]);

  return anoAtual;
};

const inferirPeriodoPeloTexto = (texto) => {
  const textoNormalizado = normalizar(texto);
  const hoje = new Date();

  if (/\bmes passado\b/.test(textoNormalizado)) {
    const ano = hoje.getMonth() === 0 ? hoje.getFullYear() - 1 : hoje.getFullYear();
    const mesIndex = hoje.getMonth() === 0 ? 11 : hoje.getMonth() - 1;
    return {
      dataInicio: primeiroDiaMes(ano, mesIndex),
      dataFim: ultimoDiaMes(ano, mesIndex),
      descricao: "mes passado",
    };
  }

  for (const [mesNome, mesIndex] of MESES_PT_BR) {
    const padraoMes =
      new RegExp(`\\b(mes\\s+de|mês\\s+de|em|de)\\s+${mesNome}\\b`).test(
        textoNormalizado,
      ) || new RegExp(`\\b${mesNome}\\b`).test(textoNormalizado);

    if (!padraoMes) continue;

    const ano = obterAnoParaMesFalado(
      textoNormalizado,
      mesNome,
      hoje.getFullYear(),
    );

    return {
      dataInicio: primeiroDiaMes(ano, mesIndex),
      dataFim: ultimoDiaMes(ano, mesIndex),
      descricao: `${mesNome} de ${ano}`,
    };
  }

  return null;
};

const inferirIntentPeloTexto = (texto) => {
  const textoNormalizado = normalizar(texto);

  if (/\brelatorio\b/.test(textoNormalizado)) return "GERAR_RELATORIO_LOJA";
  if (/\bestoque\b/.test(textoNormalizado)) return "CONSULTAR_ESTOQUE";
  if (
    /\b(movimentac|abastec|abastecer|colocar|adicionar|adiciona|repor|inserir|entrada|saida|contador|in|out)\b/.test(
      textoNormalizado,
    )
  ) {
    return "ABRIR_MOVIMENTACOES";
  }

  return null;
};

const extrairNumeroAposRotulo = (textoNormalizado, rotulos) => {
  for (const rotulo of rotulos) {
    const match = textoNormalizado.match(
      new RegExp(
        `\\b${rotulo}\\b\\s*(?:e|eh|de|=|:|-)?\\s*(\\d{1,9})\\b`,
      ),
    );
    if (match) return Number(match[1]);
  }

  return null;
};

const inferirContadoresPeloTexto = (texto) => {
  const textoNormalizado = normalizar(texto);

  return {
    contadorIn: extrairNumeroAposRotulo(textoNormalizado, [
      "contador entrada",
      "contador de entrada",
      "contador in",
      "entrada",
      "in",
    ]),
    contadorOut: extrairNumeroAposRotulo(textoNormalizado, [
      "contador saida",
      "contador de saida",
      "contador out",
      "saida",
      "out",
    ]),
  };
};

const extrairQuantidadeAbastecidaPeloTexto = (texto) => {
  const textoNormalizado = normalizar(texto);
  const padroes = [
    /\b(?:abastecer|abastece|abasteci|abastecimento|colocar|coloquei|coloca|adicionar|adicionei|adiciona|add|repor|repor com|completei|completar|inserir|inseri)\b(?:\s+\w+){0,4}?\s+(\d{1,6})\b/,
    /\b(\d{1,6})\s+(?:pelucias|pelucia|produtos|produto|unidades|unidade|itens|item)\b/,
  ];

  for (const padrao of padroes) {
    const match = textoNormalizado.match(padrao);
    if (match) return Number(match[1]);
  }

  return null;
};

const normalizarMemoriaLocal = (valor) => {
  const origem = valor && typeof valor === "object" ? valor : {};
  const prefill = origem.prefill && typeof origem.prefill === "object"
    ? origem.prefill
    : origem;

  return {
    intent: origem.intent || origem.ultimoIntent || null,
    lojaId: origem.lojaId || prefill.lojaId || null,
    lojaNome: origem.lojaNome || null,
    maquinaId: origem.maquinaId || prefill.maquinaId || null,
    maquinaNome: origem.maquinaNome || null,
    contadorIn: Number.isInteger(origem.contadorIn)
      ? origem.contadorIn
      : Number.isInteger(prefill.contadorIn)
        ? prefill.contadorIn
        : null,
    contadorOut: Number.isInteger(origem.contadorOut)
      ? origem.contadorOut
      : Number.isInteger(prefill.contadorOut)
        ? prefill.contadorOut
        : null,
    quantidadeAbastecida: Number.isInteger(origem.quantidadeAbastecida)
      ? origem.quantidadeAbastecida
      : Number.isInteger(prefill.quantidadeAbastecida)
        ? prefill.quantidadeAbastecida
        : Number.isInteger(prefill.quantidadeAdicionada)
          ? prefill.quantidadeAdicionada
        : Number.isInteger(prefill.abastecidas)
          ? prefill.abastecidas
          : null,
  };
};

const obterChaveMemoriaAssistente = (req) =>
  req.usuario?.id || req.usuario?.email || req.ip || "anonimo";

const obterMemoriaAssistente = (chave) => {
  const registro = memoriasAssistentePorUsuario.get(chave);
  if (!registro) return null;

  if (Date.now() - registro.salvoEmMs > MEMORIA_ASSISTENTE_TTL_MS) {
    memoriasAssistentePorUsuario.delete(chave);
    return null;
  }

  return registro.memoria;
};

const salvarMemoriaAssistente = (chave, memoria) => {
  if (!chave || !memoria) return;

  memoriasAssistentePorUsuario.set(chave, {
    salvoEmMs: Date.now(),
    memoria,
  });
};

const completarComMemoriaLocal = ({ interpretacao, memoriaLocal }) => {
  const memoria = normalizarMemoriaLocal(memoriaLocal);
  const interpretacaoCompleta = { ...interpretacao };

  if (
    !interpretacaoCompleta.intent ||
    ["DESCONHECIDO", "AJUDA"].includes(interpretacaoCompleta.intent)
  ) {
    interpretacaoCompleta.intent = memoria.intent || interpretacaoCompleta.intent;
  }

  for (const campo of ["lojaId", "lojaNome", "maquinaId", "maquinaNome"]) {
    if (!interpretacaoCompleta[campo] && memoria[campo]) {
      interpretacaoCompleta[campo] = memoria[campo];
    }
  }

  for (const campo of ["contadorIn", "contadorOut", "quantidadeAbastecida"]) {
    if (
      !Number.isInteger(interpretacaoCompleta[campo]) &&
      Number.isInteger(memoria[campo])
    ) {
      interpretacaoCompleta[campo] = memoria[campo];
    }
  }

  return interpretacaoCompleta;
};

const completarInterpretacaoComTexto = ({
  interpretacao,
  texto,
  lojas,
  maquinas,
  memoriaLocal,
}) => {
  const interpretacaoComMemoria = completarComMemoriaLocal({
    interpretacao,
    memoriaLocal,
  });
  const interpretacaoCompleta = {
    ...interpretacaoComMemoria,
    lojaId: interpretacaoComMemoria?.lojaId ?? null,
    lojaNome: interpretacaoComMemoria?.lojaNome ?? null,
    maquinaId: interpretacaoComMemoria?.maquinaId ?? null,
    maquinaNome: interpretacaoComMemoria?.maquinaNome ?? null,
    contadorIn:
      Number.isInteger(interpretacaoComMemoria?.contadorIn) &&
      interpretacaoComMemoria.contadorIn >= 0
        ? interpretacaoComMemoria.contadorIn
        : null,
    contadorOut:
      Number.isInteger(interpretacaoComMemoria?.contadorOut) &&
      interpretacaoComMemoria.contadorOut >= 0
        ? interpretacaoComMemoria.contadorOut
        : null,
    quantidadeAbastecida:
      Number.isInteger(interpretacaoComMemoria?.quantidadeAbastecida) &&
      interpretacaoComMemoria.quantidadeAbastecida >= 0
        ? interpretacaoComMemoria.quantidadeAbastecida
        : null,
    periodo: {
      dataInicio: interpretacaoComMemoria?.periodo?.dataInicio ?? null,
      dataFim: interpretacaoComMemoria?.periodo?.dataFim ?? null,
      descricao: interpretacaoComMemoria?.periodo?.descricao ?? null,
    },
  };

  const intentInferido = inferirIntentPeloTexto(texto);
  if (
    intentInferido &&
    (!interpretacaoCompleta.intent ||
      ["DESCONHECIDO", "AJUDA"].includes(interpretacaoCompleta.intent))
  ) {
    interpretacaoCompleta.intent = intentInferido;
  }

  const lojaInferida = inferirLojaPeloTexto(texto, lojas);
  if (lojaInferida && !interpretacaoCompleta.lojaId) {
    interpretacaoCompleta.lojaId = lojaInferida.id;
    interpretacaoCompleta.lojaNome = lojaInferida.nome;
  }

  const lojaParaMaquina = resolverLoja(interpretacaoCompleta, lojas);
  const maquinaInferida = inferirMaquinaPeloTexto({
    texto,
    maquinas,
    lojaResolvida: lojaParaMaquina,
  });
  if (maquinaInferida && !interpretacaoCompleta.maquinaId) {
    interpretacaoCompleta.maquinaId = maquinaInferida.id;
    interpretacaoCompleta.maquinaNome =
      maquinaInferida.nome || maquinaInferida.codigo;
  }

  const contadoresInferidos = inferirContadoresPeloTexto(texto);
  if (
    Number.isInteger(contadoresInferidos.contadorIn) &&
    interpretacaoCompleta.contadorIn === null
  ) {
    interpretacaoCompleta.contadorIn = contadoresInferidos.contadorIn;
  }
  if (
    Number.isInteger(contadoresInferidos.contadorOut) &&
    interpretacaoCompleta.contadorOut === null
  ) {
    interpretacaoCompleta.contadorOut = contadoresInferidos.contadorOut;
  }

  const quantidadeAbastecidaInferida = extrairQuantidadeAbastecidaPeloTexto(texto);
  if (
    Number.isInteger(quantidadeAbastecidaInferida) &&
    interpretacaoCompleta.quantidadeAbastecida === null
  ) {
    interpretacaoCompleta.quantidadeAbastecida = quantidadeAbastecidaInferida;
  }

  const periodoInferido = inferirPeriodoPeloTexto(texto);
  if (
    periodoInferido &&
    (!interpretacaoCompleta.periodo.dataInicio ||
      !interpretacaoCompleta.periodo.dataFim)
  ) {
    interpretacaoCompleta.periodo = periodoInferido;
  }

  const camposFaltantes = new Set(interpretacaoCompleta.camposFaltantes || []);
  if (interpretacaoCompleta.lojaId) camposFaltantes.delete("loja");
  if (interpretacaoCompleta.maquinaId) camposFaltantes.delete("maquina");
  if (
    interpretacaoCompleta.periodo.dataInicio &&
    interpretacaoCompleta.periodo.dataFim
  ) {
    camposFaltantes.delete("periodo");
    camposFaltantes.delete("dataInicio");
    camposFaltantes.delete("dataFim");
  }

  interpretacaoCompleta.camposFaltantes = Array.from(camposFaltantes);
  interpretacaoCompleta.precisaConfirmacao =
    interpretacaoCompleta.camposFaltantes.length > 0;

  return interpretacaoCompleta;
};

const montarResumoEstoque = (estoques, lojas) => {
  const porLoja = new Map(
    lojas.map((loja) => [
      loja.id,
      {
        loja,
        produtos: [],
        totalItens: 0,
        produtosBaixoEstoque: 0,
      },
    ]),
  );

  for (const item of estoques) {
    const grupo = porLoja.get(item.lojaId);
    if (!grupo) continue;

    const quantidade = Number(item.quantidade || 0);
    const minimo = Number(item.estoqueMinimo || item.produto?.estoqueMinimo || 0);
    const produto = {
      id: item.produto?.id,
      nome: item.produto?.nome || "Produto",
      codigo: item.produto?.codigo || null,
      quantidade,
      estoqueMinimo: minimo,
      baixoEstoque: quantidade <= minimo,
    };

    grupo.produtos.push(produto);
    grupo.totalItens += quantidade;
    if (produto.baixoEstoque) grupo.produtosBaixoEstoque += 1;
  }

  return Array.from(porLoja.values()).map((grupo) => ({
    loja: grupo.loja,
    totalItens: grupo.totalItens,
    produtosBaixoEstoque: grupo.produtosBaixoEstoque,
    produtos: grupo.produtos.sort((a, b) => a.nome.localeCompare(b.nome)),
  }));
};

const executarConsultaEstoque = async ({ lojaResolvida, lojas }) => {
  const lojasConsultadas =
    lojaResolvida === TODAS_AS_LOJAS ? lojas : [lojaResolvida].filter(Boolean);

  if (!lojasConsultadas.length) {
    return {
      status: "precisa_confirmacao",
      mensagem: "Qual loja voce quer consultar?",
      camposFaltantes: ["loja"],
    };
  }

  const estoques = await EstoqueLoja.findAll({
    where: {
      ativo: true,
      lojaId: { [Op.in]: lojasConsultadas.map((loja) => loja.id) },
    },
    include: [
      {
        model: Produto,
        as: "produto",
        attributes: ["id", "nome", "codigo", "emoji", "estoqueMinimo"],
      },
    ],
    order: [[{ model: Produto, as: "produto" }, "nome", "ASC"]],
  });

  const resumo = montarResumoEstoque(estoques, lojasConsultadas);
  const totalGeral = resumo.reduce((acc, loja) => acc + loja.totalItens, 0);
  const texto =
    resumo.length === 1
      ? `${resumo[0].loja.nome} tem ${resumo[0].totalItens} itens em estoque.`
      : `As ${resumo.length} lojas consultadas somam ${totalGeral} itens em estoque.`;

  return {
    status: "executado",
    tipo: "estoque",
    mensagem: texto,
    dados: { lojas: resumo, totalGeral },
  };
};

const montarResumoRelatorio = (relatorio) => {
  const totais = relatorio?.totais || {};
  const loja = relatorio?.loja?.nome || "Loja";

  return [
    `${loja}: ${Number(totais.fichas || 0)} fichas e ${Number(totais.produtosSairam || 0)} produtos sairam no periodo.`,
    `Bruto consolidado: ${formatarMoeda(totais.valorBrutoConsolidadoLojaMaquinas)}. Liquido consolidado: ${formatarMoeda(totais.valorLiquidoConsolidadoLojaMaquinas)}.`,
    `Gasto total do periodo: ${formatarMoeda(totais.gastoTotalPeriodo)}.`,
  ].join(" ");
};

const executarRelatorioLoja = async ({ interpretacao, lojaResolvida }) => {
  if (!lojaResolvida || lojaResolvida === TODAS_AS_LOJAS) {
    return {
      status: "precisa_confirmacao",
      mensagem: "De qual loja voce quer gerar o relatorio?",
      camposFaltantes: ["loja"],
    };
  }

  const { dataInicio, dataFim } = interpretacao.periodo || {};
  if (!dataInicio || !dataFim) {
    return {
      status: "precisa_confirmacao",
      mensagem: "Qual periodo devo usar para gerar o relatorio?",
      camposFaltantes: ["periodo"],
    };
  }

  const relatorio = await gerarRelatorioImpressaoPorLoja({
    lojaId: lojaResolvida.id,
    dataInicio,
    dataFim,
  });

  return {
    status: "executado",
    tipo: "relatorio-loja",
    mensagem: montarResumoRelatorio(relatorio),
    acao: {
      tipo: "abrir_relatorio",
      rota: "/relatorios",
      query: {
        lojaId: lojaResolvida.id,
        dataInicio,
        dataFim,
      },
      endpoint: `/api/relatorios/impressao?lojaId=${encodeURIComponent(
        lojaResolvida.id,
      )}&dataInicio=${encodeURIComponent(dataInicio)}&dataFim=${encodeURIComponent(
        dataFim,
      )}`,
    },
    dados: relatorio,
  };
};

const montarPrefillMovimentacao = ({ interpretacao, lojaResolvida, maquinaResolvida }) => ({
  lojaId: lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS ? lojaResolvida.id : null,
  maquinaId: maquinaResolvida?.id || null,
  contadorIn: Number.isInteger(interpretacao?.contadorIn)
    ? interpretacao.contadorIn
    : null,
  contadorOut: Number.isInteger(interpretacao?.contadorOut)
    ? interpretacao.contadorOut
    : null,
  quantidadeAbastecida: Number.isInteger(interpretacao?.quantidadeAbastecida)
    ? interpretacao.quantidadeAbastecida
    : null,
  quantidadeAdicionada: Number.isInteger(interpretacao?.quantidadeAbastecida)
    ? interpretacao.quantidadeAbastecida
    : null,
  abastecidas: Number.isInteger(interpretacao?.quantidadeAbastecida)
    ? interpretacao.quantidadeAbastecida
    : null,
});

const montarMemoriaLocal = ({
  texto,
  interpretacao,
  lojaResolvida,
  maquinaResolvida,
  resultado,
}) => ({
  versao: 1,
  salvoEm: new Date().toISOString(),
  ultimoTexto: texto,
  intent: interpretacao.intent,
  lojaId:
    lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS ? lojaResolvida.id : null,
  lojaNome:
    lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS ? lojaResolvida.nome : null,
  maquinaId: maquinaResolvida?.id || null,
  maquinaNome: maquinaResolvida?.nome || maquinaResolvida?.codigo || null,
  contadorIn: Number.isInteger(interpretacao?.contadorIn)
    ? interpretacao.contadorIn
    : null,
  contadorOut: Number.isInteger(interpretacao?.contadorOut)
    ? interpretacao.contadorOut
    : null,
  quantidadeAbastecida: Number.isInteger(interpretacao?.quantidadeAbastecida)
    ? interpretacao.quantidadeAbastecida
    : null,
  quantidadeAdicionada: Number.isInteger(interpretacao?.quantidadeAbastecida)
    ? interpretacao.quantidadeAbastecida
    : null,
  prefill: resultado?.acao?.prefill || resultado?.dados?.prefill || null,
});

const executarAbrirMovimentacoes = ({
  interpretacao,
  lojaResolvida,
  maquinaResolvida,
}) => {
  const prefill = montarPrefillMovimentacao({
    interpretacao,
    lojaResolvida,
    maquinaResolvida,
  });

  if (!lojaResolvida || lojaResolvida === TODAS_AS_LOJAS) {
    return {
      status: "precisa_confirmacao",
      tipo: "navegacao",
      mensagem: "Qual loja devo selecionar para a movimentacao?",
      camposFaltantes: ["loja"],
      acao: {
        tipo: "abrir_movimentacao",
        rota: "/movimentacoes",
        modo: "nova_movimentacao",
        abrirFormulario: true,
        query: prefill,
        prefill,
      },
    };
  }

  if (!maquinaResolvida) {
    return {
      status: "precisa_confirmacao",
      tipo: "navegacao",
      mensagem: "Qual maquina devo selecionar para a movimentacao?",
      camposFaltantes: ["maquina"],
      acao: {
        tipo: "abrir_movimentacao",
        rota: "/movimentacoes",
        modo: "nova_movimentacao",
        abrirFormulario: true,
        query: {
          lojaId: lojaResolvida.id,
          maquinaId: null,
          contadorIn: prefill.contadorIn,
          contadorOut: prefill.contadorOut,
          quantidadeAbastecida: prefill.quantidadeAbastecida,
          quantidadeAdicionada: prefill.quantidadeAdicionada,
          abastecidas: prefill.abastecidas,
        },
        prefill,
      },
    };
  }

  return {
    status: "executado",
    tipo: "navegacao",
    mensagem: `Abrindo movimentacoes com ${lojaResolvida.nome} e maquina ${
      maquinaResolvida.nome || maquinaResolvida.codigo
    } selecionadas.`,
    acao: {
      tipo: "abrir_movimentacao",
      rota: "/movimentacoes",
      modo: "nova_movimentacao",
      abrirFormulario: true,
      query: {
        lojaId: lojaResolvida.id,
        maquinaId: maquinaResolvida.id,
        contadorIn: prefill.contadorIn,
        contadorOut: prefill.contadorOut,
        quantidadeAbastecida: prefill.quantidadeAbastecida,
        quantidadeAdicionada: prefill.quantidadeAdicionada,
        abastecidas: prefill.abastecidas,
      },
      prefill,
    },
    dados: {
      loja: lojaResolvida,
      maquina: maquinaResolvida,
      prefill,
    },
  };
};

export const processarComandoAssistenteIa = async (req, res) => {
  try {
    const texto = String(req.body?.texto || req.body?.transcricao || "").trim();
    const chaveMemoria = obterChaveMemoriaAssistente(req);
    const memoriaLocal =
      req.body?.memoriaLocal ||
      req.body?.ultimoComando ||
      req.body?.contextoAnterior ||
      obterMemoriaAssistente(chaveMemoria) ||
      null;

    if (!texto) {
      return res.status(400).json({ error: "texto e obrigatorio" });
    }

    const [lojas, maquinas] = await Promise.all([
      buscarLojasAtivas(),
      buscarMaquinasAtivas(),
    ]);
    const interpretacaoOpenAI = await chamarOpenAIParaInterpretar({
      texto,
      lojas,
      maquinas,
    });
    const interpretacao = completarInterpretacaoComTexto({
      interpretacao: interpretacaoOpenAI,
      texto,
      lojas,
      maquinas,
      memoriaLocal,
    });
    const lojaResolvida = resolverLoja(interpretacao, lojas);
    const maquinaResolvida = resolverMaquina({
      interpretacao,
      maquinas,
      lojaResolvida,
    });

    let resultado;
    if (interpretacao.intent === "CONSULTAR_ESTOQUE") {
      resultado = await executarConsultaEstoque({ lojaResolvida, lojas });
    } else if (interpretacao.intent === "GERAR_RELATORIO_LOJA") {
      resultado = await executarRelatorioLoja({ interpretacao, lojaResolvida });
    } else if (interpretacao.intent === "ABRIR_MOVIMENTACOES") {
      resultado = executarAbrirMovimentacoes({
        interpretacao,
        lojaResolvida,
        maquinaResolvida,
      });
    } else {
      resultado = {
        status: "nao_entendido",
        mensagem:
          interpretacao.respostaCurta ||
          "Nao entendi o comando. Posso consultar estoque, abrir movimentacoes ou gerar relatorio de uma loja por periodo.",
      };
    }

    const memoriaAtualizada = montarMemoriaLocal({
      texto,
      interpretacao,
      lojaResolvida,
      maquinaResolvida,
      resultado,
    });
    salvarMemoriaAssistente(chaveMemoria, memoriaAtualizada);

    return res.json({
      assistente: ASSISTENTE,
      transcricao: texto,
      interpretacao,
      lojaResolvida:
        lojaResolvida && lojaResolvida !== TODAS_AS_LOJAS ? lojaResolvida : null,
      maquinaResolvida,
      resultado,
      memoriaLocal: memoriaAtualizada,
    });
  } catch (error) {
    console.error("Erro no assistente de IA:", error);
    return res.status(error.status || 500).json({
      error: "Erro ao processar comando do assistente",
      message: error.message,
    });
  }
};

export const lerContadoresPorImagem = async (req, res) => {
  try {
    const imagemBase64 = String(req.body?.imagemBase64 || "")
      .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "")
      .trim();
    const mimeType = String(req.body?.mimeType || "image/jpeg").trim();

    if (!imagemBase64) {
      return res.status(400).json({ error: "imagemBase64 e obrigatoria" });
    }

    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(mimeType)) {
      return res.status(400).json({
        error: "Formato de imagem invalido. Use JPEG, PNG ou WEBP.",
      });
    }

    const tamanhoEstimadoBytes = Math.ceil((imagemBase64.length * 3) / 4);
    if (tamanhoEstimadoBytes > 5 * 1024 * 1024) {
      return res.status(413).json({
        error: "Imagem muito grande. Envie uma foto com ate 5MB.",
      });
    }

    const leitura = await chamarOpenAIParaLerContadores({
      imagemBase64,
      mimeType,
    });

    const contadorIn =
      typeof leitura.contadorIn === "number" ? leitura.contadorIn : null;
    const contadorOut =
      typeof leitura.contadorOut === "number" ? leitura.contadorOut : null;

    return res.json({
      contadorIn,
      contadorOut,
      confianca: leitura.confianca || "baixa",
      observacao: leitura.observacao || "",
    });
  } catch (error) {
    console.error("Erro ao ler contadores por imagem:", error);
    return res.status(error.status || 500).json({
      error: "Erro ao ler contadores por imagem",
      message: error.message,
    });
  }
};
