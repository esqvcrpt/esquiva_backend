import express from "express";
import { v4 as uuidv4 } from "uuid";
import pool from "./db.js";

const app = express();
app.use(express.json());

// =========================
// HEALTH CHECK
// =========================
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

// =========================
// CRIAR PAGAMENTO
// =========================
app.post("/payment/create", async (req, res) => {
  const { merchantId, amountBRL } = req.body;

  if (!merchantId || !amountBRL) {
    return res.status(400).json({
      error: "merchantId e amountBRL são obrigatórios"
    });
  }

  const paymentId = uuidv4();
  const usdtAmount = Number(amountBRL) / 5;

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_${paymentId}`,
    status: "PENDING",
    usdtAmount
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

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

// =========================
// SOLICITAR SAQUE
// =========================
app.post("/merchant/withdraw", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({
      error: "merchantId e amountUSDT são obrigatórios"
    });
  }

  await pool.query(
    `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
     VALUES ($1, $2, 'REQUESTED')`,
    [merchantId, amountUSDT]
  );

  res.json({ message: "Saque solicitado com sucesso" });
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
// APROVAR SAQUE (ADMIN)
// =========================
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

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server rodando na porta", PORT);
});