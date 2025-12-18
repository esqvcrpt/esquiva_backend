import express from "express";
import cors from "cors";
import crypto from "crypto";
import Database from "better-sqlite3";

const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Banco SQLite
const db = new Database("payments.db");

// 🔹 Criar tabela se não existir
db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    paymentId TEXT PRIMARY KEY,
    merchantId TEXT,
    amount REAL,
    status TEXT
  )
`).run();

// 🔹 Healthcheck
app.get("/", (req, res) => {
  res.send("Esquiva API rodando");
});

app.get("/ping", (req, res) => {
  res.json({ ok: true });
});

// 🔹 Criar pagamento
app.post("/payment/create", (req, res) => {
  const { amount, merchantId } = req.body;

  if (!amount || !merchantId) {
    return res.status(400).json({ error: "Dados inválidos" });
  }

  const paymentId = crypto.randomUUID();

  db.prepare(`
    INSERT INTO payments (paymentId, merchantId, amount, status)
    VALUES (?, ?, ?, ?)
  `).run(paymentId, merchantId, amount, "PENDING");

  res.json({
    paymentId,
    pixCopyPaste: "000201010212...",
    qrCodeUrl:
      "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=PIX_" +
      paymentId,
    status: "PENDING"
  });
});

// 🔹 Confirmar pagamento
app.post("/payment/confirm", (req, res) => {
  const { paymentId } = req.body;

  const payment = db
    .prepare("SELECT * FROM payments WHERE paymentId = ?")
    .get(paymentId);

  if (!payment) {
    return res.status(404).json({ error: "Pagamento não encontrado" });
  }

  db.prepare(`
    UPDATE payments
    SET status = 'PAID'
    WHERE paymentId = ?
  `).run(paymentId);

  res.json({
    paymentId,
    status: "PAID",
    message: "Pagamento confirmado com sucesso"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
