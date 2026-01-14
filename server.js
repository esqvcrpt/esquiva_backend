require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// PostgreSQL
// ==============================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ==============================
// ADMIN AUTH
// ==============================
function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}

// ==============================
// CREATE PAYMENT (PIX)
// ==============================
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = uuidv4();
  const usdtAmount = Number(amountBRL) / 5; // mock conversão

  res.json({
    paymentId,
    status: "PENDING",
    usdtAmount,
    pixCopyPaste: "000201010212...",
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`
  });
});

// ==============================
// CONFIRM PAYMENT
// ==============================
app.post("/payment/confirm", async (req, res) => {
  const { paymentId, merchantId, usdtAmount } = req.body;

  if (!paymentId || !merchantId || !usdtAmount) {
    return res.status(400).json({ error: "Dados obrigatórios ausentes" });
  }

  await pool.query(
    `INSERT INTO transactions 
     (merchant_id, type, amount_usdt, reference)
     VALUES ($1, 'CREDIT', $2, $3)`,
    [merchantId, usdtAmount, paymentId]
  );

  res.json({
    paymentId,
    status: "PAID"
  });
});

// ==============================
// MERCHANT BALANCE
// ==============================
app.get("/merchant/:merchantId/balance", async (req, res) => {
  const { merchantId } = req.params;

  const result = await pool.query(
    `SELECT COALESCE(SUM(
      CASE 
        WHEN type='CREDIT' THEN amount_usdt
        WHEN type='DEBIT' THEN -amount_usdt
      END
    ),0) AS balance
     FROM transactions
     WHERE merchant_id=$1`,
    [merchantId]
  );

  res.json({
    merchantId,
    balanceUSDT: Number(result.rows[0].balance)
  });
});

// ==============================
// REQUEST WITHDRAW
// ==============================
app.post("/withdraw/request", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res
      .status(400)
      .json({ error: "merchantId e amountUSDT são obrigatórios" });
  }

  await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')`,
    [merchantId, amountUSDT]
  );

  res.json({ message: "Saque solicitado" });
});

// ==============================
// LIST WITHDRAWALS (ADMIN)
// ==============================
app.get(
  "/admin/withdrawals",
  adminAuth,
  async (req, res) => {
    const result = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );
    res.json(result.rows);
  }
);

// ==============================
// APPROVE WITHDRAW (ADMIN)
// ==============================
app.post(
  "/admin/withdraw/:id/approve",
  adminAuth,
  async (req, res) => {
    const { id } = req.params;

    const w = await pool.query(
      "SELECT * FROM withdrawals WHERE id=$1",
      [id]
    );

    if (w.rows.length === 0) {
      return res.status(404).json({ error: "Saque não encontrado" });
    }

    const withdrawal = w.rows[0];

    await pool.query(
      `INSERT INTO transactions
       (merchant_id, type, amount_usdt, reference)
       VALUES ($1, 'DEBIT', $2, $3)`,
      [withdrawal.merchant_id, withdrawal.amount_usdt, `withdraw_${id}`]
    );

    await pool.query(
      "UPDATE withdrawals SET status='PAID' WHERE id=$1",
      [id]
    );

    res.json({
      id,
      status: "PAID",
      message: "Saque aprovado com sucesso"
    });
  }
);

// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Backend live on port", PORT);
});