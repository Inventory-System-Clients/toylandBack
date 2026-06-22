import { GastoFixoLoja, GastoTotalFixoLoja } from "../models/index.js";
import { sequelize } from "../database/connection.js";
import { Op } from "sequelize";

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

const consolidarGastosFixosPorNome = (gastos) => {
  const mapa = new Map();

  for (const gasto of gastos) {
    const chave = normalizarNomeGasto(gasto?.nome);
    if (!chave) continue;
    mapa.set(chave, gasto);
  }

  return Array.from(mapa.values());
};

const calcularValorMensalDoGasto = (gasto) => {
  const valor = Number(gasto?.valor || 0);

  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor;
};

const calcularTotalFixoLoja = async (lojaId, transaction) => {
  const gastos = await GastoFixoLoja.findAll({
    where: { lojaId },
    attributes: ["id", "nome", "valor"],
    order: [["id", "ASC"]],
    raw: true,
    transaction,
  });

  const gastosConsolidados = consolidarGastosFixosPorNome(gastos);

  const total = gastosConsolidados.reduce(
    (acc, item) => acc + calcularValorMensalDoGasto(item),
    0,
  );

  return Number(total.toFixed(2));
};

export const getGastosFixos = async (req, res) => {
  try {
    const { lojaId } = req.params;
    const gastos = await GastoFixoLoja.findAll({
      where: { lojaId },
      order: [["nome", "ASC"]],
    });
    res.json(gastos);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao buscar gastos fixos", details: err.message });
  }
};

export const saveGastosFixos = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { lojaId } = req.params;
    const { gastos } = req.body;

    if (!Array.isArray(gastos)) {
      await transaction.rollback();
      return res.status(400).json({ error: "Gastos inválidos" });
    }

    const nomesRecebidos = [];

    for (const gasto of gastos) {
      const nome = normalizarNomeParaPersistencia(gasto.nome);
      if (!nome) continue;

      nomesRecebidos.push(nome);

      await GastoFixoLoja.upsert(
        {
          lojaId,
          nome,
          valor: Number(gasto.valor || 0),
          observacao: gasto.observacao || null,
        },
        { transaction },
      );
    }

    if (nomesRecebidos.length > 0) {
      await GastoFixoLoja.destroy({
        where: {
          lojaId,
          nome: { [Op.notIn]: nomesRecebidos },
        },
        transaction,
      });
    }

    const gastosAtuais = await GastoFixoLoja.findAll({
      where: { lojaId },
      attributes: ["id", "nome"],
      order: [["id", "DESC"]],
      raw: true,
      transaction,
    });

    const nomesJaVistos = new Set();
    const idsParaRemover = [];

    for (const item of gastosAtuais) {
      const chave = normalizarNomeGasto(item.nome);
      if (!chave) {
        idsParaRemover.push(item.id);
        continue;
      }

      if (nomesJaVistos.has(chave)) {
        idsParaRemover.push(item.id);
        continue;
      }

      nomesJaVistos.add(chave);
    }

    if (idsParaRemover.length > 0) {
      await GastoFixoLoja.destroy({
        where: { id: { [Op.in]: idsParaRemover } },
        transaction,
      });
    }

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = agora.getMonth() + 1;
    const valorTotal = await calcularTotalFixoLoja(lojaId, transaction);

    await GastoTotalFixoLoja.upsert(
      {
        lojaId,
        ano,
        mes,
        valorTotal,
      },
      { transaction },
    );

    await transaction.commit();
    res.json({ success: true, ano, mes, valorTotal });
  } catch (err) {
    await transaction.rollback();
    res
      .status(500)
      .json({ error: "Erro ao salvar gastos fixos", details: err.message });
  }
};

export default {
  getGastosFixos,
  saveGastosFixos,
};
