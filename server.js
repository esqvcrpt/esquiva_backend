const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors());
app.use(express.json());

// ==============================
// MEMÓRIA (simples, sem banco)
// ==============================
const payments = {};
const merchantBalances = {};

// ==============================
// FUNÇÃO PARA CREDITAR LOJISTA
// ==============================
function creditMerchant(merchantId, amount) {
  if (!merchantBalances[merchantId]) {
    merchantBalances[merchantId] = 0;
  }
  merchantBalances[merchantId] += amount;
}

// ==============================
// CRIAR PAGAMENTO
// ==============================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();

  // Simulação simples de conversão
  const usdtAmount = amountBRL / 5;

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
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`,
    status: "PENDING"
  });
});

// ==============================
// CONFIRMAR PAGAMENTO
// ==============================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  creditMerchant(
    payments[paymentId].merchantId,
    payments[paymentId].usdtAmount
  );

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[payments[paymentId].merchantId]
  });
});

// ==============================
// STATUS DO PAGAMENTO
// ==============================
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

// ==============================
// SALDO DO LOJISTA
// ==============================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// ==============================
// START SERVER
// ==============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});