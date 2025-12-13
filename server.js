import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json());

// Memória temporária de pagamentos
const payments = {};

// Rota raiz
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

// Health check
app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// Criar pagamento (simulação Pix)
app.post("/payment/create", (req, res) => {
  const { amount, merchantId } = req.body;

  if (!amount || !merchantId) {
    return res.status(400).json({ error: "amount and merchantId are required" });
  }

  const paymentId = crypto.randomUUID();

  payments[paymentId] = {
    paymentId,
    amount,
    merchantId,
    status: "PENDING",
    createdAt: new Date().toISOString()
  };

  res.json({
    paymentId,
    amount,
    merchantId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_" +
      paymentId,
    status: "PENDING"
  });
});

// Confirmar pagamento (simulação de webhook Pix)
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId is required" });
  }

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Payment not found" });
  }

  payments[paymentId].status = "PAID";
  payments[paymentId].paidAt = new Date().toISOString();

  res.json({
    paymentId,
    status: "PAID"
  });
});

// Consultar pagamento
app.get("/payment/:paymentId", (req, res) => {
  const { paymentId } = req.params;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Payment not found" });
  }

  res.json(payments[paymentId]);
});

// Start do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
