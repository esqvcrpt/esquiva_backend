require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();

// ===== MIDDLEWARES =====
app.use(cors());
app.use(express.json());

// ===== IMPORTS =====
const withdrawalsRoutes = require("./routes/withdrawals");

// ===== DADOS EM MEMÓRIA (SIMULAÇÃO) =====
const payments = {};
const merchantBalances = {};

// ===== ROTAS =====

// 🔹 Criar pagamento PIX
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = uuidv4();
  const usdtAmount = amountBRL / 5; // conversão simulada

  payments[paymentId] = {
    merchantId,
    amountBRL,
    usdtAmount,
    status: "PENDING",
  };

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`,
    status: "PENDING",
  });
});

// 🔹 Confirmar pagamento
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  const { merchantId, usdtAmount } = payments[paymentId];

  merchantBalances[merchantId] =
    (merchantBalances[merchantId] || 0) + usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[merchantId],
  });
});

// 🔹 Consultar status do pagamento
app.get("/payment/status/:paymentId", (req, res) => {
  const { paymentId } = req.params;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  res.json({
    paymentId,
    status: payments[paymentId].status,
  });
});

// 🔹 Consultar saldo do lojista
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0,
  });
});

// ===== ROTAS DE SAQUE (POSTGRES) =====
app.use(withdrawalsRoutes);

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});