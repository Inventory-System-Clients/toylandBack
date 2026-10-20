import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Consolidado diário por leitor (POS) da Machine Pay — base do ranking de quedas
// e dos gráficos por período. Uma linha por posId por dia (horário de Brasília).
const MachinePayDiario = sequelize.define(
  "MachinePayDiario",
  {
    id: {
      type: DataTypes.STRING(80),
      primaryKey: true,
      comment: "<posId>_<YYYY-MM-DD>",
    },
    posId: { type: DataTypes.STRING(50), allowNull: false, field: "pos_id" },
    data: { type: DataTypes.DATEONLY, allowNull: false },
    nomePonto: { type: DataTypes.STRING(255), field: "nome_ponto" },
    quedas: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Maior valor do contador 'Nx' do painel visto no dia",
    },
    vezesOffline: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "vezes_offline",
      comment: "Transições online → offline detectadas pelo monitoramento",
    },
    minutosOffline: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "minutos_offline",
    },
    coletas: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    coletasOffline: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "coletas_offline",
    },
    piorSinal: { type: DataTypes.STRING(20), field: "pior_sinal" },
    vendasQtd: { type: DataTypes.INTEGER, defaultValue: 0, field: "vendas_qtd" },
    vendasValor: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      field: "vendas_valor",
    },
  },
  {
    tableName: "machine_pay_diario",
    timestamps: true,
    indexes: [{ fields: ["data"] }, { fields: ["pos_id", "data"] }],
  },
);

export default MachinePayDiario;
