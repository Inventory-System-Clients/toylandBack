import express from "express";
import graficosRoutes from "./graficos.routes.js";
import authRoutes from "./auth.routes.js";
import usuarioRoutes from "./usuario.routes.js";
import lojaRoutes from "./loja.routes.js";
import maquinaRoutes from "./maquina.routes.js";
import produtoRoutes from "./produto.routes.js";
import movimentacaoRoutes from "./movimentacao.routes.js";
import relatorioRoutes from "./relatorio.routes.js";
import totaisRoutes from "./totais.routes.js";
import adminRoutes from "./admin.routes.js";
import estoqueLojaRoutes from "./estoqueLoja.routes.js";
import movimentacaoEstoqueLojaRoutes from "./movimentacaoEstoqueLoja.routes.js";
import veiculoRoutes from "./veiculo.routes.js";
import alertasVeiculosRoutes from "./alertasVeiculos.routes.js";
import movimentacaoVeiculoRoutes from "./movimentacaoVeiculo.routes.js";
import registroDinheiroRoutes from "./registroDinheiro.routes.js";
import gastoVariavelRoutes from "./gastoVariavel.routes.js";
import tipoGastoVariavelRoutes from "./tipoGastoVariavel.routes.js";
import gastoFixoLojaRoutes from "./gastoFixoLoja.routes.js";
import manutencaoRoutes from "./manutencao.routes.js";
import fechamentoMensalRelatorioRoutes from "./fechamentoMensalRelatorio.routes.js";
import sangriaRoutes from "./sangria.routes.js";
import listaComprasPendenteRoutes from "./listaComprasPendente.routes.js";
import logAtividadeRoutes from "./logAtividade.routes.js";
import assistenteIaRoutes from "./assistenteIa.routes.js";
import fornecedorRoutes from "./fornecedor.routes.js";
import compraFornecedorRoutes from "./compraFornecedor.routes.js";
import machinePayRoutes from "./machinePay.routes.js";
const router = express.Router();

router.use("/auth", authRoutes);
router.use("/usuarios", usuarioRoutes);
router.use("/lojas", lojaRoutes);
router.use("/maquinas", maquinaRoutes);
router.use("/produtos", produtoRoutes);
router.use("/movimentacoes", movimentacaoRoutes);
router.use("/relatorios", relatorioRoutes);
router.use("/totais", totaisRoutes);
router.use("/admin", adminRoutes);
router.use("/estoque-lojas", estoqueLojaRoutes);
router.use("/movimentacao-estoque-loja", movimentacaoEstoqueLojaRoutes);
router.use("/logs-atividade", logAtividadeRoutes);
router.use("/assistente-ia", assistenteIaRoutes);
router.use("/fornecedores", fornecedorRoutes);
router.use("/compras-fornecedores", compraFornecedorRoutes);
router.use("/machine-pay", machinePayRoutes);

router.use("/veiculos", veiculoRoutes);
router.use("/alertas-veiculos", alertasVeiculosRoutes);

router.use("/movimentacao-veiculos", movimentacaoVeiculoRoutes);

router.use("/registro-dinheiro", registroDinheiroRoutes);
router.use("/graficos", graficosRoutes);
router.use("/gastos-variaveis", gastoVariavelRoutes);
router.use("/tipos-gastos-variaveis", tipoGastoVariavelRoutes);
router.use("/graficos", graficosRoutes);

router.use("/gastos-fixos-loja", gastoFixoLojaRoutes);
router.use("/manutencoes", manutencaoRoutes);
router.use("/fechamentos-mensais-relatorio", fechamentoMensalRelatorioRoutes);
router.use("/sangrias", sangriaRoutes);
router.use("/lista-compras-pendentes", listaComprasPendenteRoutes);

export default router;
