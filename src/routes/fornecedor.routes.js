import express from "express";
import {
  atualizarFornecedor,
  criarFornecedor,
  deletarFornecedor,
  listarFornecedores,
  obterFornecedor,
} from "../controllers/fornecedorController.js";
import {
  autenticar,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, autorizarPermissao(["fornecedores", "estoque"], "ADMIN"), listarFornecedores);
router.get("/:id", autenticar, autorizarPermissao(["fornecedores", "estoque"], "ADMIN"), obterFornecedor);
router.post(
  "/",
  autenticar,
  autorizarPermissao("fornecedores", "ADMIN"),
  registrarLog("CRIAR_FORNECEDOR", "Fornecedor"),
  criarFornecedor,
);
router.put(
  "/:id",
  autenticar,
  autorizarPermissao("fornecedores", "ADMIN"),
  registrarLog("EDITAR_FORNECEDOR", "Fornecedor"),
  atualizarFornecedor,
);
router.delete(
  "/:id",
  autenticar,
  autorizarPermissao("fornecedores", "ADMIN"),
  registrarLog("DELETAR_FORNECEDOR", "Fornecedor"),
  deletarFornecedor,
);

export default router;
