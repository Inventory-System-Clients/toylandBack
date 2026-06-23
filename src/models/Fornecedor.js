import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const Fornecedor = sequelize.define(
  "Fornecedor",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    razaoSocial: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    nomeFantasia: DataTypes.STRING(180),
    documento: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      comment: "CNPJ ou CPF",
    },
    inscricaoEstadual: DataTypes.STRING(30),
    inscricaoMunicipal: DataTypes.STRING(30),
    consultorNome: DataTypes.STRING(120),
    emailPrincipal: DataTypes.STRING(150),
    emailFinanceiro: DataTypes.STRING(150),
    telefoneComercial: DataTypes.STRING(30),
    cep: DataTypes.STRING(10),
    logradouro: DataTypes.STRING(180),
    numero: DataTypes.STRING(20),
    complemento: DataTypes.STRING(100),
    bairro: DataTypes.STRING(100),
    cidade: DataTypes.STRING(100),
    estado: DataTypes.STRING(2),
    banco: DataTypes.STRING(100),
    agencia: DataTypes.STRING(30),
    conta: DataTypes.STRING(40),
    titularidade: DataTypes.STRING(180),
    chavePix: DataTypes.STRING(180),
    condicoesPagamento: DataTypes.TEXT,
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "fornecedores",
    timestamps: true,
  },
);

export default Fornecedor;
