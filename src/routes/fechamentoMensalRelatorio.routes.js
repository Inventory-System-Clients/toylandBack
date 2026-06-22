import express from "express";
import {
  criarFechamentoMensalRelatorio,
  listarFechamentosMensaisRelatorio,
  obterFechamentoMensalRelatorio,
} from "../controllers/fechamentoMensalRelatorioController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

router.get(
  "/",
  autenticar,
  autorizarRole("ADMIN"),
  listarFechamentosMensaisRelatorio,
);
router.get(
  "/:id",
  autenticar,
  autorizarRole("ADMIN"),
  obterFechamentoMensalRelatorio,
);
router.post(
  "/",
  autenticar,
  autorizarRole("ADMIN"),
  criarFechamentoMensalRelatorio,
);

export default router;
