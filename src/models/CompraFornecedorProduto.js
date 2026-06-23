import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const CompraFornecedorProduto = sequelize.define(
  "CompraFornecedorProduto",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    compraId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "compras_fornecedores", key: "id" },
    },
    produtoId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "produtos", key: "id" },
    },
    quantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1 },
    },
  },
  {
    tableName: "compras_fornecedores_produtos",
    timestamps: false,
  },
);

export default CompraFornecedorProduto;
