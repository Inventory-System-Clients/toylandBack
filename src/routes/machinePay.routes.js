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

const router = express.Router();

router.use(autenticar, autorizarRole("ADMIN", "MACHINEPAY"));

router.get("/maquinas", listarMaquinasMachinePay);
router.get("/status", consultarStatusMaquinas);
router.get("/descobrir-usr/:posId", descobrirUsrPorPosId);
router.post("/maquinas/:id/mqtt-creditos", enviarCreditosMqtt);
router.get("/maquinas/:id/transacoes-24h", consultarTransacoes24h);
router.post("/pagamentos/:idwebhook/devolver", devolverPagamento);

export default router;
