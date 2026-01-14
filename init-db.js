import pool from "./db.js";

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
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

  console.log("Banco inicializado com sucesso");
}

initDB()
  .then(() => process.exit())
  .catch(err => {
    console.error(err);
    process.exit(1);
  });