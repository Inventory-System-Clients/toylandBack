import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const ListaComprasProduto = sequelize.define(
  "ListaComprasProduto",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    listaLojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "lista_compras_lojas", key: "id" },
      field: "lista_loja_id",
    },
    produtoKey: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "produto_key",
    },
    produtoId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "produto_id",
    },
    produtoNome: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "produto_nome",
    },
    produtoEmoji: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: "📦",
      field: "produto_emoji",
    },
    produtoCodigo: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: "",
      field: "produto_codigo",
    },
    quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "lista_compras_produtos",
    timestamps: false,
  },
);

export default ListaComprasProduto;
