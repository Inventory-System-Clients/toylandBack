import { Op } from "sequelize";
import { Fornecedor } from "../models/index.js";

const camposTexto = [
  "razaoSocial",
  "nomeFantasia",
  "documento",
  "inscricaoEstadual",
  "inscricaoMunicipal",
  "consultorNome",
  "emailPrincipal",
  "emailFinanceiro",
  "telefoneComercial",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "estado",
  "banco",
  "agencia",
  "conta",
  "titularidade",
  "chavePix",
  "condicoesPagamento",
];

const normalizarDados = (body) => {
  const dados = {};
  camposTexto.forEach((campo) => {
    if (body[campo] !== undefined) {
      const valor = String(body[campo] ?? "").trim();
      dados[campo] = valor || null;
    }
  });
  if (body.estado !== undefined) {
    dados.estado = String(body.estado || "").trim().toUpperCase() || null;
  }
  if (body.ativo !== undefined) dados.ativo = Boolean(body.ativo);
  return dados;
};

const documentoDuplicado = async (documento, ignorarId = null) => {
  if (!documento) return false;
  const where = { documento };
  if (ignorarId) where.id = { [Op.ne]: ignorarId };
  return Boolean(await Fornecedor.findOne({ where }));
};

export const listarFornecedores = async (req, res) => {
  try {
    const where = {};
    if (req.query.incluirInativos !== "true") where.ativo = true;
    const fornecedores = await Fornecedor.findAll({
      where,
      order: [["razaoSocial", "ASC"]],
    });
    res.json(fornecedores);
  } catch (error) {
    console.error("Erro ao listar fornecedores:", error);
    res.status(500).json({ error: "Erro ao listar fornecedores" });
  }
};

export const obterFornecedor = async (req, res) => {
  try {
    const fornecedor = await Fornecedor.findByPk(req.params.id);
    if (!fornecedor) {
      return res.status(404).json({ error: "Fornecedor não encontrado" });
    }
    res.json(fornecedor);
  } catch (error) {
    console.error("Erro ao obter fornecedor:", error);
    res.status(500).json({ error: "Erro ao obter fornecedor" });
  }
};

export const criarFornecedor = async (req, res) => {
  try {
    const dados = normalizarDados(req.body);
    if (!dados.razaoSocial) {
      return res.status(400).json({ error: "Razão Social é obrigatória" });
    }
    if (await documentoDuplicado(dados.documento)) {
      return res.status(400).json({ error: "CNPJ ou CPF já cadastrado" });
    }
    const fornecedor = await Fornecedor.create(dados);
    res.locals.entityId = fornecedor.id;
    res.status(201).json(fornecedor);
  } catch (error) {
    console.error("Erro ao criar fornecedor:", error);
    res.status(500).json({ error: "Erro ao criar fornecedor" });
  }
};

export const atualizarFornecedor = async (req, res) => {
  try {
    const fornecedor = await Fornecedor.findByPk(req.params.id);
    if (!fornecedor) {
      return res.status(404).json({ error: "Fornecedor não encontrado" });
    }
    const dados = normalizarDados(req.body);
    if (dados.razaoSocial === null) {
      return res.status(400).json({ error: "Razão Social é obrigatória" });
    }
    if (
      dados.documento &&
      (await documentoDuplicado(dados.documento, fornecedor.id))
    ) {
      return res.status(400).json({ error: "CNPJ ou CPF já cadastrado" });
    }
    await fornecedor.update(dados);
    res.json(fornecedor);
  } catch (error) {
    console.error("Erro ao atualizar fornecedor:", error);
    res.status(500).json({ error: "Erro ao atualizar fornecedor" });
  }
};

export const deletarFornecedor = async (req, res) => {
  try {
    const fornecedor = await Fornecedor.findByPk(req.params.id);
    if (!fornecedor) {
      return res.status(404).json({ error: "Fornecedor não encontrado" });
    }
    if (!fornecedor.ativo) {
      await fornecedor.destroy();
      return res.json({
        message: "Fornecedor excluído permanentemente",
        permanentDelete: true,
      });
    }
    await fornecedor.update({ ativo: false });
    res.json({
      message: "Fornecedor desativado",
      permanentDelete: false,
    });
  } catch (error) {
    console.error("Erro ao excluir fornecedor:", error);
    res.status(500).json({ error: "Erro ao excluir fornecedor" });
  }
};
