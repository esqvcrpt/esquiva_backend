import express from 'express'
import pool from '../db.js'

const router = express.Router()

// Criar solicitação de saque (lojista)
router.post('/request', async (req, res) => {
  const { merchantId, amountUSDT } = req.body

  if (!merchantId || !amountUSDT) {
    return res.status(400).json({ error: 'merchantId e amountUSDT são obrigatórios' })
  }

  try {
    const merchant = await pool.query(
      'SELECT balance_usdt FROM merchants WHERE merchant_id = $1',
      [merchantId]
    )

    if (merchant.rows.length === 0) {
      return res.status(404).json({ error: 'Merchant não encontrado' })
    }

    if (merchant.rows[0].balance_usdt < amountUSDT) {
      return res.status(400).json({ error: 'Saldo insuficiente' })
    }

    await pool.query(
      `INSERT INTO withdrawals (merchant_id, amount_usdt, status)
       VALUES ($1, $2, 'PENDING')`,
      [merchantId, amountUSDT]
    )

    await pool.query(
      'UPDATE merchants SET balance_usdt = balance_usdt - $1 WHERE merchant_id = $2',
      [amountUSDT, merchantId]
    )

    res.json({ message: 'Saque solicitado com sucesso' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

// Listar saques (ADMIN)
router.get('/admin', async (req, res) => {
  const adminKey = req.headers['x-admin-key']

  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Não autorizado' })
  }

  try {
    const result = await pool.query(
      'SELECT * FROM withdrawals ORDER BY created_at DESC'
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

export default router
