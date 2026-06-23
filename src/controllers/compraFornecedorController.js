import { sequelize } from "../database/connection.js";
import {
  CompraFornecedor,
  CompraFornecedorProduto,
  EstoqueLoja,
  Fornecedor,
  Loja,
  MovimentacaoEstoqueLoja,
  MovimentacaoEstoqueLojaProduto,
  Produto,
  Usuario,
} from "../models/index.js";
import { obterOuCriarGaragem } from "./movimentacaoEstoqueLojaController.js";

const consolidarProdutos = (produtos) => {
  const totais = new Map();
  (Array.isArray(produtos) ? produtos : []).forEach((item) => {
    const quantidade = Number(item.quantidade);
    if (item.produtoId && Number.isInteger(quantidade) && quantidade > 0) {
      totais.set(
        item.produtoId,
        (totais.get(item.produtoId) || 0) + quantidade,
      );
    }
  });
  return Array.from(totais.entries()).map(([produtoId, quantidade]) => ({
    produtoId,
    quantidade,
  }));
};

const criarMovimento = async ({
  lojaId,
  usuarioId,
  observacao,
  data,
  itens,
  tipo,
  transaction,
}) => {
  const movimento = await MovimentacaoEstoqueLoja.create(
    {
      lojaId,
      usuarioId,
      observacao,
      dataMovimentacao: data,
    },
    { transaction },
  );
  await MovimentacaoEstoqueLojaProduto.bulkCreate(
    itens.map((item) => ({
      movimentacaoEstoqueLojaId: movimento.id,
      produtoId: item.produtoId,
      quantidade: item.quantidade,
      tipoMovimentacao: tipo,
    })),
    { transaction },
  );
  return movimento;
};

const alterarEstoque = async ({
  lojaId,
  itens,
  operacao,
  transaction,
}) => {
  for (const item of itens) {
    const [estoque] = await EstoqueLoja.findOrCreate({
      where: { lojaId, produtoId: item.produtoId },
      defaults: { quantidade: 0 },
      transaction,
    });
    if (operacao === "entrada") {
      await estoque.increment("quantidade", {
        by: item.quantidade,
        transaction,
      });
    } else {
      await estoque.decrement("quantidade", {
        by: item.quantidade,
        transaction,
      });
    }
  }
};

export const criarCompraFornecedor = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      fornecedorId,
      destinoLojaId,
      produtos,
      observacao,
      dataCompra,
    } = req.body;
    const itens = consolidarProdutos(produtos);
    const usuarioId = req.usuario?.id;

    if (!fornecedorId || itens.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Fornecedor e pelo menos um produto são obrigatórios.",
      });
    }

    const [fornecedor, garagem] = await Promise.all([
      Fornecedor.findByPk(fornecedorId, { transaction }),
      obterOuCriarGaragem(transaction),
    ]);
    if (!fornecedor || !fornecedor.ativo) {
      await transaction.rollback();
      return res.status(404).json({ error: "Fornecedor não encontrado." });
    }

    const destinoId = destinoLojaId || garagem.id;
    const destino = await Loja.findByPk(destinoId, { transaction });
    if (!destino || !destino.ativo) {
      await transaction.rollback();
      return res.status(404).json({ error: "Destino não encontrado." });
    }

    const produtosExistentes = await Produto.count({
      where: { id: itens.map((item) => item.produtoId) },
      transaction,
    });
    if (produtosExistentes !== itens.length) {
      await transaction.rollback();
      return res.status(400).json({ error: "Há produtos inválidos na compra." });
    }

    const data = dataCompra || new Date();
    const compra = await CompraFornecedor.create(
      {
        fornecedorId,
        destinoLojaId: destino.id,
        usuarioId,
        observacao,
        dataCompra: data,
      },
      { transaction },
    );
    await CompraFornecedorProduto.bulkCreate(
      itens.map((item) => ({ ...item, compraId: compra.id })),
      { transaction },
    );

    const descricaoCompra = `Compra de ${fornecedor.razaoSocial} - entrada obrigatória na Garagem`;
    await criarMovimento({
      lojaId: garagem.id,
      usuarioId,
      observacao: descricaoCompra,
      data,
      itens,
      tipo: "entrada",
      transaction,
    });
    await alterarEstoque({
      lojaId: garagem.id,
      itens,
      operacao: "entrada",
      transaction,
    });

    if (String(destino.id) !== String(garagem.id)) {
      const descricaoTransferencia = `Transferência automática da Garagem para ${destino.nome} - compra ${fornecedor.razaoSocial}`;
      await criarMovimento({
        lojaId: garagem.id,
        usuarioId,
        observacao: descricaoTransferencia,
        data,
        itens,
        tipo: "saida",
        transaction,
      });
      await alterarEstoque({
        lojaId: garagem.id,
        itens,
        operacao: "saida",
        transaction,
      });
      await criarMovimento({
        lojaId: destino.id,
        usuarioId,
        observacao: descricaoTransferencia,
        data,
        itens,
        tipo: "entrada",
        transaction,
      });
      await alterarEstoque({
        lojaId: destino.id,
        itens,
        operacao: "entrada",
        transaction,
      });
    }

    await transaction.commit();
    res.status(201).json({
      message:
        String(destino.id) === String(garagem.id)
          ? "Compra registrada e recebida na Garagem."
          : `Compra recebida na Garagem e transferida para ${destino.nome}.`,
      compraId: compra.id,
      fornecedor: fornecedor.razaoSocial,
      destino: destino.nome,
      produtos: itens,
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Erro ao registrar compra:", error);
    res.status(500).json({
      error: "Erro interno ao registrar compra.",
      details: error.message,
    });
  }
};

export const listarComprasFornecedores = async (req, res) => {
  try {
    const compras = await CompraFornecedor.findAll({
      include: [
        { model: Fornecedor, as: "fornecedor" },
        { model: Loja, as: "destino" },
        { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
        {
          model: CompraFornecedorProduto,
          as: "produtos",
          include: [{ model: Produto, as: "produto" }],
        },
      ],
      order: [["dataCompra", "DESC"]],
    });
    res.json(compras);
  } catch (error) {
    console.error("Erro ao listar compras:", error);
    res.status(500).json({ error: "Erro ao listar compras" });
  }
};
