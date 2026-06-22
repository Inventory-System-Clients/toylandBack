"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("lojas", "valorFichaPadrao", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 2.5,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("lojas", "valorFichaPadrao");
  },
};
