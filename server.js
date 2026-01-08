import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// memória simples (temporária)
const payments = {};

app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// Criar pagamento
app.post("/payment/create", (req, res) => {
  const { amount, merchantId } = req.body;

  if (!amount || !merchantId) {
    return res.status(400).json({ error: "amount e merchantId são obrigatórios" });
  }

  const paymentId = crypto.randomUUID();

  payments[paymentId] = {
    paymentId,
    amount,
    merchantId,
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
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  res.json({
    paymentId,
    status: "PAID"
  });
});
// Confirmar pagamento
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
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
