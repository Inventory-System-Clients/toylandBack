import express from "express";
import registroDinheiroController from "../controllers/registroDinheiroController.js";
import { autenticar } from "../middlewares/auth.js";
const router = express.Router();

router.get(
  "/machine-pay",
  autenticar,
  registroDinheiroController.consultarMachinePay,
);
router.get(
  "/proximo-periodo",
  autenticar,
  registroDinheiroController.obterProximoPeriodo,
);

// POST /registro-dinheiro
router.post("/", autenticar, registroDinheiroController.criar);

// GET /registro-dinheiro
router.get("/", autenticar, registroDinheiroController.listar);

export default router;
