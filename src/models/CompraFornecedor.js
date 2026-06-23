import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const CompraFornecedor = sequelize.define(
  "CompraFornecedor",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fornecedorId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "fornecedores", key: "id" },
    },
    destinoLojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "lojas", key: "id" },
    },
    usuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "usuarios", key: "id" },
    },
    observacao: DataTypes.TEXT,
    dataCompra: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "compras_fornecedores",
    timestamps: true,
  },
);

export default CompraFornecedor;
