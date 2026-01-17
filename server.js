import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ========================
   CONFIG
======================== */
const ADMIN_KEY = process.env.ADMIN_KEY;

/* ========================
   RATE LIMIT
======================== */
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
  })
);

/* ========================
   HEALTH
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN - CREATE MERCHANT
======================== */
app.post("/admin/merchant/create", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== ADMIN_KEY) {
      return res.status(401).json({ error: "Não autorizado (admin)" });
    }

    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      `INSERT INTO merchants (merchant_id, api_key, balance)
       VALUES ($1, $2, 0)
       ON CONFLICT (merchant_id) DO NOTHING`,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error("CREATE MERCHANT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   MERCHANT - BALANCE
======================== */
app.get("/merchant/:merchantId/balance", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "API Key ausente" });
    }

    const { merchantId } = req.params;

    const result = await pool.query(
      `SELECT balance FROM merchants
       WHERE merchant_id = $1 AND api_key = $2`,
      [merchantId, apiKey]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    res.json({
      merchantId,
      balance: result.rows[0].balance.toString(),
    });
  } catch (err) {
    console.error("BALANCE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CREATE PAYMENT
======================== */
app.post("/payment/create", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "API Key ausente" });
    }

    const { amountUSDT } = req.body;
    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const merchant = await pool.query(
      `SELECT merchant_id FROM merchants WHERE api_key = $1`,
      [apiKey]
    );

    if (merchant.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    const paymentId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
       VALUES ($1, $2, $3, 'CREATED')`,
      [paymentId, merchant.rows[0].merchant_id, amountUSDT]
    );

    res.json({
      paymentId,
      amountUSDT,
      status: "CREATED",
    });
  } catch (err) {
    console.error("CREATE PAYMENT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CONFIRM PAYMENT
======================== */
app.post("/payment/confirm", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId é obrigatório" });
    }

    const payment = await pool.query(
      `SELECT merchant_id, amount_usdt FROM payments
       WHERE payment_id = $1 AND status = 'CREATED'`,
      [paymentId]
    );

    if (payment.rowCount === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    await pool.query(
      `UPDATE payments SET status = 'PAID' WHERE payment_id = $1`,
      [paymentId]
    );

    await pool.query(
      `UPDATE merchants
       SET balance = balance + $1
       WHERE merchant_id = $2`,
      [payment.rows[0].amount_usdt, payment.rows[0].merchant_id]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso",
    });
  } catch (err) {
    console.error("CONFIRM PAYMENT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   GET PAYMENT STATUS
======================== */
app.get("/payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;

    const result = await pool.query(
      `SELECT payment_id, amount_usdt, status
       FROM payments WHERE payment_id = $1`,
      [paymentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("GET PAYMENT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("API rodando na porta", PORT)
);