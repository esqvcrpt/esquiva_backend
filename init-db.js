import pool from "./db.js";

async function init() {
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

  console.log("DB pronto");
  process.exit(0);
}

init();