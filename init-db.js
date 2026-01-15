import pool from "./db.js";

async function init() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id SERIAL PRIMARY KEY,
        merchant_id TEXT UNIQUE NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        payment_id TEXT UNIQUE NOT NULL,
        merchant_id TEXT NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

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

    console.log("Banco inicializado com sucesso");

    // 🔴 ISSO É O PONTO-CHAVE
    await pool.end(); // fecha conexão
    process.exit(0);
  } catch (err) {
    console.error("Erro ao inicializar banco:", err);
    process.exit(1);
  }
}

init();