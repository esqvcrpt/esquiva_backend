import express from "express";
import { sendUSDT } from "../controllers/walletController.js";

const router = express.Router();

// Enviar USDT para o comerciante
router.post("/send", async (req, res) => {
  try {
    const { walletAddress, amount } = req.body;

    if (!walletAddress || !amount) {
      return res.status(400).json({
        error: "walletAddress e amount são obrigatórios"
      });
    }

    const tx = await sendUSDT(walletAddress, amount);

    return res.json({
      message: "USDT enviado com sucesso",
      tx
    });
  } catch (err) {
    console.error("Erro /wallet/send:", err);
    res.status(500).json({ error: "Erro ao enviar USDT" });
  }
});

export default router;