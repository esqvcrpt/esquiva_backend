const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// MEMÓRIA (SIMPLES, SEM DB AINDA)
// ===============================
const payments = {};
const merchantBalances = {};

// ===============================
// ROTAS BÁSICAS
// ===============================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// ===============================
// CRIAR PAGAMENTO
// ===============================
app.post("/payment/create", (req, res) => {
  const { amountBRL, merchantId } = req.body;

  if (!amountBRL || !merchantId) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = crypto.randomUUID();
  const usdtAmount = amountBRL / 5; // exemplo fixo

  payments[paymentId] = {
    paymentId,
    merchantId,
    amountBRL,
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

// ===============================
// CONFIRMAR PAGAMENTO
// ===============================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  const merchantId = payments[paymentId].merchantId;
  const usdtAmount = payments[paymentId].usdtAmount;

  merchantBalances[merchantId] =
    (merchantBalances[merchantId] || 0) + usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[merchantId]
  });
});

// ===============================
// VER SALDO
// ===============================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});