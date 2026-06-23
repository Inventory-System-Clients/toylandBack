"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("registro_dinheiro", "valorPix", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("registro_dinheiro", "valorCartao", {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn(
      "registro_dinheiro",
      "valorCartaoLiquido",
      {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
    );
  },
  down: async (queryInterface) => {
    await queryInterface.removeColumn("registro_dinheiro", "valorCartaoLiquido");
    await queryInterface.removeColumn("registro_dinheiro", "valorCartao");
    await queryInterface.removeColumn("registro_dinheiro", "valorPix");
  },
};
