"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Altera o tipo da coluna id para UUID
    await queryInterface.changeColumn("RegistroDinheiros", "id", {
      type: Sequelize.UUID,
      defaultValue: Sequelize.literal("uuid_generate_v4()"),
      allowNull: false,
      primaryKey: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Reverte para INTEGER autoIncrement
    await queryInterface.changeColumn("RegistroDinheiros", "id", {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    });
  },
};
