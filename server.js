import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   MIDDLEWARES
========================= */

// Admin auth
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

// Merchant auth
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const result = await pool.query(
    "SELECT merchant_id FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (result.rowCount === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = result.rows[0].merchant_id;
  next();
}

/* =========================
   HEALTH CHECK
========================= */

app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =========================
   ADMIN
========================= */

// Criar lojista
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

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   PAYMENTS
========================= */

// Criar pagamento
app.post("/payment/create", merchantAuth, async (req, res) => {
  try {
    const { amountBRL } = req.body;
    if (!amountBRL) {
      return res
        .status(400)
        .json({ error: "merchantId e amountBRL são obrigatórios" });
    }

    const amountUSDT = Number(amountBRL) / 5;
    const paymentId = crypto.randomUUID();

    await pool.query(
      `INSERT INTO payments 
      (payment_id, merchant_id, amount_usdt, status)
      VALUES ($1, $2, $3, 'CREATED')`,
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

// Confirmar pagamento
app.post("/payment/confirm", async (req, res) => {
  try {
    const { paymentId } = req.body;
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId é obrigatório" });
    }

    const result = await pool.query(
      "SELECT * FROM payments WHERE payment_id = $1",
      [paymentId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    const payment = result.rows[0];

    await pool.query(
      "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
      [paymentId]
    );

    await pool.query(
      `UPDATE merchants 
       SET balance_usdt = balance_usdt + $1 
       WHERE merchant_id = $2`,
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
   MERCHANT
========================= */

// Ver saldo
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT balance_usdt FROM merchants WHERE merchant_id = $1",
      [req.merchantId]
    );

    res.json({
      merchantId: req.merchantId,
      balance: result.rows[0].balance_usdt.toString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// Solicitar saque
app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  try {
    const { amountUSDT } = req.body;

    const balanceResult = await pool.query(
      "SELECT balance_usdt FROM merchants WHERE merchant_id = $1",
      [req.merchantId]
    );

    const balance = Number(balanceResult.rows[0].balance_usdt);

    if (balance < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      `UPDATE merchants 
       SET balance_usdt = balance_usdt - $1 
       WHERE merchant_id = $2`,
      [amountUSDT, req.merchantId]
    );

    await pool.query(
      `INSERT INTO withdrawals 
       (merchant_id, amount_usdt, status)
       VALUES ($1, $2, 'REQUESTED')`,
      [req.merchantId, amountUSDT]
    );

    res.json({ status: "Saque solicitado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Esquiva API rodando na porta", PORT);
});