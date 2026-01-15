import express from "express";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(express.json());

// =========================
// CONFIG
// =========================
const ADMIN_KEY = process.env.ADMIN_KEY;

// =========================
// MEMÓRIA (controle simples)
// =========================
const merchants = new Map();
const payments = new Map();

// =========================
// MIDDLEWARES
// =========================
function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

function merchantAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const merchant = [...merchants.entries()].find(
    ([, value]) => value.apiKey === key
  );

  if (!merchant) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = merchant[0];
  req.merchant = merchant[1];
  next();
}

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

// =========================
// ADMIN — CRIAR LOJISTA
// =========================
app.post("/admin/merchant/create", adminAuth, (req, res) => {
  const { merchantId } = req.body;

  if (!merchantId) {
    return res.status(400).json({ error: "merchantId obrigatório" });
  }

  const apiKey = crypto.randomUUID();

  merchants.set(merchantId, {
    apiKey,
    balance: 0
  });

  res.json({ merchantId, apiKey });
});

// =========================
// MERCHANT — CRIAR PAGAMENTO
// =========================
app.post("/payment/create", merchantAuth, (req, res) => {
  const { amountBRL } = req.body;

  if (!amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  // Conversão fake: 1 USDT = 5 BRL
  const amountUSDT = Number(amountBRL) / 5;

  const paymentId = crypto.randomUUID();

  payments.set(paymentId, {
    merchantId: req.merchantId,
    amountUSDT,
    status: "CREATED"
  });

  res.json({
    paymentId,
    amountUSDT,
    status: "CREATED"
  });
});

// =========================
// CONFIRMAR PAGAMENTO (SIMULA PIX)
// =========================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId || !payments.has(paymentId)) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  const payment = payments.get(paymentId);
  payment.status = "PAID";

  const merchant = merchants.get(payment.merchantId);
  merchant.balance += Number(payment.amountUSDT);

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

// =========================
// MERCHANT — CONSULTAR SALDO
// =========================
app.get("/merchant/balance", merchantAuth, (req, res) => {
  res.json({
    merchantId: req.merchantId,
    balance: String(req.merchant.balance)
  });
});

// =========================
// MERCHANT — SOLICITAR SAQUE
// =========================
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT obrigatório" });
  }

  if (Number(amountUSDT) > req.merchant.balance) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    "INSERT INTO withdrawals (merchant_id, amount_usdt, status) VALUES ($1,$2,$3)",
    [req.merchantId, amountUSDT, "REQUESTED"]
  );

  req.merchant.balance -= Number(amountUSDT);

  res.json({
    message: "Saque solicitado com sucesso"
  });
});

// =========================
// ADMIN — LISTAR SAQUES
// =========================
app.get("/admin/withdrawals", adminAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );
  res.json(rows);
});

// =========================
// ADMIN — APROVAR SAQUE
// =========================
app.post("/admin/withdraw/approve", adminAuth, async (req, res) => {
  const { id } = req.body;

  await pool.query(
    "UPDATE withdrawals SET status='PAID' WHERE id=$1",
    [id]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server rodando na porta", PORT);
});