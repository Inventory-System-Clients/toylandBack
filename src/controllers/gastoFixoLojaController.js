import { Op } from "sequelize";
import {
  GastoFixoLoja,
  GastoFixoLojaMensal,
  GastoTotalFixoLoja,
} from "../models/index.js";
import { sequelize } from "../database/connection.js";
import {
  calcularTotalGastosFixosMes,
  mesAnterior,
  resolverGastosFixosDoMes,
} from "../services/gastoFixoMensalService.js";

const ALCANCES_VALIDOS = new Set([
  "somente_mes",
  "deste_mes_em_diante",
  "mes_anterior_e_seguintes",
]);

const normalizarNomeGasto = (nomeOriginal) =>
  String(nomeOriginal || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const normalizarNomeParaPersistencia = (nomeOriginal) => {
  const nome = String(nomeOriginal || "").trim();
  const chave = normalizarNomeGasto(nome);

  if (
    chave === "alugel dobrado ultimo mes (12x)" ||
    chave === "aluguel dobrado ultimo mes (12x)" ||
    chave === "alugel dobrado ultimo mes" ||
    chave === "aluguel dobrado ultimo mes"
  ) {
    return "Aluguel dobrado último mês";
  }

  return nome;
};

const obterMesReferencia = (origem = {}) => {
  const agora = new Date();
  const ano = Number(origem.ano || agora.getFullYear());
  const mes = Number(origem.mes || agora.getMonth() + 1);

  if (
    !Number.isInteger(ano) ||
    ano < 2000 ||
    ano > 2200 ||
    !Number.isInteger(mes) ||
    mes < 1 ||
    mes > 12
  ) {
    return null;
  }

  return { ano, mes };
};

const consolidarGastosRecebidos = (gastos) => {
  const mapa = new Map();

  for (const gasto of gastos) {
    const nome = normalizarNomeParaPersistencia(gasto?.nome);
    const chave = normalizarNomeGasto(nome);
    if (!chave) continue;

    const valor = Number(gasto?.valor || 0);
    mapa.set(chave, {
      nome,
      valor: Number.isFinite(valor) ? valor : 0,
      observacao: String(gasto?.observacao || "").trim() || null,
    });
  }

  return mapa;
};

const atualizarTotalMensal = async (lojaId, ano, mes, transaction) => {
  const valorTotal = await calcularTotalGastosFixosMes(lojaId, ano, mes, {
    transaction,
  });

  await GastoTotalFixoLoja.upsert(
    { lojaId, ano, mes, valorTotal },
    { transaction },
  );

  return valorTotal;
};

export const getGastosFixos = async (req, res) => {
  try {
    const { lojaId } = req.params;
    const referencia = obterMesReferencia(req.query);

    if (!referencia) {
      return res.status(400).json({ error: "Mês de referência inválido" });
    }

    const gastos = await resolverGastosFixosDoMes(
      lojaId,
      referencia.ano,
      referencia.mes,
    );

    return res.json(gastos);
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Erro ao buscar gastos fixos", details: err.message });
  }
};

export const saveGastosFixos = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { lojaId } = req.params;
    const { gastos } = req.body;
    const referencia = obterMesReferencia(req.body);
    const alcance = ALCANCES_VALIDOS.has(req.body?.alcance)
      ? req.body.alcance
      : "deste_mes_em_diante";

    if (!Array.isArray(gastos)) {
      await transaction.rollback();
      return res.status(400).json({ error: "Gastos inválidos" });
    }

    if (!referencia) {
      await transaction.rollback();
      return res.status(400).json({ error: "Mês de referência inválido" });
    }

    const recebidos = consolidarGastosRecebidos(gastos);
    const propagar = alcance !== "somente_mes";
    const inicioVigencia =
      alcance === "mes_anterior_e_seguintes"
        ? mesAnterior(referencia.ano, referencia.mes)
        : referencia;

    const [gastosNoMesSelecionado, gastosNoInicio, quantidadeBase] =
      await Promise.all([
        resolverGastosFixosDoMes(lojaId, referencia.ano, referencia.mes, {
          transaction,
        }),
        resolverGastosFixosDoMes(
          lojaId,
          inicioVigencia.ano,
          inicioVigencia.mes,
          { transaction },
        ),
        GastoFixoLoja.count({ where: { lojaId }, transaction }),
      ]);

    // Mantém a tabela antiga somente como configuração inicial/fallback.
    if (quantidadeBase === 0) {
      for (const gasto of recebidos.values()) {
        await GastoFixoLoja.create(
          { lojaId, ...gasto },
          { transaction },
        );
      }
    }

    const nomesAfetados = new Map();
    for (const gasto of [...gastosNoMesSelecionado, ...gastosNoInicio]) {
      nomesAfetados.set(normalizarNomeGasto(gasto.nome), gasto.nome);
    }
    for (const [chave, gasto] of recebidos) {
      nomesAfetados.set(chave, gasto.nome);
    }

    for (const [chave, nomeAnterior] of nomesAfetados) {
      const gasto = recebidos.get(chave);
      const nome = gasto?.nome || nomeAnterior;

      await GastoFixoLojaMensal.upsert(
        {
          lojaId,
          nome,
          ano: inicioVigencia.ano,
          mes: inicioVigencia.mes,
          valor: gasto?.valor || 0,
          observacao: gasto?.observacao || null,
          propagar,
          ativo: Boolean(gasto),
        },
        { transaction },
      );
    }

    // Remove duplicidades exatas antigas no mesmo mês, sem apagar o histórico.
    const versoesDoMes = await GastoFixoLojaMensal.findAll({
      where: {
        lojaId,
        ano: inicioVigencia.ano,
        mes: inicioVigencia.mes,
        propagar,
      },
      order: [["id", "DESC"]],
      transaction,
    });
    const vistos = new Set();
    const idsDuplicados = [];
    for (const item of versoesDoMes) {
      const chave = normalizarNomeGasto(item.nome);
      if (vistos.has(chave)) idsDuplicados.push(item.id);
      else vistos.add(chave);
    }
    if (idsDuplicados.length) {
      await GastoFixoLojaMensal.destroy({
        where: { id: { [Op.in]: idsDuplicados } },
        transaction,
      });
    }

    const valorTotal = await atualizarTotalMensal(
      lojaId,
      referencia.ano,
      referencia.mes,
      transaction,
    );

    if (
      inicioVigencia.ano !== referencia.ano ||
      inicioVigencia.mes !== referencia.mes
    ) {
      await atualizarTotalMensal(
        lojaId,
        inicioVigencia.ano,
        inicioVigencia.mes,
        transaction,
      );
    }

    await transaction.commit();
    return res.json({
      success: true,
      ano: referencia.ano,
      mes: referencia.mes,
      alcance,
      inicioVigencia,
      valorTotal,
    });
  } catch (err) {
    await transaction.rollback();
    return res
      .status(500)
      .json({ error: "Erro ao salvar gastos fixos", details: err.message });
  }
};

export default {
  getGastosFixos,
  saveGastosFixos,
};
