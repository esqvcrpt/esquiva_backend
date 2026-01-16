import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

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
   AUTH MIDDLEWARES
======================== */
function requireAdmin(req, res, next) {
  const admin_key = req.headers["x-admin-key"];

  if (!admin_key || admin_key !== process.env.admin_key) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }

  next();
}

async function requireMerchant(req, res, next) {
  const admin_key = req.headers["x-admin-key"];
  if (!admin_key) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    "SELECT merchant_id FROM merchants WHERE admin_key = $1",
    [admin_key]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = rows[0].merchant_id;
  next();
}

/* ========================
   HEALTH
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN
======================== */
app.post("/admin/merchant/create", requireAdmin, async (req, res) => {
  try {
    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const admin_key = crypto.randomUUID();

    await pool.query(
      "INSERT INTO merchants (merchant_id, admin_key) VALUES ($1, $2)",
      [merchantId, admin_key]
    );

    res.json({ merchantId, admin_key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   PAYMENTS
======================== */
app.post("/payment/create", requireMerchant, async (req, res) => {
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
      status: "CREATED",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

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

    await pool.query(
      "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
      [paymentId]
    );

    await pool.query(
      `INSERT INTO transactions
       (merchant_id, type, amount_usdt, reference)
       VALUES ($1, 'CREDIT', $2, $3)`,
      [payment.merchant_id, payment.amount_usdt, paymentId]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   BALANCE
======================== */
app.get("/merchant/balance", requireMerchant, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(
      CASE WHEN type='CREDIT' THEN amount_usdt ELSE -amount_usdt END
    ),0) AS balance
     FROM transactions WHERE merchant_id = $1`,
    [req.merchantId]
  );

  res.json({
    merchantId: req.merchantId,
    balance: rows[0].balance,
  });
});

/* ========================
   WITHDRAW
======================== */
app.post("/merchant/withdraw", requireMerchant, async (req, res) => {
  try {
    const { amountUSDT } = req.body;
    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(
        CASE WHEN type='CREDIT' THEN amount_usdt ELSE -amount_usdt END
      ),0) AS balance
       FROM transactions WHERE merchant_id = $1`,
      [req.merchantId]
    );

    if (Number(rows[0].balance) < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      `INSERT INTO transactions
       (merchant_id, type, amount_usdt, reference)
       VALUES ($1, 'DEBIT', $2, 'WITHDRAW')`,
      [req.merchantId, amountUSDT]
    );

    res.json({ message: "Saque solicitado com sucesso" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("Server running on port", PORT)
);