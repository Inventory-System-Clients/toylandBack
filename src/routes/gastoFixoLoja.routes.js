import express from "express";
import controller from "../controllers/gastoFixoLojaController.js";

const router = express.Router();

// Buscar gastos fixos de uma loja
router.get("/:lojaId", controller.getGastosFixos);

// Salvar (criar/atualizar) gastos fixos de uma loja
router.post("/:lojaId", controller.saveGastosFixos);

export default router;
