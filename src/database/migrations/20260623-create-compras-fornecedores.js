"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("compras_fornecedores", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      fornecedorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "fornecedores", key: "id" },
      },
      destinoLojaId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "lojas", key: "id" },
      },
      usuarioId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "usuarios", key: "id" },
      },
      observacao: Sequelize.TEXT,
      dataCompra: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
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
    await queryInterface.createTable("compras_fornecedores_produtos", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      compraId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "compras_fornecedores", key: "id" },
        onDelete: "CASCADE",
      },
      produtoId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "produtos", key: "id" },
      },
      quantidade: { type: Sequelize.INTEGER, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("compras_fornecedores_produtos");
    await queryInterface.dropTable("compras_fornecedores");
  },
};
