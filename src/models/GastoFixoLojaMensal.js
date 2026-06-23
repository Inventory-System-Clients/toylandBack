import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const GastoFixoLojaMensal = sequelize.define(
  "GastoFixoLojaMensal",
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
    ano: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 12 },
    },
    valor: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    observacao: DataTypes.TEXT,
    propagar: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "gastos_fixos_loja_mensais",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["lojaid", "ano", "mes"] },
      {
        unique: true,
        fields: ["lojaid", "nome", "ano", "mes", "propagar"],
      },
    ],
  },
);

export default GastoFixoLojaMensal;
