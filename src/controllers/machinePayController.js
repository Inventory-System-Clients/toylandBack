import { Op } from "sequelize";
import { Maquina, Loja } from "../models/index.js";
import {
  consultarStatusMachinePay,
  consultarTransacoesMachinePay,
  enviarCreditosMqttMachinePay,
} from "../services/machinePayService.js";

const atributosMaquina = [
  "id",
  "codigo",
  "nome",
  "machinePayPosId",
  "lojaId",
  "ativo",
];

const montarPeriodoUltimas24h = () => {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 24 * 60 * 60 * 1000);

  return {
    inicio: inicio.toISOString().slice(0, 16),
    fim: fim.toISOString().slice(0, 16),
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
    const periodo = montarPeriodoUltimas24h();
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
