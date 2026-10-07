import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Cada tentativa de envio de crédito feita por um CreditoRemotoLink. O valor
// é descontado do link ANTES de chamar a Machine Pay; se a chamada falhar o
// valor continua descontado (status "erro"/"incerto"), porque não dá pra ter
// certeza de que o crédito não chegou na máquina — melhor perder saldo do
// link do que deixar passar do limite.
const CreditoRemotoEnvio = sequelize.define(
  "CreditoRemotoEnvio",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    linkId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "link_id",
      references: {
        model: "credito_remoto_links",
        key: "id",
      },
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "maquina_id",
      references: {
        model: "maquinas",
        key: "id",
      },
    },
    valorCentavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "valor_centavos",
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pendente",
      comment: "pendente | enviado | incerto | erro",
    },
    idwebhook: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    detalhe: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(300),
      allowNull: true,
      field: "user_agent",
    },
  },
  {
    tableName: "credito_remoto_envios",
    timestamps: true,
  },
);

export default CreditoRemotoEnvio;
