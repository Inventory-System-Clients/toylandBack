import express from "express";
import {
  listarMovimentacoesEstoqueLoja,
  criarMovimentacaoEstoqueLoja,
  transferirDaGaragem,
  editarMovimentacaoEstoqueLoja,
  deletarMovimentacaoEstoqueLoja,
} from "../controllers/movimentacaoEstoqueLojaController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listarMovimentacoesEstoqueLoja);
router.post("/transferir-da-garagem", autenticar, transferirDaGaragem);
router.post("/", autenticar, criarMovimentacaoEstoqueLoja);
router.put("/:id", autenticar, editarMovimentacaoEstoqueLoja);
router.delete("/:id", autenticar, deletarMovimentacaoEstoqueLoja);

export default router;
