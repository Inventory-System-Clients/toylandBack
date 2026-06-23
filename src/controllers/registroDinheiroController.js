import RegistroDinheiro from "../models/RegistroDinheiro.js";
import { Op, fn, col, cast, where as sequelizeWhere } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  GastoVariavel,
  GastoTotalFixoLoja,
  GastoFixoLoja,
  MovimentacaoProduto,
  Movimentacao,
  Maquina,
  Produto,
} from "../models/index.js";
import { consultarFechamentoMachinePay } from "../services/machinePayService.js";
import { calcularTotalGastosFixosMes } from "../services/gastoFixoMensalService.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

const normalizarValorMonetario = (valor) => {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;

  const valorNormalizado = String(valor)
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const numero = Number(valorNormalizado);
  return Number.isFinite(numero) ? numero : 0;
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

const calcularTotalFixoAtualDaLoja = async (lojaId) => {
  const gastos = await GastoFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
    },
    attributes: ["id", "nome", "valor"],
    order: [["id", "ASC"]],
    raw: true,
  });

  const gastosConsolidados = consolidarGastosFixosPorNome(gastos);

  const total = gastosConsolidados.reduce(
    (acc, item) => acc + calcularValorMensalDoGastoFixo(item),
    0,
  );

  return Number(total.toFixed(2));
};

const obterTotaisFixosMensaisLegado = async (lojaId, mesesIntervalo) => {
  if (!mesesIntervalo.length) return new Map();

  const totais = await GastoTotalFixoLoja.findAll({
    where: {
      [Op.and]: [sequelizeWhere(cast(col("lojaid"), "text"), String(lojaId))],
      [Op.or]: mesesIntervalo.map((m) => ({ ano: m.ano, mes: m.mes })),
    },
    raw: true,
  });

  const mapa = new Map(
    totais.map((item) => [
      `${item.ano}-${String(item.mes).padStart(2, "0")}`,
      Number(item.valorTotal || 0),
    ]),
  );

  const totalAtual = await calcularTotalFixoAtualDaLoja(lojaId);

  for (const item of mesesIntervalo) {
    const chave = `${item.ano}-${String(item.mes).padStart(2, "0")}`;
    const valorSalvo = Number(mapa.get(chave) || 0);
    const mudou = !mapa.has(chave) || Math.abs(valorSalvo - totalAtual) > 0.009;

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
          "[RegistroDinheiro] Falha ao persistir total fixo mensal, seguindo com cálculo em memória:",
          error.message,
        );
      }
    }

    mapa.set(chave, totalAtual);
  }

  return mapa;
};

const obterTotaisFixosMensais = async (lojaId, mesesIntervalo) => {
  const mapa = new Map();

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
        "[RegistroDinheiro] Falha ao persistir o total fixo mensal:",
        error.message,
      );
    }

    mapa.set(chave, valorTotal);
  }

  return mapa;
};

const calcularGastoFixoProporcional = async (lojaId, inicio, fim) => {
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

const calcularGastoProdutosSaidaPeriodo = async (lojaId, inicio, fim) => {
  const itensVendidos = await MovimentacaoProduto.findAll({
    attributes: ["quantidadeSaiu"],
    include: [
      {
        model: Produto,
        as: "produto",
        attributes: ["custoUnitario", "preco"],
      },
      {
        model: Movimentacao,
        attributes: [],
        required: true,
        where: {
          dataColeta: { [Op.between]: [inicio, fim] },
        },
        include: [
          {
            model: Maquina,
            as: "maquina",
            attributes: [],
            required: true,
            where: { lojaId },
          },
        ],
      },
    ],
    raw: true,
    nest: true,
  });

  const custoTotal = itensVendidos.reduce((acc, item) => {
    const qtd = Number(item.quantidadeSaiu || 0);
    if (qtd <= 0) return acc;

    const custoUnitario = Number(item.produto?.custoUnitario || 0);
    const precoFallback = Number(item.produto?.preco || 0);
    const custo = custoUnitario > 0 ? custoUnitario : precoFallback;

    return acc + qtd * custo;
  }, 0);

  return Number(custoTotal.toFixed(2));
};

const calcularGastosPeriodo = async (lojaId, inicio, fim) => {
  const [gastoFixoPeriodo, gastoVariavelPeriodo, gastoProdutosPeriodo] =
    await Promise.all([
      calcularGastoFixoProporcional(lojaId, inicio, fim),
      calcularGastoVariavelPeriodo(lojaId, inicio, fim),
      calcularGastoProdutosSaidaPeriodo(lojaId, inicio, fim),
    ]);

  const gastoTotalPeriodo = Number(
    (gastoFixoPeriodo + gastoVariavelPeriodo + gastoProdutosPeriodo).toFixed(2),
  );

  return {
    gastoFixoPeriodo,
    gastoVariavelPeriodo,
    gastoProdutosPeriodo,
    gastoTotalPeriodo,
  };
};

const registroDinheiroController = {
  async obterProximoPeriodo(req, res) {
    try {
      const { lojaId, maquinaId } = req.query;
      if (!lojaId || !maquinaId) {
        return res.status(400).json({ error: "Informe a loja e a máquina." });
      }

      const where = {
        lojaId,
        registrarTotalLoja: false,
        maquinaId,
      };
      const ultimoRegistro = await RegistroDinheiro.findOne({
        where,
        order: [
          ["fim", "DESC"],
          ["createdAt", "DESC"],
        ],
      });

      const fim = new Date();
      const inicio = ultimoRegistro?.fim
        ? new Date(new Date(ultimoRegistro.fim).getTime() + 60 * 1000)
        : new Date(fim.getTime() - 7 * DAY_IN_MS);

      return res.json({
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        possuiHistorico: Boolean(ultimoRegistro),
        ultimoFechamento: ultimoRegistro
          ? {
              id: ultimoRegistro.id,
              inicio: ultimoRegistro.inicio,
              fim: ultimoRegistro.fim,
            }
          : null,
      });
    } catch (err) {
      console.error("[RegistrarDinheiro] Erro ao obter próximo período:", err);
      return res.status(500).json({
        error: "Não foi possível calcular o próximo período.",
      });
    }
  },

  async consultarMachinePay(req, res) {
    try {
      const { maquinaId, inicio, fim } = req.query;

      if (!maquinaId || !inicio || !fim) {
        return res.status(400).json({
          error: "Informe máquina, início e fim para consultar a Machine Pay.",
        });
      }

      const maquina = await Maquina.findByPk(maquinaId, {
        attributes: ["id", "codigo", "nome", "machinePayPosId"],
      });

      if (!maquina) {
        return res.status(404).json({ error: "Máquina não encontrada." });
      }

      if (!maquina.machinePayPosId) {
        return res.status(400).json({
          error: "Esta máquina ainda não possui ID da Machine Pay cadastrado.",
        });
      }

      const dados = await consultarFechamentoMachinePay({
        posId: maquina.machinePayPosId,
        inicio,
        fim,
      });

      return res.json({
        maquinaId: maquina.id,
        machinePayPosId: maquina.machinePayPosId,
        inicio,
        fim,
        ...dados,
      });
    } catch (err) {
      console.error("[MachinePay] Erro ao consultar fechamento:", err);
      return res.status(502).json({
        error: "Não foi possível consultar a Machine Pay.",
        details: err.message,
      });
    }
  },

  async criar(req, res) {
    try {
      const {
        loja,
        maquina,
        inicio,
        fim,
        valorDinheiro,
        valorCartaoPix,
        valorPix,
        valorCartao,
        percentualTaxaCartaoMedia,
        observacoes,
        gastosVariaveis = [],
      } = req.body;

      const ehRegistroTotalLoja = false;

      console.log("[RegistrarDinheiro] Dados recebidos:", req.body);

      if (!loja || !maquina || !inicio || !fim) {
        console.error("[RegistrarDinheiro] Campos obrigatórios ausentes");
        return res
          .status(400)
          .json({
            error:
              "Campos obrigatórios ausentes: loja, máquina, início e fim.",
          });
      }

      const inicioPeriodo = new Date(inicio);
      const fimPeriodo = new Date(fim);

      if (
        Number.isNaN(inicioPeriodo.getTime()) ||
        Number.isNaN(fimPeriodo.getTime())
      ) {
        return res.status(400).json({ error: "Período inválido." });
      }

      if (fimPeriodo < inicioPeriodo) {
        return res
          .status(400)
          .json({ error: "Data fim não pode ser menor que data início." });
      }

      const registroSobreposto = await RegistroDinheiro.findOne({
        where: {
          lojaId: loja,
          maquinaId: ehRegistroTotalLoja ? null : maquina || null,
          registrarTotalLoja: ehRegistroTotalLoja,
          inicio: { [Op.lte]: fimPeriodo },
          fim: { [Op.gte]: inicioPeriodo },
        },
      });
      if (registroSobreposto) {
        return res.status(409).json({
          error:
            "Este período se sobrepõe a um fechamento já registrado para o mesmo local.",
        });
      }

      if (!Array.isArray(gastosVariaveis)) {
        return res
          .status(400)
          .json({ error: "gastosVariaveis deve ser um array." });
      }

      const gastosVariaveisNormalizados = gastosVariaveis
        .map((item) => ({
          nome: String(item?.nome || "").trim(),
          valor: normalizarValorMonetario(item?.valor),
          observacao: item?.observacao ? String(item.observacao).trim() : null,
        }))
        .filter((item) => item.nome.length > 0);

      const totalGastosVariaveisNovos = ehRegistroTotalLoja
        ? gastosVariaveisNormalizados.reduce(
            (acc, item) => acc + Number(item.valor || 0),
            0,
          )
        : 0;

      const gastosPeriodo = ehRegistroTotalLoja
        ? await calcularGastosPeriodo(
            loja,
            inicioDoDia(inicioPeriodo),
            fimDoDia(fimPeriodo),
          )
        : {
            gastoFixoPeriodo: 0,
            gastoVariavelPeriodo: 0,
            gastoProdutosPeriodo: 0,
            gastoTotalPeriodo: 0,
          };

      const gastoVariavelPeriodoFinal = Number(
        (
          gastosPeriodo.gastoVariavelPeriodo + totalGastosVariaveisNovos
        ).toFixed(2),
      );
      const gastoTotalPeriodoFinal = Number(
        (
          gastosPeriodo.gastoFixoPeriodo +
          gastoVariavelPeriodoFinal +
          gastosPeriodo.gastoProdutosPeriodo
        ).toFixed(2),
      );

      const recebeuValoresSeparados =
        valorPix !== undefined || valorCartao !== undefined;
      const valorPixNumero = recebeuValoresSeparados
        ? normalizarValorMonetario(valorPix)
        : 0;
      const valorCartaoNumero = recebeuValoresSeparados
        ? normalizarValorMonetario(valorCartao)
        : normalizarValorMonetario(valorCartaoPix);
      const valorCartaoPixNumero = Number(
        (valorPixNumero + valorCartaoNumero).toFixed(2),
      );
      const percentualTaxaCartaoMediaNumero = Math.max(
        normalizarValorMonetario(percentualTaxaCartaoMedia),
        0,
      );
      const taxaDeCartao = Number(
        (
          valorCartaoNumero *
          (Math.min(percentualTaxaCartaoMediaNumero, 100) / 100)
        ).toFixed(2),
      );
      const valorCartaoPixLiquidoNumero = Number(
        Math.max(valorPixNumero + valorCartaoNumero - taxaDeCartao, 0).toFixed(
          2,
        ),
      );
      const valorCartaoLiquidoNumero = Number(
        Math.max(valorCartaoNumero - taxaDeCartao, 0).toFixed(2),
      );

      const dadosRegistro = {
        lojaId: loja,
        maquinaId: ehRegistroTotalLoja ? null : maquina || null,
        registrarTotalLoja: ehRegistroTotalLoja,
        inicio,
        fim,
        valorDinheiro: normalizarValorMonetario(valorDinheiro),
        valorCartaoPix: valorCartaoPixNumero,
        valorCartaoPixLiquido: valorCartaoPixLiquidoNumero,
        valorPix: valorPixNumero,
        valorCartao: valorCartaoNumero,
        valorCartaoLiquido: valorCartaoLiquidoNumero,
        taxaDeCartao,
        percentualTaxaCartaoMedia: percentualTaxaCartaoMediaNumero,
        gastoFixoPeriodo: ehRegistroTotalLoja
          ? gastosPeriodo.gastoFixoPeriodo
          : 0,
        gastoVariavelPeriodo: ehRegistroTotalLoja
          ? gastoVariavelPeriodoFinal
          : 0,
        gastoProdutosPeriodo: ehRegistroTotalLoja
          ? gastosPeriodo.gastoProdutosPeriodo
          : 0,
        gastoTotalPeriodo: ehRegistroTotalLoja ? gastoTotalPeriodoFinal : 0,
        observacoes,
      };

      const transaction = await sequelize.transaction();

      try {
        const registro = await RegistroDinheiro.create(dadosRegistro, {
          fields: [
            "lojaId",
            "maquinaId",
            "registrarTotalLoja",
            "inicio",
            "fim",
            "valorDinheiro",
            "valorCartaoPix",
            "valorCartaoPixLiquido",
            "valorPix",
            "valorCartao",
            "valorCartaoLiquido",
            "taxaDeCartao",
            "percentualTaxaCartaoMedia",
            "gastoFixoPeriodo",
            "gastoVariavelPeriodo",
            "gastoProdutosPeriodo",
            "gastoTotalPeriodo",
            "observacoes",
          ],
          transaction,
        });

        if (ehRegistroTotalLoja && gastosVariaveisNormalizados.length > 0) {
          const payloadGastosVariaveis = gastosVariaveisNormalizados.map(
            (item) => ({
              lojaId: loja,
              nome: item.nome,
              valor: item.valor,
              observacao: item.observacao,
              dataInicio: inicio,
              dataFim: fim,
              registroDinheiroId: registro.id,
            }),
          );

          await GastoVariavel.bulkCreate(payloadGastosVariaveis, {
            transaction,
          });
        }

        await transaction.commit();
        return res.status(201).json(registro);
      } catch (dbError) {
        await transaction.rollback();
        throw dbError;
      }
    } catch (err) {
      console.error("[RegistrarDinheiro] Erro inesperado:", err);
      return res
        .status(500)
        .json({ error: "Erro ao registrar dinheiro", details: err.message });
    }
  },

  async listar(req, res) {
    try {
      const registros = await RegistroDinheiro.findAll({
        order: [["createdAt", "DESC"]],
      });
      return res.json(registros);
    } catch (err) {
      return res
        .status(500)
        .json({ error: "Erro ao buscar registros", details: err.message });
    }
  },
};

export default registroDinheiroController;
