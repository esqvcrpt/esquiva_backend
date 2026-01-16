import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ========================
   CONFIG
======================== */
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error("ADMIN_KEY não definida no environment");
  process.exit(1);
}

/* ========================
   RATE LIMIT
======================== */
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
app.use(limiter);

/* ========================
   MIDDLEWARE ADMIN
======================== */
function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

/* ========================
   MIDDLEWARE MERCHANT
======================== */
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    "SELECT id, merchant_id FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchant = rows[0];
  next();
}

/* ========================
   HEALTH CHECK
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN — CRIAR LOJISTA
======================== */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  try {
    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      "INSERT INTO merchants (merchant_id, api_key) VALUES ($1, $2)",
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CRIAR PAGAMENTO
======================== */
app.post("/payment/create", merchantAuth, async (req, res) => {
  try {
    const { amountBRL } = req.body;
    if (!amountBRL) {
      return res.status(400).json({ error: "amountBRL obrigatório" });
    }

    const paymentId = crypto.randomUUID();
    const amountUSDT = Number(amountBRL) / 5;

    await pool.query(
      `INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
       VALUES ($1, $2, $3, 'CREATED')`,
      [paymentId, req.merchant.merchant_id, amountUSDT]
    );

    res.json({
      paymentId,
      amountUSDT,
      status: "CREATED"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CONFIRMAR PAGAMENTO
======================== */
app.post("/payment/confirm", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId obrigatório" });
    }

    await pool.query(
      "UPDATE payments SET status='PAID' WHERE payment_id=$1",
      [paymentId]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CONSULTAR SALDO
======================== */
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount_usdt),0) as balance
     FROM payments
     WHERE merchant_id=$1 AND status='PAID'`,
    [req.merchant.merchant_id]
  );

  res.json({
    merchantId: req.merchant.merchant_id,
    balance: rows[0].balance
  });
});

/* ========================
   SAQUE
======================== */
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(amount_usdt),0) as balance
       FROM payments
       WHERE merchant_id=$1 AND status='PAID'`,
      [req.merchant.merchant_id]
    );

    if (Number(rows[0].balance) < Number(amountUSDT)) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
       VALUES ($1, $2, 'PAID')`,
      [req.merchant.merchant_id, amountUSDT]
    );

    res.json({
      status: "PAID",
      message: "Saque aprovado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server rodando na porta", PORT);
});