import { Op } from "sequelize";
import RegistroDinheiro from "../models/RegistroDinheiro.js";

async function getDashboardGraficos(req, res) {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    // Validação básica
    if (!dataInicio || !dataFim) {
      return res.status(400).json({ error: "dataInicio e dataFim são obrigatórios." });
    }

    // Filtro base por período
    const where = {
      // ajuste o campo de data conforme seu modelo — createdAt, dataRegistro, etc.
      createdAt: {
        [Op.between]: [
          new Date(`${dataInicio}T00:00:00`),
          new Date(`${dataFim}T23:59:59`),
        ],
      },
    };

    // Filtro opcional por loja
    if (lojaId && lojaId !== "__TODAS_AS_LOJAS__") {
      where.lojaId = lojaId;
    }

    const registros = await RegistroDinheiro.findAll({ where });

    // Agregação por loja
    const totaisPorLoja = {};
    registros.forEach((reg) => {
      const id = reg.lojaId || "SEM_LOJA";
      if (!totaisPorLoja[id]) {
        totaisPorLoja[id] = {
          lojaId: id,
          dinheiro: 0,
          cartaoPix: 0,
          cartaoPixLiquido: 0,
          taxaDeCartao: 0,
          _somaTaxaCartao: 0,   // acumulador para média ponderada
          _countTaxa: 0,
          gastoFixo: 0,
          gastoVariavel: 0,
          gastoProdutos: 0,
          gastoTotal: 0,
          fichas: 0,
          saidas: 0,
        };
      }

      const t = totaisPorLoja[id];
      t.dinheiro           += Number(reg.valorDinheiro || 0);
      t.cartaoPix          += Number(reg.valorCartaoPix || 0);
      t.cartaoPixLiquido   += Number(reg.valorCartaoPixLiquido || 0);
      t.taxaDeCartao       += Number(reg.taxaDeCartao || 0);
      t.gastoFixo          += Number(reg.gastoFixoPeriodo || 0);
      t.gastoVariavel      += Number(reg.gastoVariavelPeriodo || 0);
      t.gastoProdutos      += Number(reg.gastoProdutosPeriodo || 0);
      t.gastoTotal         += Number(reg.gastoTotalPeriodo || 0);
      t.fichas             += Number(reg.fichas || 0);
      t.saidas             += Number(reg.saidas || 0);

      // Acumula para média ponderada da taxa de cartão
      if (Number(reg.percentualTaxaCartaoMedia || 0) > 0) {
        t._somaTaxaCartao += Number(reg.percentualTaxaCartaoMedia);
        t._countTaxa      += 1;
      }
    });

    // Calcula média ponderada e remove campos auxiliares
    Object.values(totaisPorLoja).forEach((loja) => {
      loja.percentualTaxaCartaoMedia =
        loja._countTaxa > 0 ? loja._somaTaxaCartao / loja._countTaxa : 0;
      delete loja._somaTaxaCartao;
      delete loja._countTaxa;
    });

    // Agrega totais gerais
    const totaisGerais = Object.values(totaisPorLoja).reduce(
      (acc, loja) => {
        acc.dinheiro         += loja.dinheiro;
        acc.cartaoPix        += loja.cartaoPix;
        acc.cartaoPixLiquido += loja.cartaoPixLiquido;
        acc.taxaDeCartao     += loja.taxaDeCartao;
        acc.gastoFixo        += loja.gastoFixo;
        acc.gastoVariavel    += loja.gastoVariavel;
        acc.gastoProdutos    += loja.gastoProdutos;
        acc.gastoTotal       += loja.gastoTotal;
        acc.fichas           += loja.fichas;
        acc.saidas           += loja.saidas;
        acc._somaTaxa        += loja.percentualTaxaCartaoMedia;
        acc._countTaxa       += 1;
        return acc;
      },
      {
        dinheiro: 0, cartaoPix: 0, cartaoPixLiquido: 0,
        taxaDeCartao: 0, gastoFixo: 0, gastoVariavel: 0,
        gastoProdutos: 0, gastoTotal: 0, fichas: 0, saidas: 0,
        _somaTaxa: 0, _countTaxa: 0,
      },
    );

    totaisGerais.percentualTaxaCartaoMedia =
      totaisGerais._countTaxa > 0
        ? totaisGerais._somaTaxa / totaisGerais._countTaxa
        : 0;
    delete totaisGerais._somaTaxa;
    delete totaisGerais._countTaxa;

    res.json({ totaisPorLoja, totaisGerais });
  } catch (err) {
    console.error("[getDashboardGraficos] Erro:", err);
    res.status(500).json({
      error: "Erro ao gerar dados dos gráficos",
      details: err.message,
    });
  }
}

export { getDashboardGraficos };