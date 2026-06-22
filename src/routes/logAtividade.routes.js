import express from "express";
import { listarLogsAtividade } from "../controllers/logAtividadeController.js";
import { autenticar } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listarLogsAtividade);

export default router;
