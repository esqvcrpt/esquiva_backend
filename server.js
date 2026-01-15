import express from "express";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
app.use(express.json());

/* =========================
   RATE LIMIT (SEGURANÇA)
========================= */
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: "Muitas requisições, tente novamente" }
});
app.use(limiter);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =========================
   MIDDLEWARES
========================= */
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const result = await pool.query(
    "SELECT * FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (result.rowCount === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchant = result.rows[0];
  next();
}

/* =========================
   ADMIN — CRIAR LOJISTA
========================= */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  const { merchantId } = req.body;
  if (!merchantId) {
    return res.status(400).json({ error: "merchantId obrigatório" });
  }

  const apiKey = uuidv4();

  await pool.query(
    `INSERT INTO merchants (merchant_id, api_key)
     VALUES ($1, $2)`,
    [merchantId, apiKey]
  );

  res.json({ merchantId, apiKey });
});

/* =========================
   LOJISTA — CRIAR PAGAMENTO
========================= */
app.post("/merchant/payment", merchantAuth, async (req, res) => {
  const { amountBRL } = req.body;
  if (!amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = uuidv4();
  const amountUSDT = Number(amountBRL) / 5;

  await pool.query(
    `INSERT INTO payments
     (payment_id, merchant_id, amount_usdt, status)
     VALUES ($1, $2, $3, 'CREATED')`,
    [paymentId, req.merchant.merchant_id, amountUSDT]
  );

  res.json({ paymentId, amountUSDT, status: "CREATED" });
});

/* =========================
   CONFIRMAR PAGAMENTO
========================= */
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: "paymentId obrigatório" });
  }

  const result = await pool.query(
    "SELECT * FROM payments WHERE payment_id = $1",
    [paymentId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  const payment = result.rows[0];

  if (payment.status !== "CREATED") {
    return res.status(400).json({ error: "Pagamento já processado" });
  }

  await pool.query(
    "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
    [paymentId]
  );

  await pool.query(
    `INSERT INTO transactions
     (merchant_id, type, amount_usdt, reference)
     VALUES ($1, 'CREDIT', $2, $3)`,
    [payment.merchant_id, payment.amount_usdt, paymentId]
  );

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

/* =========================
   SALDO DO LOJISTA
========================= */
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const credit = await pool.query(
    "SELECT COALESCE(SUM(amount_usdt),0) FROM transactions WHERE merchant_id=$1 AND type='CREDIT'",
    [req.merchant.merchant_id]
  );

  const debit = await pool.query(
    "SELECT COALESCE(SUM(amount_usdt),0) FROM transactions WHERE merchant_id=$1 AND type='DEBIT'",
    [req.merchant.merchant_id]
  );

  const balance =
    Number(credit.rows[0].coalesce) -
    Number(debit.rows[0].coalesce);

  res.json({
    merchantId: req.merchant.merchant_id,
    balance: balance.toString()
  });
});

/* =========================
   SAQUE
========================= */
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;
  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT obrigatório" });
  }

  const balanceResult = await pool.query(
    `SELECT
      COALESCE(SUM(CASE WHEN type='CREDIT' THEN amount_usdt ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN type='DEBIT' THEN amount_usdt ELSE 0 END),0)
     AS balance
     FROM transactions WHERE merchant_id=$1`,
    [req.merchant.merchant_id]
  );

  const balance = Number(balanceResult.rows[0].balance);

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    `INSERT INTO withdrawals
     (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'PAID')`,
    [req.merchant.merchant_id, amountUSDT]
  );

  await pool.query(
    `INSERT INTO transactions
     (merchant_id, type, amount_usdt, reference)
     VALUES ($1, 'DEBIT', $2, 'withdraw')`,
    [req.merchant.merchant_id, amountUSDT]
  );

  res.json({
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("API rodando na porta", PORT)
);