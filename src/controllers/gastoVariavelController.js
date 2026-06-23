import { Op } from "sequelize";
import { GastoVariavel, Loja, Usuario } from "../models/index.js";

const inicioDoDiaLocal = (data = new Date()) => {
  const resultado = new Date(data);
  resultado.setHours(0, 0, 0, 0);
  return resultado;
};

const fimDoDiaLocal = (data = new Date()) => {
  const resultado = new Date(data);
  resultado.setHours(23, 59, 59, 999);
  return resultado;
};

const dataInicioFiltro = (data) =>
  data ? inicioDoDiaLocal(new Date(`${data}T00:00:00`)) : inicioDoDiaLocal();

const dataFimFiltro = (data) =>
  data ? fimDoDiaLocal(new Date(`${data}T00:00:00`)) : fimDoDiaLocal();

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
      usuarioId: req.usuario?.id || null,
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
    const { lojaId, dataInicio, dataFim, responsavel } = req.query;
    const where = {};
    if (lojaId) where.lojaId = lojaId;

    const inicio = dataInicioFiltro(dataInicio);
    const fim = dataFimFiltro(dataFim);

    where.dataInicio = { [Op.lte]: fim };
    where.dataFim = { [Op.gte]: inicio };

    const include = [
      { model: Loja, as: "loja", attributes: ["id", "nome"] },
      {
        model: Usuario,
        as: "usuario",
        attributes: ["id", "nome"],
        required: Boolean(responsavel),
        where: responsavel
          ? { nome: { [Op.iLike]: `%${String(responsavel).trim()}%` } }
          : undefined,
      },
    ];

    const gastos = await GastoVariavel.findAll({
      where,
      include,
      order: [
        ["dataInicio", "DESC"],
        ["createdAt", "DESC"],
      ],
    });

    res.json(gastos);
  } catch (error) {
    console.error("Erro ao listar gastos variáveis:", error);
    res.status(500).json({ error: "Erro ao listar gastos variáveis." });
  }
};
