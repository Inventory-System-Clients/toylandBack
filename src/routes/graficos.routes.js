import express from "express";
import { getDashboardGraficos } from "../controllers/graficosController.js";
import {
  autenticar,
  autorizarPermissao,
} from "../middlewares/auth.js";
import { rankingLucroBrutoLojas } from "../controllers/relatorioController.js";
const router = express.Router();

// Rota exclusiva para gráficos do dashboard
router.get("/dashboard", autenticar, autorizarPermissao("graficos", "ADMIN"), getDashboardGraficos);

// Nova rota para ranking de lucro bruto das lojas
router.get(
  "/ranking-lucro-bruto-lojas",
  autenticar,
  autorizarPermissao("graficos", "ADMIN"),
  rankingLucroBrutoLojas,
);

export default router;
