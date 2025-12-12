import { sendUSDTtoAddress } from "../services/cryptoService.js";

export async function sendUSDT(walletAddress, amount) {
  if (!walletAddress || !amount) {
    throw new Error("walletAddress e amount são obrigatórios");
  }

  // Chama o serviço responsável pela transação
  const tx = await sendUSDTtoAddress(walletAddress, amount);

  return {
    walletAddress,
    amount,
    txHash: tx
  };
}