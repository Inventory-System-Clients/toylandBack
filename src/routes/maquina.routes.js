import express from "express";
import {
  listarMaquinas,
  obterMaquina,
  criarMaquina,
  atualizarMaquina,
  deletarMaquina,
  obterEstoqueAtual,
} from "../controllers/maquinaController.js";
import { produtoSugeridoPorMaquina } from "../controllers/produtoSugeridoController.js";
import {
  autenticar,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";
import { problemaMaquina } from "../controllers/movimentacaoController.js";

const router = express.Router();

router.get("/", autenticar, listarMaquinas);
router.get("/:id", autenticar, obterMaquina);
router.get("/:id/estoque", autenticar, obterEstoqueAtual);
router.get("/:id/produto-sugerido", autenticar, produtoSugeridoPorMaquina);
router.get("/:id/problema", autenticar, problemaMaquina);
router.post(
  "/",
  autenticar,
  autorizarPermissao("maquinas.gerenciar", "ADMIN"),
  registrarLog("CRIAR_MAQUINA", "Maquina"),
  criarMaquina,
);
router.put(
  "/:id",
  autenticar,
  autorizarPermissao("maquinas.gerenciar", "ADMIN"),
  registrarLog("EDITAR_MAQUINA", "Maquina"),
  atualizarMaquina,
);
router.delete(
  "/:id",
  autenticar,
  autorizarPermissao("maquinas.gerenciar", "ADMIN"),
  registrarLog("DELETAR_MAQUINA", "Maquina"),
  deletarMaquina,
);

export default router;
