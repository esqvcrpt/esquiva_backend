import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

/* ========================
   CONFIG
======================== */
const ADMIN_KEY = process.env.ADMIN_KEY;

/* ========================
   RATE LIMIT
======================== */
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100,
  })
);

/* ========================
   HEALTH
======================== */
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

/* ========================
   ADMIN - CREATE MERCHANT
======================== */
app.post("/admin/merchant/create", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== ADMIN_KEY) {
      return res.status(401).json({ error: "Não autorizado (admin)" });
    }

    const { merchantId } = req.body;
    if (!merchantId) {
      return res.status(400).json({ error: "merchantId é obrigatório" });
    }

    const apiKey = crypto.randomUUID();

    await pool.query(
      `INSERT INTO merchants (merchant_id, api_key, balance)
       VALUES ($1, $2, 0)`,
      [merchantId, apiKey]
    );

    res.json({ merchantId, apiKey });
  } catch (err) {
    console.error("ERRO CREATE MERCHANT:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   MERCHANT - BALANCE
======================== */
app.get("/merchant/:merchantId/balance", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "API Key ausente" });
    }

    const { merchantId } = req.params;

    const result = await pool.query(
      `SELECT balance FROM merchants
       WHERE merchant_id = $1 AND api_key = $2`,
      [merchantId, apiKey]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: "API Key inválida" });
    }

    res.json({
      merchantId,
      balance: result.rows[0].balance.toString(),
    });
  } catch (err) {
    console.error("ERRO BALANCE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* ========================
   START
======================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log("API rodando na porta", PORT)
);