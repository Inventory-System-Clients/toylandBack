import { sequelize } from "./src/database/connection.js";
import { QueryTypes } from "sequelize";

try {
  // Buscar maquinas com nome ou codigo '10'
  const maquinas = await sequelize.query(
    `SELECT id, nome, codigo, "lojaId" FROM maquinas WHERE codigo = '10' OR nome ILIKE '%maq10%' OR nome ILIKE '%maquina 10%' OR nome ILIKE '%10INT%'`,
    { type: QueryTypes.SELECT },
  );
  console.log("🖥️  Máquinas encontradas:", JSON.stringify(maquinas, null, 2));

  if (maquinas.length === 0) {
    // buscar todas para o usuário identificar
    const todas = await sequelize.query(
      `SELECT id, nome, codigo, "lojaId" FROM maquinas ORDER BY nome LIMIT 30`,
      { type: QueryTypes.SELECT },
    );
    console.log("Todas as máquinas:", JSON.stringify(todas, null, 2));
  } else {
    for (const maq of maquinas) {
      console.log(
        `\n📋 Movimentações da máquina ${maq.nome} (id=${maq.id}, lojaId=${maq.lojaId}):`,
      );

      const movs = await sequelize.query(
        `SELECT m.id, m."dataColeta", m."totalPre", m.sairam, m.abastecidas, m."totalPos", m."tipoOcorrencia", m.observacoes
         FROM movimentacoes m
         WHERE m."maquinaId" = :maqId
         ORDER BY m."dataColeta" DESC
         LIMIT 5`,
        { replacements: { maqId: maq.id }, type: QueryTypes.SELECT },
      );
      console.log("Movimentações:", JSON.stringify(movs, null, 2));

      // Para cada movimentação, buscar os produtos
      for (const mov of movs) {
        const prods = await sequelize.query(
          `SELECT mp."produtoId", p.nome, mp."quantidadeAbastecida", mp."quantidadeSaiu", mp."retiradaProduto"
           FROM movimentacao_produtos mp
           JOIN produtos p ON p.id = mp."produtoId"
           WHERE mp."movimentacaoId" = :movId`,
          { replacements: { movId: mov.id }, type: QueryTypes.SELECT },
        );
        console.log(
          `  → Mov ${mov.id} (${mov.dataColeta?.toISOString?.() ?? mov.dataColeta}) abast=${mov.abastecidas} produtos:`,
          JSON.stringify(prods, null, 2),
        );
      }

      // Estoque atual da loja da máquina
      console.log(`\n📦 Estoque atual da loja ${maq.lojaId}:`);
      const estoque = await sequelize.query(
        `SELECT el."produtoId", p.nome, el.quantidade
         FROM estoque_lojas el
         JOIN produtos p ON p.id = el."produtoId"
         WHERE el."lojaId" = :lojaId
         ORDER BY p.nome`,
        { replacements: { lojaId: maq.lojaId }, type: QueryTypes.SELECT },
      );
      console.log(JSON.stringify(estoque, null, 2));
    }
  }
} catch (err) {
  console.error("Erro:", err.message);
} finally {
  await sequelize.close();
}
