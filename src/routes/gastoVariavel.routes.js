import express from "express";
import {
  criarGastoVariavel,
  listarGastosVariaveis,
} from "../controllers/gastoVariavelController.js";
import { autenticar, autorizarRole } from "../middlewares/auth.js";

const router = express.Router();

router.post("/", autenticar, autorizarRole("ADMIN"), criarGastoVariavel);
router.get("/", autenticar, autorizarRole("ADMIN"), listarGastosVariaveis);

export default router;
