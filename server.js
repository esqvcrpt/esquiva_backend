import express from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
app.use(express.json());

/* =========================
   CONFIG
========================= */
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* =========================
   ADMIN — CRIAR LOJISTA
========================= */
app.post("/admin/merchant/create", (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { merchantId } = req.body;

  if (!merchantId) {
    return res.status(400).json({ error: "merchantId é obrigatório" });
  }

  const apiKey = uuidv4();

  return res.json({
    merchantId,
    apiKey
  });
});

/* =========================
   PAGAMENTO — CRIAR
========================= */
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = uuidv4();
  const amountUSDT = amountBRL / 5; // conversão fixa

  await pool.query(
    `
    INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
    VALUES ($1, 'CREDIT', $2, $3)
    `,
    [merchantId, amountUSDT, paymentId]
  );

  res.json({
    paymentId,
    amountUSDT,
    status: "CREATED"
  });
});

/* =========================
   PAGAMENTO — CONFIRMAR
========================= */
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

/* =========================
   LOJISTA — CONSULTAR SALDO
========================= */
app.get("/merchant/:merchantId/balance", async (req, res) => {
  const { merchantId } = req.params;

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
    [merchantId]
  );

  res.json({
    merchantId,
    balance: result.rows[0].balance
  });
});

/* =========================
   SAQUE — SOLICITAR
========================= */
app.post("/withdraw/request", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({
      error: "merchantId e amountUSDT são obrigatórios"
    });
  }

  await pool.query(
    `
    INSERT INTO withdrawals (merchant_id, amount_usdt, status)
    VALUES ($1, $2, 'REQUESTED')
    `,
    [merchantId, amountUSDT]
  );

  res.json({
    status: "REQUESTED",
    message: "Saque solicitado com sucesso"
  });
});

/* =========================
   ADMIN — LISTAR SAQUES
========================= */
app.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    `SELECT * FROM withdrawals ORDER BY created_at DESC`
  );

  res.json(result.rows);
});

/* =========================
   ADMIN — APROVAR SAQUE
========================= */
app.post("/admin/withdraw/approve", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { id } = req.body;

  await pool.query(
    `UPDATE withdrawals SET status = 'PAID' WHERE id = $1`,
    [id]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});