import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  // MERCHANTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      balance NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // PAYMENTS
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount_usdt NUMERIC NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // WITHDRAWALS
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
}

initDB().catch(err => {
  console.error("Erro ao inicializar banco:", err);
  process.exit(1);
});