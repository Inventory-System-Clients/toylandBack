import { sequelize } from "../database/connection.js";
import {
  ListaComprasPendente,
  ListaComprasLoja,
  ListaComprasProduto,
} from "../models/index.js";

const listaComprasPendenteController = {
  // GET /lista-compras-pendentes
  async listar(req, res) {
    try {
      const listas = await ListaComprasPendente.findAll({
        order: [["criadoEm", "DESC"]],
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.json(listas);
    } catch (err) {
      console.error("Erro ao listar listas de compras:", err);
      return res
        .status(500)
        .json({ error: "Erro ao listar listas de compras." });
    }
  },

  // POST /lista-compras-pendentes
  async criar(req, res) {
    const t = await sequelize.transaction();
    try {
      const { lojas, usuarioId } = req.body;

      if (!Array.isArray(lojas) || lojas.length === 0) {
        await t.rollback();
        return res.status(400).json({ error: "lojas é obrigatório." });
      }

      const lista = await ListaComprasPendente.create(
        { usuarioId: usuarioId ?? req.usuario?.id ?? null },
        { transaction: t },
      );

      for (const lojaData of lojas) {
        const listaLoja = await ListaComprasLoja.create(
          {
            listaId: lista.id,
            lojaId: lojaData.lojaId,
            lojaNome: lojaData.lojaNome,
          },
          { transaction: t },
        );

        if (Array.isArray(lojaData.produtos)) {
          await ListaComprasProduto.bulkCreate(
            lojaData.produtos.map((p) => ({
              listaLojaId: listaLoja.id,
              produtoKey: p.key,
              produtoId: p.produtoId ?? null,
              produtoNome: p.produtoNome,
              produtoEmoji: p.produtoEmoji ?? "📦",
              produtoCodigo: p.produtoCodigo ?? "",
              quantidade: Number(p.quantidade) || 0,
            })),
            { transaction: t },
          );
        }
      }

      await t.commit();

      const criada = await ListaComprasPendente.findByPk(lista.id, {
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.status(201).json(criada);
    } catch (err) {
      await t.rollback();
      console.error("Erro ao criar lista de compras:", err);
      return res.status(500).json({ error: "Erro ao criar lista de compras." });
    }
  },

  // DELETE /lista-compras-pendentes/:id
  async excluir(req, res) {
    try {
      const { id } = req.params;
      const lista = await ListaComprasPendente.findByPk(id);
      if (!lista) {
        return res.status(404).json({ error: "Lista não encontrada." });
      }
      // Cascata manual pois o Sequelize sync não garante ON DELETE CASCADE via FK
      const lojas = await ListaComprasLoja.findAll({ where: { listaId: id } });
      const lojaIds = lojas.map((l) => l.id);
      if (lojaIds.length > 0) {
        await ListaComprasProduto.destroy({ where: { listaLojaId: lojaIds } });
      }
      await ListaComprasLoja.destroy({ where: { listaId: id } });
      await lista.destroy();
      return res.status(204).send();
    } catch (err) {
      console.error("Erro ao excluir lista de compras:", err);
      return res
        .status(500)
        .json({ error: "Erro ao excluir lista de compras." });
    }
  },

  // DELETE /lista-compras-pendentes/:id/produto/:produtoId
  // Remove um produto específico de uma loja do pendente
  async removerProduto(req, res) {
    try {
      const { id, produtoId } = req.params;
      const { lojaId } = req.query;

      if (!lojaId) {
        return res
          .status(400)
          .json({ error: "lojaId é obrigatório na query." });
      }

      const listaLoja = await ListaComprasLoja.findOne({
        where: { listaId: id, lojaId },
      });
      if (!listaLoja) {
        return res
          .status(404)
          .json({ error: "Loja não encontrada no pendente." });
      }

      await ListaComprasProduto.destroy({
        where: { listaLojaId: listaLoja.id, produtoKey: produtoId },
      });

      // Se não sobrar nenhum produto na loja, remove a loja
      const restantes = await ListaComprasProduto.count({
        where: { listaLojaId: listaLoja.id },
      });
      if (restantes === 0) {
        await listaLoja.destroy();

        // Se não sobrar nenhuma loja, remove a lista
        const restantesLojas = await ListaComprasLoja.count({
          where: { listaId: id },
        });
        if (restantesLojas === 0) {
          await ListaComprasPendente.destroy({ where: { id } });
          return res.status(204).send();
        }
      }

      const atualizada = await ListaComprasPendente.findByPk(id, {
        include: [
          {
            model: ListaComprasLoja,
            as: "lojas",
            include: [{ model: ListaComprasProduto, as: "produtos" }],
          },
        ],
      });
      return res.json(atualizada);
    } catch (err) {
      console.error("Erro ao remover produto do pendente:", err);
      return res.status(500).json({ error: "Erro ao remover produto." });
    }
  },
};

export default listaComprasPendenteController;
