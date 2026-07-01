import { sequelize } from "./src/database/connection.js";

async function run() {
  try {
    console.log("🔄 Conectando ao banco...");
    await sequelize.authenticate();
    console.log("✅ Conectado!");

    console.log("\n📝 Adicionando coluna machine_pay_usr_id na tabela maquinas...");
    await sequelize.query(`
      ALTER TABLE maquinas
      ADD COLUMN IF NOT EXISTS machine_pay_usr_id VARCHAR(50) DEFAULT NULL;
    `);

    console.log("✅ Coluna machine_pay_usr_id adicionada com sucesso!");
    console.log("   Tabela: maquinas");
    console.log("   Uso: ID do cliente no painel Machine Pay para status Online/Offline em tempo real");
  } catch (err) {
    console.error("❌ Erro:", err.message);
  } finally {
    await sequelize.close();
  }
}

run();
