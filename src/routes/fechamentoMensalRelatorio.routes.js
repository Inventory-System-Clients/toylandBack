import express from "express";
import {
  criarFechamentoMensalRelatorio,
  listarFechamentosMensaisRelatorio,
  obterFechamentoMensalRelatorio,
} from "../controllers/fechamentoMensalRelatorioController.js";
import {
  autenticar,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

router.get(
  "/",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  listarFechamentosMensaisRelatorio,
);
router.get(
  "/:id",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  obterFechamentoMensalRelatorio,
);
router.post(
  "/",
  autenticar,
  autorizarPermissao("relatorios", "ADMIN"),
  criarFechamentoMensalRelatorio,
);

export default router;
