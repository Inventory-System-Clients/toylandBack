import express from "express";
import {
  criarGastoVariavel,
  listarGastosVariaveis,
} from "../controllers/gastoVariavelController.js";
import {
  autenticar,
  autorizarRole,
  verificarPermissaoLoja,
} from "../middlewares/auth.js";

const router = express.Router();

router.post(
  "/",
  autenticar,
  autorizarRole("ADMIN", "FUNCIONARIO"),
  verificarPermissaoLoja(),
  criarGastoVariavel,
);
router.get("/", autenticar, autorizarRole("ADMIN"), listarGastosVariaveis);

export default router;
