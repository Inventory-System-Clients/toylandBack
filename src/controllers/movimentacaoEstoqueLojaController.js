import { randomUUID } from "node:crypto";
import MovimentacaoEstoqueLoja from "../models/MovimentacaoEstoqueLoja.js";
import MovimentacaoEstoqueLojaProduto from "../models/MovimentacaoEstoqueLojaProduto.js";
import {
  EstoqueLoja,
  Loja,
  Usuario,
  Produto,
} from "../models/index.js";
import { sequelize } from "../database/connection.js";

const NOME_DEPOSITO_CENTRAL = "Garagem";

export const obterOuCriarGaragem = async (transaction) => {
  const [garagem] = await Loja.findOrCreate({
    where: { nome: NOME_DEPOSITO_CENTRAL },
    defaults: {
      nome: NOME_DEPOSITO_CENTRAL,
      endereco: "Depósito central de produtos",
      responsavel: "Estoque central",
      ativo: true,
    },
    transaction,
  });

  if (!garagem.ativo) {
    await garagem.update({ ativo: true }, { transaction });
  }

  return garagem;
};

// Listar todas as movimentações de estoque de loja
export const listarMovimentacoesEstoqueLoja = async (req, res) => {
  try {
    const movimentacoes = await MovimentacaoEstoqueLoja.findAll({
      order: [["dataMovimentacao", "DESC"]],
      include: [
        { model: Loja, as: "loja", attributes: ["id", "nome"] },
        { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
        {
          model: MovimentacaoEstoqueLojaProduto,
          as: "produtosEnviados",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "codigo", "emoji"],
            },
          ],
        },
      ],
    });
    res.json(movimentacoes);
  } catch (error) {
    res.status(500).json({ error: "Erro ao listar movimentações" });
  }
};

// Criar nova movimentação
export const criarMovimentacaoEstoqueLoja = async (req, res) => {
  try {
    const { lojaId, produtos, observacao, dataMovimentacao } = req.body;
    // usuarioId será preenchido automaticamente pelo middleware de autenticação
    const usuarioId = req.usuario?.id;

    console.log("[DEBUG] Payload recebido:", req.body);

    // 1. Validação
    if (!lojaId || !Array.isArray(produtos) || produtos.length === 0) {
      console.error("[ERRO] Loja ou produtos ausentes", { lojaId, produtos });
      return res
        .status(400)
        .json({ error: "Loja e Produtos são obrigatórios." });
    }

    // 2. Criar a Movimentação (Header)
    const movimentacao = await MovimentacaoEstoqueLoja.create({
      lojaId,
      usuarioId,
      observacao,
      dataMovimentacao: dataMovimentacao || new Date(),
    });

    console.log("[DEBUG] Movimentacao criada ID:", movimentacao.id);

    // 3. Salvar produtos enviados (Itens) e atualizar estoque
    const { EstoqueLoja } = await import("../models/index.js");
    for (const [idx, item] of produtos.entries()) {
      try {
        await MovimentacaoEstoqueLojaProduto.create({
          movimentacaoEstoqueLojaId: movimentacao.id,
          produtoId: item.produtoId,
          quantidade: Number(item.quantidade),
          tipoMovimentacao: item.tipoMovimentacao || "saida",
        });

        // Atualizar estoque da loja
        const estoque = await EstoqueLoja.findOne({
          where: { lojaId, produtoId: item.produtoId },
        });
        let novaQuantidade = 0;
        if (estoque) {
          console.log(
            `[ESTOQUE] Antes: lojaId=${lojaId}, produtoId=${item.produtoId}, quantidadeAtual=${estoque.quantidade}`
          );
          if ((item.tipoMovimentacao || "saida") === "entrada") {
            novaQuantidade = estoque.quantidade + Number(item.quantidade);
          } else {
            novaQuantidade = estoque.quantidade - Number(item.quantidade);
            if (novaQuantidade < 0) novaQuantidade = 0;
          }
          await estoque.update({ quantidade: novaQuantidade });
          console.log(
            `[ESTOQUE] Depois: lojaId=${lojaId}, produtoId=${item.produtoId}, novaQuantidade=${novaQuantidade}`
          );
        } else {
          // Se não existe, cria novo registro de estoque
          novaQuantidade =
            (item.tipoMovimentacao || "saida") === "entrada"
              ? Number(item.quantidade)
              : 0;
          await EstoqueLoja.create({
            lojaId,
            produtoId: item.produtoId,
            quantidade: novaQuantidade,
          });
          console.log(
            `[ESTOQUE] Criado novo estoque: lojaId=${lojaId}, produtoId=${item.produtoId}, quantidade=${novaQuantidade}`
          );
        }
      } catch (err) {
        console.error(`[ERRO] Falha ao criar produto idx ${idx}:`, item, err);
      }
    }

    // 4. Retornar movimentação completa com os produtos inclusos
    const movimentacaoCompleta = await MovimentacaoEstoqueLoja.findByPk(
      movimentacao.id,
      {
        include: [
          { model: Loja, as: "loja", attributes: ["id", "nome"] },
          { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
          {
            model: MovimentacaoEstoqueLojaProduto,
            as: "produtosEnviados",
            include: [
              { model: Produto, as: "produto", attributes: ["id", "nome"] },
            ],
          },
        ],
      }
    );

    return res.status(201).json(movimentacaoCompleta);
  } catch (err) {
    console.error("[ERRO] Exception geral ao criar movimentação:", err);
    return res.status(500).json({
      error: "Erro interno ao criar movimentação",
      details: err.message,
    });
  }
};

// Transferir produtos da Garagem para o depósito de uma loja
export const transferirDaGaragem = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { lojaDestinoId, produtos, observacao, dataMovimentacao } = req.body;
    const usuarioId = req.usuario?.id;
    const itensRecebidos = Array.isArray(produtos)
      ? produtos
          .map((item) => ({
            produtoId: item.produtoId,
            quantidade: Number(item.quantidade),
          }))
          .filter(
            (item) =>
              item.produtoId &&
              Number.isInteger(item.quantidade) &&
              item.quantidade > 0,
          )
      : [];
    const quantidadesPorProduto = new Map();
    itensRecebidos.forEach((item) => {
      quantidadesPorProduto.set(
        item.produtoId,
        (quantidadesPorProduto.get(item.produtoId) || 0) + item.quantidade,
      );
    });
    const itens = Array.from(quantidadesPorProduto.entries()).map(
      ([produtoId, quantidade]) => ({ produtoId, quantidade }),
    );

    if (!lojaDestinoId || itens.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "Loja de destino e produtos válidos são obrigatórios.",
      });
    }

    const garagem = await obterOuCriarGaragem(transaction);
    if (String(garagem.id) === String(lojaDestinoId)) {
      await transaction.rollback();
      return res
        .status(400)
        .json({ error: "A loja de destino deve ser diferente da Garagem." });
    }

    const lojaDestino = await Loja.findByPk(lojaDestinoId, { transaction });
    if (!lojaDestino || !lojaDestino.ativo) {
      await transaction.rollback();
      return res.status(404).json({ error: "Loja de destino não encontrada." });
    }

    for (const item of itens) {
      const estoqueOrigem = await EstoqueLoja.findOne({
        where: { lojaId: garagem.id, produtoId: item.produtoId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const disponivel = Number(estoqueOrigem?.quantidade || 0);
      if (disponivel < item.quantidade) {
        const produto = await Produto.findByPk(item.produtoId, { transaction });
        await transaction.rollback();
        return res.status(400).json({
          error: `Estoque insuficiente na Garagem para ${produto?.nome || "o produto"}. Disponível: ${disponivel}, solicitado: ${item.quantidade}.`,
        });
      }
    }

    const data = dataMovimentacao || new Date();
    const observacaoTransferencia =
      observacao ||
      `Transferência da Garagem para ${lojaDestino.nome}`;
    const grupoId = randomUUID();

    const movimentacaoOrigem = await MovimentacaoEstoqueLoja.create(
      {
        lojaId: garagem.id,
        usuarioId,
        observacao: observacaoTransferencia,
        dataMovimentacao: data,
        grupoId,
      },
      { transaction },
    );
    const movimentacaoDestino = await MovimentacaoEstoqueLoja.create(
      {
        lojaId: lojaDestino.id,
        usuarioId,
        observacao: observacaoTransferencia,
        dataMovimentacao: data,
        grupoId,
      },
      { transaction },
    );

    for (const item of itens) {
      const estoqueOrigem = await EstoqueLoja.findOne({
        where: { lojaId: garagem.id, produtoId: item.produtoId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await estoqueOrigem.decrement("quantidade", {
        by: item.quantidade,
        transaction,
      });

      const [estoqueDestino] = await EstoqueLoja.findOrCreate({
        where: { lojaId: lojaDestino.id, produtoId: item.produtoId },
        defaults: { quantidade: 0 },
        transaction,
      });
      await estoqueDestino.increment("quantidade", {
        by: item.quantidade,
        transaction,
      });

      await MovimentacaoEstoqueLojaProduto.bulkCreate(
        [
          {
            movimentacaoEstoqueLojaId: movimentacaoOrigem.id,
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            tipoMovimentacao: "saida",
          },
          {
            movimentacaoEstoqueLojaId: movimentacaoDestino.id,
            produtoId: item.produtoId,
            quantidade: item.quantidade,
            tipoMovimentacao: "entrada",
          },
        ],
        { transaction },
      );
    }

    await transaction.commit();
    return res.status(201).json({
      message: `Produtos transferidos da Garagem para ${lojaDestino.nome}.`,
      origem: { id: garagem.id, nome: garagem.nome },
      destino: { id: lojaDestino.id, nome: lojaDestino.nome },
      produtos: itens,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    console.error("Erro ao transferir estoque da Garagem:", error);
    return res.status(500).json({
      error: "Erro interno ao transferir produtos da Garagem.",
      details: error.message,
    });
  }
};

// Editar movimentação
export const editarMovimentacaoEstoqueLoja = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { lojaId, usuarioId, produtos, observacao, dataMovimentacao } =
      req.body;

    const movimentacao = await MovimentacaoEstoqueLoja.findByPk(id, {
      transaction,
    });

    if (!movimentacao) {
      await transaction.rollback();
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    const emGrupo = Boolean(movimentacao.grupoId);
    const grupo = emGrupo
      ? await MovimentacaoEstoqueLoja.findAll({
          where: { grupoId: movimentacao.grupoId },
          transaction,
        })
      : [movimentacao];

    // Loja/usuário só fazem sentido em registros avulsos: mudar a loja de um
    // dos lados de uma transferência/compra vinculada quebraria o outro lado.
    for (const registro of grupo) {
      if (!emGrupo) {
        registro.lojaId = lojaId || registro.lojaId;
        registro.usuarioId = usuarioId || registro.usuarioId;
      }
      registro.observacao = observacao || registro.observacao;
      registro.dataMovimentacao = dataMovimentacao || registro.dataMovimentacao;
      await registro.save({ transaction });
    }

    if (Array.isArray(produtos)) {
      if (!emGrupo) {
        // Registro avulso: comportamento original (remove e recria os itens,
        // permitindo adicionar/remover produtos da movimentação).
        const produtosAntigos = await MovimentacaoEstoqueLojaProduto.findAll({
          where: { movimentacaoEstoqueLojaId: movimentacao.id },
          transaction,
        });

        await MovimentacaoEstoqueLojaProduto.destroy({
          where: { movimentacaoEstoqueLojaId: movimentacao.id },
          transaction,
        });

        const mapAntigos = {};
        for (const prod of produtosAntigos) {
          mapAntigos[prod.produtoId] = prod;
        }

        for (const item of produtos) {
          await MovimentacaoEstoqueLojaProduto.create(
            {
              movimentacaoEstoqueLojaId: movimentacao.id,
              produtoId: item.produtoId,
              quantidade: Number(item.quantidade),
              tipoMovimentacao: item.tipoMovimentacao || "saida",
            },
            { transaction },
          );

          const antigo = mapAntigos[item.produtoId];
          const quantidadeAntiga = antigo ? Number(antigo.quantidade) : 0;
          const tipoAntigo = antigo
            ? antigo.tipoMovimentacao
            : item.tipoMovimentacao || "saida";
          const quantidadeNova = Number(item.quantidade);
          const tipoNovo = item.tipoMovimentacao || "saida";

          const [estoque] = await EstoqueLoja.findOrCreate({
            where: { lojaId: movimentacao.lojaId, produtoId: item.produtoId },
            defaults: { quantidade: 0 },
            transaction,
          });

          let novaQuantidade = Number(estoque.quantidade);
          if (tipoAntigo === "entrada") {
            novaQuantidade -= quantidadeAntiga;
          } else {
            novaQuantidade += quantidadeAntiga;
          }
          if (tipoNovo === "entrada") {
            novaQuantidade += quantidadeNova;
          } else {
            novaQuantidade -= quantidadeNova;
          }
          if (novaQuantidade < 0) novaQuantidade = 0;
          await estoque.update({ quantidade: novaQuantidade }, { transaction });
        }
      } else {
        // Registro vinculado (transferência/compra): só a quantidade de cada
        // produto é corrigida, espelhada em todas as pontas do grupo. A
        // direção (entrada/saída) de cada lado não muda por aqui.
        const quantidadesNovasPorProduto = new Map(
          produtos
            .filter((item) => item.produtoId)
            .map((item) => [item.produtoId, Number(item.quantidade)]),
        );

        for (const registro of grupo) {
          const itensAtuais = await MovimentacaoEstoqueLojaProduto.findAll({
            where: { movimentacaoEstoqueLojaId: registro.id },
            transaction,
          });

          for (const itemAtual of itensAtuais) {
            if (!quantidadesNovasPorProduto.has(itemAtual.produtoId)) {
              continue;
            }

            const quantidadeNova = quantidadesNovasPorProduto.get(
              itemAtual.produtoId,
            );
            const quantidadeAntiga = Number(itemAtual.quantidade);
            if (
              !Number.isFinite(quantidadeNova) ||
              quantidadeNova === quantidadeAntiga
            ) {
              continue;
            }

            const [estoque] = await EstoqueLoja.findOrCreate({
              where: {
                lojaId: registro.lojaId,
                produtoId: itemAtual.produtoId,
              },
              defaults: { quantidade: 0 },
              transaction,
            });

            const delta = quantidadeNova - quantidadeAntiga;
            const efeito =
              itemAtual.tipoMovimentacao === "entrada" ? delta : -delta;
            const novaQuantidadeEstoque = Math.max(
              0,
              Number(estoque.quantidade) + efeito,
            );
            await estoque.update(
              { quantidade: novaQuantidadeEstoque },
              { transaction },
            );

            itemAtual.quantidade = quantidadeNova;
            await itemAtual.save({ transaction });
          }
        }
      }
    }

    await transaction.commit();

    // Retornar movimentação completa
    const movimentacaoCompleta = await MovimentacaoEstoqueLoja.findByPk(
      movimentacao.id,
      {
        include: [
          { model: Loja, as: "loja", attributes: ["id", "nome"] },
          { model: Usuario, as: "usuario", attributes: ["id", "nome"] },
          {
            model: MovimentacaoEstoqueLojaProduto,
            as: "produtosEnviados",
            include: [
              { model: Produto, as: "produto", attributes: ["id", "nome"] },
            ],
          },
        ],
      }
    );

    return res.json(movimentacaoCompleta);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Erro ao editar:", error);
    return res.status(500).json({ error: "Erro ao editar movimentação" });
  }
};

// Deletar movimentação
export const deletarMovimentacaoEstoqueLoja = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const movimentacao = await MovimentacaoEstoqueLoja.findByPk(id, {
      transaction,
    });
    if (!movimentacao) {
      await transaction.rollback();
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    // Se faz parte de uma transferência/compra vinculada, exclui o grupo
    // inteiro junto para não deixar o estoque de um dos lados desatualizado.
    const grupo = movimentacao.grupoId
      ? await MovimentacaoEstoqueLoja.findAll({
          where: { grupoId: movimentacao.grupoId },
          transaction,
        })
      : [movimentacao];

    for (const registro of grupo) {
      const produtosMovimentados = await MovimentacaoEstoqueLojaProduto.findAll({
        where: { movimentacaoEstoqueLojaId: registro.id },
        transaction,
      });

      for (const item of produtosMovimentados) {
        const [estoque] = await EstoqueLoja.findOrCreate({
          where: { lojaId: registro.lojaId, produtoId: item.produtoId },
          defaults: { quantidade: 0 },
          transaction,
        });

        let novaQuantidade = Number(estoque.quantidade);
        if ((item.tipoMovimentacao || "saida") === "entrada") {
          // Se era uma entrada, ao deletar deve subtrair do estoque
          novaQuantidade -= item.quantidade;
        } else {
          // Se era uma saída, ao deletar deve somar de volta ao estoque
          novaQuantidade += item.quantidade;
        }
        if (novaQuantidade < 0) novaQuantidade = 0;
        await estoque.update({ quantidade: novaQuantidade }, { transaction });
      }

      await MovimentacaoEstoqueLojaProduto.destroy({
        where: { movimentacaoEstoqueLojaId: registro.id },
        transaction,
      });
      await registro.destroy({ transaction });
    }

    await transaction.commit();

    return res.json({
      message:
        grupo.length > 1
          ? `Movimentação excluída com sucesso (${grupo.length - 1} registro(s) vinculado(s) removido(s) junto).`
          : "Movimentação excluída com sucesso",
    });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Erro ao excluir:", error);
    return res.status(500).json({ error: "Erro ao excluir movimentação" });
  }
};
