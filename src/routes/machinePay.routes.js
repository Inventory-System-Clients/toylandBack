import express from "express";
import {
  consultarStatusMaquinas,
  consultarTransacoes24h,
  descobrirUsrPorPosId,
  devolverPagamento,
  enviarCreditosMqtt,
  listarMaquinasMachinePay,
} from "../controllers/machinePayController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
import {
  obterResumo,
  listarMaquinasMonitor,
  rankingQuedas,
  serieDiaria,
  detalharMaquinaMonitor,
  listarEventos,
  coletarAgora,
  listarVendasMaquinaMonitor,
  enviarCreditoMaquinaMonitor,
  devolverPagamentoMonitor,
  salvarHorarioMonitor,
  salvarRegiaoMonitor,
  mapaMaquinasMonitor,
  salvarLocalizacaoMonitor,
} from "../controllers/machinePayMonitorController.js";
import { filtrosAnalise, horariosDePico, rankingMaquinas } from "../controllers/machinePayAnaliseController.js";

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "MACHINEPAY"));

// Monitoramento completo do painel (histórico coletado periodicamente).
router.get("/monitor/resumo", obterResumo);
router.get("/monitor/maquinas", listarMaquinasMonitor);
router.get("/monitor/maquinas/:posId", detalharMaquinaMonitor);
router.get("/monitor/ranking-quedas", rankingQuedas);
router.get("/monitor/serie-diaria", serieDiaria);
router.get("/monitor/eventos", listarEventos);
router.post("/monitor/coletar", autorizarRole("ADMIN"), coletarAgora);
router.get("/monitor/mapa", mapaMaquinasMonitor);
router.get("/monitor/analise/filtros", filtrosAnalise);
router.get("/monitor/analise/picos", horariosDePico);
router.get("/monitor/analise/ranking", rankingMaquinas);
router.get("/monitor/maquinas/:posId/vendas", listarVendasMaquinaMonitor);
router.post("/monitor/maquinas/:posId/credito", autorizarRole("ADMIN"), enviarCreditoMaquinaMonitor);
router.post("/monitor/maquinas/:posId/devolucao", autorizarRole("ADMIN"), devolverPagamentoMonitor);
router.put("/monitor/maquinas/:posId/horario", autorizarRole("ADMIN"), salvarHorarioMonitor);
router.put("/monitor/maquinas/:posId/regiao", autorizarRole("ADMIN"), salvarRegiaoMonitor);
router.put("/monitor/maquinas/:posId/localizacao", autorizarRole("ADMIN"), salvarLocalizacaoMonitor);

router.get("/maquinas", listarMaquinasMachinePay);
router.get("/status", consultarStatusMaquinas);
router.get("/descobrir-usr/:posId", descobrirUsrPorPosId);
router.post("/maquinas/:id/mqtt-creditos", enviarCreditosMqtt);
router.get("/maquinas/:id/transacoes-24h", consultarTransacoes24h);
router.post("/pagamentos/:idwebhook/devolver", devolverPagamento);

export default router;
