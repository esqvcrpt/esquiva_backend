const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Conexão PostgreSQL (Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 🔹 Inicializar tabelas
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      balance_usdt NUMERIC DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      merchant_id TEXT,
      amount_brl NUMERIC,
      amount_usdt NUMERIC,
      status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

initDB();

// 🔹 Criar pagamento
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = uuidv4();
  const usdtAmount = Number(amountBRL) / 5; // taxa fictícia

  await pool.query(
    `INSERT INTO payments (id, merchant_id, amount_brl, amount_usdt, status)
     VALUES ($1, $2, $3, $4, 'PENDING')`,
    [paymentId, merchantId, amountBRL, usdtAmount]
  );

  await pool.query(
    `INSERT INTO merchants (id, balance_usdt)
     VALUES ($1, 0)
     ON CONFLICT (id) DO NOTHING`,
    [merchantId]
  );

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`,
    status: "PENDING"
  });
});

// 🔹 Confirmar pagamento
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  const payment = await pool.query(
    `SELECT * FROM payments WHERE id = $1`,
    [paymentId]
  );

  if (payment.rows.length === 0) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  if (payment.rows[0].status === "PAID") {
    return res.json({ message: "Pagamento já confirmado" });
  }

  await pool.query(
    `UPDATE payments SET status = 'PAID' WHERE id = $1`,
    [paymentId]
  );

  await pool.query(
    `UPDATE merchants
     SET balance_usdt = balance_usdt + $1
     WHERE id = $2`,
    [payment.rows[0].amount_usdt, payment.rows[0].merchant_id]
  );

  const balance = await pool.query(
    `SELECT balance_usdt FROM merchants WHERE id = $1`,
    [payment.rows[0].merchant_id]
  );

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: balance.rows[0].balance_usdt
  });
});

// 🔹 Ver saldo do lojista
app.get("/merchant/:merchantId/balance", async (req, res) => {
  const { merchantId } = req.params;

  const result = await pool.query(
    `SELECT balance_usdt FROM merchants WHERE id = $1`,
    [merchantId]
  );

  res.json({
    merchantId,
    balanceUSDT: result.rows[0]?.balance_usdt || 0
  });
});

// 🔹 Porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});