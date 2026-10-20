// Páginas "Horários de pico" e "Ranking das máquinas" (dados da Machine Pay).
import { Op, fn, col } from "sequelize";
import {
  MachinePayConta,
  MachinePayDiario,
  MachinePayVendaHora,
  Movimentacao,
} from "../models/index.js";
import { carregarStatusFormatados } from "./machinePayMonitorController.js";
import { dataBrasil } from "../services/machinePayMonitorService.js";
import {
  DIAS_HISTORICO_HORA,
  estadoSincronizacaoVendasHora,
  sincronizarVendasPorHora,
} from "../services/machinePayVendasHoraService.js";
import { montarPicos, montarRankingMaquinas, somarDias } from "../utils/machinePayAnalise.js";
import { temPermissao } from "../utils/permissoes.js";

const PERIODOS_PICO = [7, 30, 90];

const verValores = (usuario) => temPermissao(usuario, "machinePay.valores", ["ADMIN", "FINANCEIRO"]);

// Código mostrado ao lado do nome: o da máquina no sistema, senão o id do painel
const codigoDe = (m) => m.vinculo?.codigo || m.idPainel || m.posId;

// Leitores ativos, opcionalmente de um cliente (usrId) e/ou um leitor (posId)
async function maquinasSelecionadas({ usrId, posId }) {
  const todas = await carregarStatusFormatados();
  return todas.filter(
    (m) => !m.desativada && (!usrId || m.usrId === usrId) && (!posId || m.posId === posId),
  );
}

const responderErro = (res, error, mensagem) => {
  console.error(`[MachinePay Análise] ${mensagem}:`, error.message);
  res.status(500).json({ error: mensagem, details: error.message });
};

// GET /api/machine-pay/monitor/analise/filtros — clientes e máquinas para os seletores
export const filtrosAnalise = async (req, res) => {
  try {
    const [maquinas, contas] = await Promise.all([
      maquinasSelecionadas({}),
      MachinePayConta.findAll({ attributes: ["usrId", "nome"], raw: true }),
    ]);
    const nomeConta = new Map(contas.map((c) => [c.usrId, c.nome]));
    const clientes = new Map();
    for (const m of maquinas) {
      const usrId = m.usrId || "";
      if (!clientes.has(usrId)) {
        clientes.set(usrId, {
          usrId,
          nome: nomeConta.get(usrId) || m.cliente || (usrId ? `Conta ${usrId}` : "Sem cliente"),
          maquinas: [],
        });
      }
      clientes.get(usrId).maquinas.push({ posId: m.posId, nomePonto: m.nomePonto, codigo: codigoDe(m) });
    }
    const lista = [...clientes.values()]
      .map((c) => ({
        ...c,
        maquinas: c.maquinas.sort((a, b) => String(a.nomePonto).localeCompare(String(b.nomePonto), "pt-BR")),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    res.json({ clientes: lista });
  } catch (error) {
    responderErro(res, error, "Erro ao listar clientes Machine Pay");
  }
};

// GET /api/machine-pay/monitor/analise/picos?dias=7|30|90&usrId=&posId=
// Média por dia (dias fechados, até ontem) por dia da semana e hora, horário de Brasília.
export const horariosDePico = async (req, res) => {
  try {
    const dias = PERIODOS_PICO.includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
    const fim = somarDias(dataBrasil(), -1);
    const inicio = somarDias(fim, -(dias - 1));
    const maquinas = await maquinasSelecionadas(req.query);

    const [linhas, inicioHistorico] = await Promise.all([
      maquinas.length
        ? MachinePayVendaHora.findAll({
            where: {
              posId: { [Op.in]: maquinas.map((m) => m.posId) },
              data: { [Op.between]: [inicio, fim] },
            },
            attributes: ["data", "horas"],
            raw: true,
          })
        : [],
      MachinePayVendaHora.min("data"),
    ]);

    // Nada lido ainda (primeiro acesso / deploy novo): começa a leitura já
    if (!inicioHistorico && !estadoSincronizacaoVendasHora().emAndamento) {
      sincronizarVendasPorHora().catch((error) =>
        console.error("[MachinePay Vendas/hora] Falha:", error.message),
      );
    }

    const { ultimaRodada, emAndamento } = estadoSincronizacaoVendasHora();
    res.json({
      ...montarPicos(linhas, { inicio, fim }),
      maquinas: maquinas.length,
      sincronizacao: {
        emAndamento,
        inicioHistorico: inicioHistorico || null,
        diasGuardados: DIAS_HISTORICO_HORA,
        ultimaLeitura: ultimaRodada?.em || null,
        pendentes: ultimaRodada?.restantes ?? null,
      },
    });
  } catch (error) {
    responderErro(res, error, "Erro ao montar horários de pico");
  }
};

const PERIODOS_RANKING = {
  hoje: (hoje) => hoje,
  "7dias": (hoje) => somarDias(hoje, -6),
  mes: (hoje) => `${hoje.slice(0, 8)}01`,
};

// Pelúcias que saíram por máquina do sistema, pelas movimentações (coletas) do período
async function peluciasPorMaquina(maquinaIds, inicio, fim) {
  if (!maquinaIds.length) return new Map();
  const linhas = await Movimentacao.findAll({
    where: {
      maquinaId: { [Op.in]: maquinaIds },
      retiradaEstoque: false,
      dataColeta: {
        [Op.between]: [new Date(`${inicio}T00:00:00-03:00`), new Date(`${fim}T23:59:59.999-03:00`)],
      },
    },
    attributes: [[col("maquina_id"), "maquinaId"], [fn("SUM", col("sairam")), "pelucias"]],
    group: [col("maquina_id")],
    raw: true,
  });
  return new Map(linhas.map((l) => [l.maquinaId, Number(l.pelucias) || 0]));
}

// GET /api/machine-pay/monitor/analise/ranking?periodo=hoje|7dias|mes&usrId=
export const rankingMaquinas = async (req, res) => {
  try {
    const periodo = PERIODOS_RANKING[req.query.periodo] ? req.query.periodo : "7dias";
    const fim = dataBrasil();
    const inicio = PERIODOS_RANKING[periodo](fim);
    const maquinas = await maquinasSelecionadas({ usrId: req.query.usrId });
    const posIds = maquinas.map((m) => m.posId);

    const [diarios, pelucias] = await Promise.all([
      posIds.length
        ? MachinePayDiario.findAll({
            where: { posId: { [Op.in]: posIds }, data: { [Op.between]: [inicio, fim] } },
            attributes: [
              [col("pos_id"), "posId"],
              [fn("SUM", col("vendas_qtd")), "vendasQtd"],
              [fn("SUM", col("vendas_valor")), "vendasValor"],
              [fn("SUM", col("quedas")), "quedas"],
            ],
            group: [col("pos_id")],
            raw: true,
          })
        : [],
      peluciasPorMaquina(
        maquinas.map((m) => m.vinculo?.maquinaId).filter(Boolean),
        inicio,
        fim,
      ),
    ]);

    const porPosId = new Map(diarios.map((d) => [d.posId, d]));
    const linhas = maquinas.map((m) => {
      const d = porPosId.get(m.posId);
      return {
        posId: m.posId,
        nomePonto: m.nomePonto || m.vinculo?.nome || m.posId,
        codigo: codigoDe(m),
        cliente: m.cliente,
        vinculada: Boolean(m.vinculo),
        vendasQtd: Number(d?.vendasQtd) || 0,
        vendasValor: Number(d?.vendasValor) || 0,
        quedas: Number(d?.quedas) || 0,
        // Pelúcia só existe para leitor ligado a uma máquina do sistema
        pelucias: m.vinculo ? pelucias.get(m.vinculo.maquinaId) || 0 : null,
      };
    });

    res.json({
      periodo: { chave: periodo, inicio, fim },
      maquinas: linhas.length,
      maquinasSemVinculo: linhas.filter((l) => !l.vinculada).length,
      ...montarRankingMaquinas(linhas, { verValores: verValores(req.usuario) }),
    });
  } catch (error) {
    responderErro(res, error, "Erro ao montar ranking das máquinas");
  }
};
