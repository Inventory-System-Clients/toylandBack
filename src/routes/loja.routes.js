import express from "express";
import {
  listarLojas,
  obterLoja,
  criarLoja,
  atualizarLoja,
  deletarLoja,
} from "../controllers/lojaController.js";
import {
  autenticar,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listarLojas);
router.get("/:id", autenticar, obterLoja);
router.post(
  "/",
  autenticar,
  autorizarPermissao("lojas.gerenciar", "ADMIN"),
  registrarLog("CRIAR_LOJA", "Loja"),
  criarLoja
);
router.put(
  "/:id",
  autenticar,
  autorizarPermissao("lojas.gerenciar", "ADMIN"),
  registrarLog("EDITAR_LOJA", "Loja"),
  atualizarLoja
);
router.delete(
  "/:id",
  autenticar,
  autorizarPermissao("lojas.gerenciar", "ADMIN"),
  registrarLog("DELETAR_LOJA", "Loja"),
  deletarLoja
);

export default router;
