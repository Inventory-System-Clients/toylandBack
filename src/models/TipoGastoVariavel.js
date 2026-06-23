import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const TipoGastoVariavel = sequelize.define(
  "TipoGastoVariavel",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "tipos_gastos_variaveis",
    timestamps: true,
  },
);

export default TipoGastoVariavel;
