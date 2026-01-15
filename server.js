import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// ==================
// CONFIG
// ==================
const ADMIN_KEY = process.env.ADMIN_KEY;

// ==================
// STORAGE EM MEMÓRIA
// ==================
const merchants = {}; // merchantId -> { merchantId, apiKey }
const merchantBalances = {}; // merchantId -> balance
const payments = {}; // paymentId -> payment data

// ==================
// HEALTH
// ==================
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

// ==================
// ADMIN - CRIAR LOJISTA
// ==================
app.post("/admin/merchant/create", (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  const { merchantId } = req.body;

  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  if (!merchantId) {
    return res.status(400).json({ error: "merchantId é obrigatório" });
  }

  const apiKey = crypto.randomUUID();

  merchants[merchantId] = {
    merchantId,
    apiKey
  };

  merchantBalances[merchantId] = 0;

  res.json({
    merchantId,
    apiKey
  });
});

// ==================
// CRIAR PAGAMENTO (PIX SIMULADO)
// ==================
app.post("/payment/create", (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const { amountBRL } = req.body;

  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  if (!amountBRL || amountBRL <= 0) {
    return res.status(400).json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const merchant = Object.values(merchants).find(
    (m) => m.apiKey === apiKey
  );

  if (!merchant) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  const paymentId = crypto.randomUUID();
  const amountUSDT = amountBRL / 5; // conversão simulada

  payments[paymentId] = {
    paymentId,
    merchantId: merchant.merchantId,
    amountUSDT,
    status: "CREATED"
  };

  res.json({
    paymentId,
    amountUSDT,
    status: "CREATED"
  });
});

// ==================
// CONFIRMAR PAGAMENTO
// ==================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  const payment = payments[paymentId];

  if (!payment) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  if (payment.status === "PAID") {
    return res.json({ status: "Já confirmado" });
  }

  payment.status = "PAID";
  merchantBalances[payment.merchantId] += payment.amountUSDT;

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

// ==================
// SALDO DO LOJISTA
// ==================
app.get("/merchant/balance", (req, res) => {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const merchant = Object.values(merchants).find(
    (m) => m.apiKey === apiKey
  );

  if (!merchant) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  res.json({
    merchantId: merchant.merchantId,
    balance: merchantBalances[merchant.merchantId].toString()
  });
});

// ==================
// SOLICITAR SAQUE
// ==================
app.post("/merchant/withdraw", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  const { amountUSDT } = req.body;

  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  if (!amountUSDT || amountUSDT <= 0) {
    return res.status(400).json({ error: "amountUSDT inválido" });
  }

  const merchant = Object.values(merchants).find(
    (m) => m.apiKey === apiKey
  );

  if (!merchant) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  const merchantId = merchant.merchantId;
  const balance = merchantBalances[merchantId];

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  merchantBalances[merchantId] -= amountUSDT;

  const result = await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')
     RETURNING id, amount_usdt, status`,
    [merchantId, amountUSDT]
  );

  res.json({
    id: result.rows[0].id,
    amountUSDT: result.rows[0].amount_usdt,
    status: result.rows[0].status
  });
});

// ==================
// ADMIN - LISTAR SAQUES
// ==================
app.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// ==================
// START
// ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});