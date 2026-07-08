import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const MovimentacaoEstoqueLoja = sequelize.define(
  "MovimentacaoEstoqueLoja",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "lojas",
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
    observacao: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    grupoId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment:
        "Vincula movimentações criadas juntas pela mesma compra/transferência (loja + garagem)",
    },
    dataMovimentacao: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    atualizadoEm: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "movimentacao_estoque_lojas",
    timestamps: true,
    createdAt: "dataMovimentacao",
    updatedAt: "atualizadoEm",
  }
);

export default MovimentacaoEstoqueLoja;
