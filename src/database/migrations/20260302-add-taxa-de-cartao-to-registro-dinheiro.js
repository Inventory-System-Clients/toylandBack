"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("registro_dinheiro", "taxaDeCartao", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("registro_dinheiro", "taxaDeCartao");
  },
};
