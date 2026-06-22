import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const Sangria = sequelize.define(
  "Sangria",
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
      field: "loja_id",
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "usuarios", key: "id" },
      field: "usuario_id",
    },
    dataContagem: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "data_contagem",
    },
    quantidade: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    notas2: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_2",
    },
    notas5: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_5",
    },
    notas10: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_10",
    },
    notas20: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_20",
    },
    notas50: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_50",
    },
    notas100: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_100",
    },
    notas200: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "notas_200",
    },
    valorCalculadoNotas: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_calculado_notas",
    },
    observacao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "sangrias",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

export default Sangria;