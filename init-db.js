import pool from "./db.js";

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        merchant_id TEXT PRIMARY KEY,
        api_key TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS balances (
        merchant_id TEXT PRIMARY KEY,
        balance_usdt NUMERIC DEFAULT 0
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id TEXT PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        status TEXT NOT NULL,
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

    console.log("Banco inicializado com sucesso");
    process.exit(0);
  } catch (err) {
    console.error("Erro ao inicializar banco:", err);
    process.exit(1);
  }
}

initDB();