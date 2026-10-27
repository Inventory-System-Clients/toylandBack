import express from "express";
import {
  criarCompraFornecedor,
  listarComprasFornecedores,
} from "../controllers/compraFornecedorController.js";
import {
  autenticar,
  registrarLog,
  autorizarPermissao,
} from "../middlewares/auth.js";

const router = express.Router();
router.get("/", autenticar, autorizarPermissao(["fornecedores", "estoque"], "ADMIN"), listarComprasFornecedores);
router.post(
  "/",
  autenticar,
  autorizarPermissao(["fornecedores", "estoque"], "ADMIN"),
  registrarLog("REGISTRAR_COMPRA_FORNECEDOR", "CompraFornecedor"),
  criarCompraFornecedor,
);
export default router;
