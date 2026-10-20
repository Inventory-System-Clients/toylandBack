import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Linha do tempo de conexão de cada leitor Machine Pay, gerada pelo monitoramento:
//  - QUEDA:   o contador "Nx" do painel subiu (o leitor caiu e reconectou)
//  - OFFLINE: o leitor passou de online para offline
//  - ONLINE:  o leitor voltou; duracaoMinutos = quanto tempo ficou fora
const MachinePayEvento = sequelize.define(
  "MachinePayEvento",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    posId: { type: DataTypes.STRING(50), allowNull: false, field: "pos_id" },
    nomePonto: { type: DataTypes.STRING(255), field: "nome_ponto" },
    tipo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      comment: "QUEDA | OFFLINE | ONLINE",
    },
    dataHora: { type: DataTypes.DATE, allowNull: false, field: "data_hora" },
    data: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: "Dia (horário de Brasília) do evento",
    },
    quedasAntes: { type: DataTypes.INTEGER, field: "quedas_antes" },
    quedasDepois: { type: DataTypes.INTEGER, field: "quedas_depois" },
    duracaoMinutos: { type: DataTypes.INTEGER, field: "duracao_minutos" },
    sinalWifi: { type: DataTypes.STRING(20), field: "sinal_wifi" },
  },
  {
    tableName: "machine_pay_eventos",
    timestamps: true,
    updatedAt: false,
    indexes: [{ fields: ["data"] }, { fields: ["pos_id", "data_hora"] }],
  },
);

export default MachinePayEvento;
