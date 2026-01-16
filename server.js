import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ========================
   RATE LIMIT
======================== */
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
});
app.use(limiter);

/* ========================
   HEALTH CHECK
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN AUTH
======================== */
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

/* ========================
   MERCHANT AUTH
======================== */
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    "SELECT * FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchant = rows[0];
  next();
}

/* ========================
   ADMIN - CREATE MERCHANT
======================== */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  try {
    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      `INSERT INTO merchants (merchant_id, api_key, balance)
       VALUES ($1, $2, 0)`,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CREATE PAYMENT
======================== */
app.post("/payment/create", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;
  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  const paymentId = crypto.randomUUID();

  await pool.query(
    `INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
     VALUES ($1, $2, $3, 'CREATED')`,
    [paymentId, req.merchant.merchant_id, amountUSDT]
  );

  res.json({ paymentId, amountUSDT, status: "CREATED" });
});

/* ========================
   CONFIRM PAYMENT
======================== */
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  await pool.query(
    `UPDATE payments SET status = 'PAID' WHERE payment_id = $1`,
    [paymentId]
  );

  const { rows } = await pool.query(
    `SELECT merchant_id, amount_usdt FROM payments WHERE payment_id = $1`,
    [paymentId]
  );

  const payment = rows[0];

  await pool.query(
    `UPDATE merchants
     SET balance = balance + $1
     WHERE merchant_id = $2`,
    [payment.amount_usdt, payment.merchant_id]
  );

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso",
  });
});

/* ========================
   MERCHANT BALANCE  ✅ AQUI ESTAVA FALTANDO
======================== */
app.post("/merchant/balance", merchantAuth, async (req, res) => {
  res.json({
    merchantId: req.merchant.merchant_id,
    balance: req.merchant.balance.toString(),
  });
});

/* ========================
   MERCHANT WITHDRAW
======================== */
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  if (Number(req.merchant.balance) < Number(amountUSDT)) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    `UPDATE merchants SET balance = balance - $1 WHERE merchant_id = $2`,
    [amountUSDT, req.merchant.merchant_id]
  );

  res.json({
    status: "PAID",
    message: "Saque aprovado com sucesso",
  });
});

/* ========================
   START SERVER
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});