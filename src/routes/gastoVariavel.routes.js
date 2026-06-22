import express from "express";
import {
  criarGastoVariavel,
  listarGastosVariaveis,
} from "../controllers/gastoVariavelController.js";

const router = express.Router();

router.post("/gastos-variaveis", criarGastoVariavel);
router.get("/gastos-variaveis", listarGastosVariaveis);

export default router;
