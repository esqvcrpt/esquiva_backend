import express from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
app.use(express.json());

/* =====================
   MIDDLEWARES
===================== */

function adminAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
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

/* =====================
   HEALTH CHECK
===================== */

app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =====================
   ADMIN
===================== */

// Criar lojista
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  const { merchantId } = req.body;
  if (!merchantId) {
    return res.status(400).json({ error: "merchantId obrigatório" });
  }

  const apiKey = uuidv4();

  await pool.query(
    "INSERT INTO merchants (merchant_id, api_key, balance) VALUES ($1, $2, 0)",
    [merchantId, apiKey]
  );

  res.json({ merchantId, apiKey });
});

// Listar saques pendentes
app.get("/admin/withdraws", adminAuth, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM withdrawals WHERE status = 'REQUESTED'"
  );
  res.json(result.rows);
});

// Aprovar saque
app.post("/admin/withdraw/approve", adminAuth, async (req, res) => {
  const { withdrawalId } = req.body;

  const result = await pool.query(
    "SELECT * FROM withdrawals WHERE id = $1 AND status = 'REQUESTED'",
    [withdrawalId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Saque não encontrado" });
  }

  const withdrawal = result.rows[0];

  await pool.query(
    "UPDATE merchants SET balance = balance - $1 WHERE merchant_id = $2",
    [withdrawal.amount_usdt, withdrawal.merchant_id]
  );

  await pool.query(
    "UPDATE withdrawals SET status = 'PAID' WHERE id = $1",
    [withdrawalId]
  );

  res.json({ status: "PAID", withdrawalId });
});

/* =====================
   MERCHANT
===================== */

// Criar pagamento
app.post("/merchant/payment/create", merchantAuth, async (req, res) => {
  const { amountBRL } = req.body;
  if (!amountBRL) {
    return res.status(400).json({ error: "amountBRL obrigatório" });
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

// Confirmar pagamento
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  const result = await pool.query(
    "SELECT * FROM payments WHERE payment_id = $1",
    [paymentId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  const payment = result.rows[0];

  await pool.query(
    "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
    [paymentId]
  );

  await pool.query(
    "UPDATE merchants SET balance = balance + $1 WHERE merchant_id = $2",
    [payment.amount_usdt, payment.merchant_id]
  );

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso",
  });
});

// Ver saldo
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  res.json({
    merchantId: req.merchant.merchant_id,
    balance: req.merchant.balance,
  });
});

// Solicitar saque
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;

  if (req.merchant.balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  const result = await pool.query(
    `INSERT INTO withdrawals 
     (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')
     RETURNING *`,
    [req.merchant.merchant_id, amountUSDT]
  );

  res.json(result.rows[0]);
});

/* =====================
   START
===================== */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API rodando na porta", PORT);
});