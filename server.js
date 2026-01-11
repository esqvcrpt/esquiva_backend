import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// MEMÓRIA TEMPORÁRIA
// =====================
const payments = {};
const merchantBalances = {};

// =====================
// HEALTH CHECK
// =====================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =====================
// CRIAR PAGAMENTO
// =====================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();

  // conversão fake: R$50 = 10 USDT
  const usdtAmount = amountBRL / 5;

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

// =====================
// CONFIRMAR PAGAMENTO
// =====================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  const payment = payments[paymentId];
  if (!payment) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payment.status = "PAID";

  merchantBalances[payment.merchantId] =
    (merchantBalances[payment.merchantId] || 0) + payment.usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[payment.merchantId]
  });
});

// =====================
// VER SALDO DO LOJISTA
// =====================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// =====================
// SOLICITAR SAQUE
// =====================
app.post("/merchant/:merchantId/withdraw", async (req, res) => {
  const { merchantId } = req.params;
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  const balance = merchantBalances[merchantId] || 0;
  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  merchantBalances[merchantId] -= amountUSDT;

  await pool.query(
    "INSERT INTO withdrawals (merchant_id, amount_usdt, status) VALUES ($1,$2,$3)",
    [merchantId, amountUSDT, "REQUESTED"]
  );

  res.json({
    merchantId,
    amountUSDT,
    status: "REQUESTED"
  });
});

// =====================
// ADMIN — VER SAQUES
// =====================
app.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});