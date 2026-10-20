// Coleta periódica do status dos leitores Machine Pay (online/offline, quedas do dia,
// sinal). Desligue com MACHINE_PAY_MONITOR_ATIVO=false (ex: em desenvolvimento).
import cron from "node-cron";
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

const INTERVALO_MINUTOS = Math.min(
  Math.max(Number(process.env.MACHINE_PAY_MONITOR_INTERVALO_MIN) || 5, 1),
  59,
);

cron.schedule(`*/${INTERVALO_MINUTOS} * * * *`, async () => {
  if (!monitorLigado()) return;
  try {
    await coletarStatusMachinePay();
  } catch (error) {
    console.error("[MachinePay Monitor] Falha na coleta:", error.message);
  }
});

// Vendas por hora (página "Horários de pico"): lê do extrato os dias fechados que
// faltam. De hora em hora porque o histórico inicial é lido aos poucos.
cron.schedule("17 * * * *", async () => {
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
});

// Limpeza do histórico antigo: todo dia às 03:30
cron.schedule("30 3 * * *", async () => {
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
});

export const intervaloMonitorMinutos = INTERVALO_MINUTOS;
export default null;

