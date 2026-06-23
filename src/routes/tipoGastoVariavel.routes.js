import express from "express";
import {
  atualizarTipoGastoVariavel,
  criarTipoGastoVariavel,
  listarTiposGastosVariaveis,
  removerTipoGastoVariavel,
} from "../controllers/tipoGastoVariavelController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

router.get("/", autenticar, listarTiposGastosVariaveis);
router.post("/", autenticar, autorizarRole("ADMIN"), criarTipoGastoVariavel);
router.put("/:id", autenticar, autorizarRole("ADMIN"), atualizarTipoGastoVariavel);
router.delete("/:id", autenticar, autorizarRole("ADMIN"), removerTipoGastoVariavel);

export default router;
