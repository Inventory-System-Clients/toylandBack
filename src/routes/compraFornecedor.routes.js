import express from "express";
import {
  criarCompraFornecedor,
  listarComprasFornecedores,
} from "../controllers/compraFornecedorController.js";
import {
  autenticar,
  autorizarRole,
  registrarLog,
} from "../middlewares/auth.js";

const router = express.Router();
router.get("/", autenticar, autorizarRole("ADMIN"), listarComprasFornecedores);
router.post(
  "/",
  autenticar,
  autorizarRole("ADMIN"),
  registrarLog("REGISTRAR_COMPRA_FORNECEDOR", "CompraFornecedor"),
  criarCompraFornecedor,
);
export default router;
