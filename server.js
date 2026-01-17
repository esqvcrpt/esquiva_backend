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
       VALUES ($1, $2, 0)`,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error("ERRO CREATE MERCHANT:", err);
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
    console.error("ERRO BALANCE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   PAYMENT - CREATE
======================== */
app.post("/payment/create", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "API Key ausente" });
    }

    const { merchantId, amountUSDT } = req.body;

    if (!merchantId || !amountUSDT) {
      return res.status(400).json({
        error: "merchantId e amountUSDT são obrigatórios",
      });
    }

    // valida lojista
    const merchant = await pool.query(
      `SELECT merchant_id FROM merchants
       WHERE merchant_id = $1 AND api_key = $2`,
      [merchantId, apiKey]
    );

    if (merchant.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    const paymentId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
       VALUES ($1, $2, $3, 'CREATED')`,
      [paymentId, merchantId, amountUSDT]
    );

    res.json({
      paymentId,
      amountUSDT,
      status: "CREATED",
    });
  } catch (err) {
    console.error("ERRO PAYMENT CREATE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   PAYMENT - CONFIRM
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

    const { merchant_id, amount_usdt } = payment.rows[0];

    await pool.query(
      `UPDATE payments SET status = 'PAID' WHERE payment_id = $1`,
      [paymentId]
    );

    await pool.query(
      `UPDATE merchants
       SET balance = balance + $1
       WHERE merchant_id = $2`,
      [amount_usdt, merchant_id]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso",
    });
  } catch (err) {
    console.error("ERRO PAYMENT CONFIRM:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("API rodando na porta", PORT);
});