import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const ListaComprasPendente = sequelize.define(
  "ListaComprasPendente",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "usuarios", key: "id" },
      field: "usuario_id",
    },
    criadoEm: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "criado_em",
    },
  },
  {
    tableName: "lista_compras_pendentes",
    timestamps: false,
  },
);

export default ListaComprasPendente;
