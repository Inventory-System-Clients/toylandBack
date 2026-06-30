import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const Maquina = sequelize.define(
  "Maquina",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    codigo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: "Ex: M01, M02, TK BALL",
    },
    nome: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    machinePayPosId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
      field: "machine_pay_pos_id",
      comment: "Identificador POS da máquina no painel Machine Pay",
    },
    tipo: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: "Ex: Agarra Mais, TakeBall",
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "lojas",
        key: "id",
      },
    },
    capacidadePadrao: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      comment: "Quantidade máxima que a máquina comporta",
    },
    valorFicha: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 5.0,
      comment: "Valor em R$ de cada jogada",
    },
    jogadasBoasPorPelucia: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: "jogadas_boas_por_pelucia",
      comment: "Quantidade ideal de jogadas para sair uma pelúcia",
    },
    peluciaGigante: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "pelucia_gigante",
      comment: "Indica se a maquina trabalha com pelucia gigante",
    },
    alertaJogadasAntesPelucia: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "alerta_jogadas_antes_pelucia",
      comment:
        "Quantidade de jogadas antes da meta para alertar pelucia perto de sair",
      validate: {
        min: 1,
      },
    },
    fichasNecessarias: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "fichas_necessarias",
      comment: "Campo legado. A ToyLand não usa fichas.",
      validate: {
        min: 1,
      },
    },
    forcaForte: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "forca_forte",
      comment: "Força forte da garra em percentual (0-100%)",
      validate: {
        min: 0,
        max: 100,
      },
    },
    forcaFraca: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "forca_fraca",
      comment: "Força fraca da garra em percentual (0-100%)",
      validate: {
        min: 0,
        max: 100,
      },
    },
    forcaPremium: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "forca_premium",
      comment: "Força premium da garra em percentual (0-100%)",
      validate: {
        min: 0,
        max: 100,
      },
    },
    jogadasPremium: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "jogadas_premium",
      comment: "Quantidade de jogadas para usar a força premium",
      validate: {
        min: 1,
      },
    },
    percentualAlertaEstoque: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      comment: "Porcentagem mínima para alertar estoque baixo",
    },
    localizacao: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "Posição dentro da loja",
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "maquinas",
    timestamps: true,
  }
);

export default Maquina;
