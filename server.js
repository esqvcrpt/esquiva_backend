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
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
});
app.use(limiter);

/* ========================
   HEALTH CHECK
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   MIDDLEWARE ADMIN
======================== */
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey) {
    return res.status(401).json({ error: "Admin key ausente" });
  }

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado (admin)" });
  }

  next();
}

/* ========================
   CRIAR LOJISTA (ADMIN)
======================== */
app.post("/admin/merchant/create", adminAuth, async (req, res) => {
  try {
    const { merchantId } = req.body;

    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO merchants (merchant_id, api_key)
      VALUES ($1, $2)
      `,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error("ERRO CREATE MERCHANT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   MIDDLEWARE LOJISTA
======================== */
async function merchantAuth(req, res, next) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "API Key ausente" });
  }

  const { rows } = await pool.query(
    `SELECT merchant_id FROM merchants WHERE api_key = $1`,
    [apiKey]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "API Key inválida" });
  }

  req.merchantId = rows[0].merchant_id;
  next();
}

/* ========================
   SALDO DO LOJISTA
======================== */
app.get("/merchant/balance", merchantAuth, async (req, res) => {
  try {
    const { merchantId } = req;

    const { rows } = await pool.query(
      `
      SELECT COALESCE(SUM(
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

    res.json({ merchantId, balance: rows[0].balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START SERVER
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});