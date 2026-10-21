import { Op } from "sequelize";
import { Maquina, Loja } from "../models/index.js";
import {
  consultarStatusMachinePay,
  consultarTransacoesMachinePay,
  enviarCreditosMqttMachinePay,
  devolverPagamentoMachinePay,
  descobrirUsrDePosId,
} from "../services/machinePayService.js";
import {
  ehUsrDaContaLogada,
  listarMaquinasCadastradas,
} from "../services/machinePayDetalhadoService.js";
import { parsearPainelMaquinas } from "../services/machinePayPainelParser.js";

const atributosMaquina = [
  "id",
  "codigo",
  "nome",
  "machinePayPosId",
  "machinePayUsrId",
  "lojaId",
  "ativo",
];

const formatarDataHoraBrasilia = (data) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(data)
    .replace(" ", "T");

const montarPeriodoUltimas24h = () => {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);

  return {
    inicio: formatarDataHoraBrasilia(inicio),
    fim: formatarDataHoraBrasilia(fim),
  };
};

const buscarMaquinaMachinePay = async (id) => {
  const maquina = await Maquina.findByPk(id, {
    attributes: atributosMaquina,
    include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
  });

  if (!maquina) {
    const error = new Error("Maquina nao encontrada.");
    error.status = 404;
    throw error;
  }

  if (!maquina.machinePayPosId) {
    const error = new Error("Esta maquina nao possui ID da Machine Pay.");
    error.status = 400;
    throw error;
  }

  return maquina;
};

export const listarMaquinasMachinePay = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: {
        ativo: true,
        machinePayPosId: {
          [Op.ne]: null,
        },
      },
      attributes: atributosMaquina,
      include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
      order: [["codigo", "ASC"]],
    });

    res.json(maquinas.filter((maquina) => maquina.machinePayPosId?.trim()));
  } catch (error) {
    console.error("[MachinePay] Erro ao listar maquinas:", error);
    res.status(500).json({ error: "Erro ao listar maquinas Machine Pay." });
  }
};

export const consultarStatusMaquinas = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: {
        ativo: true,
        machinePayPosId: {
          [Op.ne]: null,
        },
      },
      attributes: atributosMaquina,
      include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
      order: [["codigo", "ASC"]],
    });

    const resultados = await Promise.all(
      maquinas
        .filter((maquina) => maquina.machinePayPosId?.trim())
        .map(async (maquina) => {
          try {
            const status = await consultarStatusMachinePay({
              posId: maquina.machinePayPosId,
              usrId: maquina.machinePayUsrId || undefined,
            });

            return {
              maquinaId: maquina.id,
              machinePayPosId: maquina.machinePayPosId,
              status,
            };
          } catch (error) {
            return {
              maquinaId: maquina.id,
              machinePayPosId: maquina.machinePayPosId,
              status: {
                online: false,
                status: "erro",
                erro: error.message,
                consultadoEm: new Date().toISOString(),
              },
            };
          }
        }),
    );

    res.json({ resultados });
  } catch (error) {
    console.error("[MachinePay] Erro ao consultar status:", error);
    res.status(500).json({ error: "Erro ao consultar status Machine Pay." });
  }
};

export const enviarCreditosMqtt = async (req, res) => {
  try {
    const { id } = req.params;
    const creditos = Math.max(1, Number(req.body?.creditos || 1));
    const maquina = await buscarMaquinaMachinePay(id);
    const resultado = await enviarCreditosMqttMachinePay({
      posId: maquina.machinePayPosId,
      creditos,
    });

    res.json({
      maquinaId: maquina.id,
      machinePayPosId: maquina.machinePayPosId,
      ...resultado,
    });
  } catch (error) {
    console.error("[MachinePay] Erro ao enviar creditos MQTT:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel enviar creditos MQTT.",
    });
  }
};

export const consultarTransacoes24h = async (req, res) => {
  try {
    const { id } = req.params;
    const maquina = await buscarMaquinaMachinePay(id);

    const isAdmin = req.usuario?.role === "ADMIN";
    let periodo;
    if (isAdmin && req.query.inicio && req.query.fim) {
      periodo = {
        inicio: req.query.inicio,
        fim: req.query.fim,
      };
    } else {
      periodo = montarPeriodoUltimas24h();
    }

    const dados = await consultarTransacoesMachinePay({
      posId: maquina.machinePayPosId,
      ...periodo,
    });

    res.json({
      maquinaId: maquina.id,
      machinePayPosId: maquina.machinePayPosId,
      ...dados,
    });
  } catch (error) {
    console.error("[MachinePay] Erro ao consultar transacoes:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel consultar transacoes.",
    });
  }
};

export const devolverPagamento = async (req, res) => {
  try {
    const { idwebhook } = req.params;
    if (!idwebhook) {
      return res.status(400).json({ error: "idwebhook e obrigatorio." });
    }

    const resultado = await devolverPagamentoMachinePay({ idwebhook });
    res.json(resultado);
  } catch (error) {
    console.error("[MachinePay] Erro ao devolver pagamento:", error);
    res.status(error.status || 502).json({
      error: error.message || "Nao foi possivel devolver o pagamento.",
    });
  }
};

export const descobrirUsrPorPosId = async (req, res) => {
  try {
    const { posId } = req.params;
    const resultado = await descobrirUsrDePosId({ posId });
    if (!resultado) {
      return res.status(404).json({
        error: "Nao foi possivel encontrar o usr para esse posId. O caixa precisa ter pelo menos um pagamento no extrato.",
      });
    }
    res.json(resultado);
  } catch (error) {
    console.error("[MachinePay] Erro ao descobrir usr:", error);
    res.status(502).json({ error: error.message });
  }
};

// GET /api/machine-pay/leitores/:usrId — leitores da conta no painel, para
// escolher o POS ID de uma máquina a partir do Usr ID já cadastrado.
export const listarLeitoresDaConta = async (req, res) => {
  try {
    const usrId = String(req.params.usrId || "").trim();
    if (!/^\d+$/.test(usrId)) {
      return res.status(400).json({ error: "Usr ID inválido" });
    }
    if (await ehUsrDaContaLogada(usrId)) {
      return res.status(400).json({
        error:
          "Esse Usr ID é da conta de login do painel, não de um cliente. Clique em Atualizar no Usr ID (com o POS ID preenchido) para buscar o usr certo.",
      });
    }

    const html = await listarMaquinasCadastradas({ usrId });
    // Só leitores dessa conta (o painel pode devolver os da conta logada)
    const leitores = parsearPainelMaquinas(html).filter(
      (l) => String(l.usrId || "") === usrId,
    );

    const usados = await Maquina.findAll({
      where: { machinePayPosId: { [Op.in]: leitores.map((l) => l.posId) } },
      attributes: ["id", "codigo", "nome", "machinePayPosId"],
      raw: true,
    });
    const maquinaPorPosId = new Map(usados.map((m) => [String(m.machinePayPosId), m]));

    res.json(
      leitores
        .map((l) => {
          const maquina = maquinaPorPosId.get(l.posId);
          return {
            posId: l.posId,
            nomePonto: l.nomePonto,
            cliente: l.cliente,
            online: l.online,
            maquinaVinculada: maquina
              ? { id: maquina.id, codigo: maquina.codigo, nome: maquina.nome }
              : null,
          };
        })
        .sort((a, b) =>
          String(a.nomePonto || "").localeCompare(String(b.nomePonto || ""), "pt-BR"),
        ),
    );
  } catch (error) {
    console.error("[MachinePay] Erro ao listar leitores da conta:", error);
    res.status(error.status || 502).json({ error: error.message });
  }
};
