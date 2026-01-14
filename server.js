import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// health
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

// criar pagamento
const payments = {};

app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = uuidv4();
  const usdtAmount = Number(amountBRL) / 5;

  payments[paymentId] = {
    paymentId,
    merchantId,
    usdtAmount,
    status: "PENDING"
  };

  res.json({
    paymentId,
    status: "PENDING"
  });
});

// confirmar pagamento
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  await pool.query(
    "INSERT INTO transactions (merchant_id, type, amount_usdt, reference) VALUES ($1,$2,$3,$4)",
    [
      payments[paymentId].merchantId,
      "CREDIT",
      payments[paymentId].usdtAmount,
      paymentId
    ]
  );

  res.json({
    paymentId,
    status: "PAID"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});