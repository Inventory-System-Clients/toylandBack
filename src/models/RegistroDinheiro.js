import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const RegistroDinheiro = sequelize.define(
  "RegistroDinheiro",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    registrarTotalLoja: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    inicio: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    fim: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    valorDinheiro: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    valorCartaoPix: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    valorCartaoPixLiquido: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    taxaDeCartao: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    percentualTaxaCartaoMedia: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0,
    },
    gastoFixoPeriodo: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_fixo_periodo",
    },
    gastoVariavelPeriodo: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_variavel_periodo",
    },
    gastoProdutosPeriodo: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_produtos_periodo",
    },
    gastoTotalPeriodo: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_total_periodo",
    },
    observacoes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "registro_dinheiro",
    timestamps: true,
  },
);

export default RegistroDinheiro;
