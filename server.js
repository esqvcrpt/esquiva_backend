import express from "express";
import cors from "cors";
import crypto from "crypto";
import pool, { initDB } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// =========================
// MEMÓRIA (MVP)
// =========================
const payments = {};
const merchantBalances = {};

// =========================
// HEALTHCHECK
// =========================
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// =========================
// CRIAR PAGAMENTO (PIX)
// =========================
app.post("/payment/create", (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = crypto.randomUUID();

  // conversão fixa para MVP (exemplo)
  const usdtAmount = Number(amountBRL) / 10;

  payments[paymentId] = {
    paymentId,
    merchantId,
    amountBRL,
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

// =========================
// CONFIRMAR PAGAMENTO
// =========================
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

  merchantBalances[merchantId] =
    (merchantBalances[merchantId] || 0) + usdtAmount;

  res.json({
    paymentId,
    status: "PAID",
    balanceUSDT: merchantBalances[merchantId]
  });
});

// =========================
// SALDO DO LOJISTA
// =========================
app.get("/merchant/:merchantId/balance", (req, res) => {
  const { merchantId } = req.params;

  res.json({
    merchantId,
    balanceUSDT: merchantBalances[merchantId] || 0
  });
});

// =========================
// SOLICITAR SAQUE (SEMI-CUSTODIAL)
// =========================
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

  await pool.query(
    "INSERT INTO withdrawals (merchant_id, amount_usdt, status) VALUES ($1,$2,$3)",
    [merchantId, amountUSDT, "REQUESTED"]
  );

  res.json({
    success: true,
    merchantId,
    amountUSDT,
    status: "REQUESTED"
  });
});

// =========================
// LISTAR SAQUES (ADMIN)
// =========================
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

// =========================
// INICIALIZAÇÃO
// =========================
const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log("Server running on port", PORT);
    });
  })
  .catch(err => {
    console.error("Erro ao iniciar banco", err);
  });