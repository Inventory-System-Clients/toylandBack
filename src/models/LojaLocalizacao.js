import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Posição de cada loja no mapa Machine Pay (os leitores das máquinas da loja
// aparecem nela). Três fontes, nesta ordem de preferência:
//   1. manual   - link do Google Maps / coordenadas coladas por alguém
//   2. gps      - GPS do celular do funcionário na PRIMEIRA movimentação com GPS
//                 bom registrada na loja (não é trocado nas visitas seguintes)
//   3. endereco - geocodificação do endereço cadastrado da loja
const LojaLocalizacao = sequelize.define(
  "LojaLocalizacao",
  {
    lojaId: {
      type: DataTypes.UUID,
      primaryKey: true,
      field: "loja_id",
    },

    manualLat: { type: DataTypes.DOUBLE, field: "manual_lat" },
    manualLng: { type: DataTypes.DOUBLE, field: "manual_lng" },
    manualEm: { type: DataTypes.DATE, field: "manual_em" },

    gpsLat: { type: DataTypes.DOUBLE, field: "gps_lat" },
    gpsLng: { type: DataTypes.DOUBLE, field: "gps_lng" },
    gpsPontos: {
      type: DataTypes.JSONB,
      field: "gps_pontos",
      comment: "Ponto gravado [{lat,lng,precisao,em,movimentacaoId}], para conferência",
    },
    gpsEm: { type: DataTypes.DATE, field: "gps_em" },

    enderecoLat: { type: DataTypes.DOUBLE, field: "endereco_lat" },
    enderecoLng: { type: DataTypes.DOUBLE, field: "endereco_lng" },
    enderecoPrecisao: {
      type: DataTypes.STRING(10),
      field: "endereco_precisao",
      comment: "rua (achou o endereço) ou cidade (só o centro da cidade)",
    },
    enderecoConsultado: {
      type: DataTypes.STRING(400),
      field: "endereco_consultado",
      comment: "Texto enviado ao geocodificador; consulta de novo se o cadastro mudar",
    },
    enderecoStatus: {
      type: DataTypes.STRING(20),
      field: "endereco_status",
      comment: "ok, nao_encontrado ou erro",
    },
    geocodificador: { type: DataTypes.STRING(10), comment: "google ou osm" },
    enderecoEm: { type: DataTypes.DATE, field: "endereco_em" },
  },
  {
    tableName: "loja_localizacoes",
    timestamps: true,
  },
);

export default LojaLocalizacao;
