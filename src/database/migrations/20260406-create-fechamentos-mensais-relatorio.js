"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable("fechamentos_mensais_relatorio", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      loja_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "lojas",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      ano: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      mes: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      data_inicio: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      data_fim: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      fichas_quantidade: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      valor_fichas: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_trocadora_dinheiro_bruto: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_trocadora_cartao_pix_bruto: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_trocadora_cartao_pix_liquido: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_maquinas_dinheiro_bruto: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_maquinas_cartao_pix_bruto: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_maquinas_cartao_pix_liquido: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_bruto_consolidado: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      valor_liquido_consolidado: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      taxa_cartao_percentual_media: {
        type: Sequelize.DECIMAL(6, 3),
        allowNull: false,
        defaultValue: 0,
      },
      taxa_cartao_valor: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      produtos_entraram: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      produtos_sairam: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      gasto_variavel_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gasto_fixo_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gasto_produtos_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gasto_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      ticket_por_premio_total: {
        type: Sequelize.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gastos_fixos_detalhados: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      maquinas_detalhes: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      totais_raw: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
      },
      fechado_por_usuario_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "usuarios",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT",
      },
      fechado_em: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    await queryInterface.addIndex("fechamentos_mensais_relatorio", ["loja_id"]);
    await queryInterface.addIndex("fechamentos_mensais_relatorio", [
      "ano",
      "mes",
    ]);
    await queryInterface.addIndex("fechamentos_mensais_relatorio", [
      "fechado_em",
    ]);
    await queryInterface.addIndex(
      "fechamentos_mensais_relatorio",
      ["loja_id", "ano", "mes"],
      {
        unique: true,
        name: "fechamentos_mensais_relatorio_loja_ano_mes_uq",
      },
    );
  },

  down: async (queryInterface) => {
    await queryInterface.dropTable("fechamentos_mensais_relatorio");
  },
};
