import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  GastoVariavel,
  Loja,
  Manutencao,
  ManutencaoUsuario,
  Usuario,
} from "../models/index.js";

const includeAdmin = [
  {
    model: Usuario,
    as: "criadoPor",
    attributes: ["id", "nome", "email", "role"],
  },
  {
    model: Usuario,
    as: "resolvidoPor",
    attributes: ["id", "nome", "email", "role"],
  },
  {
    model: Usuario,
    as: "funcionariosPermitidos",
    attributes: ["id", "nome", "email"],
    through: { attributes: [] },
  },
  {
    model: Loja,
    as: "loja",
    attributes: ["id", "nome"],
  },
];

export const listarFuncionariosManutencao = async (req, res) => {
  try {
    const funcionarios = await Usuario.findAll({
      where: {
        role: "FUNCIONARIO",
        ativo: true,
      },
      attributes: ["id", "nome", "email"],
      order: [["nome", "ASC"]],
    });

    res.json(funcionarios);
  } catch (error) {
    console.error("Erro ao listar funcionários para manutenção:", error);
    res.status(500).json({ error: "Erro ao listar funcionários" });
  }
};

export const criarManutencao = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { titulo, descricao, funcionariosIds, custo, lojaId } = req.body;

    if (!titulo || !descricao) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Título e descrição são obrigatórios" });
    }

    if (!Array.isArray(funcionariosIds) || funcionariosIds.length === 0) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "Selecione ao menos um funcionário" });
    }

    const idsUnicos = [...new Set(funcionariosIds.filter(Boolean))];

    const custoInformado =
      custo !== undefined && custo !== null && custo !== "";
    const custoNumerico = custoInformado
      ? Number(String(custo).replace(",", "."))
      : null;

    if (
      custoInformado &&
      (!Number.isFinite(custoNumerico) || custoNumerico < 0)
    ) {
      await transaction.rollback();
      return res.status(400).json({
        error:
          "Custo inválido. Informe um valor numérico maior ou igual a zero.",
      });
    }

    if (custoInformado && custoNumerico > 0 && !lojaId) {
      await transaction.rollback();
      return res.status(400).json({
        error:
          "Selecione uma loja para registrar o gasto variável da manutenção.",
      });
    }

    const funcionarios = await Usuario.findAll({
      where: {
        id: { [Op.in]: idsUnicos },
        role: "FUNCIONARIO",
        ativo: true,
      },
      attributes: ["id"],
      transaction,
    });

    if (funcionarios.length !== idsUnicos.length) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Um ou mais funcionários informados são inválidos ou inativos",
      });
    }

    if (lojaId) {
      const loja = await Loja.findByPk(lojaId, { transaction });
      if (!loja) {
        await transaction.rollback();
        return res.status(400).json({ error: "Loja informada não encontrada" });
      }
    }

    const manutencao = await Manutencao.create(
      {
        titulo,
        descricao,
        custo: custoInformado ? custoNumerico : null,
        lojaId: lojaId || null,
        criadoPorId: req.usuario.id,
      },
      { transaction },
    );

    await ManutencaoUsuario.bulkCreate(
      idsUnicos.map((usuarioId) => ({
        manutencaoId: manutencao.id,
        usuarioId,
      })),
      { transaction },
    );

    if (custoInformado && custoNumerico > 0 && lojaId) {
      const agora = new Date();
      await GastoVariavel.create(
        {
          lojaId,
          nome: `Manutenção - ${titulo}`,
          valor: custoNumerico,
          observacao: `Gerado automaticamente pela manutenção ${manutencao.id}${descricao ? ` | ${descricao}` : ""}`,
          dataInicio: agora,
          dataFim: agora,
        },
        { transaction },
      );
    }

    await transaction.commit();

    const manutencaoCompleta = await Manutencao.findByPk(manutencao.id, {
      include: includeAdmin,
    });

    res.locals.entityId = manutencao.id;
    res.status(201).json(manutencaoCompleta);
  } catch (error) {
    await transaction.rollback();
    console.error("Erro ao criar manutenção:", error);
    res.status(500).json({ error: "Erro ao criar manutenção" });
  }
};

export const listarManutencoes = async (req, res) => {
  try {
    const { status, dataInicio, dataFim, lojaId, usuarioId } = req.query;
    let include = [...includeAdmin];
    const where = {};

    if (req.usuario.role !== "ADMIN") {
      where.status = "PENDENTE";
      include = [
        {
          model: Usuario,
          as: "criadoPor",
          attributes: ["id", "nome", "email", "role"],
        },
        {
          model: Usuario,
          as: "resolvidoPor",
          attributes: ["id", "nome", "email", "role"],
        },
        {
          model: Usuario,
          as: "funcionariosPermitidos",
          attributes: ["id", "nome", "email"],
          through: { attributes: [] },
          where: { id: req.usuario.id },
          required: true,
        },
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ];
    } else {
      if (status && ["PENDENTE", "RESOLVIDA"].includes(status)) {
        where.status = status;
      }

      if (lojaId) {
        where.lojaId = lojaId;
      }

      if (dataInicio || dataFim) {
        where.createdAt = {};

        if (dataInicio) {
          where.createdAt[Op.gte] = new Date(`${dataInicio}T00:00:00.000Z`);
        }

        if (dataFim) {
          where.createdAt[Op.lte] = new Date(`${dataFim}T23:59:59.999Z`);
        }
      }

      if (usuarioId) {
        include = include.map((item) => {
          if (item.as !== "funcionariosPermitidos") return item;
          return {
            ...item,
            where: { id: usuarioId },
            required: true,
          };
        });
      }
    }

    const manutencoes = await Manutencao.findAll({
      where,
      include,
      order: [["createdAt", "DESC"]],
    });

    res.json(manutencoes);
  } catch (error) {
    console.error("Erro ao listar manutenções:", error);
    res.status(500).json({ error: "Erro ao listar manutenções" });
  }
};

export const resolverManutencao = async (req, res) => {
  try {
    const manutencao = await Manutencao.findByPk(req.params.id, {
      include: [
        {
          model: Usuario,
          as: "funcionariosPermitidos",
          attributes: ["id"],
          through: { attributes: [] },
        },
      ],
    });

    if (!manutencao) {
      return res.status(404).json({ error: "Manutenção não encontrada" });
    }

    const usuarioPermitido =
      req.usuario.role === "ADMIN" ||
      manutencao.funcionariosPermitidos.some(
        (usuario) => usuario.id === req.usuario.id,
      );

    if (!usuarioPermitido) {
      return res.status(403).json({
        error: "Você não tem permissão para resolver esta manutenção",
      });
    }

    if (manutencao.status === "RESOLVIDA") {
      return res
        .status(400)
        .json({ error: "Esta manutenção já foi resolvida" });
    }

    await manutencao.update({
      status: "RESOLVIDA",
      resolvidoPorId: req.usuario.id,
      resolvidoEm: new Date(),
    });

    const manutencaoAtualizada = await Manutencao.findByPk(manutencao.id, {
      include: includeAdmin,
    });

    res.json(manutencaoAtualizada);
  } catch (error) {
    console.error("Erro ao resolver manutenção:", error);
    res.status(500).json({ error: "Erro ao resolver manutenção" });
  }
};
