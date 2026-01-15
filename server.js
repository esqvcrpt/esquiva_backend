import express from "express";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
const PORT = process.env.PORT || 3000;

/* =======================
   MIDDLEWARES
======================= */
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200
});
app.use(limiter);

/* =======================
   KEYS
======================= */
const ADMIN_KEY = process.env.ADMIN_KEY;

/* =======================
   HEALTH CHECK
======================= */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =======================
   ADMIN – CRIAR LOJISTA
======================= */
app.post("/admin/merchant/create", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== ADMIN_KEY) {
      return res.status(401).json({ error: "Não autorizado (admin)" });
    }

    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId obrigatório" });
    }

    const apiKey = uuidv4();

    await pool.query(
      `INSERT INTO merchants (merchant_id, api_key, balance)
       VALUES ($1, $2, 0)
       ON CONFLICT (merchant_id) DO NOTHING`,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =======================
   AUTH LOJISTA
======================= */
async function authMerchant(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    "SELECT * FROM merchants WHERE api_key = $1",
    [apiKey]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchant = rows[0];
  next();
}

/* =======================
   PASSO 3 – CRIAR PAGAMENTO
======================= */
app.post("/payment/create", authMerchant, async (req, res) => {
  try {
    const { merchantId, amountBRL } = req.body;

    if (!merchantId || !amountBRL) {
      return res
        .status(400)
        .json({ error: "merchantId e amountBRL são obrigatórios" });
    }

    if (merchantId !== req.merchant.merchant_id) {
      return res.status(403).json({ error: "Merchant inválido" });
    }

    const paymentId = uuidv4();
    const amountUSDT = Number(amountBRL) / 5; // conversão simples

    await pool.query(
      `INSERT INTO payments
       (payment_id, merchant_id, amount_usdt, status)
       VALUES ($1, $2, $3, 'CREATED')`,
      [paymentId, merchantId, amountUSDT]
    );

    res.json({
      paymentId,
      amountUSDT,
      status: "CREATED"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar pagamento" });
  }
});

/* =======================
   PASSO 4 – CONFIRMAR PAGAMENTO
======================= */
app.post("/payment/confirm", async (req, res) => {
  try {
    const { paymentId } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId obrigatório" });
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
      return res.json({ status: "PAID", message: "Pagamento já confirmado" });
    }

    await pool.query(
      "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
      [paymentId]
    );

    await pool.query(
      "UPDATE merchants SET balance = balance + $1 WHERE merchant_id = $2",
      [payment.amount_usdt, payment.merchant_id]
    );

    res.json({
      paymentId,
      status: "PAID",
      message: "Pagamento confirmado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao confirmar pagamento" });
  }
});

/* =======================
   CONSULTAR SALDO
======================= */
app.get("/merchant/:merchantId/balance", authMerchant, async (req, res) => {
  const { merchantId } = req.params;

  if (merchantId !== req.merchant.merchant_id) {
    return res.status(403).json({ error: "Acesso negado" });
  }

  res.json({
    merchantId,
    balance: req.merchant.balance.toString()
  });
});

/* =======================
   SAQUE
======================= */
app.post("/merchant/withdraw", authMerchant, async (req, res) => {
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT obrigatório" });
  }

  if (Number(req.merchant.balance) < Number(amountUSDT)) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    "UPDATE merchants SET balance = balance - $1 WHERE merchant_id = $2",
    [amountUSDT, req.merchant.merchant_id]
  );

  res.json({
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

/* =======================
   START
======================= */
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});