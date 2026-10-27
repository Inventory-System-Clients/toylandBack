import express from "express";
import {
  balançoSemanal,
  alertasEstoque,
  performanceMaquinas,
  relatorioImpressao,
  relatorioTodasLojas,
  buscarAlertasDeInconsistencia,
  ignorarAlertaMovimentacao,
  dashboardRelatorio,
  alertasMovimentacaoOut,
  alertasMovimentacaoIn,
  alertasBomDesempenho,
  alertasPeluciaGigante,
  machinePayTotalMes,
} from "../controllers/relatorioController.js";
import { alertasAbastecimentoIncompleto } from "../controllers/movimentacaoController.js";
import {
  autenticar,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

// Novas rotas para alertas OUT e IN
router.get(
  "/alertas-movimentacao-out",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasMovimentacaoOut,
);
router.get(
  "/alertas-movimentacao-in",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasMovimentacaoIn,
);

// Todas as rotas de relatórios são restritas a ADMIN
router.get(
  "/balanco-semanal",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  balançoSemanal,
);
router.get(
  "/alertas-movimentacao-inconsistente",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  buscarAlertasDeInconsistencia,
);
router.delete(
  "/alertas-movimentacao-inconsistente/:id",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  ignorarAlertaMovimentacao,
);
router.get(
  "/alertas-estoque",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasEstoque,
);
router.get(
  "/alertas-bom-desempenho",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasBomDesempenho,
);
router.delete(
  "/alertas-bom-desempenho/:id",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  ignorarAlertaMovimentacao,
);
router.get(
  "/alertas-pelucia-gigante",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasPeluciaGigante,
);
router.get(
  "/machine-pay-mes",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  machinePayTotalMes,
);
router.get(
  "/performance-maquinas",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  performanceMaquinas,
);
router.get(
  "/impressao",
  autenticar,
  autorizarPermissao(["relatorios", "graficos"], "ADMIN"),
  relatorioImpressao,
);
router.get(
  "/todas-lojas",
  autenticar,
  autorizarPermissao(["relatorios", "graficos"], "ADMIN"),
  relatorioTodasLojas,
);
router.get(
  "/dashboard",
  autenticar,
  autorizarPermissao(["relatorios", "graficos"], "ADMIN"),
  dashboardRelatorio,
);
router.get(
  "/alertas-abastecimento-incompleto",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  alertasAbastecimentoIncompleto,
);
router.delete(
  "/alertas-abastecimento-incompleto/:id",
  autenticar,
  autorizarPermissao(["relatorios", "alertas"], "ADMIN"),
  ignorarAlertaMovimentacao,
);

export default router;
