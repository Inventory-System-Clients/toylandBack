// Coleta periódica do status dos leitores Machine Pay (página "Machine Pay detalhado"):
// online/offline, quedas do dia, sinal. Desligue com MACHINE_PAY_MONITOR_ATIVO=false
// (ex: em desenvolvimento). Os timers só começam com iniciarJobsMachinePayMonitor().
import {
  coletarStatusMachinePay,
  limparHistoricoAntigo,
  monitorConfigurado,
} from "../services/machinePayMonitorService.js";
import {
  limparVendasHoraAntigas,
  sincronizarVendasPorHora,
} from "../services/machinePayVendasHoraService.js";

const monitorLigado = () =>
  process.env.MACHINE_PAY_MONITOR_ATIVO !== "false" && monitorConfigurado();

export const intervaloMonitorMinutos = Math.min(
  Math.max(Number(process.env.MACHINE_PAY_MONITOR_INTERVALO_MIN) || 5, 1),
  59,
);

const HORA_MS = 60 * 60 * 1000;

const coletar = async () => {
  if (!monitorLigado()) return;
  try {
    await coletarStatusMachinePay();
  } catch (error) {
    console.error("[MachinePay Monitor] Falha na coleta:", error.message);
  }
};

// Vendas por hora (página "Horários de pico"): lê do extrato os dias fechados que
// faltam. De hora em hora porque o histórico inicial é lido aos poucos.
const sincronizarVendas = async () => {
  if (!monitorLigado()) return;
  try {
    const resultado = await sincronizarVendasPorHora();
    if (resultado?.consultas) {
      console.log(
        `[MachinePay Vendas/hora] ${resultado.dias} dia(s) lidos em ${resultado.consultas} consulta(s), ${resultado.falhas} falha(s), ${resultado.restantes} pendente(s)`,
      );
    }
  } catch (error) {
    console.error("[MachinePay Vendas/hora] Falha:", error.message);
  }
};

// Limpeza do histórico antigo: uma vez por dia
const limpar = async () => {
  if (!monitorLigado()) return;
  try {
    const { eventos, diarios } = await limparHistoricoAntigo();
    await limparVendasHoraAntigas();
    console.log(
      `[MachinePay Monitor] Histórico antigo removido: ${eventos} eventos, ${diarios} dias`,
    );
  } catch (error) {
    console.error("[MachinePay Monitor] Falha na limpeza:", error.message);
  }
};

let iniciado = false;

export const iniciarJobsMachinePayMonitor = () => {
  if (iniciado) return;
  iniciado = true;
  setTimeout(coletar, 30 * 1000);
  setInterval(coletar, intervaloMonitorMinutos * 60 * 1000);
  setTimeout(sincronizarVendas, 2 * 60 * 1000);
  setInterval(sincronizarVendas, HORA_MS);
  setInterval(limpar, 24 * HORA_MS);
  console.log(
    `📡 Monitor Machine Pay detalhado: coleta a cada ${intervaloMonitorMinutos} min`,
  );
};
