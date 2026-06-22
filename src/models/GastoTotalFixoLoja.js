import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const GastoTotalFixoLoja = sequelize.define(
  "GastoTotalFixoLoja",
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
    ano: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 12,
      },
    },
    valorTotal: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_total",
    },
  },
  {
    tableName: "gastos_totais_fixos_loja",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["lojaid"] },
      { fields: ["ano", "mes"] },
      { unique: true, fields: ["lojaid", "ano", "mes"] },
    ],
  },
);

export default GastoTotalFixoLoja;
