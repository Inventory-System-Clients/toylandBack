import { Op } from "sequelize";
import { TipoGastoVariavel } from "../models/index.js";

const normalizarNome = (nome) => String(nome || "").trim();

export const listarTiposGastosVariaveis = async (req, res) => {
  try {
    const { incluirInativos = "false", busca } = req.query;
    const where = {};

    if (incluirInativos !== "true") {
      where.ativo = true;
    }

    if (busca) {
      where.nome = { [Op.iLike]: `%${normalizarNome(busca)}%` };
    }

    const tipos = await TipoGastoVariavel.findAll({
      where,
      order: [
        ["ativo", "DESC"],
        ["nome", "ASC"],
      ],
    });

    return res.json(tipos);
  } catch (error) {
    console.error("Erro ao listar tipos de gastos variáveis:", error);
    return res
      .status(500)
      .json({ error: "Erro ao listar tipos de gastos variáveis." });
  }
};

export const criarTipoGastoVariavel = async (req, res) => {
  try {
    const nome = normalizarNome(req.body.nome);

    if (!nome) {
      return res.status(400).json({ error: "Informe o nome do gasto." });
    }

    const existente = await TipoGastoVariavel.findOne({
      where: { nome: { [Op.iLike]: nome } },
    });

    if (existente) {
      if (!existente.ativo) {
        await existente.update({ ativo: true, nome });
        return res.status(200).json(existente);
      }

      return res.status(409).json({ error: "Esse gasto já está cadastrado." });
    }

    const tipo = await TipoGastoVariavel.create({ nome });
    return res.status(201).json(tipo);
  } catch (error) {
    console.error("Erro ao criar tipo de gasto variável:", error);
    return res
      .status(500)
      .json({ error: "Erro ao criar tipo de gasto variável." });
  }
};

export const atualizarTipoGastoVariavel = async (req, res) => {
  try {
    const tipo = await TipoGastoVariavel.findByPk(req.params.id);

    if (!tipo) {
      return res.status(404).json({ error: "Tipo de gasto não encontrado." });
    }

    const nome = normalizarNome(req.body.nome);
    if (!nome) {
      return res.status(400).json({ error: "Informe o nome do gasto." });
    }

    const duplicado = await TipoGastoVariavel.findOne({
      where: {
        id: { [Op.ne]: tipo.id },
        nome: { [Op.iLike]: nome },
      },
    });

    if (duplicado) {
      return res.status(409).json({ error: "Esse gasto já está cadastrado." });
    }

    await tipo.update({
      nome,
      ativo: req.body.ativo === undefined ? tipo.ativo : Boolean(req.body.ativo),
    });

    return res.json(tipo);
  } catch (error) {
    console.error("Erro ao atualizar tipo de gasto variável:", error);
    return res
      .status(500)
      .json({ error: "Erro ao atualizar tipo de gasto variável." });
  }
};

export const removerTipoGastoVariavel = async (req, res) => {
  try {
    const tipo = await TipoGastoVariavel.findByPk(req.params.id);

    if (!tipo) {
      return res.status(404).json({ error: "Tipo de gasto não encontrado." });
    }

    await tipo.update({ ativo: false });
    return res.status(204).send();
  } catch (error) {
    console.error("Erro ao remover tipo de gasto variável:", error);
    return res
      .status(500)
      .json({ error: "Erro ao remover tipo de gasto variável." });
  }
};
