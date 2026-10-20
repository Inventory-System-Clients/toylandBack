import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

// Última leitura de cada leitor (POS) do painel Machine Pay, atualizada pelo job
// de monitoramento. O painel só mostra o estado do momento — offlineDesde e
// ultimaVezOnline são calculados por nós comparando leituras consecutivas.
const MachinePayStatus = sequelize.define(
  "MachinePayStatus",
  {
    posId: {
      type: DataTypes.STRING(50),
      primaryKey: true,
      field: "pos_id",
    },
    idPainel: { type: DataTypes.STRING(30), field: "id_painel" },
    usrId: { type: DataTypes.STRING(50), field: "usr_id" },
    nomePonto: { type: DataTypes.STRING(255), field: "nome_ponto" },
    cliente: { type: DataTypes.STRING(120) },
    online: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    quedasHoje: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "quedas_hoje",
      comment: "Contador 'Nx' do painel: quantas vezes o leitor caiu no dia",
    },
    dia: {
      type: DataTypes.DATEONLY,
      comment: "Dia (horário de Brasília) a que quedasHoje se refere",
    },
    versao: { type: DataTypes.STRING(20) },
    tipoVersao: { type: DataTypes.STRING(40), field: "tipo_versao" },
    diasVencer: { type: DataTypes.INTEGER, field: "dias_vencer" },
    gateway: { type: DataTypes.STRING(40) },
    hibrido: { type: DataTypes.BOOLEAN, defaultValue: false },
    serial: { type: DataTypes.STRING(50) },
    pagamentoTeste: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "pagamento_teste",
    },
    telemetria: { type: DataTypes.STRING(40) },
    modoResposta: { type: DataTypes.STRING(30), field: "modo_resposta" },
    vendasHojeQtd: { type: DataTypes.INTEGER, defaultValue: 0, field: "vendas_hoje_qtd" },
    vendasHojeValor: {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0,
      field: "vendas_hoje_valor",
    },
    totalValor: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0, field: "total_valor" },
    totalQtd: { type: DataTypes.INTEGER, defaultValue: 0, field: "total_qtd" },
    pix: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    debito: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    credito: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    ultimaVendaHoje: { type: DataTypes.JSONB, field: "ultima_venda_hoje" },
    ultimaVendaOntem: { type: DataTypes.JSONB, field: "ultima_venda_ontem" },
    ultimaVendaAnterior: { type: DataTypes.JSONB, field: "ultima_venda_anterior" },
    sinalWifi: { type: DataTypes.STRING(20), field: "sinal_wifi" },
    dataEquipamento: {
      type: DataTypes.STRING(25),
      field: "data_equipamento",
      comment: "Data/hora exibida pelo painel junto do sinal Wi-Fi (texto original)",
    },
    ip: { type: DataTypes.STRING(45) },
    offlineDesde: {
      type: DataTypes.DATE,
      field: "offline_desde",
      comment: "Quando o monitoramento viu o leitor passar de online para offline",
    },
    ultimaVezOnline: { type: DataTypes.DATE, field: "ultima_vez_online" },
    coletadoEm: { type: DataTypes.DATE, field: "coletado_em" },
  },
  {
    tableName: "machine_pay_status",
    timestamps: true,
  },
);

export default MachinePayStatus;
