const express = require("express");
const { pool } = require("../db");

const router = express.Router();

/**
 * Solicitar saque
 */
router.post("/withdraw", async (req, res) => {
  const { merchantId, amountUSDT } = req.body;

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({
      error: "merchantId e amountUSDT são obrigatórios"
    });
  }

  try {
    await pool.query(
      "INSERT INTO withdrawals (merchant_id, amount_usdt, status) VALUES ($1, $2, 'PENDING')",
      [merchantId, amountUSDT]
    );

    res.json({
      message: "Saque solicitado com sucesso"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao solicitar saque" });
  }
});

/**
 * Listar saques (ADMIN)
 */
router.get("/admin/withdrawals", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  try {
    const { rows } = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar saques" });
  }
});

module.exports = router;