import express from "express";
import {
  criarManutencao,
  listarFuncionariosManutencao,
  listarManutencoes,
  resolverManutencao,
} from "../controllers/manutencaoController.js";
import {
  autenticar,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar);

router.get("/", listarManutencoes);
router.get(
  "/funcionarios",
  autorizarPermissao("manutencao.gerenciar", "ADMIN"),
  listarFuncionariosManutencao,
);
router.post(
  "/",
  autorizarPermissao("manutencao.gerenciar", "ADMIN"),
  registrarLog("CRIAR_MANUTENCAO", "Manutencao"),
  criarManutencao,
);
router.patch(
  "/:id/resolver",
  registrarLog("RESOLVER_MANUTENCAO", "Manutencao"),
  resolverManutencao,
);

export default router;
