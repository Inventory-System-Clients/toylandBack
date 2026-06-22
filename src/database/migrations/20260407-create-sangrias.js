"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("sangrias", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      loja_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "lojas",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      usuario_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: "usuarios",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      data_contagem: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      quantidade: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      notas_2: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_5: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_10: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_20: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_50: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_100: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      notas_200: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      valor_calculado_notas: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      observacao: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("sangrias", ["loja_id"]);
    await queryInterface.addIndex("sangrias", ["data_contagem"]);
    await queryInterface.addIndex("sangrias", ["usuario_id"]);
    await queryInterface.addIndex("sangrias", ["loja_id", "data_contagem"]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("sangrias");
  },
};