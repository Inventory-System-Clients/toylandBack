import { Op } from "sequelize";
import { LogAtividade, Produto, Usuario } from "../models/index.js";

const toDateStart = (value) => (value ? new Date(`${value}T00:00:00`) : null);
const toDateEnd = (value) => (value ? new Date(`${value}T23:59:59.999`) : null);

const sameId = (a, b) => String(a ?? "") === String(b ?? "");

const getDetalhes = (log) => log?.detalhes || {};

export const normalizarLogAtividade = (log, produto = null) => {
  const json = typeof log.toJSON === "function" ? log.toJSON() : log;
  const detalhes = getDetalhes(json);
  const quantidadeAnterior = detalhes.quantidadeAnterior;
  const quantidadeNova = detalhes.quantidadeNova;
  const diferenca =
    detalhes.diferenca ??
    (quantidadeAnterior !== undefined && quantidadeNova !== undefined
      ? Number(quantidadeNova || 0) - Number(quantidadeAnterior || 0)
      : undefined);

  return {
    id: json.id,
    lojaId: detalhes.lojaId ?? detalhes.body?.lojaId ?? detalhes.params?.lojaId,
    produtoId:
      detalhes.produtoId ?? detalhes.body?.produtoId ?? detalhes.params?.produtoId,
    usuario: json.usuario
      ? {
          id: json.usuario.id,
          nome: json.usuario.nome,
          email: json.usuario.email,
        }
      : null,
    acao: json.acao,
    entidade: json.entidade,
    entidadeId: json.entidadeId,
    produto,
    quantidadeAnterior,
    quantidadeNova,
    diferenca,
    estoqueMinimoAnterior: detalhes.estoqueMinimoAnterior,
    estoqueMinimoNovo: detalhes.estoqueMinimoNovo,
    createdAt: json.createdAt,
    observacao: detalhes.observacao || detalhes.descricao || json.acao,
    detalhes,
  };
};

export const listarLogsAtividade = async (req, res) => {
  try {
    const { lojaId, loja_id, produtoId, dataInicio, dataFim, limite = 1000 } =
      req.query;
    const lojaFiltro = lojaId || loja_id;
    const where = {};
    const inicio = toDateStart(dataInicio);
    const fim = toDateEnd(dataFim);

    if (inicio || fim) {
      where.createdAt = {};
      if (inicio) where.createdAt[Op.gte] = inicio;
      if (fim) where.createdAt[Op.lte] = fim;
    }

    const logs = await LogAtividade.findAll({
      where,
      include: [{ model: Usuario, as: "usuario", attributes: ["id", "nome", "email"] }],
      order: [["createdAt", "DESC"]],
      limit: Math.min(Number(limite) || 1000, 5000),
    });

    const produtoIds = [
      ...new Set(
        logs
          .map((log) => getDetalhes(log).produtoId || getDetalhes(log).params?.produtoId)
          .filter(Boolean),
      ),
    ];

    const produtos = produtoIds.length
      ? await Produto.findAll({
          where: { id: { [Op.in]: produtoIds } },
          attributes: ["id", "nome", "codigo", "emoji"],
        })
      : [];
    const produtosPorId = new Map(produtos.map((produto) => [String(produto.id), produto]));

    const logsNormalizados = logs
      .map((log) => {
        const detalhes = getDetalhes(log);
        const logLojaId = detalhes.lojaId || detalhes.body?.lojaId || detalhes.params?.lojaId;
        const logProdutoId =
          detalhes.produtoId || detalhes.body?.produtoId || detalhes.params?.produtoId;

        return normalizarLogAtividade(
          log,
          produtosPorId.get(String(logProdutoId)) || null,
        );
      })
      .filter((log) => !lojaFiltro || sameId(log.lojaId, lojaFiltro))
      .filter((log) => !produtoId || sameId(log.produtoId, produtoId))
      .filter(
        (log) =>
          !lojaFiltro ||
          (log.produtoId &&
            log.quantidadeAnterior !== undefined &&
            log.quantidadeNova !== undefined),
      );

    res.json(logsNormalizados);
  } catch (error) {
    console.error("Erro ao listar logs de atividade:", error);
    res.status(500).json({ error: "Erro ao listar logs de atividade" });
  }
};
