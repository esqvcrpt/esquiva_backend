import express from "express";
import { pool } from "../db.js";

const router = express.Router();

// 🔐 Middleware simples de admin
function adminAuth(req, res, next) {
  const adminKey = req.headers["x-admin-key"];

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  next();
}

// 📤 Criar solicitação de saque
router.post("/withdraw", async (req, res) => {
  const { merchantId, amountUSDT, walletAddress } = req.body;

  if (!merchantId || !amountUSDT || !walletAddress) {
    return res.status(400).json({
      error: "merchantId, amountUSDT e walletAddress são obrigatórios"
    });
  }

  try {
    // Verifica saldo
    const balanceResult = await pool.query(
      "SELECT balance_usdt FROM merchants WHERE merchant_id = $1",
      [merchantId]
    );

    if (balanceResult.rowCount === 0) {
      return res.status(404).json({ error: "Lojista não encontrado" });
    }

    const balance = Number(balanceResult.rows[0].balance_usdt);

    if (balance < amountUSDT) {
      return res.status(400).json({ error: "Saldo insuficiente" });
    }

    // Cria saque
    await pool.query(
      `INSERT INTO withdrawals (merchant_id, amount_usdt, wallet_address, status)
       VALUES ($1, $2, $3, 'PENDING')`,
      [merchantId, amountUSDT, walletAddress]
    );

    // Debita saldo
    await pool.query(
      "UPDATE merchants SET balance_usdt = balance_usdt - $1 WHERE merchant_id = $2",
      [amountUSDT, merchantId]
    );

    res.json({
      message: "Saque solicitado com sucesso",
      status: "PENDING"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// 📋 Listar saques (ADMIN)
router.get("/admin/withdrawals", adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM withdrawals ORDER BY created_at DESC"
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

export default router;
