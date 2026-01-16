import pool from "./db.js";

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      balance NUMERIC DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount_usdt NUMERIC NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Banco inicializado com sucesso");
}

initDB().then(() => process.exit(0));