const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  try {
    console.log("🔄 Inicializando banco de dados...");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        reference TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("✅ Tabelas criadas com sucesso");
  } catch (err) {
    console.error("❌ Erro ao criar tabelas:", err.message);
  }
}

module.exports = initDB;