import express from "express";
import {
  consultarStatusMaquinas,
  consultarTransacoes24h,
  descobrirUsrPorPosId,
  devolverPagamento,
  enviarCreditosMqtt,
  listarLeitoresDaConta,
  listarMaquinasMachinePay,
} from "../controllers/machinePayController.js";
import {
  autenticar,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

// Usadas pelo cadastro da máquina (POS ID e Usr ID): também para quem gerencia máquinas
const cadastroMaquina = [
  autenticar,
  autorizarPermissao(["machinePay", "maquinas.gerenciar"], "ADMIN", "MACHINEPAY"),
];
router.get("/descobrir-usr/:posId", ...cadastroMaquina, descobrirUsrPorPosId);
router.get("/leitores/:usrId", ...cadastroMaquina, listarLeitoresDaConta);

router.use(autenticar, autorizarPermissao("machinePay", "ADMIN", "MACHINEPAY"));

router.get("/maquinas", listarMaquinasMachinePay);
router.get("/status", consultarStatusMaquinas);
router.post("/maquinas/:id/mqtt-creditos", enviarCreditosMqtt);
router.get("/maquinas/:id/transacoes-24h", consultarTransacoes24h);
router.post("/pagamentos/:idwebhook/devolver", devolverPagamento);

export default router;
