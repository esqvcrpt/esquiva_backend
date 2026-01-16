import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import pool from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   MIDDLEWARES
========================= */
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
app.use(limiter);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =========================
   HELPERS
========================= */
function requireAdmin(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }

  next();
}

function requireMerchant(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }
  req.apiKey = apiKey;
  next();
}

/* =========================
   ADMIN – CRIAR LOJISTA
========================= */
app.post("/admin/merchant/create", requireAdmin, async (req, res) => {
  try {
    const { merchantId } = req.body;

    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO merchants (merchant_id, api_key, balance)
      VALUES ($1, $2, 0)
      `,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   LOJISTA – CRIAR PAGAMENTO
========================= */
app.post("/payment/create", requireMerchant, async (req, res) => {
  try {
    const { amountUSDT } = req.body;

    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const merchant = await pool.query(
      `SELECT merchant_id FROM merchants WHERE api_key = $1`,
      [req.apiKey]
    );

    if (merchant.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    const paymentId = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
      VALUES ($1, $2, $3, 'CREATED')
      `,
      [paymentId, merchant.rows[0].merchant_id, amountUSDT]
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
   ADMIN – CONFIRMAR PAGAMENTO
========================= */
app.post("/admin/payment/confirm", requireAdmin, async (req, res) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId é obrigatório" });
    }

    const payment = await pool.query(
      `SELECT * FROM payments WHERE payment_id = $1`,
      [paymentId]
    );

    if (payment.rowCount === 0) {
      return res.status(404).json({ error: "Pagamento não encontrado" });
    }

    if (payment.rows[0].status === "PAID") {
      return res.json({ status: "PAID", message: "Pagamento já confirmado" });
    }

    await pool.query(
      `UPDATE payments SET status = 'PAID' WHERE payment_id = $1`,
      [paymentId]
    );

    await pool.query(
      `
      UPDATE merchants
      SET balance = balance + $1
      WHERE merchant_id = $2
      `,
      [payment.rows[0].amount_usdt, payment.rows[0].merchant_id]
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
   LOJISTA – CONSULTAR SALDO
========================= */
app.get("/merchant/balance", requireMerchant, async (req, res) => {
  try {
    const merchant = await pool.query(
      `SELECT merchant_id, balance FROM merchants WHERE api_key = $1`,
      [req.apiKey]
    );

    if (merchant.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    res.json({
      merchantId: merchant.rows[0].merchant_id,
      balance: merchant.rows[0].balance.toString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   LOJISTA – SOLICITAR SAQUE
========================= */
app.post("/merchant/withdraw", requireMerchant, async (req, res) => {
  try {
    const { amountUSDT } = req.body;

    if (!amountUSDT) {
      return res.status(400).json({ error: "amountUSDT é obrigatório" });
    }

    const merchant = await pool.query(
      `SELECT * FROM merchants WHERE api_key = $1`,
      [req.apiKey]
    );

    if (merchant.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    if (Number(merchant.rows[0].balance) < Number(amountUSDT)) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    const withdraw = await pool.query(
      `
      INSERT INTO withdrawals (merchant_id, amount_usdt, status)
      VALUES ($1, $2, 'PAID')
      RETURNING id
      `,
      [merchant.rows[0].merchant_id, amountUSDT]
    );

    await pool.query(
      `
      UPDATE merchants
      SET balance = balance - $1
      WHERE merchant_id = $2
      `,
      [amountUSDT, merchant.rows[0].merchant_id]
    );

    res.json({
      id: withdraw.rows[0].id,
      status: "PAID",
      message: "Saque aprovado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});