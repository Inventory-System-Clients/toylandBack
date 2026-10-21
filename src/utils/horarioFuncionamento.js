// Horário de funcionamento do ponto onde a máquina fica. Formato salvo em
// maquinas.horario_funcionamento:
//   { "1": { "inicio": "10:00", "fim": "22:00" }, "6": { ... } }
// Chave = dia da semana (0 = domingo ... 6 = sábado). Dia ausente = ponto fechado
// o dia todo. null = horário não informado (máquina tratada como 24h).
// Se "fim" <= "inicio" o expediente vira a noite (ex: 18:00 → 02:00).

const FUSO_HORARIO = "America/Sao_Paulo";
const REGEX_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DIAS_SEMANA = ["0", "1", "2", "3", "4", "5", "6"];

const minutosDoDia = (hora) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
};

// Valida e limpa o que veio do formulário. Retorna { valor } ou { erro }.
export const normalizarHorarioFuncionamento = (entrada) => {
  if (entrada === null || entrada === undefined || entrada === "") {
    return { valor: null };
  }
  if (typeof entrada !== "object" || Array.isArray(entrada)) {
    return { erro: "Horário de funcionamento inválido" };
  }

  const valor = {};
  for (const [dia, faixa] of Object.entries(entrada)) {
    if (!DIAS_SEMANA.includes(dia)) {
      return { erro: `Dia da semana inválido no horário de funcionamento: ${dia}` };
    }
    if (!faixa) continue;
    const { inicio, fim } = faixa;
    if (!REGEX_HORA.test(inicio || "") || !REGEX_HORA.test(fim || "")) {
      return { erro: "Informe abertura e fechamento no formato HH:MM para cada dia marcado" };
    }
    valor[dia] = { inicio, fim };
  }

  if (!Object.keys(valor).length) {
    return { erro: "Marque pelo menos um dia de funcionamento ou deixe o ponto como 24h" };
  }
  return { valor };
};

// Dia da semana (0-6) e minuto do dia no horário de Brasília.
const agoraBrasil = (data) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO_HORARIO,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(data)
      .map((p) => [p.type, p.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday);
  return { dia, minuto: Number(partes.hour) * 60 + Number(partes.minute) };
};

// true = ponto aberto (ou sem horário cadastrado) no instante informado.
export const pontoAberto = (horario, data = new Date()) => {
  if (!horario || typeof horario !== "object" || !Object.keys(horario).length) {
    return true;
  }
  const { dia, minuto } = agoraBrasil(data);

  const hoje = horario[String(dia)];
  if (hoje) {
    const inicio = minutosDoDia(hoje.inicio);
    const fim = minutosDoDia(hoje.fim);
    if (fim > inicio ? minuto >= inicio && minuto < fim : minuto >= inicio) return true;
  }

  // Expediente de ontem que atravessou a meia-noite
  const ontem = horario[String((dia + 6) % 7)];
  if (ontem) {
    const inicio = minutosDoDia(ontem.inicio);
    const fim = minutosDoDia(ontem.fim);
    if (fim <= inicio && minuto < fim) return true;
  }

  return false;
};
