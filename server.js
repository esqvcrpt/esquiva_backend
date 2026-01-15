import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   CONFIG
================================ */
const ADMIN_KEY = process.env.ADMIN_KEY;

/* ===============================
   STORAGE EM MEMÓRIA (MVP)
================================ */
const merchants = {}; // merchantId -> { apiKey }
const payments = {};  // paymentId -> payment data

/* ===============================
   MIDDLEWARES
================================ */
function authenticateAdmin(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

function authenticateMerchant(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  const merchant = Object.entries(merchants).find(
    ([, value]) => value.apiKey === apiKey
  );

  if (!merchant) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = merchant[0];
  next();
}

/* ===============================
   HEALTH
================================ */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ===============================
   ADMIN — CRIAR LOJISTA
================================ */
app.post("/admin/merchant/create", authenticateAdmin, (req, res) => {
  const { merchantId } = req.body;

  if (!merchantId) {
    return res.status(400).json({ error: "merchantId é obrigatório" });
  }

  if (merchants[merchantId]) {
    return res.status(400).json({ error: "Lojista já existe" });
  }

  const apiKey = crypto.randomUUID();
  merchants[merchantId] = { apiKey };

  res.json({ merchantId, apiKey });
});

/* ===============================
   PAGAMENTO — CRIAR
================================ */
app.post("/payment/create", authenticateMerchant, async (req, res) => {
  const { amountBRL } = req.body;

  if (!amountBRL) {
    return res.status(400).json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();
  const amountUSDT = Number(amountBRL) / 5; // conversão fictícia

  payments[paymentId] = {
    paymentId,
    merchantId: req.merchantId,
    amountUSDT,
    status: "CREATED"
  };

  res.json({
    paymentId,
    amountUSDT,
    status: "CREATED"
  });
});

/* ===============================
   PAGAMENTO — CONFIRMAR
================================ */
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId || !payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  const payment = payments[paymentId];
  payment.status = "PAID";

  // CREDIT no ledger
  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, 'CREDIT', $2, $3)
    `,
    [payment.merchantId, payment.amountUSDT, paymentId]
  );

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

/* ===============================
   SALDO DO LOJISTA
================================ */
app.get("/merchant/balance", authenticateMerchant, async (req, res) => {
  const merchantId = req.merchantId;

  const credit = await pool.query(
    `
    SELECT COALESCE(SUM(amount_usdt),0) AS total
    FROM transactions
    WHERE merchant_id=$1 AND type='CREDIT'
    `,
    [merchantId]
  );

  const debit = await pool.query(
    `
    SELECT COALESCE(SUM(amount_usdt),0) AS total
    FROM transactions
    WHERE merchant_id=$1 AND type='DEBIT'
    `,
    [merchantId]
  );

  const balance =
    Number(credit.rows[0].total) - Number(debit.rows[0].total);

  res.json({ merchantId, balance });
});

/* ===============================
   SAQUE — SOLICITAR (LOJISTA)
================================ */
app.post("/merchant/withdraw", authenticateMerchant, async (req, res) => {
  const { amountUSDT } = req.body;
  const merchantId = req.merchantId;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  const balanceResult = await pool.query(
    `
    SELECT COALESCE(
      SUM(CASE WHEN type='CREDIT' THEN amount_usdt ELSE 0 END) -
      SUM(CASE WHEN type='DEBIT' THEN amount_usdt ELSE 0 END)
    ,0) AS balance
    FROM transactions
    WHERE merchant_id=$1
    `,
    [merchantId]
  );

  const balance = Number(balanceResult.rows[0].balance);

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  const result = await pool.query(
    `
    INSERT INTO withdrawals (merchant_id, amount_usdt, status)
    VALUES ($1, $2, 'REQUESTED')
    RETURNING id
    `,
    [merchantId, amountUSDT]
  );

  res.json({
    withdrawalId: result.rows[0].id,
    status: "REQUESTED"
  });
});

/* ===============================
   SAQUE — APROVAR (ADMIN)
================================ */
app.post("/admin/withdraw/:id/approve", authenticateAdmin, async (req, res) => {
  const { id } = req.params;

  const withdrawal = await pool.query(
    `SELECT * FROM withdrawals WHERE id=$1`,
    [id]
  );

  if (!withdrawal.rows.length) {
    return res.status(404).json({ error: "Saque não encontrado" });
  }

  const { merchant_id, amount_usdt } = withdrawal.rows[0];

  await pool.query(
    `UPDATE withdrawals SET status='PAID' WHERE id=$1`,
    [id]
  );

  // DEBIT no ledger
  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, 'DEBIT', $2, $3)
    `,
    [merchant_id, amount_usdt, id]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

/* ===============================
   EXTRATO (LEDGER)
================================ */
app.get("/merchant/transactions", authenticateMerchant, async (req, res) => {
  const result = await pool.query(
    `
    SELECT type, amount_usdt, reference, created_at
    FROM transactions
    WHERE merchant_id=$1
    ORDER BY created_at DESC
    `,
    [req.merchantId]
  );

  res.json(result.rows);
});

/* ===============================
   START
================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Esquiva API rodando na porta", PORT);
});