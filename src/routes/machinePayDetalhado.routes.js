// Página "Machine Pay detalhado": monitoramento dos leitores, mapa, horários de
// pico e ranking. Separada da página Machine Pay original (/machine-pay), com
// tabelas próprias (machine_pay_*), para não afetar o que já funciona.
import express from "express";
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
import {
  filtrosAnalise,
  horariosDePico,
  rankingMaquinas,
} from "../controllers/machinePayAnaliseController.js";
import { autenticar, autorizarRole, registrarLog } from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "MACHINEPAY"));

router.get("/monitor/resumo", obterResumo);
router.get("/monitor/maquinas", listarMaquinasMonitor);
router.get("/monitor/maquinas/:posId", detalharMaquinaMonitor);
router.get("/monitor/ranking-quedas", rankingQuedas);
router.get("/monitor/serie-diaria", serieDiaria);
router.get("/monitor/eventos", listarEventos);
router.post("/monitor/coletar", coletarAgora);
router.get("/monitor/mapa", mapaMaquinasMonitor);

// Abas "Horários de pico" e "Ranking das máquinas"
router.get("/monitor/analise/filtros", filtrosAnalise);
router.get("/monitor/analise/picos", horariosDePico);
router.get("/monitor/analise/ranking", rankingMaquinas);

// Ações abertas pelo nome da máquina
router.get("/monitor/maquinas/:posId/vendas", listarVendasMaquinaMonitor);
router.post(
  "/monitor/maquinas/:posId/credito",
  registrarLog("CREDITO_REMOTO_MACHINE_PAY", "MachinePay"),
  enviarCreditoMaquinaMonitor,
);
router.post(
  "/monitor/maquinas/:posId/devolucao",
  registrarLog("DEVOLUCAO_PAGAMENTO_MACHINE_PAY", "MachinePay"),
  devolverPagamentoMonitor,
);

// Configuração do ponto: só ADMIN
router.put(
  "/monitor/maquinas/:posId/horario",
  autorizarRole("ADMIN"),
  registrarLog("HORARIO_FUNCIONAMENTO_MACHINE_PAY", "MachinePay"),
  salvarHorarioMonitor,
);
router.put(
  "/monitor/maquinas/:posId/regiao",
  autorizarRole("ADMIN"),
  registrarLog("REGIAO_MACHINE_PAY", "MachinePay"),
  salvarRegiaoMonitor,
);
router.put(
  "/monitor/maquinas/:posId/localizacao",
  autorizarRole("ADMIN"),
  registrarLog("LOCALIZACAO_MACHINE_PAY", "MachinePay"),
  salvarLocalizacaoMonitor,
);

export default router;
