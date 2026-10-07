import express from "express";
import {
  consultarLinkPublico,
  enviarCreditoPublico,
  listarLinks,
  criarLink,
  bloquearLink,
  obterTokenLink,
  obterTokensLote,
  listarEnviosLink,
} from "../controllers/creditoRemotoController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

// Limite simples em memória por chave (IP ou link). Não é a proteção do
// saldo — essa é o UPDATE atômico no controller —, só evita abuso/spam.
const criarLimitador = ({ janelaMs, maximo, chave }) => {
  const acessos = new Map();

  return (req, res, next) => {
    const agora = Date.now();
    const id = chave(req);
    const recentes = (acessos.get(id) || []).filter(
      (momento) => agora - momento < janelaMs,
    );

    if (recentes.length >= maximo) {
      return res
        .status(429)
        .json({ error: "Muitas tentativas. Aguarde um minuto." });
    }

    recentes.push(agora);
    acessos.set(id, recentes);

    if (acessos.size > 5000) {
      for (const [k, v] of acessos) {
        if (!v.some((momento) => agora - momento < janelaMs)) acessos.delete(k);
      }
    }

    next();
  };
};

const porIp = (req) => String(req.headers["x-forwarded-for"] || req.ip);
const porLink = (req) => String(req.headers["x-link-token"] || "");

// Públicas: autenticadas só pelo token do link (header X-Link-Token, pra não
// aparecer em log de URL). Não dão acesso a nenhuma outra rota do sistema.
router.get(
  "/publico",
  criarLimitador({ janelaMs: 60_000, maximo: 60, chave: porIp }),
  consultarLinkPublico,
);
router.post(
  "/publico/enviar",
  criarLimitador({ janelaMs: 60_000, maximo: 15, chave: porIp }),
  criarLimitador({ janelaMs: 60_000, maximo: 10, chave: porLink }),
  enviarCreditoPublico,
);

// Admin
router.get("/links", autenticar, autorizarRole("ADMIN"), listarLinks);
router.post("/links", autenticar, autorizarRole("ADMIN"), criarLink);
router.post(
  "/links/:id/bloquear",
  autenticar,
  autorizarRole("ADMIN"),
  bloquearLink,
);
router.get(
  "/links/:id/token",
  autenticar,
  autorizarRole("ADMIN"),
  obterTokenLink,
);
router.get(
  "/lotes/:loteId/tokens",
  autenticar,
  autorizarRole("ADMIN"),
  obterTokensLote,
);
router.get(
  "/links/:id/envios",
  autenticar,
  autorizarRole("ADMIN"),
  listarEnviosLink,
);

export default router;
