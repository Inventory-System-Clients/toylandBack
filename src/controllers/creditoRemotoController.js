import crypto from "crypto";
import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  CreditoRemotoLink,
  CreditoRemotoEnvio,
  Loja,
  Maquina,
  Usuario,
} from "../models/index.js";
import { enviarCreditosMqttMachinePay } from "../services/machinePayService.js";

const LIMITE_PADRAO_REAIS = 150;
const LIMITE_MAXIMO_REAIS = 10000;
const VALOR_MINIMO_ENVIO_CENTAVOS = 100;
const QUANTIDADE_MAXIMA_POR_LOTE = 50;

// 32 bytes aleatórios em base64url = 43 caracteres.
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENSAGEM_LINK_INVALIDO = "Voucher inválido ou expirado.";

const gerarToken = () => crypto.randomBytes(32).toString("base64url");

const hashToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex");

// Cópia cifrada do token, só pra o admin conseguir copiar o link de novo.
// A chave sai do JWT_SECRET (que já fica só no ambiente do backend).
const chaveCifra = () =>
  crypto
    .createHash("sha256")
    .update(`${process.env.JWT_SECRET || ""}:credito-remoto`)
    .digest();

const cifrarToken = (token) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const conteudo = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), conteudo]
    .map((parte) => parte.toString("base64url"))
    .join(".");
};

const decifrarToken = (valor) => {
  try {
    const [iv, tag, conteudo] = String(valor || "")
      .split(".")
      .map((parte) => Buffer.from(parte, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", chaveCifra(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(conteudo), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    return null;
  }
};

const centavosParaReais = (centavos) => Number((centavos / 100).toFixed(2));

// Só entram máquinas ativas, com ID Machine Pay e "TOYLAND" no nome (ou no
// código, quando o nome está vazio). Aceita "Toyland", "TOY LAND" etc.
const FILTRO_NOME_TOYLAND = "toy\\s*land";

const whereMaquinasMachinePay = {
  ativo: true,
  machinePayPosId: { [Op.ne]: null },
  [Op.or]: [
    { nome: { [Op.iRegexp]: FILTRO_NOME_TOYLAND } },
    { codigo: { [Op.iRegexp]: FILTRO_NOME_TOYLAND } },
  ],
};

const nomeMaquina = (maquina) => maquina?.nome || maquina?.codigo || "-";

// Onde o link vale (sempre dentro das máquinas TOYLAND):
// - máquina fixa (ex.: link de teste) = só aquela máquina;
// - lojas escolhidas = máquinas TOYLAND dessas lojas;
// - nenhum dos dois = todas as máquinas TOYLAND.
const whereMaquinasDoLink = (link) => {
  if (link?.maquinaId) return { ...whereMaquinasMachinePay, id: link.maquinaId };
  if (link?.lojaIds?.length) {
    return { ...whereMaquinasMachinePay, lojaId: { [Op.in]: link.lojaIds } };
  }
  return whereMaquinasMachinePay;
};

const listarLojasMachinePay = async () => {
  const lojas = await Loja.findAll({
    where: { ativo: true },
    attributes: ["id", "nome"],
    include: [
      {
        model: Maquina,
        as: "maquinas",
        where: whereMaquinasMachinePay,
        attributes: ["id"],
        required: true,
      },
    ],
    order: [["nome", "ASC"]],
  });
  return lojas.map((loja) => ({
    id: loja.id,
    nome: loja.nome,
    qtdMaquinas: loja.maquinas.length,
  }));
};

const listarMaquinasDoLink = (link) =>
  Maquina.findAll({
    where: whereMaquinasDoLink(link),
    attributes: ["id", "nome", "codigo"],
    order: [["nome", "ASC"], ["codigo", "ASC"]],
  });

const calcularSituacao = (link) => {
  if (link.revogadoEm) return "revogado";
  if (link.usadoCentavos >= link.limiteCentavos) return "esgotado";
  if (link.expiraEm && new Date(link.expiraEm) <= new Date()) return "expirado";
  if (!link.ativo) return "inativo";
  return "ativo";
};

const resumoLink = (link, nomesLojas = new Map()) => ({
  id: link.id,
  descricao: link.descricao,
  limite: centavosParaReais(link.limiteCentavos),
  usado: centavosParaReais(link.usadoCentavos),
  restante: centavosParaReais(
    Math.max(0, link.limiteCentavos - link.usadoCentavos),
  ),
  expiraEm: link.expiraEm,
  revogadoEm: link.revogadoEm,
  situacao: calcularSituacao(link),
  maquina: link.maquinaId ? (link.maquina ? nomeMaquina(link.maquina) : "Máquina removida") : null,
  lojas: link.maquinaId
    ? []
    : (link.lojaIds || []).map((id) => nomesLojas.get(id) || "Loja removida"),
  loteId: link.loteId || null,
  podeCopiar: Boolean(link.tokenCifrado),
  createdAt: link.createdAt,
  criadoPor: link.criadoPor?.nome || null,
});

const obterTokenRequisicao = (req) => {
  const token = String(req.headers["x-link-token"] || "");
  return FORMATO_TOKEN.test(token) ? token : null;
};

const obterIp = (req) =>
  String(req.headers["x-forwarded-for"] || req.ip || "").slice(0, 100);

// ---------------------------------------------------------------------------
// Rotas públicas (acessadas pelo link, sem login)
// ---------------------------------------------------------------------------

export const consultarLinkPublico = async (req, res) => {
  try {
    const token = obterTokenRequisicao(req);
    if (!token) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const link = await CreditoRemotoLink.findOne({
      where: { tokenHash: hashToken(token) },
    });
    if (!link) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const situacao = calcularSituacao(link);
    if (situacao !== "ativo") {
      return res.status(410).json({
        error: "Este voucher expirou.",
        situacao,
        descricao: link.descricao,
      });
    }

    const maquinas = await listarMaquinasDoLink(link);

    res.json({
      descricao: link.descricao,
      limite: centavosParaReais(link.limiteCentavos),
      usado: centavosParaReais(link.usadoCentavos),
      restante: centavosParaReais(link.limiteCentavos - link.usadoCentavos),
      maquinas: maquinas.map((maquina) => ({
        id: maquina.id,
        nome: nomeMaquina(maquina),
      })),
    });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao consultar link:", error);
    res.status(500).json({ error: "Erro ao carregar o voucher." });
  }
};

export const enviarCreditoPublico = async (req, res) => {
  const token = obterTokenRequisicao(req);
  if (!token) {
    return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
  }

  const tokenHash = hashToken(token);
  const { maquinaId } = req.body || {};
  const valorNumero = Number(String(req.body?.valor ?? "").replace(",", "."));
  const valorCentavos = Math.round(valorNumero * 100);

  if (
    !Number.isFinite(valorNumero) ||
    Math.abs(valorNumero * 100 - valorCentavos) > 1e-6 ||
    valorCentavos < VALOR_MINIMO_ENVIO_CENTAVOS
  ) {
    return res
      .status(400)
      .json({ error: "Informe um valor válido de pelo menos R$ 1,00." });
  }

  if (!FORMATO_UUID.test(String(maquinaId || ""))) {
    return res.status(400).json({ error: "Máquina inválida." });
  }

  let envio;
  let saldo;

  try {
    const linkAtual = await CreditoRemotoLink.findOne({ where: { tokenHash } });
    if (!linkAtual) {
      return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
    }

    const maquina = await Maquina.findOne({
      where: {
        [Op.and]: [whereMaquinasDoLink(linkAtual), { id: maquinaId }],
      },
      attributes: ["id", "nome", "codigo", "machinePayPosId"],
    });
    if (!maquina) {
      return res.status(400).json({ error: "Máquina não permitida." });
    }

    // Reserva o valor no link de forma atômica: um único UPDATE que só passa
    // se o link estiver ativo e o novo total couber no limite. Dois cliques
    // ou abas ao mesmo tempo não conseguem passar do limite, porque o
    // Postgres trava a linha e o segundo UPDATE já enxerga o total do
    // primeiro. A constraint check_credito_remoto_limite é a última barreira.
    await sequelize.transaction(async (transaction) => {
      const [linha] = await sequelize.query(
        `UPDATE credito_remoto_links
            SET usado_centavos = usado_centavos + :valor,
                ativo = CASE
                  WHEN usado_centavos + :valor >= limite_centavos THEN false
                  ELSE ativo
                END,
                "updatedAt" = NOW()
          WHERE token_hash = :tokenHash
            AND maquina_id IS NOT DISTINCT FROM :maquinaFixa
            AND ativo = true
            AND revogado_em IS NULL
            AND (expira_em IS NULL OR expira_em > NOW())
            AND usado_centavos + :valor <= limite_centavos
        RETURNING id, usado_centavos, limite_centavos`,
        {
          replacements: {
            valor: valorCentavos,
            tokenHash,
            maquinaFixa: linkAtual.maquinaId || null,
          },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      if (!linha) return;

      saldo = linha;
      envio = await CreditoRemotoEnvio.create(
        {
          linkId: linha.id,
          maquinaId: maquina.id,
          valorCentavos,
          status: "pendente",
          ip: obterIp(req),
          userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
        },
        { transaction },
      );
    });

    if (!envio) {
      const link = await CreditoRemotoLink.findOne({ where: { tokenHash } });
      if (!link) {
        return res.status(404).json({ error: MENSAGEM_LINK_INVALIDO });
      }
      if (calcularSituacao(link) !== "ativo") {
        return res.status(410).json({ error: "Este voucher expirou." });
      }
      const restante = centavosParaReais(
        link.limiteCentavos - link.usadoCentavos,
      );
      return res.status(400).json({
        error: `Valor maior que o saldo disponível (R$ ${restante.toFixed(2).replace(".", ",")}).`,
        restante,
      });
    }

    const restante = centavosParaReais(
      saldo.limite_centavos - saldo.usado_centavos,
    );

    try {
      const resultado = await enviarCreditosMqttMachinePay({
        posId: maquina.machinePayPosId,
        creditos: centavosParaReais(valorCentavos),
      });

      await envio.update({
        status: resultado.sucesso ? "enviado" : "incerto",
        idwebhook: resultado.idwebhook || null,
        detalhe: JSON.stringify({
          wsOk: resultado.wsOk,
          wsErro: resultado.wsErro,
          resposta: resultado.resposta,
        }).slice(0, 4000),
      });

      return res.json({
        sucesso: resultado.sucesso,
        mensagem: resultado.sucesso
          ? `Crédito de R$ ${centavosParaReais(valorCentavos).toFixed(2).replace(".", ",")} enviado para ${nomeMaquina(maquina)}!`
          : "Crédito enviado, mas a máquina não confirmou. Confira na máquina antes de tentar de novo.",
        restante,
        expirou: restante <= 0,
      });
    } catch (erroMachinePay) {
      // O valor continua descontado: não dá pra saber se o crédito chegou ou
      // não na máquina. Um admin pode conferir no histórico de envios.
      await envio.update({
        status: "erro",
        detalhe: String(erroMachinePay.message || erroMachinePay).slice(0, 4000),
      });
      console.error("[CreditoRemoto] Erro Machine Pay:", erroMachinePay);

      return res.status(502).json({
        error:
          "Não foi possível confirmar o envio com a máquina. Confira na máquina e, se o crédito não entrou, fale com a equipe Toyland.",
        restante,
        expirou: restante <= 0,
      });
    }
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao enviar crédito:", error);
    return res.status(500).json({ error: "Erro ao enviar crédito." });
  }
};

// ---------------------------------------------------------------------------
// Rotas de admin
// ---------------------------------------------------------------------------

export const listarLinks = async (req, res) => {
  try {
    const [links, maquinasToyland] = await Promise.all([
      CreditoRemotoLink.findAll({
        include: [
          { model: Usuario, as: "criadoPor", attributes: ["nome"] },
          { model: Maquina, as: "maquina", attributes: ["nome", "codigo"] },
        ],
        order: [["createdAt", "DESC"]],
      }),
      listarMaquinasDoLink(null),
    ]);
    const todasLojas = await Loja.findAll({ attributes: ["id", "nome"] });
    const nomesLojas = new Map(todasLojas.map((loja) => [loja.id, loja.nome]));
    const lojasMachinePay = await listarLojasMachinePay();

    res.json({
      links: links.map((link) => resumoLink(link, nomesLojas)),
      lojasMachinePay,
      maquinasPermitidas: maquinasToyland.map(nomeMaquina),
      maquinasMachinePay: maquinasToyland.map((maquina) => ({
        id: maquina.id,
        nome: nomeMaquina(maquina),
      })),
    });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao listar links:", error);
    res.status(500).json({ error: "Erro ao listar vouchers." });
  }
};

export const criarLink = async (req, res) => {
  try {
    const descricao = String(req.body?.descricao || "").trim().slice(0, 150);
    const limiteReais = Number(
      String(req.body?.limite ?? LIMITE_PADRAO_REAIS).replace(",", "."),
    );
    const limiteCentavos = Math.round(limiteReais * 100);
    const expiraEm = req.body?.expiraEm ? new Date(req.body.expiraEm) : null;
    const maquinaId = req.body?.maquinaId || null;
    const lojaIdsRecebidos = Array.isArray(req.body?.lojaIds)
      ? [...new Set(req.body.lojaIds.map(String))]
      : [];
    const quantidade = Number(req.body?.quantidade ?? 1);

    if (
      !Number.isInteger(quantidade) ||
      quantidade < 1 ||
      quantidade > QUANTIDADE_MAXIMA_POR_LOTE
    ) {
      return res.status(400).json({
        error: `Quantidade deve ser de 1 a ${QUANTIDADE_MAXIMA_POR_LOTE} vouchers.`,
      });
    }
    if (maquinaId && lojaIdsRecebidos.length) {
      return res
        .status(400)
        .json({ error: "Escolha uma máquina OU lojas, não os dois." });
    }

    if (!descricao) {
      return res.status(400).json({ error: "Informe para quem é o voucher." });
    }
    if (
      !Number.isFinite(limiteReais) ||
      limiteCentavos < VALOR_MINIMO_ENVIO_CENTAVOS ||
      limiteCentavos > LIMITE_MAXIMO_REAIS * 100
    ) {
      return res.status(400).json({ error: "Limite inválido." });
    }
    if (expiraEm && (Number.isNaN(expiraEm.getTime()) || expiraEm <= new Date())) {
      return res.status(400).json({ error: "Data de expiração inválida." });
    }

    let maquina = null;
    if (maquinaId) {
      maquina = FORMATO_UUID.test(String(maquinaId))
        ? await Maquina.findOne({
            where: { ...whereMaquinasMachinePay, id: maquinaId },
            attributes: ["id", "nome", "codigo"],
          })
        : null;
      if (!maquina) {
        return res.status(400).json({
          error: "Máquina inválida: precisa estar ativa, ter ID Machine Pay e TOYLAND no nome.",
        });
      }
    }

    let lojas = [];
    if (lojaIdsRecebidos.length) {
      const validas = (await listarLojasMachinePay()).filter((loja) =>
        lojaIdsRecebidos.includes(loja.id),
      );
      if (validas.length !== lojaIdsRecebidos.length) {
        return res.status(400).json({
          error: "Loja inválida: precisa estar ativa e ter máquina TOYLAND com ID Machine Pay.",
        });
      }
      lojas = validas;
    }

    const loteId = crypto.randomUUID();
    const criados = await sequelize.transaction(async (transaction) => {
      const lista = [];
      for (let indice = 1; indice <= quantidade; indice += 1) {
        const token = gerarToken();
        const link = await CreditoRemotoLink.create(
          {
            descricao:
              quantidade > 1
                ? `${descricao.slice(0, 140)} #${indice}/${quantidade}`
                : descricao,
            tokenHash: hashToken(token),
            tokenCifrado: cifrarToken(token),
            maquinaId: maquina?.id || null,
            lojaIds: lojas.length ? lojas.map((loja) => loja.id) : null,
            loteId,
            limiteCentavos,
            expiraEm,
            criadoPorId: req.usuario.id,
          },
          { transaction },
        );
        link.maquina = maquina;
        lista.push({ link, token });
      }
      return lista;
    });

    const nomesLojas = new Map(lojas.map((loja) => [loja.id, loja.nome]));
    res.status(201).json({
      loteId,
      links: criados.map(({ link, token }) => ({
        ...resumoLink(link, nomesLojas),
        token,
      })),
    });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao criar link:", error);
    res.status(500).json({ error: "Erro ao criar voucher." });
  }
};

export const bloquearLink = async (req, res) => {
  try {
    const link = await CreditoRemotoLink.findByPk(req.params.id);
    if (!link) {
      return res.status(404).json({ error: "Voucher não encontrado." });
    }

    await link.update({ ativo: false, revogadoEm: link.revogadoEm || new Date() });
    res.json(resumoLink(link));
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao bloquear link:", error);
    res.status(500).json({ error: "Erro ao bloquear voucher." });
  }
};

export const obterTokenLink = async (req, res) => {
  try {
    const link = await CreditoRemotoLink.findByPk(req.params.id);
    if (!link) {
      return res.status(404).json({ error: "Voucher não encontrado." });
    }

    const token = decifrarToken(link.tokenCifrado);
    if (!token || hashToken(token) !== link.tokenHash) {
      return res
        .status(400)
        .json({ error: "Este voucher não pode ser copiado de novo. Gere outro." });
    }

    res.json({ token });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao obter link:", error);
    res.status(500).json({ error: "Erro ao obter voucher." });
  }
};

// Links ativos de um lote, com token — pra imprimir os QR Codes de novo.
export const obterTokensLote = async (req, res) => {
  try {
    if (!FORMATO_UUID.test(String(req.params.loteId))) {
      return res.status(400).json({ error: "Lote inválido." });
    }
    const links = await CreditoRemotoLink.findAll({
      where: { loteId: req.params.loteId },
      include: [{ model: Maquina, as: "maquina", attributes: ["nome", "codigo"] }],
      order: [["createdAt", "ASC"]],
    });
    const todasLojas = await Loja.findAll({ attributes: ["id", "nome"] });
    const nomesLojas = new Map(todasLojas.map((loja) => [loja.id, loja.nome]));

    const ativos = links
      .filter((link) => calcularSituacao(link) === "ativo")
      .map((link) => {
        const token = decifrarToken(link.tokenCifrado);
        return token && hashToken(token) === link.tokenHash
          ? { ...resumoLink(link, nomesLojas), token }
          : null;
      })
      .filter(Boolean);

    res.json({ loteId: req.params.loteId, links: ativos });
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao obter lote:", error);
    res.status(500).json({ error: "Erro ao obter os vouchers do lote." });
  }
};

export const listarEnviosLink = async (req, res) => {
  try {
    const envios = await CreditoRemotoEnvio.findAll({
      where: { linkId: req.params.id },
      include: [{ model: Maquina, as: "maquina", attributes: ["nome", "codigo"] }],
      order: [["createdAt", "DESC"]],
    });

    res.json(
      envios.map((envio) => ({
        id: envio.id,
        maquina: nomeMaquina(envio.maquina),
        valor: centavosParaReais(envio.valorCentavos),
        status: envio.status,
        idwebhook: envio.idwebhook,
        detalhe: envio.status === "enviado" ? null : envio.detalhe,
        ip: envio.ip,
        createdAt: envio.createdAt,
      })),
    );
  } catch (error) {
    console.error("[CreditoRemoto] Erro ao listar envios:", error);
    res.status(500).json({ error: "Erro ao listar envios." });
  }
};
