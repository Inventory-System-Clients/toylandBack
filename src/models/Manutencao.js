import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const Manutencao = sequelize.define(
  "Manutencao",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    titulo: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    custo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: null,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "lojas",
        key: "id",
      },
    },
    status: {
      type: DataTypes.ENUM("PENDENTE", "RESOLVIDA"),
      allowNull: false,
      defaultValue: "PENDENTE",
    },
    criadoPorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
    },
    resolvidoPorId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "usuarios",
        key: "id",
      },
    },
    resolvidoEm: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "manutencoes",
    timestamps: true,
  },
);

export default Manutencao;
