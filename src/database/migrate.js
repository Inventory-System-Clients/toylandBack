import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import Sequelize from "sequelize";
import { sequelize } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const garantirTabelaDeControle = async (queryInterface) => {
  const tabelas = await queryInterface.showAllTables();
  const nomes = tabelas.map((tabela) =>
    typeof tabela === "string" ? tabela : tabela.tableName,
  );
  if (!nomes.includes("SequelizeMeta")) {
    await queryInterface.createTable("SequelizeMeta", {
      name: { type: Sequelize.STRING, allowNull: false, primaryKey: true },
    });
  }
};

const main = async () => {
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  await garantirTabelaDeControle(queryInterface);

  const [linhas] = await sequelize.query('SELECT name FROM "SequelizeMeta"');
  const jaAplicadas = new Set(linhas.map((linha) => linha.name));

  const arquivos = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((arquivo) => arquivo.endsWith(".js"))
    .sort();

  let executadas = 0;
  for (const arquivo of arquivos) {
    if (jaAplicadas.has(arquivo)) continue;

    const migration = require(path.join(MIGRATIONS_DIR, arquivo));
    console.log(`▶ Aplicando migration: ${arquivo}`);
    await migration.up(queryInterface, Sequelize);
    await sequelize.query(
      'INSERT INTO "SequelizeMeta" (name) VALUES (:name)',
      { replacements: { name: arquivo } },
    );
    executadas += 1;
  }

  console.log(
    executadas === 0
      ? "✅ Nenhuma migration pendente."
      : `✅ ${executadas} migration(ns) aplicada(s) com sucesso.`,
  );

  await sequelize.close();
};

main().catch(async (error) => {
  console.error("❌ Erro ao rodar migrations:", error);
  await sequelize.close();
  process.exit(1);
});
