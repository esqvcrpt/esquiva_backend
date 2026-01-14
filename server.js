import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// Middleware lojista
// =====================
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-merchant-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API Key obrigatória" });
  }

  const result = await pool.query(
    "SELECT id FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (result.rowCount === 0) {
    return res.status(403).json({ error: "API Key inválida" });
  }

  req.merchantId = result.rows[0].id;
  next();
}

// =====================
// Health check
// =====================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

// =====================
// Criar pagamento
// =====================
app.post("/payment/create", merchantAuth, async (req, res) => {
  const { amountBRL } = req.body;

  if (!amountBRL) {
    return res.status(400).json({ error: "amountBRL obrigatório" });
  }

  const paymentId = crypto.randomUUID();
  const usdtAmount = amountBRL / 10; // exemplo conversão fixa

  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, 'CREDIT', $2, $3)
    `,
    [req.merchantId, usdtAmount, paymentId]
  );

  res.json({
    paymentId,
    status: "PENDING"
  });
});

// =====================
// Confirmar pagamento
// =====================
app.post("/payment/confirm", merchantAuth, async (req, res) => {
  const { paymentId } = req.body;

  await pool.query(
    `
    UPDATE transactions
    SET reference = reference
    WHERE reference = $1 AND merchant_id = $2
    `,
    [paymentId, req.merchantId]
  );

  res.json({
    paymentId,
    status: "PAID"
  });
});

// =====================
// Ver saldo do lojista
// =====================
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const result = await pool.query(
    `
    SELECT
      COALESCE(SUM(
        CASE
          WHEN type = 'CREDIT' THEN amount_usdt
          WHEN type = 'DEBIT' THEN -amount_usdt
        END
      ), 0) AS balance
    FROM transactions
    WHERE merchant_id = $1
    `,
    [req.merchantId]
  );

  res.json({
    merchantId: req.merchantId,
    balanceUSDT: result.rows[0].balance
  });
});

// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});