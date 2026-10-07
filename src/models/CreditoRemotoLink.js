import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Link temporário de crédito remoto (voucher). Quem tem o link só consegue
// enviar crédito Machine Pay para as máquinas Machine Pay com "TOYLAND" no
// nome, até o limite em reais. O token em si nunca é
// salvo em texto puro — a busca é pelo hash SHA-256 (tokenHash) e a cópia
// pro admin fica cifrada com uma chave derivada do JWT_SECRET (tokenCifrado),
// então quem só lê o banco não consegue reconstruir o link.
//
// Valores ficam em centavos (INTEGER) pra não ter erro de arredondamento no
// controle do limite. A constraint check_credito_remoto_limite (criada no
// startup em server.js) garante no próprio Postgres que usadoCentavos nunca
// passa de limiteCentavos, mesmo se algum código tentar.
const CreditoRemotoLink = sequelize.define(
  "CreditoRemotoLink",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    descricao: {
      type: DataTypes.STRING(150),
      allowNull: false,
      comment: "Para quem é o link, ex: Promoção Shopping X",
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: "token_hash",
    },
    tokenCifrado: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "token_cifrado",
      comment: "Token cifrado (AES-256-GCM) para o admin poder copiar o link de novo",
    },
    maquinaId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "maquina_id",
      references: {
        model: "maquinas",
        key: "id",
      },
      comment: "Se preenchido, o link só envia para esta máquina (ex.: link de teste). Vazio = máquinas TOYLAND",
    },
    lojaIds: {
      type: DataTypes.ARRAY(DataTypes.UUID),
      allowNull: true,
      field: "loja_ids",
      comment: "Se preenchido (e sem máquina fixa), o link vale nas máquinas Machine Pay dessas lojas",
    },
    loteId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "lote_id",
      comment: "Links criados juntos (ex.: 10 vouchers de R$ 5) compartilham o mesmo lote",
    },
    limiteCentavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "limite_centavos",
    },
    usadoCentavos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "usado_centavos",
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    expiraEm: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "expira_em",
    },
    revogadoEm: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "revogado_em",
    },
    criadoPorId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "criado_por_id",
      references: {
        model: "usuarios",
        key: "id",
      },
    },
  },
  {
    tableName: "credito_remoto_links",
    timestamps: true,
  },
);

export default CreditoRemotoLink;
