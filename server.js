const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY;

/* =========================
   CRIAR PAGAMENTO (PIX)
========================= */
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  const paymentId = uuidv4();
  const usdtAmount = Number(amountBRL) / 5; // conversão simulada

  await pool.query(
    `INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
     VALUES ($1, 'CREDIT', $2, $3)`,
    [merchantId, usdtAmount, paymentId]
  );

  res.json({
    paymentId,
    status: "PENDING",
    pixCopyPaste: "000201010212...",
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`,
  });
});

/* =========================
   CONFIRMAR PAGAMENTO
========================= */
app.post("/payment/confirm", async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  const result = await pool.query(
    `SELECT * FROM transactions WHERE reference = $1`,
    [paymentId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso",
  });
});

/* =========================
   CONSULTAR SALDO LOJISTA
========================= */
app.get("/merchant/:merchantId/balance", async (req, res) => {
  const { merchantId } = req.params;

  const credit = await pool.query(
    `SELECT COALESCE(SUM(amount_usdt),0) FROM transactions
     WHERE merchant_id=$1 AND type='CREDIT'`,
    [merchantId]
  );

  const debit = await pool.query(
    `SELECT COALESCE(SUM(amount_usdt),0) FROM transactions
     WHERE merchant_id=$1 AND type='DEBIT'`,
    [merchantId]
  );

  const balance =
    Number(credit.rows[0].coalesce) - Number(debit.rows[0].coalesce);

  res.json({ merchantId, balanceUSDT: balance });
});

/* =========================
   SOLICITAR SAQUE
========================= */
app.post("/merchant/:merchantId/withdraw", async (req, res) => {
  const { merchantId } = req.params;
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  const balanceResult = await pool.query(
    `SELECT
      (SELECT COALESCE(SUM(amount_usdt),0) FROM transactions WHERE merchant_id=$1 AND type='CREDIT')
      -
      (SELECT COALESCE(SUM(amount_usdt),0) FROM transactions WHERE merchant_id=$1 AND type='DEBIT')
      AS balance`,
    [merchantId]
  );

  if (Number(balanceResult.rows[0].balance) < Number(amountUSDT)) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  const withdrawal = await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED') RETURNING *`,
    [merchantId, amountUSDT]
  );

  res.json(withdrawal.rows[0]);
});

/* =========================
   LISTAR SAQUES (ADMIN)
========================= */
app.get("/admin/withdrawals", async (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    `SELECT * FROM withdrawals ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

/* =========================
   APROVAR SAQUE (ADMIN)
========================= */
app.post("/admin/withdrawals/:id/approve", async (req, res) => {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { id } = req.params;

  const withdrawal = await pool.query(
    `SELECT * FROM withdrawals WHERE id=$1`,
    [id]
  );

  if (withdrawal.rows.length === 0) {
    return res.status(404).json({ error: "Saque não encontrado" });
  }

  await pool.query(
    `UPDATE withdrawals SET status='PAID' WHERE id=$1`,
    [id]
  );

  await pool.query(
    `INSERT INTO transactions (merchant_id, type, amount_usdt, reference)
     VALUES ($1, 'DEBIT', $2, $3)`,
    [
      withdrawal.rows[0].merchant_id,
      withdrawal.rows[0].amount_usdt,
      `withdraw_${id}`,
    ]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso",
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});