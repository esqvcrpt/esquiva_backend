const express = require("express");
const router = express.Router();
const pool = require("../db");

/**
 * Middleware ADMIN
 */
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  next();
}

/**
 * ============================
 *  CRIAR SOLICITAÇÃO DE SAQUE
 * ============================
 * POST /withdrawals/request
 */
router.post("/request", async (req, res) => {
  const { merchantId, amountUSDT, walletAddress } = req.body;

  if (!merchantId || !amountUSDT || !walletAddress) {
    return res.status(400).json({
      error: "merchantId, amountUSDT e walletAddress são obrigatórios"
    });
  }

  try {
    const merchant = await pool.query(
      "SELECT balance_usdt FROM merchants WHERE merchant_id = $1",
      [merchantId]
    );

    if (merchant.rows.length === 0) {
      return res.status(404).json({ error: "Merchant não encontrado" });
    }

    const balance = Number(merchant.rows[0].balance_usdt);

    if (balance < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    await pool.query(
      `INSERT INTO withdrawals (merchant_id, amount_usdt, wallet_address, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [merchantId, amountUSDT, walletAddress]
    );

    await pool.query(
      "UPDATE merchants SET balance_usdt = balance_usdt - $1 WHERE merchant_id = $2",
      [amountUSDT, merchantId]
    );

    res.json({
      message: "Saque solicitado com sucesso",
      merchantId,
      amountUSDT
    });
  } catch (err) {
    console.error("ERRO SAQUE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * ============================
 *  LISTAR SAQUES (ADMIN)
 * ============================
 * GET /withdrawals/admin
 */
router.get("/admin", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("ERRO LISTAR SAQUES:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/**
 * ============================
 *  APROVAR SAQUE (ADMIN)
 * ============================
 * POST /withdrawals/admin/approve
 */
router.post("/admin/approve", adminAuth, async (req, res) => {
  const { withdrawalId } = req.body;

  if (!withdrawalId) {
    return res.status(400).json({ error: "withdrawalId é obrigatório" });
  }

  try {
    await pool.query(
      "UPDATE withdrawals SET status = 'PAID' WHERE id = $1",
      [withdrawalId]
    );

    res.json({
      message: "Saque aprovado com sucesso"
    });
  } catch (err) {
    console.error("ERRO APROVAR SAQUE:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

module.exports = router;
