import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// ===== MEMÓRIA (MVP) =====
const payments = {};
const merchantBalances = {};
const withdrawals = [];

// ===== CONFIG =====
const BRL_TO_USDT_RATE = 5; // Ex: R$5 = 1 USDT

// ===== ROTAS =====
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// ===== CRIAR PAGAMENTO =====
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();

  payments[paymentId] = {
    paymentId,
    merchantId,
    amountBRL,
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

// ===== CONFIRMAR PAGAMENTO =====
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
    return res.json({ message: "Pagamento já confirmado" });
  }

  payment.status = "PAID";

  const usdtAmount = payment.amountBRL / BRL_TO_USDT_RATE;

  merchantBalances[payment.merchantId] =
    (merchantBalances[payment.merchantId] || 0) + usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[payment.merchantId]
  });
});

// ===== CONSULTAR SALDO =====
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// ===== SOLICITAR SAQUE =====
app.post("/merchant/withdraw", (req, res) => {
  const { merchantId, amountUSDT, walletAddress } = req.body;

  if (!merchantId || !amountUSDT || !walletAddress) {
    return res.status(400).json({
      error: "merchantId, amountUSDT e walletAddress são obrigatórios"
    });
  }

  const balance = merchantBalances[merchantId] || 0;

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  merchantBalances[merchantId] -= amountUSDT;

  withdrawals.push({
    merchantId,
    amountUSDT,
    walletAddress,
    status: "PENDING",
    createdAt: new Date()
  });

  res.json({
    merchantId,
    withdrawn: amountUSDT,
    remainingBalance: merchantBalances[merchantId],
    status: "PENDING"
  });
});

// ===== LISTAR SAQUES (ADMIN) =====
app.get("/admin/withdrawals", (req, res) => {
  res.json(withdrawals);
});

// ===== SERVER =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});