import express from "express";
import { autenticar, autorizarRole } from "../middlewares/auth.js";
import {
  limparDadosAntigos,
  verificarDadosParaLimpeza,
} from "../utils/dataRetention.js";

const router = express.Router();
const dataRetentionEnabled = process.env.DATA_RETENTION_ENABLED === "true";

// Verificar quantos dados podem ser excluídos (dry run)
router.get(
  "/verificar-limpeza",
  autenticar,
  autorizarRole("ADMIN"),
  async (req, res) => {
    if (!dataRetentionEnabled) {
      return res.status(503).json({
        error: "Limpeza de dados antigos está desativada no momento",
      });
    }

    try {
      const resultado = await verificarDadosParaLimpeza();
      res.json(resultado);
    } catch (error) {
      console.error("Erro ao verificar limpeza:", error);
      res.status(500).json({ error: "Erro ao verificar dados para limpeza" });
    }
  },
);

// Executar limpeza de dados antigos
router.post(
  "/limpar-dados-antigos",
  autenticar,
  autorizarRole("ADMIN"),
  async (req, res) => {
    if (!dataRetentionEnabled) {
      return res.status(503).json({
        error: "Limpeza de dados antigos está desativada no momento",
      });
    }

    try {
      const resultado = await limparDadosAntigos();
      res.json(resultado);
    } catch (error) {
      console.error("Erro ao limpar dados:", error);
      res.status(500).json({ error: "Erro ao executar limpeza de dados" });
    }
  },
);

export default router;
