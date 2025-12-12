//
// cryptoService.js
// Módulo de conversão e envio de USDT (versão simulada para desenvolvimento)
//

import { v4 as uuid } from "uuid";

/**
 * Simula conversão BRL → USDT usando uma “taxa” fixa para testes.
 * No futuro, aqui entra Binance/Bitso/Mexc/OKX etc.
 */
export async function convertBRLtoUSDT(brlValue) {
  const fakeRate = 0.20; // 1 BRL → 0.20 USDT (exemplo)
  const usdt = brlValue * fakeRate;

  return Number(usdt.toFixed(2));
}

/**
 * Simula envio de USDT para uma wallet
 */
export async function sendUSDTtoAddress(walletAddress, amount) {
  return {
    txId: uuid(),
    to: walletAddress,
    amount,
    network: "TRC20",
    status: "confirmed",
    timestamp: Date.now()
  };
}