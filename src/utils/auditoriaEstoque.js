import { LogAtividade } from "../models/index.js";

export const registrarAuditoriaEstoque = async ({
  req,
  lojaId,
  produtoId,
  acao = "EDICAO_MANUAL_ESTOQUE",
  quantidadeAnterior,
  quantidadeNova,
  estoqueMinimoAnterior,
  estoqueMinimoNovo,
  observacao = "Ajuste manual no estoque",
  entidadeId = null,
}) => {
  const anterior = Number(quantidadeAnterior || 0);
  const nova = Number(quantidadeNova || 0);
  const diferenca = nova - anterior;

  if (
    anterior === nova &&
    estoqueMinimoAnterior === estoqueMinimoNovo &&
    acao === "EDICAO_MANUAL_ESTOQUE"
  ) {
    return;
  }

  await LogAtividade.create({
    usuarioId: req.usuario?.id,
    acao,
    entidade: "EstoqueLoja",
    entidadeId,
    detalhes: {
      lojaId,
      produtoId,
      quantidadeAnterior: anterior,
      quantidadeNova: nova,
      diferenca,
      estoqueMinimoAnterior,
      estoqueMinimoNovo,
      observacao,
    },
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.get("user-agent"),
  });
};
