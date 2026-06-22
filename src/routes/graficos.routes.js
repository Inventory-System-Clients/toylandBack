import express from "express";
import { getDashboardGraficos } from "../controllers/graficosController.js";
import { autenticar, requireAdmin } from "../middlewares/auth.js";
import { rankingLucroBrutoLojas } from "../controllers/relatorioController.js";
const router = express.Router();

// Rota exclusiva para gráficos do dashboard
router.get("/dashboard", autenticar, requireAdmin, getDashboardGraficos);

// Nova rota para ranking de lucro bruto das lojas
router.get(
  "/ranking-lucro-bruto-lojas",
  autenticar,
  requireAdmin,
  rankingLucroBrutoLojas,
);

export default router;
