"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("movimentacao_estoque_lojas", "grupoId", {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("movimentacao_estoque_lojas", "grupoId");
  },
};
