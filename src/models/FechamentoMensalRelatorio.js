import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const FechamentoMensalRelatorio = sequelize.define(
  "FechamentoMensalRelatorio",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    lojaId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "loja_id",
    },
    ano: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    mes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 12,
      },
    },
    dataInicio: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "data_inicio",
    },
    dataFim: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "data_fim",
    },
    fichasQuantidade: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "fichas_quantidade",
    },
    valorFichas: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_fichas",
    },
    valorTrocadoraDinheiroBruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_trocadora_dinheiro_bruto",
    },
    valorTrocadoraCartaoPixBruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_trocadora_cartao_pix_bruto",
    },
    valorTrocadoraCartaoPixLiquido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_trocadora_cartao_pix_liquido",
    },
    valorMaquinasDinheiroBruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_maquinas_dinheiro_bruto",
    },
    valorMaquinasCartaoPixBruto: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_maquinas_cartao_pix_bruto",
    },
    valorMaquinasCartaoPixLiquido: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_maquinas_cartao_pix_liquido",
    },
    valorBrutoConsolidado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_bruto_consolidado",
    },
    valorLiquidoConsolidado: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "valor_liquido_consolidado",
    },
    taxaCartaoPercentualMedia: {
      type: DataTypes.DECIMAL(6, 3),
      allowNull: false,
      defaultValue: 0,
      field: "taxa_cartao_percentual_media",
    },
    taxaCartaoValor: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "taxa_cartao_valor",
    },
    produtosEntraram: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "produtos_entraram",
    },
    produtosSairam: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "produtos_sairam",
    },
    gastoVariavelTotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_variavel_total",
    },
    gastoFixoTotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_fixo_total",
    },
    gastoProdutosTotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_produtos_total",
    },
    gastoTotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "gasto_total",
    },
    ticketPorPremioTotal: {
      type: DataTypes.DECIMAL(14, 2),
      allowNull: false,
      defaultValue: 0,
      field: "ticket_por_premio_total",
    },
    gastosFixosDetalhados: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: "gastos_fixos_detalhados",
    },
    maquinasDetalhes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: "maquinas_detalhes",
    },
    totaisRaw: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      field: "totais_raw",
    },
    fechadoPorUsuarioId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "fechado_por_usuario_id",
    },
    fechadoEm: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "fechado_em",
    },
  },
  {
    tableName: "fechamentos_mensais_relatorio",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["loja_id"] },
      { fields: ["ano", "mes"] },
      { unique: true, fields: ["loja_id", "ano", "mes"] },
      { fields: ["fechado_em"] },
    ],
  },
);

export default FechamentoMensalRelatorio;
