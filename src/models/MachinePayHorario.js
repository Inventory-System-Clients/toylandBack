import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Configuração do ponto de leitores Machine Pay que não estão vinculados a uma
// máquina do sistema (horário de funcionamento e região). Leitor vinculado usa
// os campos da própria máquina (maquinas.horario_funcionamento / maquinas.regiao).
const MachinePayHorario = sequelize.define(
  "MachinePayHorario",
  {
    posId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      field: "pos_id",
    },
    horarioFuncionamento: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: "horario_funcionamento",
      comment: "Mesmo formato de maquinas.horario_funcionamento. null = 24h",
    },
    regiao: {
      type: DataTypes.STRING(10),
      allowNull: true,
      validate: { isIn: [["CAPITAL", "INTERIOR"]] },
      comment: "CAPITAL ou INTERIOR. null = padrão (CAPITAL)",
    },
  },
  {
    tableName: "machine_pay_horarios",
    timestamps: true,
  },
);

export default MachinePayHorario;
