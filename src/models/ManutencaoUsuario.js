import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const ManutencaoUsuario = sequelize.define(
  "ManutencaoUsuario",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    manutencaoId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "manutencoes",
        key: "id",
      },
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "usuarios",
        key: "id",
      },
    },
  },
  {
    tableName: "manutencao_usuarios",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["manutencaoId", "usuarioId"],
      },
    ],
  },
);

export default ManutencaoUsuario;
