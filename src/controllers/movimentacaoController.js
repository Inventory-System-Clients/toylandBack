import {
  Movimentacao,
  MovimentacaoProduto,
  Maquina,
  Usuario,
  Produto,
  EstoqueLoja,
  Loja,
} from "../models/index.js";
import { Op } from "sequelize";

const movimentacoesEmAndamento = new Set();

// US08, US09, US10 - Registrar movimentação completa
export const registrarMovimentacao = async (req, res) => {
  let chaveMovimentacaoEmAndamento = null;

  try {
    const {
      maquinaId,
      dataColeta,
      totalPre,
      sairam,
      abastecidas,
      fichas,
      contadorMaquina,
      contadorIn,
      contadorOut,
      observacoes,
      tipoOcorrencia,
      retiradaEstoque,
      produtos, // Array de { produtoId, quantidadeSaiu, quantidadeAbastecida }
      quantidade_notas_entrada,
      valor_entrada_maquininha_pix,
    } = req.body;

    // Validações
    if (
      !maquinaId ||
      totalPre === undefined ||
      sairam === undefined ||
      abastecidas === undefined
    ) {
      return res.status(400).json({
        error: "maquinaId, totalPre, sairam e abastecidas são obrigatórios",
      });
    }

    // --- REGRA DE SEGURANÇA: Não permitir total maior que totalPos da última movimentação, exceto para ADMIN ---
    const chaveBloqueio = String(maquinaId);
    if (movimentacoesEmAndamento.has(chaveBloqueio)) {
      return res.status(409).json({
        error:
          "Ja existe uma movimentacao sendo registrada para esta maquina. Aguarde a finalizacao antes de tentar novamente.",
      });
    }

    movimentacoesEmAndamento.add(chaveBloqueio);
    chaveMovimentacaoEmAndamento = chaveBloqueio;

    const ultimaMov = await Movimentacao.findOne({
      where: { maquinaId },
      order: [["createdAt", "DESC"]],
    });
    // Validação: contadorIn/contadorOut não pode ser menor que o anterior, exceto ADMIN, ou se não enviado ou zero
    if (ultimaMov) {
      // contadorIn
      if (
        typeof contadorIn === "number" &&
        contadorIn > 0 &&
        typeof ultimaMov.contadorIn === "number" &&
        ultimaMov.contadorIn !== null &&
        contadorIn < ultimaMov.contadorIn &&
        req.usuario.role !== "ADMIN"
      ) {
        return res.status(400).json({
          error: `O contador IN (${contadorIn}) não pode ser menor que o anterior. Verifique o valor digitado ou peça ajuda ao gestor.`,
        });
      }
      // contadorOut
      if (
        typeof contadorOut === "number" &&
        contadorOut > 0 &&
        typeof ultimaMov.contadorOut === "number" &&
        ultimaMov.contadorOut !== null &&
        contadorOut < ultimaMov.contadorOut &&
        req.usuario.role !== "ADMIN"
      ) {
        return res.status(400).json({
          error: `O contador OUT (${contadorOut}) não pode ser menor que o anterior. Verifique o valor digitado ou peça ajuda ao gestor.`,
        });
      }
    }
    if (
      ultimaMov &&
      typeof ultimaMov.totalPos === "number" &&
      totalPre > ultimaMov.totalPos &&
      req.usuario.role !== "ADMIN"
    ) {
      return res.status(400).json({
        error: `Não é permitido abastecer a máquina com uma quantidade maior (${totalPre}) do que o total pós da última movimentação. Confira o que você digitou.`,
      });
    }

    // --- Recalcular saída (sairam) para garantir consistência ---
    let saidaRecalculada = 0;
    if (ultimaMov && typeof ultimaMov.totalPos === "number") {
      saidaRecalculada = Math.max(0, ultimaMov.totalPos - totalPre);
    }
    // Se não houver movimentação anterior, saída é zero

    // Buscar máquina para pegar valorFicha
    const maquina = await Maquina.findByPk(maquinaId);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada" });
    }

    if (Array.isArray(produtos) && produtos.length > 0) {
      for (const produto of produtos) {
        const quantidadeAbastecida = Number(produto.quantidadeAbastecida) || 0;
        if (quantidadeAbastecida <= 0) continue;

        const estoqueLoja = await EstoqueLoja.findOne({
          where: {
            lojaId: maquina.lojaId,
            produtoId: produto.produtoId,
          },
        });

        const estoqueDisponivel = Number(estoqueLoja?.quantidade || 0);
        if (quantidadeAbastecida > estoqueDisponivel) {
          const produtoInfo = await Produto.findByPk(produto.produtoId, {
            attributes: ["nome"],
          });

          return res.status(400).json({
            error: `Não há estoque suficiente na loja para abastecer ${produtoInfo?.nome || "este produto"}. Disponível: ${estoqueDisponivel}, solicitado: ${quantidadeAbastecida}.`,
          });
        }
      }
    }

    // Calcular valor faturado: fichas + notas + digital
    const valorFaturado =
      (fichas ? fichas * parseFloat(maquina.valorFicha) : 0) +
      (quantidade_notas_entrada ? parseFloat(quantidade_notas_entrada) : 0) +
      (valor_entrada_maquininha_pix
        ? parseFloat(valor_entrada_maquininha_pix)
        : 0);

    console.log("📝 [registrarMovimentacao] Criando movimentação:", {
      maquinaId,
      totalPre,
      sairam: saidaRecalculada,
      abastecidas,
      totalPosCalculado: totalPre - saidaRecalculada + abastecidas,
      fichas: fichas || 0,
      valorFaturado,
    });

    // Calcular retiradaProduto e quantidadeSaiuTotal
    let retiradaProduto = 0;
    if (Array.isArray(produtos) && produtos.length > 0) {
      retiradaProduto = produtos.reduce(
        (soma, p) => soma + (parseInt(p.retiradaProduto) || 0),
        0,
      );
    }
    console.log(
      "🔍 [registrarMovimentacao] retiradaProduto recebido:",
      retiradaProduto,
    );
    console.log("🔍 [registrarMovimentacao] produtos recebidos:", produtos);
    const totalPosCalculado =
      (parseInt(totalPre) || 0) +
      (parseInt(abastecidas) || 0) -
      retiradaProduto;
    console.log(
      "🔍 [registrarMovimentacao] totalPosCalculado:",
      totalPosCalculado,
      "(totalPre:",
      totalPre,
      ", abastecidas:",
      abastecidas,
      ", retiradaProduto:",
      retiradaProduto,
      ")",
    );

    // Criar movimentação
    const movimentacao = await Movimentacao.create({
      maquinaId,
      usuarioId: req.usuario.id,
      dataColeta: dataColeta || new Date(),
      totalPre,
      sairam: saidaRecalculada,
      abastecidas,
      fichas: fichas || 0,
      contadorMaquina,
      contadorIn,
      contadorOut,
      valorFaturado,
      observacoes,
      tipoOcorrencia: tipoOcorrencia || "Normal",
      retiradaEstoque: retiradaEstoque || false,
      quantidade_notas_entrada: quantidade_notas_entrada ?? null,
      valor_entrada_maquininha_pix: valor_entrada_maquininha_pix ?? null,
      totalPos: totalPosCalculado,
    });

    console.log("✅ [registrarMovimentacao] Movimentação criada:", {
      id: movimentacao.id,
      totalPre: movimentacao.totalPre,
      sairam: movimentacao.sairam,
      abastecidas: movimentacao.abastecidas,
      totalPos: movimentacao.totalPos,
    });

    // Se produtos foram informados, registrar detalhes
    if (produtos && produtos.length > 0) {
      // Garantir que quantidadeSaiu dos produtos seja igual ao sairam da movimentação
      let quantidadeSaiuDistribuida = saidaRecalculada;
      const detalhesProdutos = produtos.map((p, idx) => {
        let quantidadeSaiu = 0;
        // Se só tem um produto, recebe tudo
        if (produtos.length === 1) {
          quantidadeSaiu = quantidadeSaiuDistribuida;
        } else {
          // Se vier do frontend, usa, senão distribui proporcionalmente (aqui pode ser ajustado conforme regra)
          quantidadeSaiu = p.quantidadeSaiu || 0;
        }
        return {
          movimentacaoId: movimentacao.id,
          produtoId: p.produtoId,
          quantidadeSaiu,
          quantidadeAbastecida: p.quantidadeAbastecida || 0,
          retiradaProduto: p.retiradaProduto || 0,
        };
      });

      await MovimentacaoProduto.bulkCreate(detalhesProdutos);

      // Descontar do estoque da loja os produtos abastecidos
      for (const produto of produtos) {
        if (produto.quantidadeAbastecida && produto.quantidadeAbastecida > 0) {
          // Só desconta do estoque da loja o que foi abastecido, retiradaProduto não interfere
          console.log(
            "🏪 [registrarMovimentacao] Atualizando estoque da loja:",
            {
              lojaId: maquina.lojaId,
              produtoId: produto.produtoId,
              quantidadeAbastecida: produto.quantidadeAbastecida,
            },
          );

          // Buscar estoque do produto na loja da máquina
          const estoqueLoja = await EstoqueLoja.findOne({
            where: {
              lojaId: maquina.lojaId,
              produtoId: produto.produtoId,
            },
          });

          if (estoqueLoja) {
            const quantidadeAnterior = estoqueLoja.quantidade;
            // Descontar a quantidade abastecida (não permite ficar negativo)
            const novaQuantidade = Math.max(
              0,
              estoqueLoja.quantidade - produto.quantidadeAbastecida,
            );

            console.log(
              "📦 [registrarMovimentacao] Estoque da loja atualizado:",
              {
                produtoId: produto.produtoId,
                quantidadeAnterior,
                quantidadeAbastecida: produto.quantidadeAbastecida,
                novaQuantidade,
              },
            );

            await estoqueLoja.update({ quantidade: novaQuantidade });
          } else {
            console.log(
              "⚠️ [registrarMovimentacao] Estoque da loja não encontrado:",
              {
                lojaId: maquina.lojaId,
                produtoId: produto.produtoId,
              },
            );
          }
        }
        // Se houver retiradaProduto, não altera estoque da loja
      }
    }

    // Se for devolução ao estoque da loja, somar retiradaProduto
    for (const produto of produtos || []) {
      if (
        produto.retiradaProdutoDevolverEstoque &&
        produto.retiradaProduto > 0
      ) {
        const estoqueLoja = await EstoqueLoja.findOne({
          where: {
            lojaId: maquina.lojaId,
            produtoId: produto.produtoId,
          },
        });
        if (estoqueLoja) {
          const quantidadeAnterior = estoqueLoja.quantidade;
          const novaQuantidade = quantidadeAnterior + produto.retiradaProduto;
          await estoqueLoja.update({ quantidade: novaQuantidade });
          console.log(
            "✅ [registrarMovimentacao] Devolução: retirada devolvida ao estoque da loja:",
            {
              produtoId: produto.produtoId,
              quantidadeAnterior,
              devolvida: produto.retiradaProduto,
              novaQuantidade,
            },
          );
        } else {
          console.log(
            "⚠️ [registrarMovimentacao] Estoque da loja não encontrado para devolução:",
            {
              lojaId: maquina.lojaId,
              produtoId: produto.produtoId,
            },
          );
        }
      }
    }

    // Buscar movimentação completa para retornar
    const movimentacaoCompleta = await Movimentacao.findByPk(movimentacao.id, {
      include: [
        {
          model: Maquina,
          as: "maquina",
          attributes: ["id", "codigo", "nome", "lojaId"],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nome", "email"],
        },
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "categoria"],
            },
          ],
        },
      ],
    });

    res.locals.entityId = movimentacao.id;
    res.status(201).json(movimentacaoCompleta);
  } catch (error) {
    console.error("Erro ao registrar movimentação:", error);
    res.status(500).json({ error: "Erro ao registrar movimentação" });
  } finally {
    if (chaveMovimentacaoEmAndamento) {
      movimentacoesEmAndamento.delete(chaveMovimentacaoEmAndamento);
    }
  }
};

// Listar movimentações com filtros
export const listarMovimentacoes = async (req, res) => {
  try {
    const {
      maquinaId,
      lojaId,
      dataInicio,
      dataFim,
      usuarioId,
      limite = 50,
    } = req.query;

    const where = {};

    if (maquinaId) {
      where.maquinaId = maquinaId;
    }

    if (usuarioId) {
      where.usuarioId = usuarioId;
    }

    if (dataInicio || dataFim) {
      where.dataColeta = {};
      if (dataInicio) {
        where.dataColeta[Op.gte] = new Date(dataInicio);
      }
      if (dataFim) {
        where.dataColeta[Op.lte] = new Date(dataFim);
      }
    }

    const include = [
      {
        model: Maquina,
        as: "maquina",
        attributes: ["id", "codigo", "nome", "lojaId"],
      },
      {
        model: Usuario,
        as: "usuario",
        attributes: ["id", "nome"],
      },
      {
        model: MovimentacaoProduto,
        as: "detalhesProdutos",
        include: [
          {
            model: Produto,
            as: "produto",
            attributes: ["id", "nome"],
          },
        ],
      },
    ];

    // Filtrar por loja se especificado
    if (lojaId) {
      include[0].where = { lojaId };
    }

    const movimentacoes = await Movimentacao.findAll({
      where,
      include,
      order: [["dataColeta", "DESC"]],
      limit: parseInt(limite),
    });

    res.json(
      movimentacoes.map((movimentacao) => {
        const json = movimentacao.toJSON();
        return {
          ...json,
          usuarioNome: json.usuario?.nome || json.usuario?.email || null,
          dataMovimentacao: json.dataColeta || json.createdAt || null,
        };
      }),
    );
  } catch (error) {
    console.error("Erro ao listar movimentações:", error);
    res.status(500).json({ error: "Erro ao listar movimentações" });
  }
};

// Obter movimentação por ID
export const obterMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id, {
      include: [
        {
          model: Maquina,
          as: "maquina",
          include: [
            {
              model: Loja,
              as: "loja",
              attributes: ["id", "nome"],
            },
          ],
        },
        {
          model: Usuario,
          as: "usuario",
          attributes: ["id", "nome", "email"],
        },
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

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    const json = movimentacao.toJSON();
    res.json({
      ...json,
      usuarioNome: json.usuario?.nome || json.usuario?.email || null,
      dataMovimentacao: json.dataColeta || json.createdAt || null,
    });
  } catch (error) {
    console.error("Erro ao obter movimentação:", error);
    res.status(500).json({ error: "Erro ao obter movimentação" });
  }
};

// Atualizar movimentação (apenas observações e detalhes menores)
export const atualizarMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id);

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    // Apenas admin ou o próprio usuário que criou pode editar
    if (
      req.usuario.role !== "ADMIN" &&
      movimentacao.usuarioId !== req.usuario.id
    ) {
      return res
        .status(403)
        .json({ error: "Você não pode editar esta movimentação" });
    }

    const {
      dataColeta,
      totalPre,
      totalPos,
      sairam,
      observacoes,
      tipoOcorrencia,
      fichas,
      abastecidas,
      contadorMaquina,
      contadorIn,
      contadorOut,
      retiradaEstoque,
      quantidade_notas_entrada,
      valor_entrada_maquininha_pix,
      produtos,
    } = req.body;

    const toIntOr = (valor, fallback) => {
      if (valor === undefined) return fallback;
      if (valor === null || valor === "") return null;
      const parsed = parseInt(valor, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const toFloatOr = (valor, fallback) => {
      if (valor === undefined) return fallback;
      if (valor === null || valor === "") return null;
      const parsed = parseFloat(valor);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const updateData = {
      dataColeta: dataColeta ? new Date(dataColeta) : movimentacao.dataColeta,
      totalPre: toIntOr(totalPre, movimentacao.totalPre),
      sairam: toIntOr(sairam, movimentacao.sairam),
      abastecidas: toIntOr(abastecidas, movimentacao.abastecidas),
      fichas: toIntOr(fichas, movimentacao.fichas),
      contadorMaquina: toIntOr(contadorMaquina, movimentacao.contadorMaquina),
      contadorIn: toIntOr(contadorIn, movimentacao.contadorIn),
      contadorOut: toIntOr(contadorOut, movimentacao.contadorOut),
      observacoes: observacoes ?? movimentacao.observacoes,
      tipoOcorrencia: tipoOcorrencia ?? movimentacao.tipoOcorrencia,
      retiradaEstoque:
        retiradaEstoque !== undefined
          ? Boolean(retiradaEstoque)
          : movimentacao.retiradaEstoque,
      quantidade_notas_entrada: toIntOr(
        quantidade_notas_entrada,
        movimentacao.quantidade_notas_entrada,
      ),
      valor_entrada_maquininha_pix: toFloatOr(
        valor_entrada_maquininha_pix,
        movimentacao.valor_entrada_maquininha_pix,
      ),
    };

    updateData.totalPos =
      totalPos !== undefined
        ? toIntOr(totalPos, movimentacao.totalPos)
        : Number(updateData.totalPre || 0) +
          Number(updateData.abastecidas || 0) -
          Number(updateData.sairam || 0);

    const maquina = await Maquina.findByPk(movimentacao.maquinaId);
    if (maquina) {
      updateData.valorFaturado =
        Number(updateData.fichas || 0) * parseFloat(maquina.valorFicha || 0) +
        Number(updateData.quantidade_notas_entrada || 0) +
        Number(updateData.valor_entrada_maquininha_pix || 0);
    }

    const transaction = await Movimentacao.sequelize.transaction();

    try {
      // 1. Buscar produtos antigos para reverter estoque
      const produtosAntigos = await MovimentacaoProduto.findAll({
        where: { movimentacaoId: movimentacao.id },
        transaction,
      });

      await movimentacao.update(updateData, { transaction });

      if (Array.isArray(produtos)) {
        // 2. Reverter estoque anterior (devolver o que foi abastecido antes)
        if (maquina) {
          for (const produtoAntigo of produtosAntigos) {
            if (produtoAntigo.quantidadeAbastecida > 0) {
              const estoqueLoja = await EstoqueLoja.findOne({
                where: {
                  lojaId: maquina.lojaId,
                  produtoId: produtoAntigo.produtoId,
                },
                transaction,
              });
              if (estoqueLoja) {
                await estoqueLoja.update(
                  {
                    quantidade:
                      estoqueLoja.quantidade +
                      produtoAntigo.quantidadeAbastecida,
                  },
                  { transaction },
                );
                console.log("↩️ [atualizarMovimentacao] Estoque revertido:", {
                  produtoId: produtoAntigo.produtoId,
                  devolvido: produtoAntigo.quantidadeAbastecida,
                  novaQuantidade:
                    estoqueLoja.quantidade + produtoAntigo.quantidadeAbastecida,
                });
              }
            }
          }
        }

        await MovimentacaoProduto.destroy({
          where: { movimentacaoId: movimentacao.id },
          transaction,
        });

        const detalhesProdutos = produtos
          .filter((p) => p?.produtoId)
          .map((p) => ({
            movimentacaoId: movimentacao.id,
            produtoId: p.produtoId,
            quantidadeSaiu: Number(parseInt(p.quantidadeSaiu, 10) || 0),
            quantidadeAbastecida: Number(
              parseInt(p.quantidadeAbastecida, 10) || 0,
            ),
            retiradaProduto: Number(parseInt(p.retiradaProduto, 10) || 0),
          }));

        if (detalhesProdutos.length > 0) {
          await MovimentacaoProduto.bulkCreate(detalhesProdutos, {
            transaction,
          });

          // 3. Aplicar nova dedução de estoque
          if (maquina) {
            for (const detalhe of detalhesProdutos) {
              if (detalhe.quantidadeAbastecida > 0) {
                const estoqueLoja = await EstoqueLoja.findOne({
                  where: {
                    lojaId: maquina.lojaId,
                    produtoId: detalhe.produtoId,
                  },
                  transaction,
                });
                if (estoqueLoja) {
                  const novaQuantidade = Math.max(
                    0,
                    estoqueLoja.quantidade - detalhe.quantidadeAbastecida,
                  );
                  await estoqueLoja.update(
                    { quantidade: novaQuantidade },
                    { transaction },
                  );
                  console.log("📦 [atualizarMovimentacao] Estoque deduzido:", {
                    produtoId: detalhe.produtoId,
                    deduzido: detalhe.quantidadeAbastecida,
                    novaQuantidade,
                  });
                } else {
                  console.log(
                    "⚠️ [atualizarMovimentacao] Estoque não encontrado para dedução:",
                    {
                      lojaId: maquina.lojaId,
                      produtoId: detalhe.produtoId,
                    },
                  );
                }
              }
            }
          }
        }
      }

      await transaction.commit();
    } catch (erroTransacao) {
      await transaction.rollback();
      throw erroTransacao;
    }

    const movimentacaoAtualizada = await Movimentacao.findByPk(
      movimentacao.id,
      {
        include: [
          {
            model: Maquina,
            as: "maquina",
            attributes: ["id", "codigo", "nome", "lojaId"],
          },
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nome"],
          },
          {
            model: MovimentacaoProduto,
            as: "detalhesProdutos",
            include: [
              {
                model: Produto,
                as: "produto",
                attributes: ["id", "nome", "codigo", "emoji"],
              },
            ],
          },
        ],
      },
    );

    res.json(movimentacaoAtualizada);
  } catch (error) {
    console.error("Erro ao atualizar movimentação:", error);
    res.status(500).json({ error: "Erro ao atualizar movimentação" });
  }
};

// Deletar movimentação (apenas ADMIN)
export const deletarMovimentacao = async (req, res) => {
  try {
    const movimentacao = await Movimentacao.findByPk(req.params.id);

    if (!movimentacao) {
      return res.status(404).json({ error: "Movimentação não encontrada" });
    }

    await movimentacao.destroy();

    res.json({ message: "Movimentação deletada com sucesso" });
  } catch (error) {
    console.error("Erro ao deletar movimentação:", error);
    res.status(500).json({ error: "Erro ao deletar movimentação" });
  }
};

// GET /relatorios/alertas-abastecimento-incompleto?lojaId=...&dataInicio=...&dataFim=...
export const alertasAbastecimentoIncompleto = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim, maquinaId } = req.query;
    const { Movimentacao, Maquina, Usuario, AlertaIgnorado } =
      await import("../models/index.js");

    const usuarioId = req.usuario?.id;

    // Busca movimentações no período, loja e máquina
    const whereMov = {};
    if (dataInicio || dataFim) {
      whereMov.dataColeta = {};
      if (dataInicio) whereMov.dataColeta[Op.gte] = new Date(dataInicio);
      if (dataFim) whereMov.dataColeta[Op.lte] = new Date(dataFim);
    }
    if (maquinaId) {
      whereMov.maquinaId = maquinaId;
    }

    const include = [
      {
        model: Maquina,
        as: "maquina",
        attributes: ["id", "nome", "capacidadePadrao", "lojaId"],
        ...(lojaId ? { where: { lojaId } } : {}),
        include: [
          {
            model: Loja,
            as: "loja",
            attributes: ["nome"],
          },
        ],
      },
      {
        model: Usuario,
        as: "usuario",
        attributes: ["id", "nome"],
      },
    ];

    // Busca movimentações com abastecimento
    const movimentacoes = await Movimentacao.findAll({
      where: whereMov,
      include,
      order: [["dataColeta", "DESC"]],
    });

    // Buscar alertas ignorados globalmente
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    // Gera alertas para abastecimento incompleto
    const alertas = movimentacoes
      .filter((mov) => {
        const alertaId = `abastecimento-${mov.maquina.id}-${mov.id}`;
        // Só alerta se houve abastecimento e o totalDepois é diferente do padrão
        // e se não foi ignorado pelo usuário
        if (
          mov.abastecidas > 0 &&
          mov.totalPre + mov.abastecidas !== mov.maquina.capacidadePadrao &&
          !ignoradosSet.has(alertaId)
        ) {
          return true;
        }
        return false;
      })
      .map((mov) => ({
        id: `abastecimento-${mov.maquina.id}-${mov.id}`,
        tipo: "abastecimento_incompleto",
        maquinaId: mov.maquina.id,
        maquinaNome: mov.maquina.nome,
        lojaNome: mov.maquina.loja?.nome || mov.maquina.lojaNome || null,
        capacidadePadrao: mov.maquina.capacidadePadrao,
        totalAntes: mov.totalPre,
        abastecido: mov.abastecidas,
        totalDepois: mov.totalPre + mov.abastecidas,
        usuario: mov.usuario?.nome,
        dataMovimentacao: mov.dataColeta,
        observacao: mov.observacoes || "Sem observação",
        mensagem: `Abastecimento incompleto: padrão ${
          mov.maquina.capacidadePadrao
        }, tinha ${mov.totalPre}, abasteceu ${mov.abastecidas}, ficou com ${
          mov.totalPre + mov.abastecidas
        }. Motivo: ${mov.observacoes || "Não informado"}`,
      }));

    res.json({ alertas });
  } catch (error) {
    console.error("Erro ao buscar alertas de abastecimento incompleto:", error);
    res
      .status(500)
      .json({ error: "Erro ao buscar alertas de abastecimento incompleto" });
  }
};

// GET /maquinas/:id/problema
export const problemaMaquina = async (req, res) => {
  try {
    const { id } = req.params;
    const maquina = await Maquina.findByPk(id);
    if (!maquina) {
      return res.status(404).json({ error: "Máquina não encontrada" });
    }
    // Busca última movimentação
    const ultimaMov = await Movimentacao.findOne({
      where: { maquinaId: id },
      order: [["dataColeta", "DESC"]],
    });
    const problemas = [];
    // Buscar alerta de inconsistência de IN/OUT (igual rota de alertas)
    const movimentacoes = await Movimentacao.findAll({
      where: { maquinaId: id },
      order: [["dataColeta", "DESC"]],
      limit: 2,
      attributes: [
        "id",
        "contadorIn",
        "contadorOut",
        "fichas",
        "sairam",
        "dataColeta",
      ],
    });
    if (movimentacoes.length === 2) {
      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);
      if (
        (diffOut !== (atual.sairam || 0) || diffIn !== (atual.fichas || 0)) &&
        !(atual.contadorOut === 0 && atual.contadorIn === 0)
      ) {
        problemas.push({
          tipo: "inconsistencia_contador",
          mensagem: `Inconsistência detectada: OUT (${diffOut}) esperado ${
            atual.sairam
          }, IN (${diffIn}) esperado ${atual.fichas}. OUT registrado: ${
            atual.contadorOut || 0
          } | IN registrado: ${atual.contadorIn || 0} | Fichas: ${
            atual.fichas
          }`,
          data: atual.dataColeta,
        });
      }
    }
    // Regra: abastecimento incompleto
    if (
      ultimaMov &&
      typeof ultimaMov.abastecidas === "number" &&
      typeof ultimaMov.totalPre === "number" &&
      ultimaMov.abastecidas > 0 &&
      ultimaMov.totalPre + ultimaMov.abastecidas !== maquina.capacidadePadrao
    ) {
      problemas.push({
        tipo: "abastecimento",
        mensagem: `Abastecimento incompleto: padrão ${
          maquina.capacidadePadrao
        }, tinha ${ultimaMov.totalPre}, abasteceu ${
          ultimaMov.abastecidas
        }, ficou com ${ultimaMov.totalPre + ultimaMov.abastecidas}. Motivo: ${
          ultimaMov.observacoes || "Não informado"
        }`,
        data: ultimaMov.dataColeta,
      });
    }
    res.json({
      maquina: {
        id: maquina.id,
        nome: maquina.nome,
        capacidadePadrao: maquina.capacidadePadrao,
      },
      problemas,
    });
  } catch (error) {
    console.error("Erro ao buscar problema da máquina:", error);
    res.status(500).json({ error: "Erro ao buscar problema da máquina" });
  }
};
