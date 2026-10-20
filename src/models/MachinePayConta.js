import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Contas (clientes) do painel Machine Pay já descobertas pelo monitoramento.
// Uma vez salva, a conta é lida em toda coleta — não precisa ser redescoberta.
const MachinePayConta = sequelize.define(
  "MachinePayConta",
  {
    usrId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      field: "usr_id",
    },
    nome: {
      type: DataTypes.STRING(150),
      comment: "Nome do cliente como aparece no painel (preenchido na coleta)",
    },
  },
  {
    tableName: "machine_pay_contas",
    timestamps: true,
  },
);

export default MachinePayConta;
