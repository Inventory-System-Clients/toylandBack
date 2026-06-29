// Endpoint novo: ranking de lucro bruto das lojas
export const rankingLucroBrutoLojas = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }
    const lojas = await Loja.findAll({ where: { ativo: true }, raw: true });
    const respostas = await Promise.allSettled(
      lojas.map((loja) =>
        gerarRelatorioImpressaoPorLoja({
          lojaId: loja.id,
          dataInicio,
          dataFim,
        }),
      ),
    );
    const relatoriosPorLoja = respostas
      .map((resposta, index) => {
        if (resposta.status !== "fulfilled") return null;
        return {
          loja: lojas[index],
          dados: resposta.value,
        };
      })
      .filter(Boolean);
    if (!relatoriosPorLoja.length) {
      return res.status(404).json({
        error: "Não foi possível gerar o ranking para o período selecionado.",
      });
    }
    const rankingLojas = relatoriosPorLoja.map(({ loja, dados }) => {
      const totais = dados?.totais || {};
      const lucroBruto = Number(
        totais.valorBrutoConsolidadoLojaMaquinas ??
          Number(totais.valorDinheiroLoja || 0) +
            Number(totais.valorCartaoPixLoja || 0) +
            Number(totais.valorDinheiroMaquinas || 0) +
            Number(totais.valorCartaoPixMaquinasBruto || 0),
      );
      return {
        lojaId: loja?.id,
        lojaNome: dados?.loja?.nome || loja?.nome || "Loja",
        lucroBruto,
      };
    });
    const rankingLucroBrutoLojas = [...rankingLojas]
      .sort((a, b) => b.lucroBruto - a.lucroBruto)
      .slice(0, 10);
    return res.json({ rankingLucroBrutoLojas });
  } catch (error) {
    console.error("Erro ao gerar ranking de lucro bruto:", error);
    return res.status(500).json({
      error: "Erro ao gerar ranking de lucro bruto",
      message: error.message,
    });
  }
};
// src/controllers/relatorioController.js
import {
  Sequelize,
  Op,
  fn,
  col,
  cast,
  where as sequelizeWhere,
} from "sequelize";
import {
  Movimentacao,
  MovimentacaoProduto,
  Maquina,
  Loja,
  Produto,
  Usuario,
  AlertaIgnorado,
  RegistroDinheiro,
  Sangria,
  GastoVariavel,
  GastoFixoLoja,
  GastoTotalFixoLoja,
} from "../models/index.js";
import { calcularTotalGastosFixosMes } from "../services/gastoFixoMensalService.js";
import { consultarFechamentoMachinePay } from "../services/machinePayService.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VALOR_FICHA_PADRAO_DEFAULT = 2.5;

const formatarDataMovimentacao = (valor) => {
  if (!valor) return null;

  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;

  return data.toISOString();
};

const montarMetadadosMovimentacao = (movimentacao) => ({
  usuarioId: movimentacao?.usuario?.id ?? movimentacao?.usuarioId ?? null,
  usuarioNome:
    movimentacao?.usuario?.nome ??
    movimentacao?.usuario?.email ??
    (movimentacao?.usuarioId ? `ID ${movimentacao.usuarioId}` : null),
  dataMovimentacao: formatarDataMovimentacao(
    movimentacao?.dataColeta ?? movimentacao?.createdAt,
  ),
});

const formatarDataMachinePay = (data) => {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  const hora = String(data.getHours()).padStart(2, "0");
  const minuto = String(data.getMinutes()).padStart(2, "0");
  return `${ano}-${mes}-${dia} ${hora}:${minuto}`;
};

const normalizarNomeGasto = (nomeOriginal) =>
  String(nomeOriginal || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const consolidarGastosFixosPorNome = (gastos) => {
  const mapa = new Map();

  for (const gasto of gastos) {
    const chave = normalizarNomeGasto(gasto?.nome);
    if (!chave) continue;
    mapa.set(chave, gasto);
  }

  return Array.from(mapa.values());
};

const calcularValorMensalDoGastoFixo = (gasto) => {
  const valor = Number(gasto?.valor || 0);

  if (!Number.isFinite(valor) || valor <= 0) return 0;
  return valor;
};

const diasNoMes = (ano, mes) => new Date(ano, mes, 0).getDate();

const inicioDoDia = (data) =>
  new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);

const fimDoDia = (data) =>
  new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate(),
    23,
    59,
    59,
    999,
  );

const listaMesesNoIntervalo = (inicio, fim) => {
  const meses = [];
  const cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = new Date(fim.getFullYear(), fim.getMonth(), 1);

  while (cursor <= limite) {
    meses.push({ ano: cursor.getFullYear(), mes: cursor.getMonth() + 1 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return meses;
};

const calcularTotalFixoAtualDaLoja = async (lojaId) => {
  const gastosFixos = await GastoFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
    },
    attributes: ["id", "nome", "valor"],
    order: [["id", "ASC"]],
    raw: true,
  });

  const gastosConsolidados = consolidarGastosFixosPorNome(gastosFixos);

  const total = gastosConsolidados.reduce(
    (acc, item) => acc + calcularValorMensalDoGastoFixo(item),
    0,
  );

  return Number(total.toFixed(2));
};

const obterTotaisFixosMensaisLegado = async (lojaId, mesesIntervalo) => {
  if (!mesesIntervalo.length) return new Map();

  const totaisMensais = await GastoTotalFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
      [Op.or]: mesesIntervalo.map((m) => ({ ano: m.ano, mes: m.mes })),
    },
    raw: true,
  });

  const mapaTotais = new Map(
    totaisMensais.map((item) => [
      `${item.ano}-${String(item.mes).padStart(2, "0")}`,
      Number(item.valorTotal || 0),
    ]),
  );

  const totalAtual = await calcularTotalFixoAtualDaLoja(lojaId);

  for (const item of mesesIntervalo) {
    const chave = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
    const valorSalvo = Number(mapaTotais.get(chave) || 0);
    const mudou =
      !mapaTotais.has(chave) || Math.abs(valorSalvo - totalAtual) > 0.009;

    if (mudou) {
      try {
        await GastoTotalFixoLoja.upsert({
          lojaId,
          ano: item.ano,
          mes: item.mes,
          valorTotal: totalAtual,
        });
      } catch (error) {
        console.warn(
          "[Relatorio] Falha ao persistir total fixo mensal, seguindo com cálculo em memória:",
          error.message,
        );
      }
    }

    mapaTotais.set(chave, totalAtual);
  }

  return mapaTotais;
};

const obterTotaisFixosMensais = async (lojaId, mesesIntervalo) => {
  const mapaTotais = new Map();

  for (const { ano, mes } of mesesIntervalo) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    const valorTotal = await calcularTotalGastosFixosMes(lojaId, ano, mes);

    try {
      await GastoTotalFixoLoja.upsert({
        lojaId,
        ano,
        mes,
        valorTotal,
      });
    } catch (error) {
      console.warn(
        "[Relatorio] Falha ao persistir o total fixo mensal:",
        error.message,
      );
    }

    mapaTotais.set(chave, valorTotal);
  }

  return mapaTotais;
};

const calcularGastoFixoProporcionalPeriodo = async (lojaId, inicio, fim) => {
  const mesesIntervalo = listaMesesNoIntervalo(inicio, fim);
  const totaisPorMes = await obterTotaisFixosMensais(lojaId, mesesIntervalo);

  let totalProporcional = 0;

  for (const { ano, mes } of mesesIntervalo) {
    const chave = `${ano}-${String(mes).padStart(2, "0")}`;
    const valorMensal = Number(totaisPorMes.get(chave) || 0);
    if (valorMensal <= 0) continue;

    const inicioMes = inicioDoDia(new Date(ano, mes - 1, 1));
    const fimMes = fimDoDia(new Date(ano, mes, 0));

    const inicioAplicado = inicio > inicioMes ? inicio : inicioMes;
    const fimAplicado = fim < fimMes ? fim : fimMes;

    if (inicioAplicado > fimAplicado) continue;

    const diasDoPeriodoNoMes =
      Math.floor(
        (inicioDoDia(fimAplicado).getTime() -
          inicioDoDia(inicioAplicado).getTime()) /
          DAY_IN_MS,
      ) + 1;

    totalProporcional +=
      (valorMensal / diasNoMes(ano, mes)) * diasDoPeriodoNoMes;
  }

  return Number(totalProporcional.toFixed(2));
};

const calcularGastoVariavelPeriodo = async (lojaId, inicio, fim) => {
  const total = await GastoVariavel.sum("valor", {
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId))],
      dataInicio: { [Op.lte]: fim },
      dataFim: { [Op.gte]: inicio },
    },
  });

  return Number(total || 0);
};

// --- DASHBOARD GERAL ---
export const dashboardRelatorio = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    // 1. Configuração de Datas
    const fim = dataFim ? new Date(`${dataFim}T23:59:59`) : new Date();
    const inicio = dataInicio
      ? new Date(`${dataInicio}T00:00:00`)
      : new Date(new Date().setDate(fim.getDate() - 30));

    // 2. Filtros
    const whereMovimentacao = {
      dataColeta: { [Op.between]: [inicio, fim] },
    };

    const whereMaquina = {};
    if (lojaId) whereMaquina.lojaId = lojaId;

    // --- QUERY 1: TOTAIS GERAIS ---
    const totaisRaw = await Movimentacao.findAll({
      attributes: [
        [fn("SUM", col("fichas")), "totalFichas"],
        [fn("SUM", col("sairam")), "totalSairam"],
        [fn("SUM", col("valorFaturado")), "faturamentoTotal"],
        [fn("SUM", col("quantidade_notas_entrada")), "dinheiro"],
        [fn("SUM", col("valor_entrada_maquininha_pix")), "pix"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: [],
        },
      ],
      where: whereMovimentacao,
      raw: true,
    });

    const totaisDados = totaisRaw[0] || {};
    const saidas = parseInt(totaisDados.totalSairam || 0);
    const fichas = parseInt(totaisDados.totalFichas || 0);
    const dinheiroMovimentacao = parseFloat(totaisDados.dinheiro || 0);
    const pixMovimentacao = parseFloat(totaisDados.pix || 0);

    const whereRegistroDinheiro = {
      inicio: { [Op.lte]: fim },
      fim: { [Op.gte]: inicio },
    };

    if (lojaId) {
      whereRegistroDinheiro[Op.and] = [
        sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId)),
      ];
    }

    const registrosDinheiro = await RegistroDinheiro.findAll({
      where: whereRegistroDinheiro,
      raw: true,
    });

    const dinheiroRegistro = registrosDinheiro.reduce(
      (acc, registro) => acc + Number(registro.valorDinheiro || 0),
      0,
    );

    const pixRegistro = registrosDinheiro.reduce((acc, registro) => {
      if (registro.valorPix !== undefined && registro.valorPix !== null) {
        return acc + Number(registro.valorPix || 0);
      }
      return acc;
    }, 0);

    const cartaoRegistro = registrosDinheiro.reduce((acc, registro) => {
      if (registro.valorCartao !== undefined && registro.valorCartao !== null) {
        return acc + Number(registro.valorCartao || 0);
      }
      if (
        registro.valorPix !== undefined &&
        registro.valorPix !== null &&
        registro.valorCartaoPix !== undefined &&
        registro.valorCartaoPix !== null
      ) {
        return (
          acc +
          Math.max(
            Number(registro.valorCartaoPix || 0) -
              Number(registro.valorPix || 0),
            0,
          )
        );
      }
      return acc + Number(registro.valorCartaoPix || 0);
    }, 0);

    const taxaDeCartao = Number(
      registrosDinheiro
        .reduce(
          (acc, registro) =>
            acc +
            Number(
              registro.taxaDeCartao ??
                registro.taxa_de_cartao ??
                Math.max(
                  Number(registro.valorCartao || registro.valorCartaoPix || 0) -
                    Number(
                      registro.valorCartaoLiquido ||
                        registro.valorCartaoPixLiquido ||
                        0,
                    ),
                  0,
                ),
            ),
          0,
        )
        .toFixed(2),
    );

    const dinheiro = Number(dinheiroRegistro.toFixed(2));
    const pix = Number(pixRegistro.toFixed(2));
    const cartao = Number(cartaoRegistro.toFixed(2));
    const faturamento = Number((dinheiro + pix + cartao).toFixed(2));

    const faturamentoPorDiaRegistros = new Map();
    registrosDinheiro.forEach((registro) => {
      const dataBase = registro.fim || registro.createdAt || registro.inicio;
      if (!dataBase) return;

      const chaveData = new Date(dataBase).toISOString().slice(0, 10);
      const valor =
        Number(registro.valorDinheiro || 0) +
        Number(registro.valorPix || 0) +
        (registro.valorCartao !== undefined && registro.valorCartao !== null
          ? Number(registro.valorCartao || 0)
          : Number(registro.valorCartaoPix || 0) -
            Number(registro.valorPix || 0));

      faturamentoPorDiaRegistros.set(
        chaveData,
        Number(faturamentoPorDiaRegistros.get(chaveData) || 0) + valor,
      );
    });

    if (lojaId && registrosDinheiro.length === 0) {
      // Mantém compatibilidade visual para loja sem fechamento novo ainda.
      // O card geral do dashboard fica zerado se não houver registro de dinheiro.
      const dinheiroFallback = dinheiroMovimentacao;
      const pixFallback = pixMovimentacao;
      if (dinheiroFallback > 0 || pixFallback > 0) {
        faturamentoPorDiaRegistros.clear();
      }
    }

    /*
    if (lojaId) {
      const registrosDinheiro = await RegistroDinheiro.findAll({
        where: {
          [Op.and]: [
            sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId)),
          ],
          inicio: { [Op.lte]: fim },
          fim: { [Op.gte]: inicio },
        },
        raw: true,
      });

      const registrosPreferidos = registrosDinheiro.filter(
        (registro) =>
          registro.registrarTotalLoja === true ||
          registro.registrar_total_loja === true,
      );

      const baseRegistros =
        registrosPreferidos.length > 0
          ? registrosPreferidos
          : registrosDinheiro;

      const dinheiroRegistro = baseRegistros.reduce(
        (acc, registro) => acc + Number(registro.valorDinheiro || 0),
        0,
      );

      const cartaoPixRegistro = baseRegistros.reduce(
        (acc, registro) => acc + Number(registro.valorCartaoPix || 0),
        0,
      );

      const taxaRegistro = baseRegistros.reduce(
        (acc, registro) =>
          acc +
          Number(
            registro.taxaDeCartao ??
              registro.taxa_de_cartao ??
              Math.max(
                Number(registro.valorCartaoPix || 0) -
                  Number(registro.valorCartaoPixLiquido || 0),
                0,
              ),
          ),
        0,
      );

      if (dinheiroRegistro > 0 || cartaoPixRegistro > 0) {
        dinheiro = dinheiroRegistro;
        pix = cartaoPixRegistro;
      }

      taxaDeCartao = Number(taxaRegistro.toFixed(2));
    }
    */

    // --- QUERY 2: CUSTO DE PRODUTOS (TOTAL E DIÁRIO) ---
    const itensVendidos = await MovimentacaoProduto.findAll({
      attributes: ["quantidadeSaiu"],
      include: [
        {
          model: Produto,
          as: "produto",
          attributes: ["id", "nome", "codigo", "emoji", "custoUnitario"],
        },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
    });

    const custoProdutosTotal = itensVendidos.reduce((acc, item) => {
      const qtd = item.quantidadeSaiu || 0;
      const custo = parseFloat(item.produto?.custoUnitario || 0);
      return acc + qtd * custo;
    }, 0);

    const itensVendidosPorDia = await MovimentacaoProduto.findAll({
      attributes: ["quantidadeSaiu"],
      include: [
        {
          model: Produto,
          as: "produto",
          attributes: ["custoUnitario"],
        },
        {
          model: Movimentacao,
          attributes: ["dataColeta"],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      raw: true,
      nest: true,
    });

    const custoProdutosPorDia = new Map();
    itensVendidosPorDia.forEach((item) => {
      const dataColeta = item.Movimentacao?.dataColeta;
      if (!dataColeta) return;

      const chaveData = new Date(dataColeta).toISOString().slice(0, 10);
      const qtd = Number(item.quantidadeSaiu || 0);
      const custoUnitario = Number(item.produto?.custoUnitario || 0);
      const custoItem = qtd * custoUnitario;

      custoProdutosPorDia.set(
        chaveData,
        Number(custoProdutosPorDia.get(chaveData) || 0) + custoItem,
      );
    });

    let custoFixoPeriodo = 0;
    let custoVariavelPeriodo = 0;
    if (lojaId) {
      custoFixoPeriodo = await calcularGastoFixoProporcionalPeriodo(
        lojaId,
        inicio,
        fim,
      );
      custoVariavelPeriodo = await calcularGastoVariavelPeriodo(
        lojaId,
        inicio,
        fim,
      );
    }

    const diasNoPeriodo =
      Math.floor(
        (inicioDoDia(fim).getTime() - inicioDoDia(inicio).getTime()) /
          DAY_IN_MS,
      ) + 1;
    const custoRateadoDiario =
      diasNoPeriodo > 0
        ? (Number(custoFixoPeriodo || 0) + Number(custoVariavelPeriodo || 0)) /
          diasNoPeriodo
        : 0;

    const custoTotal =
      Number(custoProdutosTotal || 0) +
      Number(custoFixoPeriodo || 0) +
      Number(custoVariavelPeriodo || 0) +
      Number(taxaDeCartao || 0);
    const lucro = faturamento - custoTotal;

    // --- QUERY 3: GRÁFICO FINANCEIRO ---
    const timelineRaw = await Movimentacao.findAll({
      attributes: [
        [fn("DATE", col("dataColeta")), "data"],
        [fn("SUM", col("valorFaturado")), "faturamento"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: [],
        },
      ],
      where: whereMovimentacao,
      group: [fn("DATE", col("dataColeta"))],
      order: [[fn("DATE", col("dataColeta")), "ASC"]],
      raw: true,
    });

    // --- QUERY 4: PERFORMANCE POR MÁQUINA ---
    const performanceRaw = await Movimentacao.findAll({
      attributes: [
        [col("maquina.nome"), "nome"],
        [fn("SUM", col("valorFaturado")), "faturamento"],
      ],
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: ["id", "nome", "capacidadePadrao"],
        },
      ],
      where: whereMovimentacao,
      group: ["maquina.id", "maquina.nome", "maquina.capacidadePadrao"],
      raw: true,
      nest: true,
    });

    const performanceMaquinas = await Promise.all(
      performanceRaw.map(async (p) => {
        const ultimaMov = await Movimentacao.findOne({
          where: { maquinaId: p.maquina.id },
          order: [["dataColeta", "DESC"]],
          attributes: ["totalPos"],
        });

        const estoqueAtual = ultimaMov ? ultimaMov.totalPos : 0;
        const capacidade = p.maquina.capacidadePadrao || 100;

        return {
          nome: p.maquina.nome,
          faturamento: parseFloat(p.faturamento || 0),
          ocupacao: ((estoqueAtual / capacidade) * 100).toFixed(1),
        };
      }),
    );

    // --- QUERY 5: RANKING DE PRODUTOS ---
    const rankingRaw = await MovimentacaoProduto.findAll({
      attributes: [
        [col("produto.nome"), "nome"],
        [fn("SUM", col("quantidadeSaiu")), "quantidade"],
      ],
      include: [
        { model: Produto, as: "produto", attributes: ["id", "nome"] },
        {
          model: Movimentacao,
          attributes: [],
          where: whereMovimentacao,
          include: [
            {
              model: Maquina,
              as: "maquina",
              where: whereMaquina,
              attributes: [],
            },
          ],
        },
      ],
      group: ["produto.id", "produto.nome"],
      order: [[fn("SUM", col("quantidadeSaiu")), "DESC"]],
      limit: 10,
      raw: true,
    });

    const rankingProdutos = rankingRaw.map((r) => ({
      nome: r.nome || "Desconhecido",
      quantidade: parseInt(r.quantidade || 0),
    }));

    const faturamentoPorDia =
      registrosDinheiro.length > 0
        ? faturamentoPorDiaRegistros
        : new Map(
            timelineRaw.map((t) => [
              String(t.data).slice(0, 10),
              Number(parseFloat(t.faturamento || 0)),
            ]),
          );

    const cursor = inicioDoDia(new Date(inicio));
    const fimDia = inicioDoDia(new Date(fim));
    const graficoFinanceiro = [];

    while (cursor <= fimDia) {
      const chaveData = cursor.toISOString().slice(0, 10);
      const faturamentoDia = Number(faturamentoPorDia.get(chaveData) || 0);
      const custoProdutosDia = Number(custoProdutosPorDia.get(chaveData) || 0);
      const custoDia = Number(custoProdutosDia + custoRateadoDiario);
      const lucroDia = Number(faturamentoDia - custoDia);

      graficoFinanceiro.push({
        data: chaveData,
        faturamento: Number(faturamentoDia.toFixed(2)),
        custo: Number(custoDia.toFixed(2)),
        lucro: Number(lucroDia.toFixed(2)),
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    // --- RESPOSTA FINAL ---
    res.json({
      totais: {
        faturamento,
        lucro,
        custoTotal,
        custoProdutosTotal,
        custoFixoPeriodo,
        custoVariavelPeriodo,
        taxaDeCartao,
        saidas,
        fichas,
        dinheiro,
        pix,
        cartao,
      },
      graficoFinanceiro,
      performanceMaquinas,
      rankingProdutos,
    });
  } catch (error) {
    console.error("Erro Crítico no Dashboard:", error);
    res.status(500).json({
      error: "Erro interno ao processar dashboard.",
      details: error.message,
    });
  }
};

export const machinePayTotalMes = async (req, res) => {
  try {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1, 0, 0, 0);
    const fim = hoje;

    const maquinas = await Maquina.findAll({
      where: {
        ativo: true,
        machinePayPosId: {
          [Op.ne]: null,
          [Op.not]: "",
        },
      },
      attributes: ["id", "nome", "machinePayPosId"],
      raw: true,
    });

    if (!maquinas.length) {
      return res.json({
        liquidoTotal: 0,
        brutoTotal: 0,
        taxaTotal: 0,
        maquinas: [],
      });
    }

    const resultados = await Promise.allSettled(
      maquinas.map((maquina) =>
        consultarFechamentoMachinePay({
          posId: maquina.machinePayPosId,
          inicio: formatarDataMachinePay(inicio),
          fim: formatarDataMachinePay(fim),
        }).then((dados) => ({
          ...dados,
          maquinaId: maquina.id,
          nome: maquina.nome,
          machinePayPosId: maquina.machinePayPosId,
        })),
      ),
    );

    let liquidoTotal = 0;
    let brutoTotal = 0;
    let taxaTotal = 0;

    const maquinasDados = resultados.map((resultado, index) => {
      if (resultado.status !== "fulfilled") {
        return {
          ...maquinas[index],
          erro: resultado.reason?.message || String(resultado.reason),
        };
      }

      liquidoTotal += Number(resultado.value.liquido || 0);
      brutoTotal += Number(resultado.value.brutoComTaxasMp || 0);
      taxaTotal += Number(resultado.value.taxas || 0);

      return resultado.value;
    });

    res.json({
      liquidoTotal: Number(liquidoTotal.toFixed(2)),
      brutoTotal: Number(brutoTotal.toFixed(2)),
      taxaTotal: Number(taxaTotal.toFixed(2)),
      maquinas: maquinasDados,
    });
  } catch (error) {
    console.error("Erro ao carregar total Machine Pay do mês:", error);
    res.status(500).json({
      error: "Erro ao carregar total Machine Pay do mês",
      details: error.message,
    });
  }
};

// --- ALERTAS DE INCONSISTÊNCIA (CORRIGIDO) ---
export const buscarAlertasDeInconsistencia = async (req, res) => {
  console.log("--- INICIANDO ALERTAS DE INCONSISTÊNCIA ---");
  try {
    // const usuarioId = req.usuario?.id; // Pode ser usado se necessário no futuro
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];

    // Buscar alertas ignorados globalmente
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));

    for (const maquina of maquinas) {
      // Busca as duas últimas movimentações da máquina
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "usuarioId",
          "contadorIn",
          "contadorOut",
          "fichas",
          "sairam",
          "dataColeta",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nome", "email"],
          },
        ],
      });

      // CORREÇÃO APLICADA AQUI:
      // Se não houver pelo menos 2 movimentações, pula esta máquina.
      if (!movimentacoes || movimentacoes.length < 2) {
        continue;
      }

      const atual = movimentacoes[0]; // mais recente
      const anterior = movimentacoes[1];
      const metadadosAtual = montarMetadadosMovimentacao(atual);
      const metadadosAnterior = montarMetadadosMovimentacao(anterior);

      // OUT: diferença do campo contadorOut
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);

      const alertaId = `${maquina.id}-${atual.id}`;

      // Pular alertas se a máquina não tem contadores (contador_out é 0 ou null)
      const temContadores =
        atual.contadorOut !== null && atual.contadorOut !== 0;

      // Se a diferença não bate com a quantidade de saída/fichas
      if (
        temContadores &&
        (diffOut !== (atual.sairam || 0) || diffIn !== (atual.fichas || 0)) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "inconsistencia_contador",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || null,
          contador_out: atual.contadorOut || 0,
          contador_in: atual.contadorIn || 0,
          fichas: atual.fichas,
          sairam: atual.sairam,
          ...metadadosAnterior,
          ...metadadosAtual,
          usuarioAnterior: metadadosAnterior.usuarioNome,
          usuarioAtual: metadadosAtual.usuarioNome,
          dataMovimentacaoAnterior: metadadosAnterior.dataMovimentacao,
          dataMovimentacaoAtual: metadadosAtual.dataMovimentacao,
          mensagem: `Inconsistência detectada: OUT (${diffOut}) esperado ${
            atual.sairam
          }, IN (${diffIn}) esperado ${atual.fichas}.\nOUT registrado: ${
            atual.contadorOut || 0
          } | IN registrado: ${atual.contadorIn || 0} | Fichas: ${
            atual.fichas
          }`,
        });
      }
    }

    res.json({ alertas });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar alertas de movimentação",
      message: error.message,
    });
  }
};

// --- IGNORAR ALERTA ---
export const ignorarAlertaMovimentacao = async (req, res) => {
  try {
    const { id } = req.params; // alertaId
    const usuarioId = req.usuario?.id;
    const { maquinaId } = req.body;
    if (!usuarioId || !maquinaId || !id) {
      return res.status(400).json({ error: "Dados obrigatórios ausentes." });
    }
    await AlertaIgnorado.create({
      alertaId: id,
      maquinaId,
      usuarioId,
    });
    res.json({ success: true });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao ignorar alerta", message: error.message });
  }
};

// --- BALANÇO MENSAL ---
export const balançoSemanal = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getFullYear(), fim.getMonth(), 1);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const includeMaquina = {
      model: Maquina,
      as: "maquina",
      attributes: ["id", "codigo", "lojaId"],
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    };

    if (lojaId) {
      includeMaquina.where = { lojaId };
    }

    const movimentacoes = await Movimentacao.findAll({
      where: whereMovimentacao,
      include: [
        includeMaquina,
        {
          model: MovimentacaoProduto,
          as: "detalhesProdutos",
          include: [
            {
              model: Produto,
              as: "produto",
              attributes: ["id", "nome", "categoria"],
            },
          ],
        },
      ],
    });

    const whereRegistroDinheiro = {
      inicio: { [Op.lte]: fim },
      fim: { [Op.gte]: inicio },
    };

    if (lojaId) {
      whereRegistroDinheiro[Op.and] = [
        sequelizeWhere(cast(col("lojaId"), "text"), String(lojaId)),
      ];
    }

    const registrosDinheiro = await RegistroDinheiro.findAll({
      where: whereRegistroDinheiro,
      raw: true,
    });

    const idsLojasRegistros = [
      ...new Set(
        registrosDinheiro.map((registro) => registro.lojaId).filter(Boolean),
      ),
    ];
    const lojasRegistros = idsLojasRegistros.length
      ? await Loja.findAll({
          where: { id: { [Op.in]: idsLojasRegistros } },
          attributes: ["id", "nome"],
          raw: true,
        })
      : [];
    const nomesLojasPorId = new Map(
      lojasRegistros.map((loja) => [String(loja.id), loja.nome]),
    );

    const obterValorRegistro = (registro) => {
      const dinheiro = Number(registro.valorDinheiro || 0);
      const pix = Number(registro.valorPix || 0);
      const cartao =
        registro.valorCartao !== undefined && registro.valorCartao !== null
          ? Number(registro.valorCartao || 0)
          : Math.max(
              Number(registro.valorCartaoPix || 0) -
                Number(registro.valorPix || 0),
              0,
            );

      return Number((dinheiro + pix + cartao).toFixed(2));
    };

    const totalFaturamentoRegistrado = registrosDinheiro.reduce(
      (total, registro) => total + obterValorRegistro(registro),
      0,
    );

    const totais = movimentacoes.reduce(
      (acc, mov) => {
        acc.totalFichas += mov.fichas || 0;
        acc.totalSairam += mov.sairam || 0;
        acc.totalAbastecidas += mov.abastecidas || 0;
        return acc;
      },
      {
        totalFichas: 0,
        totalFaturamento: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
      },
    );

    totais.totalFaturamento = Number(totalFaturamentoRegistrado.toFixed(2));

    totais.mediaFichasPremio =
      totais.totalSairam > 0
        ? (totais.totalFichas / totais.totalSairam).toFixed(2)
        : 0;

    const produtosMap = {};
    movimentacoes.forEach((mov) => {
      mov.detalhesProdutos?.forEach((dp) => {
        const produtoNome = dp.produto?.nome || "Não especificado";
        if (!produtosMap[produtoNome]) {
          produtosMap[produtoNome] = {
            nome: produtoNome,
            quantidadeSaiu: 0,
            quantidadeAbastecida: 0,
          };
        }
        produtosMap[produtoNome].quantidadeSaiu += dp.quantidadeSaiu || 0;
        produtosMap[produtoNome].quantidadeAbastecida +=
          dp.quantidadeAbastecida || 0;
      });
    });

    const distribuicaoProdutos = Object.values(produtosMap)
      .map((p) => ({
        ...p,
        porcentagem:
          totais.totalSairam > 0
            ? ((p.quantidadeSaiu / totais.totalSairam) * 100).toFixed(2)
            : 0,
      }))
      .sort((a, b) => b.quantidadeSaiu - a.quantidadeSaiu);

    const lojasMap = {};
    movimentacoes.forEach((mov) => {
      const lojaNome = mov.maquina?.loja?.nome || "Não especificado";
      if (!lojasMap[lojaNome]) {
        lojasMap[lojaNome] = {
          nome: lojaNome,
          fichas: 0,
          faturamento: 0,
          faturamentoMaquinas: 0,
          sairam: 0,
          abastecidas: 0,
        };
      }
      lojasMap[lojaNome].fichas += mov.fichas || 0;
      lojasMap[lojaNome].sairam += mov.sairam || 0;
      lojasMap[lojaNome].abastecidas += mov.abastecidas || 0;
    });

    registrosDinheiro.forEach((registro) => {
      const lojaNome =
        nomesLojasPorId.get(String(registro.lojaId)) || "NÃ£o especificado";

      if (!lojasMap[lojaNome]) {
        lojasMap[lojaNome] = {
          nome: lojaNome,
          fichas: 0,
          faturamento: 0,
          faturamentoMaquinas: 0,
          sairam: 0,
          abastecidas: 0,
        };
      }

      const valor = obterValorRegistro(registro);
      lojasMap[lojaNome].faturamento += valor;
      lojasMap[lojaNome].faturamentoMaquinas += valor;
    });

    const distribuicaoLojas = Object.values(lojasMap)
      .map((l) => ({
        ...l,
        mediaFichasPremio: l.sairam > 0 ? (l.fichas / l.sairam).toFixed(2) : 0,
        mediaFaturamentoPremio:
          l.sairam > 0 ? Number((l.faturamento / l.sairam).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.faturamento - a.faturamento);

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      totais,
      distribuicaoProdutos,
      distribuicaoLojas,
      totalMovimentacoes: movimentacoes.length,
    });
  } catch (error) {
    console.error("Erro ao gerar balanço semanal:", error);
    res.status(500).json({ error: "Erro ao gerar balanço semanal" });
  }
};

// --- ALERTAS DE ESTOQUE ---
export const alertasEstoque = async (req, res) => {
  try {
    const { lojaId } = req.query;
    const whereMaquina = { ativo: true };

    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const maquinas = await Maquina.findAll({
      where: whereMaquina,
      include: [
        {
          model: Loja,
          as: "loja",
          attributes: ["id", "nome"],
        },
      ],
    });

    const alertas = [];

    for (const maquina of maquinas) {
      const ultimaMovimentacao = await Movimentacao.findOne({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        include: [
          {
            model: MovimentacaoProduto,
            as: "detalhesProdutos",
            include: [
              {
                model: Produto,
                as: "produto",
                attributes: ["id", "nome", "emoji"],
              },
            ],
          },
        ],
      });

      const estoqueAtual = ultimaMovimentacao ? ultimaMovimentacao.totalPos : 0;
      const estoqueMinimo =
        (maquina.capacidadePadrao * maquina.percentualAlertaEstoque) / 100;
      const percentualAtual = (estoqueAtual / maquina.capacidadePadrao) * 100;

      // Pegar produtos únicos da última movimentação
      const produtosUnicos = [
        ...new Map(
          (ultimaMovimentacao?.detalhesProdutos ?? []).map((d) => [
            d.produtoId,
            { nome: d.produto?.nome, emoji: d.produto?.emoji },
          ]),
        ).values(),
      ];

      if (estoqueAtual < estoqueMinimo) {
        alertas.push({
          maquina: {
            id: maquina.id,
            codigo: maquina.codigo,
            nome: maquina.nome,
            loja: maquina.loja?.nome,
          },
          produtos: produtosUnicos,
          estoqueAtual,
          capacidadePadrao: maquina.capacidadePadrao,
          estoqueMinimo,
          percentualAtual: percentualAtual.toFixed(2),
          percentualAlerta: maquina.percentualAlertaEstoque,
          nivelAlerta:
            percentualAtual < 10
              ? "CRÍTICO"
              : percentualAtual < 20
                ? "ALTO"
                : "MÉDIO",
          ultimaAtualizacao: ultimaMovimentacao?.dataColeta,
        });
      }
    }

    alertas.sort(
      (a, b) => parseFloat(a.percentualAtual) - parseFloat(b.percentualAtual),
    );

    res.json({
      totalAlertas: alertas.length,
      alertas,
    });
  } catch (error) {
    console.error("Erro ao buscar alertas de estoque:", error);
    res.status(500).json({ error: "Erro ao buscar alertas de estoque" });
  }
};

// --- PERFORMANCE MÁQUINAS ---
export const performanceMaquinas = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    const fim = dataFim ? new Date(dataFim) : new Date();
    const inicio = dataInicio
      ? new Date(dataInicio)
      : new Date(fim.getTime() - 30 * 24 * 60 * 60 * 1000);

    const whereMovimentacao = {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    };

    const whereMaquina = {};
    if (lojaId) {
      whereMaquina.lojaId = lojaId;
    }

    const performance = await Movimentacao.findAll({
      attributes: [
        "maquinaId",
        [fn("COUNT", col("id")), "totalMovimentacoes"],
        [fn("SUM", col("fichas")), "totalFichas"],
        [fn("SUM", col("valorFaturado")), "totalFaturamento"],
        [fn("SUM", col("sairam")), "totalSairam"],
        [fn("AVG", col("mediaFichasPremio")), "mediaFichasPremioGeral"],
      ],
      where: whereMovimentacao,
      include: [
        {
          model: Maquina,
          as: "maquina",
          where: whereMaquina,
          attributes: ["id", "codigo", "nome", "tipo"],
          include: [
            {
              model: Loja,
              as: "loja",
              attributes: ["id", "nome"],
            },
          ],
        },
      ],
      group: ["maquinaId", "maquina.id", "maquina->loja.id"],
      order: [[fn("SUM", col("valorFaturado")), "DESC"]],
    });

    const resultado = performance.map((p) => ({
      maquina: {
        id: p.maquina.id,
        codigo: p.maquina.codigo,
        nome: p.maquina.nome,
        tipo: p.maquina.tipo,
        loja: p.maquina.loja?.nome,
      },
      metricas: {
        totalMovimentacoes: parseInt(p.getDataValue("totalMovimentacoes")),
        totalFichas: parseInt(p.getDataValue("totalFichas") || 0),
        totalFaturamento: parseFloat(p.getDataValue("totalFaturamento") || 0),
        totalSairam: parseInt(p.getDataValue("totalSairam") || 0),
        mediaFichasPremio: parseFloat(
          p.getDataValue("mediaFichasPremioGeral") || 0,
        ).toFixed(2),
      },
    }));

    res.json({
      periodo: {
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
      },
      performance: resultado,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório de performance:", error);
    res.status(500).json({ error: "Erro ao gerar relatório de performance" });
  }
};

// --- RELATÓRIO DE IMPRESSÃO (RESTAURADO E CORRIGIDO) ---
export const gerarRelatorioImpressaoPorLoja = async ({
  lojaId,
  dataInicio,
  dataFim,
}) => {
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);
  fim.setHours(23, 59, 59, 999);

  const loja = await Loja.findByPk(lojaId);
  if (!loja) {
    const erro = new Error("Loja não encontrada");
    erro.status = 404;
    throw erro;
  }

  const valorFichaPadraoLoja = Number(
    loja.valorFichaPadrao ?? VALOR_FICHA_PADRAO_DEFAULT,
  );

  const registrosDinheiro = await RegistroDinheiro.findAll({
    where: {
      lojaId,
      inicio: { [Op.lte]: fim },
      fim: { [Op.gte]: inicio },
    },
    raw: true,
  });

  const registrosSangria = await Sangria.findAll({
    where: {
      lojaId,
      dataContagem: { [Op.between]: [inicio, fim] },
    },
    order: [["dataContagem", "DESC"]],
    raw: true,
  });

  const movimentacoes = await Movimentacao.findAll({
    where: {
      dataColeta: {
        [Op.between]: [inicio, fim],
      },
    },
    include: [
      {
        model: Maquina,
        as: "maquina",
        where: { lojaId },
        attributes: ["id", "codigo", "nome"],
      },
      {
        model: MovimentacaoProduto,
        as: "detalhesProdutos",
        include: [
          {
            model: Produto,
            as: "produto",
            attributes: ["id", "nome", "codigo", "emoji", "custoUnitario"],
          },
        ],
      },
    ],
    order: [["dataColeta", "DESC"]],
  });

  let valorTotalLoja = 0;
  let valorDinheiroLoja = 0;
  let valorCartaoPixLoja = 0;
  let taxaDeCartaoTotal = 0;
  let somaPercentualTaxaPonderado = 0;
  let somaBasePercentualTaxa = 0;
  let gastoTotalPeriodoSalvo = 0;

  const obterNumeroRegistro = (registro, ...chaves) => {
    for (const chave of chaves) {
      const valor = registro?.[chave];
      if (valor !== undefined && valor !== null && valor !== "") {
        const numero = Number(valor);
        return Number.isFinite(numero) ? numero : 0;
      }
    }

    return 0;
  };

  const ehRegistroTotalLoja = (registro) =>
    registro?.registrarTotalLoja === true ||
    registro?.registrar_total_loja === true ||
    registro?.registrarTotalLoja === 1 ||
    registro?.registrar_total_loja === 1;

  const obterMaquinaIdRegistro = (registro) =>
    registro?.maquinaId ?? registro?.maquinaid ?? null;

  registrosDinheiro.forEach((r) => {
    if (ehRegistroTotalLoja(r)) {
      const valorCartaoPixRegistro = obterNumeroRegistro(
        r,
        "valorCartaoPix",
        "valor_cartao_pix",
      );
      const taxaRegistro = parseFloat(
        r.taxaDeCartao ??
          r.taxa_de_cartao ??
          Math.max(
            obterNumeroRegistro(r, "valorCartaoPix", "valor_cartao_pix") -
              obterNumeroRegistro(
                r,
                "valorCartaoPixLiquido",
                "valor_cartao_pix_liquido",
              ),
            0,
          ),
      );
      const percentualRegistroInformado =
        r.percentualTaxaCartaoMedia ?? r.percentual_taxa_cartao_media;
      const percentualRegistro = Number(
        percentualRegistroInformado ??
          (valorCartaoPixRegistro > 0
            ? (taxaRegistro / valorCartaoPixRegistro) * 100
            : 0),
      );

      valorTotalLoja +=
        obterNumeroRegistro(r, "valorDinheiro", "valor_dinheiro") +
        valorCartaoPixRegistro;
      valorDinheiroLoja += obterNumeroRegistro(
        r,
        "valorDinheiro",
        "valor_dinheiro",
      );
      valorCartaoPixLoja += valorCartaoPixRegistro;
      taxaDeCartaoTotal += taxaRegistro;
      somaPercentualTaxaPonderado +=
        percentualRegistro * valorCartaoPixRegistro;
      somaBasePercentualTaxa += valorCartaoPixRegistro;
      gastoTotalPeriodoSalvo += parseFloat(
        r.gastoTotalPeriodo ?? r.gasto_total_periodo ?? 0,
      );
    }
  });

  const valorTotalLojaBruto = Number(valorTotalLoja.toFixed(2));
  const gastoFixoTotalPeriodo = await calcularGastoFixoProporcionalPeriodo(
    lojaId,
    inicio,
    fim,
  );
  const gastoVariavelTotalPeriodo = await calcularGastoVariavelPeriodo(
    lojaId,
    inicio,
    fim,
  );

  const valoresPorMaquina = {};
  registrosDinheiro.forEach((r) => {
    const maquinaIdRegistro = obterMaquinaIdRegistro(r);

    if (!ehRegistroTotalLoja(r) && maquinaIdRegistro) {
      if (!valoresPorMaquina[maquinaIdRegistro]) {
        valoresPorMaquina[maquinaIdRegistro] = {
          dinheiro: 0,
          cartaoPix: 0,
          cartaoPixLiquido: 0,
          taxaDeCartao: 0,
        };
      }

      const valorCartaoPixRegistro = obterNumeroRegistro(
        r,
        "valorCartaoPix",
        "valor_cartao_pix",
      );
      const taxaRegistro = parseFloat(
        r.taxaDeCartao ??
          r.taxa_de_cartao ??
          Math.max(
            obterNumeroRegistro(r, "valorCartaoPix", "valor_cartao_pix") -
              obterNumeroRegistro(
                r,
                "valorCartaoPixLiquido",
                "valor_cartao_pix_liquido",
              ),
            0,
          ),
      );
      const valorCartaoPixLiquidoRegistro = obterNumeroRegistro(
        r,
        "valorCartaoPixLiquido",
        "valor_cartao_pix_liquido",
      );
      const valorCartaoPixLiquidoNormalizado =
        valorCartaoPixLiquidoRegistro > 0
          ? valorCartaoPixLiquidoRegistro
          : Math.max(valorCartaoPixRegistro - taxaRegistro, 0);

      valoresPorMaquina[maquinaIdRegistro].dinheiro += obterNumeroRegistro(
        r,
        "valorDinheiro",
        "valor_dinheiro",
      );
      valoresPorMaquina[maquinaIdRegistro].cartaoPix += valorCartaoPixRegistro;
      valoresPorMaquina[maquinaIdRegistro].cartaoPixLiquido +=
        valorCartaoPixLiquidoNormalizado;
      valoresPorMaquina[maquinaIdRegistro].taxaDeCartao += taxaRegistro;
    }
  });

  const totaisMaquinasRegistro = Object.values(valoresPorMaquina).reduce(
    (acc, item) => {
      acc.dinheiro += Number(item.dinheiro || 0);
      acc.cartaoPix += Number(item.cartaoPix || 0);
      acc.cartaoPixLiquido += Number(item.cartaoPixLiquido || 0);
      return acc;
    },
    { dinheiro: 0, cartaoPix: 0, cartaoPixLiquido: 0 },
  );

  const valorBrutoMaquinas = Number(
    (
      totaisMaquinasRegistro.dinheiro + totaisMaquinasRegistro.cartaoPix
    ).toFixed(2),
  );
  const valorLiquidoMaquinas = Number(
    (
      totaisMaquinasRegistro.dinheiro + totaisMaquinasRegistro.cartaoPixLiquido
    ).toFixed(2),
  );

  const totalFichas = movimentacoes.reduce(
    (sum, m) => sum + (m.fichas || 0),
    0,
  );
  const totalSairam = movimentacoes.reduce((sum, m) => {
    const ehRetiradaEstoque =
      m.retiradaEstoque === true || m.retirada_estoque === true;
    return sum + (ehRetiradaEstoque ? 0 : m.sairam || 0);
  }, 0);
  const totalAbastecidas = movimentacoes.reduce(
    (sum, m) => sum + (m.abastecidas || 0),
    0,
  );

  const produtosSairamMap = {};
  const produtosEntraramMap = {};
  const dadosPorMaquina = {};

  movimentacoes.forEach((mov) => {
    const ehRetiradaEstoque =
      mov.retiradaEstoque === true || mov.retirada_estoque === true;

    mov.detalhesProdutos?.forEach((mp) => {
      if (!ehRetiradaEstoque && mp.quantidadeSaiu > 0) {
        const key = mp.produtoId;
        if (!produtosSairamMap[key]) {
          produtosSairamMap[key] = { produto: mp.produto, quantidade: 0 };
        }
        produtosSairamMap[key].quantidade += mp.quantidadeSaiu;
      }

      if (mp.quantidadeAbastecida > 0) {
        const key = mp.produtoId;
        if (!produtosEntraramMap[key]) {
          produtosEntraramMap[key] = { produto: mp.produto, quantidade: 0 };
        }
        produtosEntraramMap[key].quantidade += mp.quantidadeAbastecida;
      }
    });

    const maquinaId = mov.maquina.id;
    if (!dadosPorMaquina[maquinaId]) {
      dadosPorMaquina[maquinaId] = {
        maquina: {
          id: mov.maquina.id,
          codigo: mov.maquina.codigo,
          nome: mov.maquina.nome,
        },
        fichas: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
        numMovimentacoes: 0,
        produtosSairam: {},
        produtosEntraram: {},
      };
    }

    dadosPorMaquina[maquinaId].fichas += mov.fichas || 0;
    dadosPorMaquina[maquinaId].totalSairam += ehRetiradaEstoque
      ? 0
      : mov.sairam || 0;
    dadosPorMaquina[maquinaId].totalAbastecidas += mov.abastecidas || 0;
    dadosPorMaquina[maquinaId].numMovimentacoes += 1;

    mov.detalhesProdutos?.forEach((mp) => {
      if (!ehRetiradaEstoque && mp.quantidadeSaiu > 0) {
        const key = mp.produtoId;
        if (!dadosPorMaquina[maquinaId].produtosSairam[key]) {
          dadosPorMaquina[maquinaId].produtosSairam[key] = {
            produto: mp.produto,
            quantidade: 0,
          };
        }
        dadosPorMaquina[maquinaId].produtosSairam[key].quantidade +=
          mp.quantidadeSaiu;
      }

      if (mp.quantidadeAbastecida > 0) {
        const key = mp.produtoId;
        if (!dadosPorMaquina[maquinaId].produtosEntraram[key]) {
          dadosPorMaquina[maquinaId].produtosEntraram[key] = {
            produto: mp.produto,
            quantidade: 0,
          };
        }
        dadosPorMaquina[maquinaId].produtosEntraram[key].quantidade +=
          mp.quantidadeAbastecida;
      }
    });
  });

  const idsMaquinasComFechamento = Object.keys(valoresPorMaquina);
  const idsMaquinasSemMovimentacao = idsMaquinasComFechamento.filter(
    (maquinaId) => !dadosPorMaquina[maquinaId],
  );

  if (idsMaquinasSemMovimentacao.length > 0) {
    const maquinasSemMovimentacao = await Maquina.findAll({
      where: {
        lojaId,
        id: { [Op.in]: idsMaquinasSemMovimentacao },
      },
      attributes: ["id", "codigo", "nome", "valorFicha"],
      raw: true,
    });

    maquinasSemMovimentacao.forEach((maquina) => {
      dadosPorMaquina[maquina.id] = {
        maquina: {
          id: maquina.id,
          codigo: maquina.codigo,
          nome: maquina.nome,
          valorFicha: maquina.valorFicha,
        },
        fichas: 0,
        totalSairam: 0,
        totalAbastecidas: 0,
        numMovimentacoes: 0,
        produtosSairam: {},
        produtosEntraram: {},
      };
    });
  }

  const produtosSairam = Object.values(produtosSairamMap).sort(
    (a, b) => b.quantidade - a.quantidade,
  );

  const produtosEntraram = Object.values(produtosEntraramMap).sort(
    (a, b) => b.quantidade - a.quantidade,
  );

  const maquinasDetalhadas = Object.values(dadosPorMaquina).map((m) => {
    let custoProdutosSairam = 0;
    const produtosSairamDetalhados = Object.values(m.produtosSairam)
      .map((p) => {
        let custoUnitario = 0;
        if (p.produto.custoUnitario && Number(p.produto.custoUnitario) > 0) {
          custoUnitario = Number(p.produto.custoUnitario);
        } else if (p.produto.preco && Number(p.produto.preco) > 0) {
          custoUnitario = Number(p.produto.preco);
        }
        const custoTotal = custoUnitario * p.quantidade;
        custoProdutosSairam += custoTotal;
        return {
          id: p.produto.id,
          nome: p.produto.nome,
          codigo: p.produto.codigo,
          emoji: p.produto.emoji,
          quantidade: p.quantidade,
          custoUnitario,
          custoTotal,
        };
      })
      .sort((a, b) => b.quantidade - a.quantidade);

    const produtosEntraramDetalhados = Object.values(m.produtosEntraram)
      .map((p) => ({
        id: p.produto.id,
        nome: p.produto.nome,
        codigo: p.produto.codigo,
        emoji: p.produto.emoji,
        quantidade: p.quantidade,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const valorFicha = m.maquina.valorFicha
      ? Number(m.maquina.valorFicha)
      : valorFichaPadraoLoja;
    const faturamentoMaquina =
      (valoresPorMaquina[m.maquina.id]?.dinheiro || 0) +
      (valoresPorMaquina[m.maquina.id]?.cartaoPixLiquido || 0);
    const lucroLiquido = faturamentoMaquina - custoProdutosSairam;
    const ticketPorPremio =
      Number(m.totalSairam || 0) > 0
        ? faturamentoMaquina / Number(m.totalSairam || 0)
        : 0;

    return {
      maquina: m.maquina,
      totais: {
        fichas: m.fichas,
        produtosSairam: m.totalSairam,
        produtosEntraram: m.totalAbastecidas,
        movimentacoes: m.numMovimentacoes,
        dinheiro: valoresPorMaquina[m.maquina.id]?.dinheiro || 0,
        cartaoPix: valoresPorMaquina[m.maquina.id]?.cartaoPix || 0,
        cartaoPixLiquido:
          valoresPorMaquina[m.maquina.id]?.cartaoPixLiquido || 0,
        taxaDeCartao: valoresPorMaquina[m.maquina.id]?.taxaDeCartao || 0,
        faturamentoBruto: Number(faturamentoMaquina.toFixed(2)),
        custoProdutosSairam,
        lucroLiquido,
        ticketPorPremio: Number(ticketPorPremio.toFixed(2)),
      },
      produtosSairam: produtosSairamDetalhados,
      produtosEntraram: produtosEntraramDetalhados,
    };
  });

  const gastoProdutosTotalPeriodo = Number(
    maquinasDetalhadas
      .reduce((acc, m) => acc + Number(m.totais?.custoProdutosSairam || 0), 0)
      .toFixed(2),
  );

  const gastoTotalPeriodoCalculado = Number(
    (
      Number(gastoFixoTotalPeriodo || 0) +
      Number(gastoVariavelTotalPeriodo || 0) +
      Number(gastoProdutosTotalPeriodo || 0)
    ).toFixed(2),
  );
  const gastoTotalPeriodo = gastoTotalPeriodoCalculado;
  const taxaDeCartaoPeriodo = Number(taxaDeCartaoTotal.toFixed(2));
  const percentualTaxaCartaoMediaPeriodo = Number(
    (somaBasePercentualTaxa > 0
      ? somaPercentualTaxaPonderado / somaBasePercentualTaxa
      : 0
    ).toFixed(2),
  );
  const valorCartaoPixLiquidoLoja = Number(
    Math.max(valorCartaoPixLoja - taxaDeCartaoPeriodo, 0).toFixed(2),
  );
  const valorBrutoConsolidadoLojaMaquinas = Number(
    (valorTotalLojaBruto + valorBrutoMaquinas).toFixed(2),
  );

  const valorSangriaTotalPeriodo = Number(
    registrosSangria
      .reduce((acc, item) => acc + Number(item.quantidade || 0), 0)
      .toFixed(2),
  );

  const valorSangriaCalculadoNotasPeriodo = Number(
    registrosSangria
      .reduce((acc, item) => acc + Number(item.valor_calculado_notas || 0), 0)
      .toFixed(2),
  );

  const valorLiquidoConsolidadoLojaMaquinas = Number(
    (
      valorDinheiroLoja +
      valorCartaoPixLiquidoLoja +
      valorLiquidoMaquinas -
      gastoTotalPeriodo
    ).toFixed(2),
  );
  const valorTotalLojaLiquido = Number(
    (valorDinheiroLoja + valorCartaoPixLiquidoLoja - gastoTotalPeriodo).toFixed(
      2,
    ),
  );
  const ticketPorPremioTotal =
    Number(totalSairam || 0) > 0
      ? Number((valorTotalLojaBruto / Number(totalSairam || 0)).toFixed(2))
      : 0;

  let valorMedioFicha = valorFichaPadraoLoja;
  if (Object.values(dadosPorMaquina).length > 0) {
    const somaValorFicha = Object.values(dadosPorMaquina).reduce((acc, m) => {
      const v = m.maquina.valorFicha
        ? Number(m.maquina.valorFicha)
        : valorFichaPadraoLoja;
      return acc + v;
    }, 0);
    valorMedioFicha = somaValorFicha / Object.values(dadosPorMaquina).length;
  }

  const valorFichasReais = totalFichas * valorMedioFicha;
  const valorTotal = valorTotalLojaBruto;
  const diferenca = valorFichasReais - valorTotal;
  let avisoFichas = null;

  if (false && Math.abs(diferenca) > 0.01) {
    avisoFichas = `Atenção: diferença entre valor das fichas em reais (R$ ${valorFichasReais.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}) e valor total da loja (R$ ${valorTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}). Diferença: R$ ${diferenca.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  }

  const graficoSaidaPorMaquina = maquinasDetalhadas.map((m) => ({
    maquina: m.maquina.nome,
    produtosSairam: m.totais.produtosSairam,
  }));

  const graficoSaidaPorProduto = produtosSairam.map((p) => ({
    produto: p.produto.nome,
    quantidade: p.quantidade,
  }));

  return {
    loja: {
      id: loja.id,
      nome: loja.nome,
      endereco: loja.endereco,
      valorFichaPadrao: Number(valorFichaPadraoLoja.toFixed(2)),
    },
    periodo: {
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
    },
    totais: {
      fichas: totalFichas,
      valorFichasTotal: Number(
        (totalFichas * Number(valorFichaPadraoLoja || 0)).toFixed(2),
      ),
      produtosSairam: totalSairam,
      produtosEntraram: totalAbastecidas,
      movimentacoes: movimentacoes.length,
      valorTotalLoja: valorTotalLojaLiquido,
      valorTotalLojaBruto,
      valorTotalLojaLiquido,
      gastoFixoTotalPeriodo,
      gastoVariavelTotalPeriodo,
      gastoProdutosTotalPeriodo,
      gastoTotalPeriodo,
      taxaDeCartao: taxaDeCartaoPeriodo,
      percentualTaxaCartaoMedia: percentualTaxaCartaoMediaPeriodo,
      valorDinheiroLoja,
      valorCartaoPixLoja,
      valorCartaoPixLiquidoLoja,
      valorDinheiroMaquinas: Number(totaisMaquinasRegistro.dinheiro.toFixed(2)),
      valorCartaoPixMaquinasBruto: Number(
        totaisMaquinasRegistro.cartaoPix.toFixed(2),
      ),
      valorCartaoPixMaquinasLiquido: Number(
        totaisMaquinasRegistro.cartaoPixLiquido.toFixed(2),
      ),
      quantidadeRegistrosDinheiro: registrosDinheiro.length,
      valorBrutoMaquinas,
      valorLiquidoMaquinas,
      valorBrutoConsolidadoLojaMaquinas,
      valorLiquidoConsolidadoLojaMaquinas,
      valorSangriaTotalPeriodo,
      valorSangriaCalculadoNotasPeriodo,
      quantidadeRegistrosSangria: registrosSangria.length,
      ticketPorPremioTotal,
    },
    dinheiro: {
      quantidadeRegistros: registrosDinheiro.length,
      registros: registrosDinheiro.map((registro) => ({
        id: registro.id,
        lojaId: registro.lojaId ?? registro.lojaid,
        maquinaId: registro.maquinaId ?? registro.maquinaid,
        registrarTotalLoja:
          registro.registrarTotalLoja ?? registro.registrar_total_loja,
        inicio: registro.inicio,
        fim: registro.fim,
        valorDinheiro: obterNumeroRegistro(
          registro,
          "valorDinheiro",
          "valor_dinheiro",
        ),
        valorCartaoPix: obterNumeroRegistro(
          registro,
          "valorCartaoPix",
          "valor_cartao_pix",
        ),
        valorPix: obterNumeroRegistro(registro, "valorPix", "valor_pix"),
        valorCartao: obterNumeroRegistro(
          registro,
          "valorCartao",
          "valor_cartao",
        ),
        taxaDeCartao: obterNumeroRegistro(
          registro,
          "taxaDeCartao",
          "taxa_de_cartao",
        ),
      })),
    },
    sangria: {
      totalPeriodo: valorSangriaTotalPeriodo,
      totalCalculadoPelasNotasPeriodo: valorSangriaCalculadoNotasPeriodo,
      quantidadeRegistros: registrosSangria.length,
      registros: registrosSangria.map((item) => ({
        id: item.id,
        dataContagem: item.data_contagem ?? item.dataContagem,
        lojaId: item.loja_id ?? item.lojaId,
        usuarioId: item.usuario_id ?? item.usuarioId,
        quantidade: Number(item.quantidade || 0),
        valorCalculadoNotas: Number(
          item.valor_calculado_notas ?? item.valorCalculadoNotas ?? 0,
        ),
        notas: {
          notas2: Number(item.notas_2 ?? item.notas2 ?? 0),
          notas5: Number(item.notas_5 ?? item.notas5 ?? 0),
          notas10: Number(item.notas_10 ?? item.notas10 ?? 0),
          notas20: Number(item.notas_20 ?? item.notas20 ?? 0),
          notas50: Number(item.notas_50 ?? item.notas50 ?? 0),
          notas100: Number(item.notas_100 ?? item.notas100 ?? 0),
          notas200: Number(item.notas_200 ?? item.notas200 ?? 0),
        },
        observacao: item.observacao || null,
        createdAt: item.created_at ?? item.createdAt,
      })),
    },
    produtosSairam: produtosSairam.map((p) => ({
      id: p.produto.id,
      nome: p.produto.nome,
      codigo: p.produto.codigo,
      emoji: p.produto.emoji,
      quantidade: p.quantidade,
    })),
    produtosEntraram: produtosEntraram.map((p) => ({
      id: p.produto.id,
      nome: p.produto.nome,
      codigo: p.produto.codigo,
      emoji: p.produto.emoji,
      quantidade: p.quantidade,
    })),
    maquinas: maquinasDetalhadas,
    graficoSaidaPorMaquina,
    graficoSaidaPorProduto,
  };
};

export const relatorioImpressao = async (req, res) => {
  try {
    const { lojaId, dataInicio, dataFim } = req.query;

    if (!lojaId) {
      return res.status(400).json({ error: "lojaId é obrigatório" });
    }

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const relatorio = await gerarRelatorioImpressaoPorLoja({
      lojaId,
      dataInicio,
      dataFim,
    });

    return res.json(relatorio);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    console.error("Erro ao gerar relatório de impressão:", error);
    return res.status(500).json({
      error: "Erro ao gerar relatório de impressão",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

export const relatorioTodasLojas = async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    if (!dataInicio || !dataFim) {
      return res
        .status(400)
        .json({ error: "dataInicio e dataFim são obrigatórios" });
    }

    const lojas = await Loja.findAll({ where: { ativo: true }, raw: true });

    const respostas = await Promise.allSettled(
      lojas.map((loja) =>
        gerarRelatorioImpressaoPorLoja({
          lojaId: loja.id,
          dataInicio,
          dataFim,
        }),
      ),
    );

    const relatoriosPorLoja = respostas
      .map((resposta, index) => {
        if (resposta.status !== "fulfilled") return null;
        return {
          loja: lojas[index],
          dados: resposta.value,
        };
      })
      .filter(Boolean);

    if (!relatoriosPorLoja.length) {
      return res.status(404).json({
        error:
          "Não foi possível gerar o relatório consolidado para o período selecionado.",
      });
    }

    const lojasSemDados = respostas
      .map((resposta, index) => {
        if (resposta.status === "fulfilled") return null;
        return lojas[index]?.nome || `Loja ${index + 1}`;
      })
      .filter(Boolean);

    const produtosMap = new Map();

    const rankingLojas = relatoriosPorLoja.map(({ loja, dados }) => {
      const totais = dados?.totais || {};
      const valorFichaPadrao = Number(
        dados?.loja?.valorFichaPadrao ??
          loja?.valorFichaPadrao ??
          VALOR_FICHA_PADRAO_DEFAULT,
      );
      const custoTotal = Number(totais.gastoTotalPeriodo || 0);
      const custoVariavel = Number(totais.gastoVariavelTotalPeriodo || 0);
      const custoProdutos = Number(totais.gastoProdutosTotalPeriodo || 0);
      const custoFixo = Number(totais.gastoFixoTotalPeriodo || 0);
      const dinheiroLoja = Number(totais.valorDinheiroLoja || 0);
      const cartaoPixLojaBruto = Number(totais.valorCartaoPixLoja || 0);
      const taxaDeCartaoLoja = Number(totais.taxaDeCartao || 0);
      const cartaoPixLojaLiquido = Number(
        totais.valorCartaoPixLiquidoLoja ??
          Math.max(cartaoPixLojaBruto - taxaDeCartaoLoja, 0),
      );
      const dinheiroMaquinas = Number(totais.valorDinheiroMaquinas || 0);
      const cartaoPixMaquinasBruto = Number(
        totais.valorCartaoPixMaquinasBruto || 0,
      );
      const cartaoPixMaquinasLiquido = Number(
        totais.valorCartaoPixMaquinasLiquido ?? cartaoPixMaquinasBruto,
      );
      const taxaDeCartaoMaquinas = Math.max(
        cartaoPixMaquinasBruto - cartaoPixMaquinasLiquido,
        0,
      );
      const dinheiro = dinheiroLoja + dinheiroMaquinas;
      const cartaoPix = cartaoPixLojaBruto + cartaoPixMaquinasBruto;
      const cartaoPixLiquido = cartaoPixLojaLiquido + cartaoPixMaquinasLiquido;
      const taxaDeCartao = taxaDeCartaoLoja + taxaDeCartaoMaquinas;
      const lucroBruto = Number(
        totais.valorBrutoConsolidadoLojaMaquinas ?? dinheiro + cartaoPix,
      );
      const lucroLiquido = Number(
        totais.valorLiquidoConsolidadoLojaMaquinas ??
          dinheiro + cartaoPixLiquido - custoTotal,
      );
      const percentualTaxaCartaoMedia = Number(
        cartaoPix > 0 ? (taxaDeCartao / cartaoPix) * 100 : 0,
      );
      const fichas = Number(totais.fichas || 0);
      const valorFichasTotal = Number(
        totais.valorFichasTotal ?? fichas * valorFichaPadrao,
      );
      const produtosSairam = Number(totais.produtosSairam || 0);
      const produtosEntraram = Number(totais.produtosEntraram || 0);
      const sangriaTotalPeriodo = Number(totais.valorSangriaTotalPeriodo || 0);

      (dados?.produtosSairam || []).forEach((produto) => {
        const id = String(produto.id ?? produto.codigo ?? produto.nome);
        const existente = produtosMap.get(id);
        const quantidade = Number(produto.quantidade || 0);

        if (!existente) {
          produtosMap.set(id, {
            id,
            nome: produto.nome || "Produto",
            codigo: produto.codigo || "S/C",
            emoji: produto.emoji || "📦",
            quantidade,
          });
          return;
        }

        existente.quantidade += quantidade;
      });

      return {
        lojaId: loja?.id,
        lojaNome: dados?.loja?.nome || loja?.nome || "Loja",
        lucroBruto,
        custoTotal,
        custoVariavel,
        custoProdutos,
        custoFixo,
        taxaDeCartao,
        lucroLiquido,
        dinheiro,
        cartaoPix,
        cartaoPixLiquido,
        percentualTaxaCartaoMedia,
        fichas,
        valorFichaPadrao,
        valorFichasTotal,
        produtosSairam,
        produtosEntraram,
        sangriaTotalPeriodo,
      };
    });

    const totais = rankingLojas.reduce(
      (acc, loja) => {
        acc.lucroBrutoTotal += loja.lucroBruto;
        acc.lucroLiquidoTotal += loja.lucroLiquido;
        acc.custoTotal += loja.custoTotal;
        acc.custoVariavelTotal += loja.custoVariavel;
        acc.custoProdutosTotal += loja.custoProdutos;
        acc.custoFixoTotal += loja.custoFixo;
        acc.taxaDeCartaoTotal += loja.taxaDeCartao;
        acc.dinheiroTotal += loja.dinheiro;
        acc.cartaoPixTotal += loja.cartaoPix;
        acc.cartaoPixLiquidoTotal += loja.cartaoPixLiquido;
        acc.fichasTotal += loja.fichas;
        acc.valorFichasTotal += loja.valorFichasTotal;
        acc.produtosSairamTotal += loja.produtosSairam;
        acc.produtosEntraramTotal += loja.produtosEntraram;
        acc.sangriaTotal += loja.sangriaTotalPeriodo;
        acc.somaPercentualTaxaPonderado +=
          loja.percentualTaxaCartaoMedia * loja.cartaoPix;
        acc.somaBasePercentualTaxa += loja.cartaoPix;
        return acc;
      },
      {
        lucroBrutoTotal: 0,
        lucroLiquidoTotal: 0,
        custoTotal: 0,
        custoVariavelTotal: 0,
        custoProdutosTotal: 0,
        custoFixoTotal: 0,
        taxaDeCartaoTotal: 0,
        dinheiroTotal: 0,
        cartaoPixTotal: 0,
        cartaoPixLiquidoTotal: 0,
        fichasTotal: 0,
        valorFichasTotal: 0,
        produtosSairamTotal: 0,
        produtosEntraramTotal: 0,
        sangriaTotal: 0,
        somaPercentualTaxaPonderado: 0,
        somaBasePercentualTaxa: 0,
      },
    );

    totais.percentualTaxaCartaoMediaTotal = Number(
      (totais.somaBasePercentualTaxa > 0
        ? totais.somaPercentualTaxaPonderado / totais.somaBasePercentualTaxa
        : 0
      ).toFixed(2),
    );
    delete totais.somaPercentualTaxaPonderado;
    delete totais.somaBasePercentualTaxa;

    const totalRecebimentos =
      totais.dinheiroTotal + totais.cartaoPixLiquidoTotal;

    const rankingLojasComParticipacao = rankingLojas.map((loja) => ({
      ...loja,
      participacaoLucroBruto:
        totais.lucroBrutoTotal > 0
          ? (loja.lucroBruto / totais.lucroBrutoTotal) * 100
          : 0,
    }));

    const rankingProdutos = Array.from(produtosMap.values())
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 15);

    const rankingLucroLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.lucroLiquido - a.lucroLiquido)
      .slice(0, 10);

    const rankingGastoLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.custoTotal - a.custoTotal)
      .slice(0, 10);

    const participacaoLojas = [...rankingLojasComParticipacao]
      .sort((a, b) => b.participacaoLucroBruto - a.participacaoLucroBruto)
      .slice(0, 10);

    const gastosFixosPorLoja = [...rankingLojasComParticipacao]
      .map((loja) => ({
        lojaNome: loja.lojaNome,
        custoFixo: Number(loja.custoFixo || 0),
      }))
      .filter((item) => item.custoFixo > 0)
      .sort((a, b) => b.custoFixo - a.custoFixo);

    return res.json({
      tipo: "todas-lojas",
      periodo: {
        inicio: dataInicio,
        fim: dataFim,
      },
      totais,
      destaques: {
        lojaMaiorLucro: rankingLucroLojas[0] || null,
        lojaMaiorGasto: rankingGastoLojas[0] || null,
        lojaMaiorParticipacao: participacaoLojas[0] || null,
        produtoMaisSaiu: rankingProdutos[0] || null,
      },
      graficos: {
        rankingLucroLojas,
        rankingGastoLojas,
        participacaoLojas,
        rankingProdutos,
        pagamento: [
          {
            metodo: "Dinheiro",
            valor: totais.dinheiroTotal,
            percentual:
              totalRecebimentos > 0
                ? (totais.dinheiroTotal / totalRecebimentos) * 100
                : 0,
          },
          {
            metodo: "Cartão / Pix (Líquido)",
            valor: totais.cartaoPixLiquidoTotal,
            percentual:
              totalRecebimentos > 0
                ? (totais.cartaoPixLiquidoTotal / totalRecebimentos) * 100
                : 0,
          },
        ],
        gastosFixosPorLoja,
      },
      lojasSemDados,
      lojasComDados: relatoriosPorLoja.length,
    });
  } catch (error) {
    console.error("Erro ao gerar relatório consolidado de lojas:", error);
    return res.status(500).json({
      error: "Erro ao gerar relatório consolidado de lojas",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// --- ALERTAS DE MOVIMENTAÇÃO OUT ---
export const alertasMovimentacaoOut = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));
    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "usuarioId",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nome", "email"],
          },
        ],
      });
      if (!movimentacoes || movimentacoes.length < 2) continue;
      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const metadadosAtual = montarMetadadosMovimentacao(atual);
      const metadadosAnterior = montarMetadadosMovimentacao(anterior);
      const diffOut = (atual.contadorOut || 0) - (anterior.contadorOut || 0);
      const alertaId = `${maquina.id}-${atual.id}`;
      if (
        atual.contadorOut !== null &&
        atual.contadorOut !== 0 &&
        diffOut !== (atual.sairam || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        const referencia = anterior.contadorOut || 0;
        const inserido = atual.contadorOut || 0;
        const saidaCalculada = atual.sairam ?? 0;
        const diferenca = inserido - referencia - saidaCalculada;
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_out",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || maquina.lojaNome || null,
          contador_out: inserido,
          contador_out_anterior: referencia,
          sairam: saidaCalculada,
          ...metadadosAnterior,
          ...metadadosAtual,
          usuarioAnterior: metadadosAnterior.usuarioNome,
          usuarioAtual: metadadosAtual.usuarioNome,
          dataMovimentacaoAnterior: metadadosAnterior.dataMovimentacao,
          dataMovimentacaoAtual: metadadosAtual.dataMovimentacao,
        });
      }
    }
    res.json({ alertas });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao buscar alertas OUT", message: error.message });
  }
};

// --- ALERTAS DE MOVIMENTAÇÃO IN ---
export const alertasMovimentacaoIn = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];
    const ignorados = await AlertaIgnorado.findAll();
    const ignoradosSet = new Set(ignorados.map((a) => a.alertaId));
    for (const maquina of maquinas) {
      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: [
          "id",
          "usuarioId",
          "contadorOut",
          "contadorIn",
          "fichas",
          "sairam",
          "dataColeta",
        ],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nome", "email"],
          },
        ],
      });
      if (!movimentacoes || movimentacoes.length < 2) continue;
      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      const metadadosAtual = montarMetadadosMovimentacao(atual);
      const metadadosAnterior = montarMetadadosMovimentacao(anterior);
      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);
      const alertaId = `${maquina.id}-${atual.id}`;
      if (
        atual.contadorIn !== null &&
        atual.contadorIn !== 0 &&
        diffIn !== (atual.fichas || 0) &&
        !ignoradosSet.has(alertaId)
      ) {
        alertas.push({
          id: alertaId,
          tipo: "movimentacao_in",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || maquina.lojaNome || null,
          contador_in: atual.contadorIn || 0,
          contador_in_anterior: anterior.contadorIn || 0,
          fichas: atual.fichas,
          ...metadadosAnterior,
          ...metadadosAtual,
          usuarioAnterior: metadadosAnterior.usuarioNome,
          usuarioAtual: metadadosAtual.usuarioNome,
          dataMovimentacaoAnterior: metadadosAnterior.dataMovimentacao,
          dataMovimentacaoAtual: metadadosAtual.dataMovimentacao,
        });
      }
    }
    res.json({ alertas });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Erro ao buscar alertas IN", message: error.message });
  }
};

// --- ALERTAS DE PELÚCIA SAINDO ABAIXO DO ESPERADO ---
export const alertasBomDesempenho = async (req, res) => {
  try {
    const maquinas = await Maquina.findAll({
      where: { ativo: true },
      include: [{ model: Loja, as: "loja", attributes: ["nome"] }],
    });
    const alertas = [];

    for (const maquina of maquinas) {
      if (
        !maquina.jogadasBoasPorPelucia ||
        Number(maquina.jogadasBoasPorPelucia) <= 0
      ) {
        continue;
      }

      const movimentacoes = await Movimentacao.findAll({
        where: { maquinaId: maquina.id },
        order: [["dataColeta", "DESC"]],
        limit: 2,
        attributes: ["id", "usuarioId", "contadorIn", "sairam", "dataColeta"],
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["id", "nome", "email"],
          },
        ],
      });

      if (!movimentacoes || movimentacoes.length < 2) continue;

      const atual = movimentacoes[0];
      const anterior = movimentacoes[1];
      if (
        atual.contadorIn === null ||
        anterior.contadorIn === null ||
        (atual.sairam || 0) <= 0
      ) {
        continue;
      }

      const diffIn = (atual.contadorIn || 0) - (anterior.contadorIn || 0);
      const quantidadeSaiu = Number(atual.sairam || 0);
      const jogadasEsperadas = Number(maquina.jogadasBoasPorPelucia);

      if (diffIn <= 0 || quantidadeSaiu <= 0) {
        continue;
      }

      const jogadasPorPelucia = Number((diffIn / quantidadeSaiu).toFixed(2));
      const contadorInEsperado = Number(
        (jogadasEsperadas * quantidadeSaiu).toFixed(2),
      );

      if (jogadasPorPelucia !== jogadasEsperadas) {
        const estaAbaixoDaMeta = jogadasPorPelucia < jogadasEsperadas;
        const metadadosAtual = montarMetadadosMovimentacao(atual);
        const metadadosAnterior = montarMetadadosMovimentacao(anterior);
        alertas.push({
          id: `${maquina.id}-${atual.id}-${
            estaAbaixoDaMeta ? "jogadas-abaixo" : "jogadas-acima"
          }`,
          tipo: estaAbaixoDaMeta
            ? "jogadas_abaixo_do_esperado"
            : "jogadas_acima_do_esperado",
          direcao: estaAbaixoDaMeta ? "abaixo" : "acima",
          maquinaId: maquina.id,
          maquinaNome: maquina.nome,
          lojaNome: maquina.loja?.nome || maquina.lojaNome || null,
          contador_in: atual.contadorIn || 0,
          contador_in_anterior: anterior.contadorIn || 0,
          sairam: quantidadeSaiu,
          jogadasBoasPorPelucia: jogadasEsperadas,
          jogadasPorPelucia,
          diffIn,
          contadorInEsperado,
          diferencaJogadas: Number(
            Math.abs(jogadasEsperadas - jogadasPorPelucia).toFixed(2),
          ),
          ...metadadosAnterior,
          ...metadadosAtual,
          usuarioAnterior: metadadosAnterior.usuarioNome,
          usuarioAtual: metadadosAtual.usuarioNome,
          dataMovimentacaoAnterior: metadadosAnterior.dataMovimentacao,
          dataMovimentacaoAtual: metadadosAtual.dataMovimentacao,
          mensagem: `A pelúcia está saindo ${
            estaAbaixoDaMeta ? "com menos jogadas" : "com mais jogadas"
          } que o esperado: na loja ${
            maquina.loja?.nome || "não informada"
          }, máquina ${
            maquina.nome || maquina.codigo || maquina.id
          }, saiu com ${jogadasPorPelucia} jogada(s) por pelúcia; o esperado era ${jogadasEsperadas}.`,
        });
      }
    }

    res.json({ alertas });
  } catch (error) {
    res.status(500).json({
      error: "Erro ao buscar alertas de jogadas fora do esperado",
      message: error.message,
    });
  }
};
