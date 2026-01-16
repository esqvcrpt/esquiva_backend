import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   HEALTH
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =========================
   ADMIN AUTH
========================= */
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

/* =========================
   MERCHANT AUTH
========================= */
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    "SELECT merchant_id FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = rows[0].merchant_id;
  next();
}

/* =========================
   CREATE MERCHANT (ADMIN)
========================= */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  try {
    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      "INSERT INTO merchants (merchant_id, api_key) VALUES ($1, $2)",
      [merchantId, apiKey]
    );

    await pool.query(
      "INSERT INTO balances (merchant_id, balance_usdt) VALUES ($1, 0)",
      [merchantId]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   CREATE PAYMENT
========================= */
app.post("/payment/create", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;
    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const paymentId = crypto.randomUUID();

    await pool.query(
      "INSERT INTO payments (payment_id, merchant_id, amount_usdt, status) VALUES ($1, $2, $3, 'CREATED')",
      [paymentId, req.merchantId, amountUSDT]
    );

    res.json({
      paymentId,
      amountUSDT,
      status: "CREATED"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   CONFIRM PAYMENT
========================= */
app.post("/payment/confirm", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId é obrigatório" });
    }

    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE payment_id = $1",
      [paymentId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    const payment = rows[0];

    if (payment.status === "PAID") {
      return res.json({ paymentId, status: "PAID" });
    }

    await pool.query(
      "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
      [paymentId]
    );

    await pool.query(
      "UPDATE balances SET balance_usdt = balance_usdt + $1 WHERE merchant_id = $2",
      [payment.amount_usdt, payment.merchant_id]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   MERCHANT BALANCE
========================= */
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT balance_usdt FROM balances WHERE merchant_id = $1",
    [req.merchantId]
  );

  res.json({
    merchantId: req.merchantId,
    balance: rows[0]?.balance_usdt || 0
  });
});

/* =========================
   WITHDRAW
========================= */
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;
    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const { rows } = await pool.query(
      "SELECT balance_usdt FROM balances WHERE merchant_id = $1",
      [req.merchantId]
    );

    if (Number(rows[0].balance_usdt) < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      "UPDATE balances SET balance_usdt = balance_usdt - $1 WHERE merchant_id = $2",
      [amountUSDT, req.merchantId]
    );

    await pool.query(
      "INSERT INTO withdrawals (merchant_id, amount_usdt, status) VALUES ($1, $2, 'PAID')",
      [req.merchantId, amountUSDT]
    );

    res.json({ status: "Saque realizado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});