import express from "express";
import { createPixCharge, convertToUSDT } from "../controllers/pixController.js";

const router = express.Router();

// 1) Criar cobrança PIX + gerar QR Code
router.post("/create", async (req, res) => {
  try {
    const { value } = req.body;

    if (!value) {
      return res.status(400).json({ error: "Valor (value) é obrigatório" });
    }

    const pixData = await createPixCharge(value);

    return res.json({
      message: "QR Code gerado com sucesso",
      pix: pixData,
    });
  } catch (err) {
    console.error("Erro /pix/create:", err);
    res.status(500).json({ error: "Erro ao criar PIX" });
  }
});

// 2) Converter automático BRL → USDT quando PIX é pago
router.post("/convert", async (req, res) => {
  try {
    const { transactionId, amount } = req.body;

    if (!transactionId || !amount) {
      return res.status(400).json({ error: "transactionId e amount são obrigatórios" });
    }

    const result = await convertToUSDT(transactionId, amount);

    return res.json({
      message: "Conversão realizada",
      conversion: result,
    });
  } catch (err) {
    console.error("Erro /pix/convert:", err);
    res.status(500).json({ error: "Erro ao converter BRL → USDT" });
  }
});

export default router;