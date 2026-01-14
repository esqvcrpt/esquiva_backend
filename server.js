import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// =======================
// STORAGE EM MEMÓRIA
// =======================
const payments = {};
const merchantBalances = {};

// =======================
// ROTAS BÁSICAS
// =======================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =======================
// CRIAR PAGAMENTO
// =======================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = crypto.randomUUID();

  // Conversão fake: 1 USDT = 10 BRL
  const usdtAmount = Number(amountBRL) / 10;

  payments[paymentId] = {
    paymentId,
    merchantId,
    usdtAmount,
    status: "PENDING"
  };

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
// CONFIRMAR PAGAMENTO
// =======================
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  const payment = payments[paymentId];

  if (!payment) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  if (payment.status === "PAID") {
    return res.json({
      paymentId,
      status: "PAID",
      balanceUSDT: merchantBalances[payment.merchantId] || 0
    });
  }

  payment.status = "PAID";

  merchantBalances[payment.merchantId] =
    (merchantBalances[payment.merchantId] || 0) + payment.usdtAmount;

  // REGISTRA TRANSAÇÃO (CRÉDITO)
  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, $2, $3, $4)
    `,
    [
      payment.merchantId,
      "CREDIT",
      payment.usdtAmount,
      paymentId
    ]
  );

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[payment.merchantId]
  });
});

// =======================
// SALDO DO LOJISTA
// =======================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// =======================
// SOLICITAR SAQUE
// =======================
app.post("/merchant/withdraw", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({
      error: "merchantId e amountUSDT são obrigatórios"
    });
  }

  const balance = merchantBalances[merchantId] || 0;

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    `
    INSERT INTO withdrawals (merchant_id, amount_usdt, status)
    VALUES ($1, $2, 'REQUESTED')
    `,
    [merchantId, amountUSDT]
  );

  res.json({
    message: "Saque solicitado com sucesso"
  });
});

// =======================
// LISTAR SAQUES (ADMIN)
// =======================
app.get("/admin/withdrawals", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// =======================
// APROVAR SAQUE (ADMIN)
// =======================
app.post("/admin/withdraw/:id/approve", async (req, res) => {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { id } = req.params;

  const result = await pool.query(
    "SELECT * FROM withdrawals WHERE id = $1",
    [id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Saque não encontrado" });
  }

  const withdrawal = result.rows[0];

  if (withdrawal.status === "PAID") {
    return res.json({
      id,
      status: "PAID",
      message: "Saque já aprovado"
    });
  }

  merchantBalances[withdrawal.merchant_id] -= Number(withdrawal.amount_usdt);

  await pool.query(
    "UPDATE withdrawals SET status = 'PAID' WHERE id = $1",
    [id]
  );

  // REGISTRA TRANSAÇÃO (DÉBITO)
  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, $2, $3, $4)
    `,
    [
      withdrawal.merchant_id,
      "DEBIT",
      withdrawal.amount_usdt,
      `withdrawal_${withdrawal.id}`
    ]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});