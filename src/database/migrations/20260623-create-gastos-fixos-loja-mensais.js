"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("gastos_fixos_loja_mensais", {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      lojaid: { type: Sequelize.UUID, allowNull: false },
      nome: { type: Sequelize.STRING(64), allowNull: false },
      ano: { type: Sequelize.INTEGER, allowNull: false },
      mes: { type: Sequelize.INTEGER, allowNull: false },
      valor: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      observacao: Sequelize.TEXT,
      propagar: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ativo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });
    await queryInterface.addIndex(
      "gastos_fixos_loja_mensais",
      ["lojaid", "nome", "ano", "mes", "propagar"],
      { unique: true, name: "gastos_fixos_mensais_vigencia_uq" },
    );
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable("gastos_fixos_loja_mensais");
  },
};
