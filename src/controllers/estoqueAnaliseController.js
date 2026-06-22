import { Op } from "sequelize";
import {
  EstoqueLoja,
  Loja,
  LogAtividade,
  Maquina,
  Movimentacao,
  MovimentacaoEstoqueLoja,
  MovimentacaoEstoqueLojaProduto,
  MovimentacaoProduto,
  Produto,
  Usuario,
} from "../models/index.js";
import { normalizarLogAtividade } from "./logAtividadeController.js";

const sameId = (a, b) => String(a ?? "") === String(b ?? "");
const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};
const toDateStart = (value) => (value ? new Date(`${value}T00:00:00`) : null);
const toDateEnd = (value) => (value ? new Date(`${value}T23:59:59.999`) : null);
const getEventDate = (evento) => new Date(evento.data || 0);

const dentroPeriodo = (evento, inicio, fim) => {
  const data = getEventDate(evento);
  if (Number.isNaN(data.getTime())) return false;
  if (inicio && data < inicio) return false;
  if (fim && data > fim) return false;
  return true;
};

const somar = (eventos, filtro) =>
  eventos.filter(filtro).reduce((acc, evento) => acc + toNumber(evento.quantidade), 0);

const montarProdutoBase = (produtoId, produtosPorId, fallback = {}) => {
  const produto = produtosPorId.get(String(produtoId)) || fallback.produto || {};
  return {
    produtoId,
    produtoNome:
      produto.nome || fallback.produtoNome || fallback.nome || `Produto ${produtoId || "-"}`,
    produtoCodigo: produto.codigo || fallback.produtoCodigo || null,
    produtoEmoji: produto.emoji || fallback.produtoEmoji || "",
  };
};

const listarLogsManuais = async ({ lojaId, dataInicio, dataFim }) => {
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
  });

  return logs
    .map((log) => normalizarLogAtividade(log))
    .filter((log) => !lojaId || sameId(log.lojaId, lojaId))
    .filter(
      (log) =>
        log.quantidadeAnterior !== undefined &&
        log.quantidadeNova !== undefined &&
        log.produtoId,
    );
};

export const analisarEstoqueLoja = async (req, res) => {
  try {
    const { lojaId } = req.params;
    const { dataInicio, dataFim } = req.query;
    const inicio = toDateStart(dataInicio);
    const fim = toDateEnd(dataFim) || new Date();

    const loja = await Loja.findByPk(lojaId, { attributes: ["id", "nome"] });
    if (!loja) {
      return res.status(404).json({ error: "Loja nao encontrada" });
    }

    const [estoqueAtual, produtos, movimentacoesEstoque, movimentacoesMaquinas, logs] =
      await Promise.all([
        EstoqueLoja.findAll({
          where: { lojaId },
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "codigo", "emoji", "estoqueMinimo"],
            },
          ],
        }),
        Produto.findAll({ attributes: ["id", "nome", "codigo", "emoji"] }),
        MovimentacaoEstoqueLoja.findAll({
          where: { lojaId },
          include: [
            { model: Usuario, as: "usuario", attributes: ["id", "nome", "email"] },
            {
              model: MovimentacaoEstoqueLojaProduto,
              as: "produtosEnviados",
              include: [
                { model: Produto, as: "produto", attributes: ["id", "nome", "codigo", "emoji"] },
              ],
            },
          ],
          order: [["dataMovimentacao", "DESC"]],
        }),
        Movimentacao.findAll({
          include: [
            {
              model: Maquina,
              as: "maquina",
              attributes: ["id", "codigo", "nome", "lojaId"],
              where: { lojaId },
            },
            { model: Usuario, as: "usuario", attributes: ["id", "nome", "email"] },
            {
              model: MovimentacaoProduto,
              as: "detalhesProdutos",
              include: [
                { model: Produto, as: "produto", attributes: ["id", "nome", "codigo", "emoji"] },
              ],
            },
          ],
          order: [["dataColeta", "DESC"]],
        }),
        listarLogsManuais({ lojaId }),
      ]);

    const produtosPorId = new Map(produtos.map((produto) => [String(produto.id), produto]));
    const eventos = [];

    for (const mov of movimentacoesEstoque) {
      for (const item of mov.produtosEnviados || []) {
        const produtoId = item.produtoId;
        const quantidade = toNumber(item.quantidade);
        const isEntrada = item.tipoMovimentacao === "entrada";
        eventos.push({
          ...montarProdutoBase(produtoId, produtosPorId, { produto: item.produto }),
          id: `loja-${mov.id}-${item.id}`,
          origem: "estoque-loja",
          origemLabel: "Movimento do estoque da loja",
          tipo: isEntrada ? "entrada" : "saida",
          quantidade,
          impactoLoja: isEntrada ? quantidade : -quantidade,
          data: mov.dataMovimentacao,
          usuario: mov.usuario,
          maquina: null,
          observacao: mov.observacao,
        });
      }
    }

    for (const mov of movimentacoesMaquinas) {
      for (const item of mov.detalhesProdutos || []) {
        const produtoBase = montarProdutoBase(item.produtoId, produtosPorId, {
          produto: item.produto,
        });
        const quantidadeAbastecida = toNumber(item.quantidadeAbastecida);
        const quantidadeSaiu = toNumber(item.quantidadeSaiu);
        const retiradaProduto = toNumber(item.retiradaProduto);

        if (quantidadeAbastecida > 0) {
          eventos.push({
            ...produtoBase,
            id: `maq-abastece-${mov.id}-${item.id}`,
            origem: "maquina",
            origemLabel: "Abastecimento de maquina",
            tipo: "saida",
            quantidade: quantidadeAbastecida,
            impactoLoja: -quantidadeAbastecida,
            data: mov.dataColeta,
            usuario: mov.usuario,
            maquina: mov.maquina,
            observacao: mov.observacoes,
          });
        }

        if (quantidadeSaiu > 0) {
          eventos.push({
            ...produtoBase,
            id: `maq-saida-${mov.id}-${item.id}`,
            origem: "maquina",
            origemLabel: "Saida da maquina",
            tipo: "saida-maquina",
            quantidade: quantidadeSaiu,
            impactoLoja: 0,
            data: mov.dataColeta,
            usuario: mov.usuario,
            maquina: mov.maquina,
            observacao: mov.observacoes,
          });
        }

        if (retiradaProduto > 0) {
          eventos.push({
            ...produtoBase,
            id: `maq-retirada-${mov.id}-${item.id}`,
            origem: "maquina",
            origemLabel: "Retirada de maquina",
            tipo: "entrada",
            quantidade: retiradaProduto,
            impactoLoja: retiradaProduto,
            data: mov.dataColeta,
            usuario: mov.usuario,
            maquina: mov.maquina,
            observacao: mov.observacoes,
          });
        }
      }
    }

    for (const log of logs) {
      const anterior = toNumber(log.quantidadeAnterior);
      const nova = toNumber(log.quantidadeNova);
      const diferenca = nova - anterior;
      if (diferenca === 0) continue;

      eventos.push({
        ...montarProdutoBase(log.produtoId, produtosPorId, { produto: log.produto }),
        id: `manual-${log.id}`,
        origem: "manual",
        origemLabel: "Edicao manual / log de atividade",
        tipo: diferenca > 0 ? "entrada" : "saida",
        quantidade: Math.abs(diferenca),
        quantidadeAnterior: anterior,
        quantidadeNova: nova,
        impactoLoja: diferenca,
        data: log.createdAt,
        usuario: log.usuario,
        maquina: null,
        observacao: log.observacao,
      });
    }

    const resumoPorProduto = new Map();
    const garantirResumo = (produtoId, fallback = {}) => {
      const key = String(produtoId || fallback.produtoNome || fallback.nome);
      if (!key || key === "undefined") return null;
      if (!resumoPorProduto.has(key)) {
        resumoPorProduto.set(key, {
          ...montarProdutoBase(produtoId, produtosPorId, fallback),
          estoqueAtual: 0,
          estoqueMinimo: 0,
          estoqueInicial: 0,
          estoqueFinal: 0,
          entradas: 0,
          saidas: 0,
          abastecimentosMaquinas: 0,
          saidasMaquinas: 0,
          ajustesManuais: 0,
          saldoPeriodo: 0,
        });
      }
      return resumoPorProduto.get(key);
    };

    for (const item of estoqueAtual) {
      const resumo = garantirResumo(item.produtoId, { produto: item.produto });
      if (resumo) {
        resumo.estoqueAtual = toNumber(item.quantidade);
        resumo.estoqueMinimo = toNumber(item.estoqueMinimo || item.produto?.estoqueMinimo);
      }
    }

    for (const evento of eventos) {
      garantirResumo(evento.produtoId, evento);
    }

    const eventosPeriodo = eventos.filter((evento) => dentroPeriodo(evento, inicio, fim));

    for (const resumo of resumoPorProduto.values()) {
      const eventosProduto = eventos.filter((evento) => sameId(evento.produtoId, resumo.produtoId));
      const impactoDepoisFim = eventosProduto
        .filter((evento) => getEventDate(evento) > fim)
        .reduce((acc, evento) => acc + toNumber(evento.impactoLoja), 0);
      const impactoDepoisInicio = inicio
        ? eventosProduto
            .filter((evento) => getEventDate(evento) >= inicio)
            .reduce((acc, evento) => acc + toNumber(evento.impactoLoja), 0)
        : 0;

      resumo.estoqueFinal = resumo.estoqueAtual - impactoDepoisFim;
      resumo.estoqueInicial = inicio
        ? resumo.estoqueAtual - impactoDepoisInicio
        : resumo.estoqueAtual;

      for (const evento of eventosPeriodo.filter((e) => sameId(e.produtoId, resumo.produtoId))) {
        if (evento.origem === "manual") resumo.ajustesManuais += evento.impactoLoja;
        else if (evento.origemLabel === "Abastecimento de maquina") {
          resumo.abastecimentosMaquinas += evento.quantidade;
        } else if (evento.tipo === "saida-maquina") resumo.saidasMaquinas += evento.quantidade;
        else if (evento.tipo === "entrada") resumo.entradas += evento.quantidade;
        else if (evento.tipo === "saida") resumo.saidas += evento.quantidade;

        resumo.saldoPeriodo += evento.impactoLoja;
      }
    }

    const produtosResumo = Array.from(resumoPorProduto.values()).sort((a, b) =>
      a.produtoNome.localeCompare(b.produtoNome),
    );

    res.json({
      loja,
      periodo: {
        dataInicio: dataInicio || null,
        dataFim: dataFim || new Date().toISOString().slice(0, 10),
      },
      totais: {
        estoqueInicial: produtosResumo.reduce((acc, item) => acc + item.estoqueInicial, 0),
        estoqueFinal: produtosResumo.reduce((acc, item) => acc + item.estoqueFinal, 0),
        entradas: produtosResumo.reduce((acc, item) => acc + item.entradas, 0),
        saidas:
          produtosResumo.reduce((acc, item) => acc + item.saidas, 0) +
          produtosResumo.reduce((acc, item) => acc + item.abastecimentosMaquinas, 0),
        abastecimentosMaquinas: produtosResumo.reduce(
          (acc, item) => acc + item.abastecimentosMaquinas,
          0,
        ),
        saidasMaquinas: produtosResumo.reduce((acc, item) => acc + item.saidasMaquinas, 0),
        ajustesManuais: produtosResumo.reduce((acc, item) => acc + item.ajustesManuais, 0),
        eventos: eventosPeriodo.length,
      },
      produtos: produtosResumo,
      eventos: eventosPeriodo.sort((a, b) => getEventDate(b) - getEventDate(a)),
      logsDetalhados: logs.filter((log) => dentroPeriodo({ data: log.createdAt }, inicio, fim)),
    });
  } catch (error) {
    console.error("Erro ao analisar estoque da loja:", error);
    res.status(500).json({ error: "Erro ao analisar estoque da loja" });
  }
};
