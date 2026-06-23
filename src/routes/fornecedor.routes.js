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
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, autorizarRole("ADMIN"), listarFornecedores);
router.get("/:id", autenticar, autorizarRole("ADMIN"), obterFornecedor);
router.post(
  "/",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("CRIAR_FORNECEDOR", "Fornecedor"),
  criarFornecedor,
);
router.put(
  "/:id",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("EDITAR_FORNECEDOR", "Fornecedor"),
  atualizarFornecedor,
);
router.delete(
  "/:id",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("DELETAR_FORNECEDOR", "Fornecedor"),
  deletarFornecedor,
);

export default router;
