import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();

/* ========================
   CONFIG BÁSICA
======================== */
app.use(cors());
app.use(express.json());

const ADMIN_KEY = process.env.admin_key;

/* ========================
   RATE LIMIT
======================== */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300
});
app.use(limiter);

/* ========================
   MIDDLEWARES
======================== */
function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

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

/* ========================
   HEALTH CHECK
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN — CRIAR LOJISTA
======================== */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  try {
    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = uuidv4();

    await pool.query(
      "INSERT INTO merchants (merchant_id, api_key) VALUES ($1, $2)",
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   CRIAR PAGAMENTO
======================== */
app.post("/payment/create", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;
    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const paymentId = uuidv4();

    await pool.query(
      "INSERT INTO payments (id, merchant_id, amount_usdt, status) VALUES ($1,$2,$3,'CREATED')",
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

/* ========================
   CONFIRMAR PAGAMENTO
======================== */
app.post("/payment/confirm", adminAuth, async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId é obrigatório" });
    }

    await pool.query(
      "UPDATE payments SET status='PAID' WHERE id=$1",
      [paymentId]
    );

    const { rows } = await pool.query(
      "SELECT merchant_id, amount_usdt FROM payments WHERE id=$1",
      [paymentId]
    );

    await pool.query(
      "UPDATE balances SET balance = balance + $1 WHERE merchant_id=$2",
      [rows[0].amount_usdt, rows[0].merchant_id]
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

/* ========================
   SALDO DO LOJISTA
======================== */
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT balance FROM balances WHERE merchant_id=$1",
    [req.merchantId]
  );

  res.json({
    merchantId: req.merchantId,
    balance: rows[0]?.balance || 0
  });
});

/* ========================
   SAQUE
======================== */
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;

    const { rows } = await pool.query(
      "SELECT balance FROM balances WHERE merchant_id=$1",
      [req.merchantId]
    );

    if (!rows[0] || Number(rows[0].balance) < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      "UPDATE balances SET balance = balance - $1 WHERE merchant_id=$2",
      [amountUSDT, req.merchantId]
    );

    res.json({
      status: "PAID",
      message: "Saque aprovado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START SERVER
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server rodando na porta", PORT);
});