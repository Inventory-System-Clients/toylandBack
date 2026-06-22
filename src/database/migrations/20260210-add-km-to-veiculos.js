// Migração para garantir a coluna 'km' na tabela 'veiculos'
module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Adiciona a coluna 'km' se não existir
    await queryInterface.addColumn("veiculos", "km", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove a coluna 'km' caso precise reverter
    await queryInterface.removeColumn("veiculos", "km");
  },
};
