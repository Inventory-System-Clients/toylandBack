import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const GastoVariavel = sequelize.define(
  "GastoVariavel",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "lojas", key: "id" },
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    valor: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    dataInicio: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dataFim: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    registroDinheiroId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "registro_dinheiro", key: "id" },
    },
  },
  {
    tableName: "GastoVariavel",
    timestamps: true,
  },
);

export default GastoVariavel;
