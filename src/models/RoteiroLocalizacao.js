import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const RoteiroLocalizacao = sequelize.define(
  "RoteiroLocalizacao",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    roteiroId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "roteiro_id",
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "usuario_id",
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    accuracy: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    altitude: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    heading: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    speed: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    capturedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "captured_at",
    },
    ativa: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    encerradaEm: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "encerrada_em",
    },
  },
  {
    tableName: "roteiros_localizacoes",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["roteiro_id", "usuario_id"],
        name: "roteiros_localizacoes_roteiro_usuario_unique",
      },
      {
        fields: ["ativa", "updated_at"],
        name: "roteiros_localizacoes_ativa_updated_at_idx",
      },
    ],
  }
);

export default RoteiroLocalizacao;
