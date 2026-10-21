import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Posição de cada leitor Machine Pay no mapa. Vem do IP que o painel mostra
// (geolocalização por IP, precisão de bairro/cidade) ou é cadastrada à mão
// (link do Google Maps / coordenadas). A posição manual nunca é trocada pelo IP.
// Fica separada de machine_pay_status para não sumir quando o leitor sai do painel.
const MachinePayLocalizacao = sequelize.define(
  "MachinePayLocalizacao",
  {
    posId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      field: "pos_id",
    },
    latitude: { type: DataTypes.DOUBLE },
    longitude: { type: DataTypes.DOUBLE },
    origem: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: "ip",
      validate: { isIn: [["ip", "manual"]] },
    },
    ip: {
      type: DataTypes.STRING(45),
      comment: "IP usado na última consulta (nova consulta só quando o IP muda)",
    },
    statusIp: {
      type: DataTypes.STRING(20),
      field: "status_ip",
      comment: "ok, privado, nao_encontrado ou erro",
    },
    cidade: { type: DataTypes.STRING(120) },
    uf: { type: DataTypes.STRING(60) },
    provedor: { type: DataTypes.STRING(150) },
    consultadoEm: { type: DataTypes.DATE, field: "consultado_em" },
  },
  {
    tableName: "machine_pay_localizacoes",
    timestamps: true,
  },
);

export default MachinePayLocalizacao;
