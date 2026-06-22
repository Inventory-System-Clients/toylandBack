import {
  Maquina,
  Produto,
  Movimentacao,
  MovimentacaoProduto,
} from "../models/index.js";

// Retorna o produto sugerido para uma máquina
export const produtoSugeridoPorMaquina = async (req, res) => {
  try {
    const { id } = req.params; // id da máquina
    const maquina = await Maquina.findByPk(id);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada" });
    }

    // 1. Buscar última movimentação da máquina
    const ultimaMov = await Movimentacao.findOne({
      where: { maquinaId: id },
      order: [["dataColeta", "DESC"]],
      include: [
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
            },
          ],
        },
      ],
    });

    if (
      ultimaMov &&
      ultimaMov.detalhesProdutos &&
      ultimaMov.detalhesProdutos.length > 0
    ) {
      // Pega o primeiro produto da última movimentação
      const prodMov = ultimaMov.detalhesProdutos[0];
      if (prodMov.produto) {
        return res.json({ produtoSugerido: prodMov.produto });
      }
    }

    // 2. Se não houver movimentação, tenta pelo tipo da máquina (nome ou tipo)
    if (maquina.tipo) {
      const produto = await Produto.findOne({
        where: {
          // Busca por tipo igual ou nome contendo o tipo
          $or: [
            { tipo: maquina.tipo },
            { nome: { $like: `%${maquina.tipo}%` } },
          ],
        },
      });
      if (produto) {
        return res.json({ produtoSugerido: produto });
      }
    }

    // 3. Não achou sugestão
    return res.json({ produtoSugerido: null });
  } catch (error) {
    console.error("Erro ao buscar produto sugerido:", error);
    res.status(500).json({ error: "Erro ao buscar produto sugerido" });
  }
};
