import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { v4 as uuidv4 } from "uuid";
import pkg from "pg";

const { Pool } = pkg;

const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
app.use(limiter);

// =================== MIDDLEWARES ===================

function adminAuth(req, res, next) {
  if (req.headers["x-admin-key"] !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }
  next();
}

async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey) return res.status(401).json({ error: "API Key ausente" });

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

// =================== STATUS ===================

app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

// =================== ADMIN ===================

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

// =================== PAYMENTS ===================

app.post("/payment/create", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;
  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT obrigatório" });
  }

  const paymentId = uuidv4();

  await pool.query(
    `INSERT INTO payments (payment_id, merchant_id, amount_usdt, status)
     VALUES ($1, $2, $3, 'CREATED')`,
    [paymentId, req.merchantId, amountUSDT]
  );

  res.json({ paymentId, amountUSDT, status: "CREATED" });
});

app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  await pool.query(
    "UPDATE payments SET status = 'PAID' WHERE payment_id = $1",
    [paymentId]
  );

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

// =================== BALANCE ===================

app.get("/merchant/balance", merchantAuth, async (req, res) => {
  const credit = await pool.query(
    "SELECT COALESCE(SUM(amount_usdt),0) FROM payments WHERE merchant_id=$1 AND status='PAID'",
    [req.merchantId]
  );

  const debit = await pool.query(
    "SELECT COALESCE(SUM(amount_usdt),0) FROM withdrawals WHERE merchant_id=$1 AND status='PAID'",
    [req.merchantId]
  );

  const balance = credit.rows[0].coalesce - debit.rows[0].coalesce;

  res.json({
    merchantId: req.merchantId,
    balance: balance.toString()
  });
});

// =================== WITHDRAW ===================

app.post("/merchant/withdraw", merchantAuth, async (req, res) => {
  const { amountUSDT } = req.body;

  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(amount_usdt),0) FROM payments WHERE merchant_id=$1 AND status='PAID'",
    [req.merchantId]
  );

  if (rows[0].coalesce < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'PAID')`,
    [req.merchantId, amountUSDT]
  );

  res.json({
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

// =================== START ===================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});