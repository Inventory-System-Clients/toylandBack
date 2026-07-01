export async function up(queryInterface, DataTypes) {
  await queryInterface.addColumn("maquinas", "machine_pay_usr_id", {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: null,
    comment: "ID do cliente/usr no painel Machine Pay (ex: 5999255357165795)",
  });
}

export async function down(queryInterface) {
  await queryInterface.removeColumn("maquinas", "machine_pay_usr_id");
}
