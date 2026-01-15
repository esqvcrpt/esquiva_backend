const express = require("express");
const { v4: uuidv4 } = require("uuid");
const pool = require("./db");

const app = express();
app.use(express.json());

// ===============================
// STORAGE EM MEMÓRIA (SIMPLIFICADO)
// ===============================
const payments = {};
const merchantBalances = {};
const merchants = {};

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

// ===============================
// ADMIN – CRIAR LOJISTA
// ===============================
app.post("/admin/merchant/create", (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { merchant_id } = req.body;

  if (!merchant_id) {
    return res.status(400).json({ error: "merchant_id é obrigatório" });
  }

  if (merchants[merchant_id]) {
    return res.status(400).json({ error: "Lojista já existe" });
  }

  merchants[merchant_id] = true;
  merchantBalances[merchant_id] = 0;

  res.json({
    message: "Lojista criado com sucesso",
    merchantId: merchant_id
  });
});

// ===============================
// CRIAR PAGAMENTO (PIX → USDT)
// ===============================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res
      .status(400)
      .json({ error: "merchantId e amountBRL são obrigatórios" });
  }

  if (!merchants[merchantId]) {
    return res.status(404).json({ error: "Lojista não encontrado" });
  }

  const paymentId = uuidv4();

  // exemplo fixo: 1 USDT = 5 BRL
  const usdtAmount = amountBRL / 5;

  payments[paymentId] = {
    merchantId,
    usdtAmount,
    status: "PENDING"
  };

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_" +
      paymentId,
    status: "PENDING"
  });
});

// ===============================
// CONFIRMAR PAGAMENTO
// ===============================
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ error: "paymentId é obrigatório" });
  }

  if (!payments[paymentId]) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  payments[paymentId].status = "PAID";

  const { merchantId, usdtAmount } = payments[paymentId];
  merchantBalances[merchantId] += usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[merchantId]
  });
});

// ===============================
// CONSULTAR SALDO DO LOJISTA
// ===============================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// ===============================
// SOLICITAR SAQUE
// ===============================
app.post("/merchant/:merchantId/withdraw", async (req, res) => {
  const { merchantId } = req.params;
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  const balance = merchantBalances[merchantId] || 0;

  if (balance < amountUSDT) {
    return res.status(400).json({ error: "Saldo insuficiente" });
  }

  merchantBalances[merchantId] -= amountUSDT;

  const result = await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')
     RETURNING *`,
    [merchantId, amountUSDT]
  );

  res.json(result.rows[0]);
});

// ===============================
// ADMIN – LISTAR SAQUES
// ===============================
app.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const result = await pool.query(
    "SELECT * FROM withdrawals ORDER BY created_at DESC"
  );

  res.json(result.rows);
});

// ===============================
// ADMIN – APROVAR SAQUE
// ===============================
app.post("/admin/withdrawals/:id/approve", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  const { id } = req.params;

  await pool.query(
    "UPDATE withdrawals SET status='PAID' WHERE id=$1",
    [id]
  );

  res.json({
    id,
    status: "PAID",
    message: "Saque aprovado com sucesso"
  });
});

// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});