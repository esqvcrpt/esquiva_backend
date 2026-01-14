const pool = require("./db");

async function initDB() {
  try {
    console.log("⏳ Inicializando banco de dados...");

    // Tabela de merchants (lojistas)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchants (
        id TEXT PRIMARY KEY,
        balance_usdt NUMERIC DEFAULT 0
      );
    `);

    // Tabela de pagamentos
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        amount_brl NUMERIC NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabela de saques
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        merchant_id TEXT NOT NULL,
        amount_usdt NUMERIC NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Tabela de transações (ledger)
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

    console.log("✅ Banco de dados inicializado com sucesso");
    process.exit(0);
  } catch (err) {
    console.error("❌ Erro ao inicializar banco:", err);
    process.exit(1);
  }
}

initDB();