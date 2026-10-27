import express from "express";
import {
  listarUsuarios,
  obterUsuario,
  criarUsuario,
  atualizarUsuario,
  deletarUsuario,
  reativarUsuario,
} from "../controllers/usuarioController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar);

// A lista também alimenta os filtros de Relatórios e Manutenção
router.get(
  "/",
  autorizarPermissao(["relatorios", "manutencao.gerenciar"], "ADMIN"),
  listarUsuarios,
);

// Demais rotas: só ADMIN
router.use(autorizarRole("ADMIN"));
router.get("/:id", obterUsuario);
router.post("/", registrarLog("CRIAR_USUARIO", "Usuario"), criarUsuario);
router.put("/:id", registrarLog("EDITAR_USUARIO", "Usuario"), atualizarUsuario);
router.delete(
  "/:id",
  registrarLog("DELETAR_USUARIO", "Usuario"),
  deletarUsuario
);
router.patch(
  "/:id/reativar",
  registrarLog("REATIVAR_USUARIO", "Usuario"),
  reativarUsuario
);

export default router;
