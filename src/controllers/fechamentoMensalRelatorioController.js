import { Op } from "sequelize";
import { FechamentoMensalRelatorio, Loja, Usuario } from "../models/index.js";

const toNumber = (valor) => Number(valor || 0);

const parseDateOnly = (textoData) => {
  const data = new Date(`${textoData}T00:00:00`);
  return Number.isNaN(data.getTime()) ? null : data;
};

const getUltimoDiaDoMes = (ano, mesZeroBased) =>
  new Date(ano, mesZeroBased + 1, 0).getDate();

const ehPeriodoMensalCompleto = (inicio, fim) => {
  if (!inicio || !fim) return false;
  if (
    inicio.getFullYear() !== fim.getFullYear() ||
    inicio.getMonth() !== fim.getMonth()
  ) {
    return false;
  }

  const ultimoDia = getUltimoDiaDoMes(inicio.getFullYear(), inicio.getMonth());
  return inicio.getDate() === 1 && fim.getDate() === ultimoDia;
};

const periodoJaEncerrado = (fim) => {
  if (!fim) return false;
  const fimDia = new Date(
    fim.getFullYear(),
    fim.getMonth(),
    fim.getDate(),
    23,
    59,
    59,
    999,
  );
  return new Date().getTime() > fimDia.getTime();
};

const extrairValorFichas = (relatorio) => {
  const valorDireto = toNumber(
    relatorio?.totais?.valorFichasTotal ?? relatorio?.totais?.valorFichas,
  );

  if (valorDireto > 0) return valorDireto;

  const totalFichas = toNumber(relatorio?.totais?.fichas);
  const valorFichaPadrao = toNumber(relatorio?.loja?.valorFichaPadrao || 2.5);
  return totalFichas * (valorFichaPadrao > 0 ? valorFichaPadrao : 2.5);
};

const extrairMaquinas = (relatorio) =>
  Array.isArray(relatorio?.maquinas) ? relatorio.maquinas : [];

const extrairTotais = (relatorio) => relatorio?.totais || {};

const normalizarGastosFixosDetalhados = (gastosFixosDetalhados) => {
  if (!Array.isArray(gastosFixosDetalhados)) return [];
  return gastosFixosDetalhados
    .map((item) => ({
      id: item?.id || null,
      nome: String(item?.nome || "").trim(),
      valor: toNumber(item?.valor),
    }))
    .filter((item) => item.nome && item.valor > 0);
};

export const criarFechamentoMensalRelatorio = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim, relatorio, gastosFixosDetalhados } =
      req.body;

    if (!lojaId || !dataInicio || !dataFim || !relatorio) {
      return res.status(400).json({
        error:
          "lojaId, dataInicio, dataFim e relatorio são obrigatórios para fechar o mês.",
      });
    }

    const inicio = parseDateOnly(dataInicio);
    const fim = parseDateOnly(dataFim);

    if (!inicio || !fim) {
      return res.status(400).json({ error: "Período inválido." });
    }

    if (!ehPeriodoMensalCompleto(inicio, fim)) {
      return res.status(400).json({
        error:
          "Fechamento só pode ser feito com período mensal completo (do dia 1 até o último dia do mês).",
      });
    }

    if (!periodoJaEncerrado(fim)) {
      return res.status(400).json({
        error:
          "Fechamento só pode ser feito após o fim do período selecionado.",
      });
    }

    const loja = await Loja.findByPk(lojaId);
    if (!loja) {
      return res.status(404).json({ error: "Loja não encontrada." });
    }

    const ano = inicio.getFullYear();
    const mes = inicio.getMonth() + 1;
    const totais = extrairTotais(relatorio);
    const maquinas = extrairMaquinas(relatorio);

    const valorMaquinasDinheiroBruto =
      totais.valorDinheiroMaquinas !== undefined &&
      totais.valorDinheiroMaquinas !== null
        ? toNumber(totais.valorDinheiroMaquinas)
        : maquinas.reduce((acc, m) => acc + toNumber(m?.totais?.dinheiro), 0);

    const valorMaquinasCartaoPixBruto =
      totais.valorCartaoPixMaquinasBruto !== undefined &&
      totais.valorCartaoPixMaquinasBruto !== null
        ? toNumber(totais.valorCartaoPixMaquinasBruto)
        : maquinas.reduce((acc, m) => acc + toNumber(m?.totais?.cartaoPix), 0);

    const valorMaquinasCartaoPixLiquido =
      totais.valorLiquidoMaquinas !== undefined &&
      totais.valorLiquidoMaquinas !== null
        ? toNumber(totais.valorLiquidoMaquinas)
        : maquinas.reduce(
            (acc, m) => acc + toNumber(m?.totais?.cartaoPixLiquido),
            0,
          );

    const valorTrocadoraDinheiroBruto = toNumber(totais.valorDinheiroLoja);
    const valorTrocadoraCartaoPixBruto = toNumber(totais.valorCartaoPixLoja);
    const valorTrocadoraCartaoPixLiquido = toNumber(
      totais.valorCartaoPixLiquidoLoja,
    );

    const valorBrutoConsolidado =
      totais.valorBrutoConsolidadoLojaMaquinas !== undefined &&
      totais.valorBrutoConsolidadoLojaMaquinas !== null
        ? toNumber(totais.valorBrutoConsolidadoLojaMaquinas)
        : valorTrocadoraDinheiroBruto +
          valorTrocadoraCartaoPixBruto +
          valorMaquinasDinheiroBruto +
          valorMaquinasCartaoPixBruto;

    const valorLiquidoConsolidado =
      totais.valorLiquidoConsolidadoLojaMaquinas !== undefined &&
      totais.valorLiquidoConsolidadoLojaMaquinas !== null
        ? toNumber(totais.valorLiquidoConsolidadoLojaMaquinas)
        : valorTrocadoraDinheiroBruto +
          valorTrocadoraCartaoPixLiquido +
          valorMaquinasDinheiroBruto +
          valorMaquinasCartaoPixLiquido -
          toNumber(totais.gastoTotalPeriodo);

    const payloadPersistencia = {
      lojaId,
      ano,
      mes,
      dataInicio,
      dataFim,
      fichasQuantidade: parseInt(totais.fichas || 0, 10) || 0,
      valorFichas: extrairValorFichas(relatorio),
      valorTrocadoraDinheiroBruto,
      valorTrocadoraCartaoPixBruto,
      valorTrocadoraCartaoPixLiquido,
      valorMaquinasDinheiroBruto,
      valorMaquinasCartaoPixBruto,
      valorMaquinasCartaoPixLiquido,
      valorBrutoConsolidado,
      valorLiquidoConsolidado,
      taxaCartaoPercentualMedia: toNumber(totais.percentualTaxaCartaoMedia),
      taxaCartaoValor: toNumber(totais.taxaDeCartao),
      produtosEntraram: parseInt(totais.produtosEntraram || 0, 10) || 0,
      produtosSairam: parseInt(totais.produtosSairam || 0, 10) || 0,
      gastoVariavelTotal: toNumber(totais.gastoVariavelTotalPeriodo),
      gastoFixoTotal: toNumber(totais.gastoFixoTotalPeriodo),
      gastoProdutosTotal: toNumber(totais.gastoProdutosTotalPeriodo),
      gastoTotal: toNumber(totais.gastoTotalPeriodo),
      ticketPorPremioTotal: toNumber(totais.ticketPorPremioTotal),
      gastosFixosDetalhados: normalizarGastosFixosDetalhados(
        gastosFixosDetalhados,
      ),
      maquinasDetalhes: maquinas,
      totaisRaw: totais,
      fechadoPorUsuarioId: req.usuario.id,
      fechadoEm: new Date(),
    };

    let fechamento = await FechamentoMensalRelatorio.findOne({
      where: { lojaId, ano, mes },
    });

    if (fechamento) {
      return res.status(409).json({
        error:
          "Já existe fechamento para esta loja nesse mês. Exclua ou consulte o fechamento existente.",
        fechamentoId: fechamento.id,
      });
    }

    fechamento = await FechamentoMensalRelatorio.create(payloadPersistencia);

    return res.status(201).json(fechamento);
  } catch (error) {
    console.error("Erro ao criar fechamento mensal do relatório:", error);
    return res.status(500).json({
      error: "Erro ao criar fechamento mensal do relatório",
      message: error.message,
    });
  }
};

export const listarFechamentosMensaisRelatorio = async (req, res) => {
  try {
    const { lojaId, ano, mes, dataInicio, dataFim } = req.query;
    const where = {};

    if (lojaId) where.lojaId = lojaId;
    if (ano) where.ano = Number(ano);
    if (mes) where.mes = Number(mes);

    if (dataInicio || dataFim) {
      where.dataFim = {};
      if (dataInicio) where.dataFim[Op.gte] = dataInicio;
      if (dataFim) where.dataFim[Op.lte] = dataFim;
    }

    const fechamentos = await FechamentoMensalRelatorio.findAll({
      where,
      order: [
        ["ano", "DESC"],
        ["mes", "DESC"],
      ],
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
        {
          model: Usuario,
          as: "fechadoPor",
          attributes: ["id", "nome", "email"],
        },
      ],
    });

    return res.json({
      total: fechamentos.length,
      fechamentos,
    });
  } catch (error) {
    console.error("Erro ao listar fechamentos mensais do relatório:", error);
    return res.status(500).json({
      error: "Erro ao listar fechamentos mensais do relatório",
      message: error.message,
    });
  }
};

export const obterFechamentoMensalRelatorio = async (req, res) => {
  try {
    const fechamento = await FechamentoMensalRelatorio.findByPk(req.params.id, {
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
        {
          model: Usuario,
          as: "fechadoPor",
          attributes: ["id", "nome", "email"],
        },
      ],
    });

    if (!fechamento) {
      return res
        .status(404)
        .json({ error: "Fechamento mensal do relatório não encontrado." });
    }

    return res.json(fechamento);
  } catch (error) {
    console.error("Erro ao obter fechamento mensal do relatório:", error);
    return res.status(500).json({
      error: "Erro ao obter fechamento mensal do relatório",
      message: error.message,
    });
  }
};
