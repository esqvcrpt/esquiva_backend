import express from "express";
import cors from "cors";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import pool from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// 🔒 Rate limit básico
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 100
  })
);

// =======================
// 🔐 MIDDLEWARE ADMIN
// =======================
function requireAdmin(req, res, next) {
  const adminKeyHeader = req.headers["x-admin-key"];
  const adminKeyEnv = process.env.ADMIN_KEY;

  if (!adminKeyEnv) {
    return res.status(500).json({
      error: "ADMIN_KEY não configurada no servidor"
    });
  }

  if (!adminKeyHeader) {
    return res.status(401).json({
      error: "x-admin-key ausente"
    });
  }

  if (adminKeyHeader !== adminKeyEnv) {
    return res.status(403).json({
      error: "Não autorizado (admin)"
    });
  }

  next();
}

// =======================
// STATUS
// =======================
app.get("/", (req, res) => {
  res.json({ status: "Esquiva API rodando" });
});

// =======================
// ADMIN → CRIAR LOJISTA
// =======================
app.post("/admin/merchant/create", requireAdmin, async (req, res) => {
  const { merchantId } = req.body;

  if (!merchantId) {
    return res.status(400).json({
      error: "merchantId é obrigatório"
    });
  }

  const apiKey = crypto.randomUUID();

  await pool.query(
    `
    INSERT INTO merchants (merchant_id, api_key)
    VALUES ($1, $2)
    ON CONFLICT (merchant_id) DO NOTHING
    `,
    [merchantId, apiKey]
  );

  res.json({
    merchantId,
    apiKey
  });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});