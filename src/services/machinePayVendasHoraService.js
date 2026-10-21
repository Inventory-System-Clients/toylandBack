// Histórico de vendas por hora (página "Horários de pico"). O painel Machine Pay
// não tem relatório por hora: lemos o extrato venda a venda de cada leitor e
// guardamos o resumo por dia/hora em machine_pay_vendas_hora. Só dias fechados
// (até ontem) entram — um dia lido não muda mais e não é consultado de novo.

import { Op } from "sequelize";
import { MachinePayStatus, MachinePayVendaHora } from "../models/index.js";
import { abrirSessaoMachinePay, listarVendasMachinePay } from "./machinePayDetalhadoService.js";
import {
  dataBrasil,
  ehCaixaLivre,
  monitorConfigurado,
  whereContasCadastradas,
} from "./machinePayMonitorService.js";
import { blocosDeDias, listarDatas, resumirVendasPorHora, somarDias } from "../utils/machinePayAnalise.js";

// Quantos dias para trás guardamos (o maior período da página é 90 dias)
export const DIAS_HISTORICO_HORA = 90;
// Dias por consulta ao extrato (uma página do painel por bloco)
const DIAS_POR_CONSULTA = 15;
// Consultas por rodada: o histórico inicial é lido aos poucos, sem sobrecarregar o painel
const CONSULTAS_POR_RODADA = Math.max(Number(process.env.MACHINE_PAY_VENDAS_HORA_POR_RODADA) || 60, 1);

let rodadaEmAndamento = null;
let ultimaRodada = null;

export const estadoSincronizacaoVendasHora = () => ({
  emAndamento: Boolean(rodadaEmAndamento),
  ultimaRodada,
});

// O que falta ler: para cada leitor do painel, os dias fechados dos últimos
// DIAS_HISTORICO_HORA dias que ainda não estão na tabela (mais recentes primeiro).
async function diasPendentes(ontem) {
  const inicio = somarDias(ontem, -(DIAS_HISTORICO_HORA - 1));
  const [leitores, lidos] = await Promise.all([
    MachinePayStatus.findAll({
      where: await whereContasCadastradas(),
      attributes: ["posId", "nomePonto"],
      raw: true,
    }),
    MachinePayVendaHora.findAll({
      where: { data: { [Op.between]: [inicio, ontem] } },
      attributes: ["posId", "data"],
      raw: true,
    }),
  ]);
  const jaLidos = new Set(lidos.map((l) => `${l.posId}_${l.data}`));
  const datas = listarDatas(inicio, ontem);

  const consultas = [];
  for (const { posId, nomePonto } of leitores) {
    if (ehCaixaLivre(nomePonto)) continue;
    const faltando = datas.filter((d) => !jaLidos.has(`${posId}_${d}`));
    for (const bloco of blocosDeDias(faltando, DIAS_POR_CONSULTA)) consultas.push({ posId, ...bloco });
  }
  // Dias mais recentes primeiro: ontem de todo mundo antes do histórico antigo
  return consultas.sort((a, b) => (a.fim < b.fim ? 1 : a.fim > b.fim ? -1 : 0));
}

async function executarRodada() {
  const ontem = somarDias(dataBrasil(), -1);
  const pendentes = await diasPendentes(ontem);
  const resultado = { em: new Date(), consultas: 0, dias: 0, falhas: 0, restantes: pendentes.length, erro: null };
  if (!pendentes.length) return resultado;

  const sessao = await abrirSessaoMachinePay();
  for (const consulta of pendentes.slice(0, CONSULTAS_POR_RODADA)) {
    resultado.consultas += 1;
    try {
      const vendas = await listarVendasMachinePay({
        posId: consulta.posId,
        inicio: `${consulta.inicio}T00:00`,
        fim: `${consulta.fim}T23:59:59`,
        sessao,
        conferirPagina: true,
      });
      const porData = resumirVendasPorHora(vendas, consulta.datas);
      await MachinePayVendaHora.bulkCreate(
        [...porData].map(([data, dia]) => ({
          id: `${consulta.posId}_${data}`,
          posId: consulta.posId,
          data,
          horas: dia.horas,
          qtd: dia.qtd,
          valor: dia.valor,
        })),
        { updateOnDuplicate: ["horas", "qtd", "valor", "updatedAt"] },
      );
      resultado.dias += consulta.datas.length;
      resultado.restantes -= 1;
    } catch (error) {
      // Leitor com problema não trava os outros; ele volta na próxima rodada
      resultado.falhas += 1;
      resultado.erro = error.message;
      console.error(`[MachinePay Vendas/hora] Falha no leitor ${consulta.posId}:`, error.message);
    }
  }
  return resultado;
}

export function sincronizarVendasPorHora() {
  if (!monitorConfigurado()) {
    return Promise.resolve(null);
  }
  if (!rodadaEmAndamento) {
    rodadaEmAndamento = executarRodada()
      .then((resultado) => {
        ultimaRodada = resultado;
        return resultado;
      })
      .catch((error) => {
        ultimaRodada = { em: new Date(), erro: error.message };
        throw error;
      })
      .finally(() => {
        rodadaEmAndamento = null;
      });
  }
  return rodadaEmAndamento;
}

export async function limparVendasHoraAntigas() {
  const limite = somarDias(dataBrasil(), -(DIAS_HISTORICO_HORA + 30));
  return MachinePayVendaHora.destroy({ where: { data: { [Op.lt]: limite } } });
}
