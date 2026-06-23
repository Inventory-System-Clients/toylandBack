"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("fornecedores", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      razaoSocial: { type: Sequelize.STRING(180), allowNull: false },
      nomeFantasia: Sequelize.STRING(180),
      documento: { type: Sequelize.STRING(20), unique: true },
      inscricaoEstadual: Sequelize.STRING(30),
      inscricaoMunicipal: Sequelize.STRING(30),
      consultorNome: Sequelize.STRING(120),
      emailPrincipal: Sequelize.STRING(150),
      emailFinanceiro: Sequelize.STRING(150),
      telefoneComercial: Sequelize.STRING(30),
      cep: Sequelize.STRING(10),
      logradouro: Sequelize.STRING(180),
      numero: Sequelize.STRING(20),
      complemento: Sequelize.STRING(100),
      bairro: Sequelize.STRING(100),
      cidade: Sequelize.STRING(100),
      estado: Sequelize.STRING(2),
      banco: Sequelize.STRING(100),
      agencia: Sequelize.STRING(30),
      conta: Sequelize.STRING(40),
      titularidade: Sequelize.STRING(180),
      chavePix: Sequelize.STRING(180),
      condicoesPagamento: Sequelize.TEXT,
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("fornecedores");
  },
};
