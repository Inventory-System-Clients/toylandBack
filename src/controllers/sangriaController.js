import { Op } from "sequelize";
import { Sangria, Loja } from "../models/index.js";

const normalizarInteiroNaoNegativo = (valor) => {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.floor(numero);
};

const normalizarDecimalNaoNegativo = (valor) => {
  const numero = Number(valor ?? 0);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Number(numero.toFixed(2));
};

const calcularValorPelasNotas = (notas) => {
  return Number(
    (
      notas.notas2 * 2 +
      notas.notas5 * 5 +
      notas.notas10 * 10 +
      notas.notas20 * 20 +
      notas.notas50 * 50 +
      notas.notas100 * 100 +
      notas.notas200 * 200
    ).toFixed(2),
  );
};

const sangriaController = {
  async criar(req, res) {
    try {
      const {
        lojaId,
        dataContagem,
        quantidade,
        notas2,
        notas5,
        notas10,
        notas20,
        notas50,
        notas100,
        notas200,
        observacao,
      } = req.body;

      if (!lojaId) {
        return res.status(400).json({ error: "lojaId é obrigatório." });
      }

      const loja = await Loja.findByPk(lojaId, { raw: true });
      if (!loja) {
        return res.status(404).json({ error: "Loja não encontrada." });
      }

      const notas = {
        notas2: normalizarInteiroNaoNegativo(notas2),
        notas5: normalizarInteiroNaoNegativo(notas5),
        notas10: normalizarInteiroNaoNegativo(notas10),
        notas20: normalizarInteiroNaoNegativo(notas20),
        notas50: normalizarInteiroNaoNegativo(notas50),
        notas100: normalizarInteiroNaoNegativo(notas100),
        notas200: normalizarInteiroNaoNegativo(notas200),
      };

      const valorCalculadoNotas = calcularValorPelasNotas(notas);
      const quantidadeNormalizada = normalizarDecimalNaoNegativo(quantidade);

      if (quantidadeNormalizada <= 0 && valorCalculadoNotas <= 0) {
        return res.status(400).json({
          error:
            "Informe a quantidade da sangria ou uma composição válida de notas.",
        });
      }

      const registro = await Sangria.create({
        lojaId,
        usuarioId: req.usuario?.id || null,
        dataContagem: dataContagem ? new Date(dataContagem) : new Date(),
        quantidade: quantidadeNormalizada,
        ...notas,
        valorCalculadoNotas,
        observacao: observacao ? String(observacao).trim() : null,
      });

      return res.status(201).json(registro);
    } catch (error) {
      console.error("Erro ao criar sangria:", error);
      return res.status(500).json({ error: "Erro ao criar sangria." });
    }
  },

  async listar(req, res) {
    try {
      const { lojaId, dataInicio, dataFim } = req.query;

      const where = {};
      if (lojaId) where.lojaId = lojaId;

      if (dataInicio || dataFim) {
        const inicio = dataInicio
          ? new Date(`${dataInicio}T00:00:00.000Z`)
          : new Date("1970-01-01T00:00:00.000Z");
        const fim = dataFim
          ? new Date(`${dataFim}T23:59:59.999Z`)
          : new Date();

        where.dataContagem = {
          [Op.between]: [inicio, fim],
        };
      }

      const registros = await Sangria.findAll({
        where,
        include: [{ model: Loja, as: "loja", attributes: ["id", "nome"] }],
        order: [["dataContagem", "DESC"]],
      });

      return res.json(registros);
    } catch (error) {
      console.error("Erro ao listar sangrias:", error);
      return res.status(500).json({ error: "Erro ao listar sangrias." });
    }
  },

  async excluir(req, res) {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: "id é obrigatório." });
      }

      const excluidas = await Sangria.destroy({ where: { id } });

      if (!excluidas) {
        return res.status(404).json({ error: "Sangria não encontrada." });
      }

      return res.json({ success: true, id });
    } catch (error) {
      console.error("Erro ao excluir sangria:", error);
      return res.status(500).json({ error: "Erro ao excluir sangria." });
    }
  },

  async excluirEmLote(req, res) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          error: "Informe um array de ids para exclusão em lote.",
        });
      }

      const idsValidos = ids
        .map((item) => String(item || "").trim())
        .filter((item) => item.length > 0);

      if (idsValidos.length === 0) {
        return res.status(400).json({
          error: "Nenhum id válido informado para exclusão.",
        });
      }

      const excluidas = await Sangria.destroy({
        where: {
          id: {
            [Op.in]: idsValidos,
          },
        },
      });

      return res.json({
        success: true,
        solicitadas: idsValidos.length,
        excluidas,
      });
    } catch (error) {
      console.error("Erro ao excluir sangrias em lote:", error);
      return res
        .status(500)
        .json({ error: "Erro ao excluir sangrias em lote." });
    }
  },
};

export default sangriaController;