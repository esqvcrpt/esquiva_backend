import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// MEMÓRIA (MVP)
// =====================
const payments = {};
const merchantBalances = {};
const withdrawals = [];

// =====================
// HEALTHCHECK
// =====================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =====================
// CRIAR PAGAMENTO (PIX)
// =====================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = crypto.randomUUID();

  // conversão mock (exemplo: 1 USDT = 5 BRL)
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

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[payment.merchantId]
  });
});

// =====================
// STATUS DO PAGAMENTO
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
// SALDO DO LOJISTA
// =====================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// =====================
// SAQUE (SEMI-CUSTODIAL)
// =====================
app.post("/merchant/withdraw", (req, res) => {
  const { merchantId, amountUSDT, walletAddress } = req.body;

  if (!merchantId || !amountUSDT || !walletAddress) {
    return res.status(400).json({
      error: "merchantId, amountUSDT e walletAddress são obrigatórios"
    });
  }

  const balance = merchantBalances[merchantId] || 0;

  if (balance < amountUSDT) {
    return res.status(400).json({
      error: "Saldo insuficiente"
    });
  }

  merchantBalances[merchantId] -= amountUSDT;

  const withdrawal = {
    id: crypto.randomUUID(),
    merchantId,
    amountUSDT,
    walletAddress,
    status: "PENDING",
    createdAt: new Date()
  };

  withdrawals.push(withdrawal);

  res.json({
    message: "Saque solicitado com sucesso",
    withdrawal
  });
});

// =====================
// ADMIN – LISTAR SAQUES
// =====================
app.get("/admin/withdrawals", (req, res) => {
  res.json(withdrawals);
});

// =====================
// ADMIN – CONFIRMAR SAQUE
// =====================
app.post("/admin/withdrawals/:id/complete", (req, res) => {
  const { id } = req.params;

  const withdrawal = withdrawals.find(w => w.id === id);

  if (!withdrawal) {
    return res.status(404).json({ error: "Saque não encontrado" });
  }

  withdrawal.status = "COMPLETED";

  res.json({
    message: "Saque concluído",
    withdrawal
  });
});

// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});