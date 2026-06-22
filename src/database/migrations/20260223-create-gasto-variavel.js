module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("GastoVariavel", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      lojaId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "Lojas", key: "id" },
      },
      nome: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      valor: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      observacao: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      dataInicio: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      dataFim: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      registroDinheiroId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "RegistroDinheiros", key: "id" },
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("GastoVariavel");
  },
};
