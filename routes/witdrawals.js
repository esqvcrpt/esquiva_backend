const express = require("express");
const router = express.Router();
const pool = require("../db");

// 🔐 middleware simples de admin
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  next();
}

// 🟢 LOJISTA – solicitar saque
router.post("/merchant/:merchantId/withdraw", async (req, res) => {
  const { merchantId } = req.params;
  const { amountUSDT } = req.body;

  if (!amountUSDT) {
    return res.status(400).json({ error: "amountUSDT é obrigatório" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
       VALUES ($1, $2, 'REQUESTED')
       RETURNING *`,
      [merchantId, amountUSDT]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao solicitar saque" });
  }
});

// 🔵 ADMIN – listar saques pendentes
router.get("/admin/withdrawals", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar saques" });
  }
});

// 🔴 ADMIN – aprovar saque
router.post("/admin/withdraw/:id/approve", adminAuth, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      "UPDATE withdrawals SET status = 'PAID' WHERE id = $1",
      [id]
    );

    res.json({ message: "Saque aprovado com sucesso" });
  } catch (err) {
    res.status(500).json({ error: "Erro ao aprovar saque" });
  }
});

module.exports = router;