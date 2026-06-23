import { Op } from "sequelize";
import { GastoFixoLoja, GastoFixoLojaMensal } from "../models/index.js";

export const chaveMes = (ano, mes) => Number(ano) * 100 + Number(mes);

export const mesAnterior = (ano, mes) =>
  Number(mes) === 1
    ? { ano: Number(ano) - 1, mes: 12 }
    : { ano: Number(ano), mes: Number(mes) - 1 };

export const resolverGastosFixosDoMes = async (
  lojaId,
  ano,
  mes,
  { transaction } = {},
) => {
  const alvo = chaveMes(ano, mes);
  const [base, versoes] = await Promise.all([
    GastoFixoLoja.findAll({
      where: { lojaId },
      raw: true,
      transaction,
    }),
    GastoFixoLojaMensal.findAll({
      where: {
        lojaId,
        [Op.or]: [
          { ano: { [Op.lt]: Number(ano) } },
          { ano: Number(ano), mes: { [Op.lte]: Number(mes) } },
        ],
      },
      order: [
        ["ano", "ASC"],
        ["mes", "ASC"],
        ["propagar", "DESC"],
        ["id", "ASC"],
      ],
      raw: true,
      transaction,
    }),
  ]);

  const mapa = new Map(
    base.map((item) => [
      item.nome,
      {
        nome: item.nome,
        valor: Number(item.valor || 0),
        observacao: item.observacao || "",
        ativo: true,
        origem: "base",
      },
    ]),
  );

  versoes
    .filter((item) => item.propagar && chaveMes(item.ano, item.mes) <= alvo)
    .forEach((item) => {
      mapa.set(item.nome, {
        nome: item.nome,
        valor: Number(item.valor || 0),
        observacao: item.observacao || "",
        ativo: item.ativo,
        origem: "vigencia",
      });
    });

  versoes
    .filter(
      (item) =>
        !item.propagar &&
        Number(item.ano) === Number(ano) &&
        Number(item.mes) === Number(mes),
    )
    .forEach((item) => {
      mapa.set(item.nome, {
        nome: item.nome,
        valor: Number(item.valor || 0),
        observacao: item.observacao || "",
        ativo: item.ativo,
        origem: "excecao",
      });
    });

  return [...mapa.values()]
    .filter((item) => item.ativo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
};

export const calcularTotalGastosFixosMes = async (
  lojaId,
  ano,
  mes,
  options,
) => {
  const gastos = await resolverGastosFixosDoMes(
    lojaId,
    ano,
    mes,
    options,
  );
  return Number(
    gastos
      .reduce((total, gasto) => total + Number(gasto.valor || 0), 0)
      .toFixed(2),
  );
};
