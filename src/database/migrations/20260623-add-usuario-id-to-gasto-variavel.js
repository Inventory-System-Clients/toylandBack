module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("GastoVariavel");

    if (!table.usuarioId) {
      await queryInterface.addColumn("GastoVariavel", "usuarioId", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "usuarios", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      });
    }
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("GastoVariavel");

    if (table.usuarioId) {
      await queryInterface.removeColumn("GastoVariavel", "usuarioId");
    }
  },
};
