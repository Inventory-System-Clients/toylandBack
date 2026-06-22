import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const GastoFixoLoja = sequelize.define(
  "GastoFixoLoja",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "lojaid",
    },
    nome: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    valor: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "GastoFixoLoja",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["lojaid"] },
      { unique: true, fields: ["lojaid", "nome"] },
    ],
  },
);

export default GastoFixoLoja;
