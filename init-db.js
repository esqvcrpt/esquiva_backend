import pool from "./db.js";

async function init() {
  try {
    /* ========================
       MERCHANTS
    ======================== */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        merchant_id TEXT PRIMARY KEY,
        api_key TEXT NOT NULL,
        balance NUMERIC DEFAULT 0
      );
    `);

    /* ========================
       PAYMENTS
    ======================== */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        payment_id TEXT PRIMARY KEY,
        merchant_id TEXT REFERENCES merchants(merchant_id),
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

init();