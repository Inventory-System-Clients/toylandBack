import express from "express";
import registroDinheiroController from "../controllers/registroDinheiroController.js";
import { autenticar } from "../middlewares/auth.js";
const router = express.Router();

router.get(
  "/machine-pay",
  autenticar,
  registroDinheiroController.consultarMachinePay,
);

// POST /registro-dinheiro
router.post("/", registroDinheiroController.criar);

// GET /registro-dinheiro
router.get("/", registroDinheiroController.listar);

export default router;
