import { GastoVariavel } from "../models/index.js";

export const criarGastoVariavel = async (req, res) => {
  try {
    const {
      lojaId,
      nome,
      valor,
      observacao,
      dataInicio,
      dataFim,
      registroDinheiroId,
    } = req.body;
    if (!lojaId || !nome || !valor || !dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "Campos obrigatórios não preenchidos." });
    }
    const gasto = await GastoVariavel.create({
      lojaId,
      nome,
      valor,
      observacao,
      dataInicio,
      dataFim,
      registroDinheiroId: registroDinheiroId || null,
    });
    res.status(201).json(gasto);
  } catch (error) {
    console.error("Erro ao criar gasto variável:", error);
    res.status(500).json({ error: "Erro ao criar gasto variável." });
  }
};

export const listarGastosVariaveis = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;
    const where = {};
    if (lojaId) where.lojaId = lojaId;
    if (dataInicio && dataFim) {
      where.dataInicio = { $gte: new Date(dataInicio) };
      where.dataFim = { $lte: new Date(dataFim) };
    }
    const gastos = await GastoVariavel.findAll({ where });
    res.json(gastos);
  } catch (error) {
    console.error("Erro ao listar gastos variáveis:", error);
    res.status(500).json({ error: "Erro ao listar gastos variáveis." });
  }
};
