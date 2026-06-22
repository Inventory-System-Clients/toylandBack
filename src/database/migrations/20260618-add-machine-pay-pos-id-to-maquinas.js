"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("maquinas", "machine_pay_pos_id", {
      type: Sequelize.STRING(50),
      allowNull: true,
      unique: true,
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("maquinas", "machine_pay_pos_id");
  },
};
