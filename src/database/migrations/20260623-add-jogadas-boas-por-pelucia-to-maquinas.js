module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("maquinas");

    if (!table.jogadas_boas_por_pelucia) {
      await queryInterface.addColumn("maquinas", "jogadas_boas_por_pelucia", {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("maquinas");

    if (table.jogadas_boas_por_pelucia) {
      await queryInterface.removeColumn("maquinas", "jogadas_boas_por_pelucia");
    }
  },
};
