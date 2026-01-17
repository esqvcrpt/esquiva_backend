import pool from "./db.js";

async function initDB() {
  await pool.query(`
    DROP TABLE IF EXISTS merchants CASCADE;

    CREATE TABLE merchants (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT UNIQUE NOT NULL,
      api_key TEXT UNIQUE NOT NULL,
      balance NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log("Tabela merchants recriada com balance");
}

initDB()
  .then(() => process.exit())
  .catch(err => {
    console.error("ERRO INIT DB:", err);
    process.exit(1);
  });