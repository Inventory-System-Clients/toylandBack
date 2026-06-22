import express from "express";
import listaComprasPendenteController from "../controllers/listaComprasPendenteController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listaComprasPendenteController.listar);
router.post("/", autenticar, listaComprasPendenteController.criar);
router.delete("/:id", autenticar, listaComprasPendenteController.excluir);
router.delete(
  "/:id/produto/:produtoId",
  autenticar,
  listaComprasPendenteController.removerProduto,
);

export default router;
