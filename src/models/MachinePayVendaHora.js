import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Vendas de cada leitor Machine Pay por hora do dia (horário de Brasília), base
// da página "Horários de pico". O painel só mostra o extrato venda a venda, então
// um job lê o extrato de cada dia fechado e guarda aqui o resumo por hora.
// Uma linha por posId por dia; "horas" tem 24 posições [quantidade, valor].
const MachinePayVendaHora = sequelize.define(
  "MachinePayVendaHora",
  {
    id: {
      type: DataTypes.STRING(80),
      primaryKey: true,
      comment: "<posId>_<YYYY-MM-DD>",
    },
    posId: { type: DataTypes.STRING(50), allowNull: false, field: "pos_id" },
    data: { type: DataTypes.DATEONLY, allowNull: false },
    horas: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: "24 posições (0h..23h) com [quantidade, valor em R$]",
    },
    qtd: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    valor: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  {
    tableName: "machine_pay_vendas_hora",
    timestamps: true,
    indexes: [{ fields: ["data"] }, { fields: ["pos_id", "data"] }],
  },
);

export default MachinePayVendaHora;
