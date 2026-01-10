const express = require("express");
const router = express.Router();
const pool = require("../db");

// Middleware de autenticação admin
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  next();
}

// Listar saques
router.get("/withdrawals", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar saques" });
  }
});

// Criar solicitação de saque
router.post("/withdrawals", async (req, res) => {
  const { merchantId, amountUSDT, walletAddress } = req.body;

  if (!merchantId || !amountUSDT || !walletAddress) {
    return res.status(400).json({
      error: "merchantId, amountUSDT e walletAddress são obrigatórios"
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO withdrawals 
       (merchant_id, amount_usdt, wallet_address, status) 
       VALUES ($1, $2, $3, 'PENDING') 
       RETURNING *`,
      [merchantId, amountUSDT, walletAddress]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao criar saque" });
  }
});

module.exports = router;