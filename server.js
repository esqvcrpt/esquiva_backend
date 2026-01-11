import express from "express";
import cors from "cors";
import crypto from "crypto";
import pkg from "pg";

const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// ENV
// =====================
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY;

// =====================
// DATABASE
// =====================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// =====================
// MEMORY (simples)
// =====================
const payments = {};
const merchantBalances = {};

// =====================
// HEALTH
// =====================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =====================
// 1️⃣ CRIAR PAGAMENTO
// =====================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();
  const usdtAmount = Number(amountBRL) / 5; // conversão simples exemplo

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
// 2️⃣ CONFIRMAR PAGAMENTO
// =====================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  const payment = payments[paymentId];
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
// 3️⃣ STATUS PAGAMENTO
// =====================
app.get("/payment/status/:paymentId", (req, res) => {
  const { paymentId } = req.params;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  res.json({
    paymentId,
    status: payments[paymentId].status
  });
});

// =====================
// 4️⃣ SALDO LOJISTA
// =====================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// =====================
// 5️⃣ SOLICITAR SAQUE
// =====================
app.post("/merchant/:merchantId/withdraw", async (req, res) => {
  const { merchantId } = req.params;
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  if ((merchantBalances[merchantId] || 0) < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  merchantBalances[merchantId] -= amountUSDT;

  await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')`,
    [merchantId, amountUSDT]
  );

  res.json({
    merchantId,
    amountUSDT,
    status: "REQUESTED"
  });
});

// =====================
// 6️⃣ ADMIN - LISTAR SAQUES
// =====================
app.get("/admin/withdrawals", async (req, res) => {
  const key = req.headers["x-admin-key"];

  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// =====================
// START
// =====================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});