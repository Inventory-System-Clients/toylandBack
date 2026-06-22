import express from "express";
import {
  criarManutencao,
  listarFuncionariosManutencao,
  listarManutencoes,
  resolverManutencao,
} from "../controllers/manutencaoController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.use(autenticar);

router.get("/", listarManutencoes);
router.get(
  "/funcionarios",
  autorizarRole("ADMIN"),
  listarFuncionariosManutencao,
);
router.post(
  "/",
  autorizarRole("ADMIN"),
  registrarLog("CRIAR_MANUTENCAO", "Manutencao"),
  criarManutencao,
);
router.patch(
  "/:id/resolver",
  registrarLog("RESOLVER_MANUTENCAO", "Manutencao"),
  resolverManutencao,
);

export default router;
