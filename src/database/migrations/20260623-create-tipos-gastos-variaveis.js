module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("tipos_gastos_variaveis", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      nome: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      ativo: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    const agora = new Date();
    const { randomUUID } = require("crypto");
    await queryInterface.bulkInsert("tipos_gastos_variaveis", [
      {
        id: randomUUID(),
        nome: "Material de limpeza",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Manutenção",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Transporte",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Pedágio",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Combustível",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Compra emergencial",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Taxa bancária",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
      {
        id: randomUUID(),
        nome: "Frete",
        ativo: true,
        createdAt: agora,
        updatedAt: agora,
      },
    ]);
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("tipos_gastos_variaveis");
  },
};
