import express from "express";
import cors from "cors";
import crypto from "crypto";
import { Pool } from "pg";

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// PostgreSQL
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =======================
// INIT DATABASE
// =======================
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

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT,
      amount_usdt NUMERIC,
      status TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}
initDB();

// =======================
// HEALTH
// =======================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =======================
// CREATE PAYMENT
// =======================
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = crypto.randomUUID();
  const usdtAmount = Number(amountBRL) / 5; // conversão simples (exemplo)

  await pool.query(
    `INSERT INTO payments (id, merchant_id, amount_brl, amount_usdt, status)
     VALUES ($1, $2, $3, $4, 'PENDING')`,
    [paymentId, merchantId, amountBRL, usdtAmount]
  );

  await pool.query(
    `INSERT INTO merchants (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING`,
    [merchantId]
  );

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_" +
      paymentId,
    status: "PENDING"
  });
});

// =======================
// CONFIRM PAYMENT
// =======================
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

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

  res.json({
    paymentId,
    status: "PAID"
  });
});

// =======================
// MERCHANT BALANCE
// =======================
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

// =======================
// WITHDRAW REQUEST
// =======================
app.post("/withdraw/request", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({
      error: "merchantId e amountUSDT são obrigatórios"
    });
  }

  const merchant = await pool.query(
    `SELECT balance_usdt FROM merchants WHERE id = $1`,
    [merchantId]
  );

  if (merchant.rows.length === 0) {
    return res.status(404).json({ error: "Lojista não encontrado" });
  }

  if (Number(merchant.rows[0].balance_usdt) < Number(amountUSDT)) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    `UPDATE merchants
     SET balance_usdt = balance_usdt - $1
     WHERE id = $2`,
    [amountUSDT, merchantId]
  );

  await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'PENDING')`,
    [merchantId, amountUSDT]
  );

  res.json({
    merchantId,
    amountUSDT,
    status: "WITHDRAW_REQUESTED"
  });
});

// =======================
// ADMIN — LIST WITHDRAWALS
// =======================
app.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    `SELECT * FROM withdrawals ORDER BY created_at DESC`
  );

  res.json(result.rows);
});

// =======================
const PORT = process.env.PORT || 3000;
app.get("/debug/env", (req, res) => {
  res.json({
    adminKeyFromEnv: process.env.ADMIN_KEY || null
  });
});
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});