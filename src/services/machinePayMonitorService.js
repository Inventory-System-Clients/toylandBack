// Monitoramento dos leitores Machine Pay. O painel só mostra o estado do momento
// (online/offline e o contador "Nx" de quedas do dia), então o histórico é montado
// aqui: a cada coleta comparamos a leitura nova com a anterior e gravamos o status
// atual, o consolidado do dia e os eventos (queda / ficou offline / voltou).

import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  Maquina,
  MachinePayStatus,
  MachinePayDiario,
  MachinePayEvento,
  MachinePayConta,
} from "../models/index.js";
import {
  listarMaquinasCadastradas,
  MachinePayServiceError,
} from "./machinePayDetalhadoService.js";
import { parsearPainelMaquinas } from "./machinePayPainelParser.js";
import { atualizarLocalizacoesPorIp } from "./machinePayGeoIpService.js";
import { atualizarLocalizacoesLojas } from "./lojaLocalizacaoService.js";

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

export const monitorConfigurado = () =>
  Boolean(
    process.env.MACHINE_PAY_LOGIN && process.env.MACHINE_PAY_PASSWORD,
  );

const usrsDoEnv = () =>
  String(process.env.MACHINE_PAY_USR || "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);

// Contas (usr) monitoradas = MACHINE_PAY_USR (a conta do cliente no painel, como
// no Club Kids) + o Usr ID preenchido nas máquinas cadastradas. O login do painel
// é de revenda e enxerga outros clientes, por isso contas antigas de
// machine_pay_contas ficam de fora: só essas contas são lidas.
export async function usrsCadastrados() {
  const maquinas = await Maquina.findAll({
    where: { machinePayUsrId: { [Op.ne]: null } },
    attributes: ["machinePayUsrId"],
    raw: true,
  });
  return [
    ...new Set([
      ...usrsDoEnv(),
      ...maquinas.map((m) => String(m.machinePayUsrId).trim()).filter(Boolean),
    ]),
  ];
}

// POS IDs das máquinas cadastradas no sistema. Como no Agarramais, só esses
// leitores entram: as contas lidas podem ter leitores de outros clientes.
export async function posIdsCadastrados() {
  const maquinas = await Maquina.findAll({
    where: { machinePayPosId: { [Op.ne]: null } },
    attributes: ["machinePayPosId"],
    raw: true,
  });
  return [
    ...new Set(maquinas.map((m) => String(m.machinePayPosId).trim()).filter(Boolean)),
  ];
}

// Filtro de machine_pay_status: só leitores com POS ID cadastrado. Linhas antigas
// de outros leitores continuam no banco, mas nunca aparecem nem são usadas.
export async function whereMaquinasCadastradas() {
  return { posId: { [Op.in]: await posIdsCadastrados() } };
}

async function resolverContasMonitoradas() {
  const usrs = await usrsCadastrados();

  if (usrs.length) {
    await MachinePayConta.bulkCreate(
      usrs.map((usrId) => ({ usrId })),
      { ignoreDuplicates: true },
    );
  }

  return usrs;
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

  const usrs = await resolverContasMonitoradas();
  if (!usrs.length) {
    throw new MachinePayServiceError(
      400,
      "Nenhuma máquina do sistema tem o Usr ID da Machine Pay. Preencha o Usr ID em pelo menos uma máquina.",
    );
  }
  const posIdsDoSistema = new Set(await posIdsCadastrados());

  const leituras = [];
  const vistos = new Set();
  const caixasLivres = new Set();
  for (const usrId of usrs) {
    const html = await listarMaquinasCadastradas({ usrId });
    for (const leitura of parsearPainelMaquinas(html)) {
      if (vistos.has(leitura.posId)) continue;
      vistos.add(leitura.posId);
      // Só leitores de máquinas do sistema (a conta pode ter de outros clientes)
      if (!posIdsDoSistema.has(leitura.posId)) continue;
      if (ehCaixaLivre(leitura.nomePonto)) {
        caixasLivres.add(leitura.posId);
        continue;
      }
      leituras.push({ ...leitura, nomePonto: leitura.nomePonto?.slice(0, 255) || null });
    }
  }

  if (!leituras.length) {
    throw new MachinePayServiceError(
      502,
      "Nenhuma máquina cadastrada foi encontrada no painel Machine Pay (confira o POS ID e o Usr ID das máquinas, ou o layout mudou / a sessão expirou)",
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
