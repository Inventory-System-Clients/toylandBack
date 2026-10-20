// Monitoramento dos leitores Machine Pay. O painel só mostra o estado do momento
// (online/offline e o contador "Nx" de quedas do dia), então o histórico é montado
// aqui: a cada coleta comparamos a leitura nova com a anterior e gravamos o status
// atual, o consolidado do dia e os eventos (queda / ficou offline / voltou).

import { Op } from "sequelize";
import {
  Maquina,
  MachinePayStatus,
  MachinePayDiario,
  MachinePayEvento,
  MachinePayConta,
  sequelize,
} from "../models/index.js";
import {
  listarMaquinasCadastradas,
  MachinePayServiceError,
} from "./machinePayMonitorGateway.js";
import { parsearPainelMaquinas } from "./machinePayPainelParser.js";
import { atualizarLocalizacoesPorIp } from "./machinePayGeoIpService.js";
import { atualizarLocalizacoesLojas } from "./lojaLocalizacaoService.js";
import { machinePayLoginConfigurado } from "./machinePayConfig.js";

const FUSO_HORARIO = "America/Sao_Paulo";

// Se o job ficar parado (deploy, servidor dormindo), não atribuímos o buraco
// inteiro como "tempo offline" — no máximo este tanto por coleta.
const LIMITE_MINUTOS_ENTRE_COLETAS = 20;

// "SEM_SINAL" no painel quase sempre significa "Wi-Fi não informado" (leitores
// WEBSOCKET não reportam), então fica fora da comparação de pior sinal.
const GRAVIDADE_SINAL = { OTIMO: 0, BOM: 1, FRACO: 2, RUIM: 3 };

export const dataBrasil = (data = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);

// Caixas com "CAIXA LIVRE" no nome não estão instalados em nenhum ponto:
// ficam fora do monitoramento (status, histórico e eventos).
export const ehCaixaLivre = (nomePonto) => /caixa\s*livre/i.test(nomePonto || "");

const piorSinal = (atual, novo) => {
  if (!(novo in GRAVIDADE_SINAL)) return atual || null;
  if (!(atual in GRAVIDADE_SINAL)) return novo;
  return GRAVIDADE_SINAL[novo] > GRAVIDADE_SINAL[atual] ? novo : atual;
};

export const monitorConfigurado = machinePayLoginConfigurado;

async function resolverMaquinasCadastradas() {
  const [maquinas, contasSalvas] = await Promise.all([
    Maquina.findAll({
      where: {
        machinePayPosId: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
      },
      attributes: ["id", "machinePayPosId", "machinePayUsrId"],
    }),
    MachinePayConta.findAll({ attributes: ["usrId"], raw: true }),
  ]);
  const usrs = new Set([
    ...String(process.env.MACHINE_PAY_USR || "")
      .split(",")
      .map((usrId) => usrId.trim())
      .filter(Boolean),
    ...maquinas.map((maquina) => maquina.machinePayUsrId).filter(Boolean),
    ...contasSalvas.map((conta) => conta.usrId).filter(Boolean),
  ]);
  return {
    posIds: new Set(maquinas.map((m) => String(m.machinePayPosId).trim())),
    usrs: [...usrs],
    totalCadastradas: maquinas.length,
  };
}

let coletaEmAndamento = null;
let ultimoErro = null;

export const obterUltimoErroColeta = () => ultimoErro;

export function coletarStatusMachinePay() {
  if (!coletaEmAndamento) {
    coletaEmAndamento = executarColeta()
      .then((resultado) => {
        ultimoErro = null;
        // Posições do mapa (lojas e IPs) em segundo plano, sem atrasar a coleta
        atualizarLocalizacoesLojas();
        atualizarLocalizacoesPorIp();
        return resultado;
      })
      .catch((error) => {
        ultimoErro = { em: new Date(), mensagem: error.message };
        throw error;
      })
      .finally(() => {
        coletaEmAndamento = null;
      });
  }
  return coletaEmAndamento;
}

async function executarColeta() {
  if (!monitorConfigurado()) {
    throw new MachinePayServiceError(
      500,
      "Monitoramento Machine Pay não configurado (MACHINE_PAY_LOGIN / MACHINE_PAY_PASSWORD)",
    );
  }

  const { posIds, usrs, totalCadastradas } = await resolverMaquinasCadastradas();
  if (!posIds.size) {
    throw new MachinePayServiceError(
      400,
      "Nenhuma máquina do sistema tem o POS ID da Machine Pay cadastrado. Preencha o POS ID em pelo menos uma máquina.",
    );
  }

  const leituras = [];
  const vistos = new Set();
  const caixasLivres = new Set();
  const posIdsEncontrados = new Set();
  // O painel pode exigir usr para mostrar uma conta específica. Tentamos as
  // contas configuradas/usadas pelas máquinas e também a listagem padrão.
  const consultasConta = [...usrs.map((usrId) => ({ usrId })), {}];
  for (const conta of consultasConta) {
    try {
      const html = await listarMaquinasCadastradas(conta);
      for (const leitura of parsearPainelMaquinas(html)) {
        if (!posIds.has(String(leitura.posId).trim())) continue;
        posIdsEncontrados.add(String(leitura.posId).trim());
        if (vistos.has(leitura.posId)) continue;
        vistos.add(leitura.posId);
        if (ehCaixaLivre(leitura.nomePonto)) {
          caixasLivres.add(leitura.posId);
          continue;
        }
        leituras.push({ ...leitura, nomePonto: leitura.nomePonto?.slice(0, 255) || null });
      }
    } catch (error) {
      if (conta === consultasConta.at(-1) && !leituras.length) throw error;
    }
  }

  if (!leituras.length) {
    throw new MachinePayServiceError(
      502,
      posIdsEncontrados.size
        ? "Os POS IDs cadastrados no Toyland só correspondem a caixas livres, que não entram no monitoramento."
        : `Nenhum dos ${totalCadastradas} POS IDs cadastrados no Toyland apareceu na listagem da conta autenticada. Confira os POS IDs e o acesso dessa conta no painel Machine Pay.`,
    );
  }

  const agora = new Date();
  const dia = dataBrasil(agora);

  const [anteriores, diariosHoje] = await Promise.all([
    MachinePayStatus.findAll({ raw: true }),
    MachinePayDiario.findAll({ where: { data: dia }, raw: true }),
  ]);
  const statusAnterior = new Map(anteriores.map((s) => [s.posId, s]));
  const diarioAnterior = new Map(diariosHoje.map((d) => [d.posId, d]));

  const linhasStatus = [];
  const linhasDiario = [];
  const eventos = [];

  for (const leitura of leituras) {
    const anterior = statusAnterior.get(leitura.posId);
    const diario = diarioAnterior.get(leitura.posId);

    const minutosDesdeUltima = anterior?.coletadoEm
      ? Math.min(
          (agora - new Date(anterior.coletadoEm)) / 60000,
          LIMITE_MINUTOS_ENTRE_COLETAS,
        )
      : 0;

    const ficouOffline = Boolean(anterior?.online) && !leitura.online;
    const voltou = Boolean(anterior) && !anterior.online && leitura.online;

    let offlineDesde = null;
    if (!leitura.online) {
      offlineDesde = ficouOffline ? agora : anterior?.offlineDesde || null;
    }

    const eventoBase = {
      posId: leitura.posId,
      nomePonto: leitura.nomePonto,
      dataHora: agora,
      data: dia,
      sinalWifi: leitura.sinalWifi,
    };

    if (ficouOffline) eventos.push({ ...eventoBase, tipo: "OFFLINE" });
    if (voltou) {
      eventos.push({
        ...eventoBase,
        tipo: "ONLINE",
        duracaoMinutos: anterior.offlineDesde
          ? Math.round((agora - new Date(anterior.offlineDesde)) / 60000)
          : null,
      });
    }

    // O contador "Nx" zera na virada do dia; só comparamos dentro do mesmo dia.
    const quedasAntes = anterior && anterior.dia === dia ? anterior.quedasHoje : null;
    if (quedasAntes !== null && leitura.quedasHoje > quedasAntes) {
      eventos.push({
        ...eventoBase,
        tipo: "QUEDA",
        quedasAntes,
        quedasDepois: leitura.quedasHoje,
      });
    }

    linhasStatus.push({
      ...leitura,
      dia,
      offlineDesde,
      ultimaVezOnline: leitura.online ? agora : anterior?.ultimaVezOnline || null,
      coletadoEm: agora,
    });

    linhasDiario.push({
      id: `${leitura.posId}_${dia}`,
      posId: leitura.posId,
      data: dia,
      nomePonto: leitura.nomePonto,
      quedas: Math.max(diario?.quedas || 0, leitura.quedasHoje),
      vezesOffline: (diario?.vezesOffline || 0) + (ficouOffline ? 1 : 0),
      minutosOffline:
        (diario?.minutosOffline || 0) +
        (leitura.online ? 0 : Math.round(minutosDesdeUltima)),
      coletas: (diario?.coletas || 0) + 1,
      coletasOffline: (diario?.coletasOffline || 0) + (leitura.online ? 0 : 1),
      piorSinal: piorSinal(diario?.piorSinal, leitura.sinalWifi),
      vendasQtd: Math.max(diario?.vendasQtd || 0, leitura.vendasHojeQtd),
      vendasValor: Math.max(Number(diario?.vendasValor || 0), leitura.vendasHojeValor),
    });
  }

  const posIdsAtuais = leituras.map((l) => l.posId);
  const camposStatus = Object.keys(linhasStatus[0]).filter((c) => c !== "posId");
  const camposDiario = Object.keys(linhasDiario[0]).filter((c) => c !== "id");

  await sequelize.transaction(async (transaction) => {
    await MachinePayStatus.bulkCreate(linhasStatus, {
      updateOnDuplicate: [...camposStatus, "updatedAt"],
      transaction,
    });
    await MachinePayDiario.bulkCreate(linhasDiario, {
      updateOnDuplicate: [...camposDiario, "updatedAt"],
      transaction,
    });
    if (eventos.length) {
      await MachinePayEvento.bulkCreate(eventos, { transaction });
    }
    // Leitores excluídos do painel deixam de aparecer na lista de status
    // (o histórico diário e os eventos deles continuam guardados).
    await MachinePayStatus.destroy({
      where: { posId: { [Op.notIn]: posIdsAtuais } },
      transaction,
    });
    if (caixasLivres.size) {
      const where = { posId: { [Op.in]: [...caixasLivres] } };
      await MachinePayDiario.destroy({ where, transaction });
      await MachinePayEvento.destroy({ where, transaction });
    }
  });

  // Completa o usr das máquinas cadastradas que apareceram nesta leitura
  // (também usado pela consulta de status online/offline da tela da máquina).
  const usrPorPosId = new Map(leituras.map((l) => [l.posId, l.usrId]));
  const maquinasSemUsr = await Maquina.findAll({
    where: { machinePayPosId: { [Op.in]: posIdsAtuais }, machinePayUsrId: null },
    attributes: ["id", "machinePayPosId"],
  });
  for (const maquina of maquinasSemUsr) {
    const usrId = usrPorPosId.get(String(maquina.machinePayPosId).trim());
    if (usrId) await maquina.update({ machinePayUsrId: usrId });
  }

  // Salva/atualiza as contas lidas com o nome do cliente que o painel mostra.
  const nomePorUsr = new Map();
  for (const leitura of leituras) {
    if (leitura.usrId && !nomePorUsr.has(leitura.usrId)) {
      nomePorUsr.set(leitura.usrId, leitura.cliente?.slice(0, 150) || null);
    }
  }
  if (nomePorUsr.size) {
    await MachinePayConta.bulkCreate(
      [...nomePorUsr].map(([usrId, nome]) => ({ usrId, nome })),
      { updateOnDuplicate: ["nome", "updatedAt"] },
    );
  }

  return {
    coletadoEm: agora,
    total: leituras.length,
    online: leituras.filter((l) => l.online).length,
    offline: leituras.filter((l) => !l.online).length,
    eventos: eventos.length,
  };
}

export async function limparHistoricoAntigo() {
  const dias = Number(process.env.MACHINE_PAY_RETENCAO_DIAS) || 365;
  const limite = dataBrasil(new Date(Date.now() - dias * 24 * 60 * 60 * 1000));
  const [eventos, diarios] = await Promise.all([
    MachinePayEvento.destroy({ where: { data: { [Op.lt]: limite } } }),
    MachinePayDiario.destroy({ where: { data: { [Op.lt]: limite } } }),
  ]);
  return { eventos, diarios, limite };
}
