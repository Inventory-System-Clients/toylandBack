import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const ListaComprasLoja = sequelize.define(
  "ListaComprasLoja",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    listaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "lista_compras_pendentes", key: "id" },
      field: "lista_id",
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "loja_id",
    },
    lojaNome: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "loja_nome",
    },
  },
  {
    tableName: "lista_compras_lojas",
    timestamps: false,
  },
);

export default ListaComprasLoja;
