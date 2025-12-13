import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
import crypto from "crypto";

app.post("/payment/create", (req, res) => {
  const { amount, merchantId } = req.body;

  const paymentId = crypto.randomUUID();

  res.json({
    paymentId,
    amount,
    merchantId,
    pixCopyPaste: "00020101021226850014br.gov.bcb.pix...",
    qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_FAKE_" + paymentId,
    status: "PENDING"
  });
});
const payments = {};

app.post("/payment/create", (req, res) => {
  const { amount, merchantId } = req.body;
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
    qrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_" + paymentId,
    status: "PENDING"
  });
});
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Payment not found" });
  }

  payments[paymentId].status = "PAID";

  res.json({
    paymentId,
    status: "PAID"
  });
});
