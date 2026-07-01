export async function up(queryInterface) {
  await queryInterface.sequelize.query(`
    ALTER TYPE "enum_usuarios_role" ADD VALUE IF NOT EXISTS 'MACHINEPAY';
  `);
}

export async function down() {}
