import { v4 as uuid } from "uuid";
import { convertBRLtoUSDT } from "../services/cryptoService.js";

// Simulação de um banco de dados interno
let pixCharges = {};

export async function createPixCharge(brlValue) {
  const id = uuid();

  // Aqui futuramente você conecta Gerencianet, Asaas, Iugu etc.
  const fakePixPayload = {
    transactionId: id,
    brlValue,
    qrcode: `FAKE_QR_CODE_FOR_${id}`,
    qrcodeBase64: "data:image/png;base64,FAKE_BASE64_IMAGE"
  };

  pixCharges[id] = {
    id,
    status: "pending",
    brlValue,
    ...fakePixPayload
  };

  return fakePixPayload;
}


export async function convertToUSDT(transactionId, amountBRL) {
  if (!pixCharges[transactionId]) {
    throw new Error("Transação não encontrada");
  }

  // Marca como pago (simulação de webhook)
  pixCharges[transactionId].status = "paid";

  // Chama o serviço de conversão
  const usdtValue = await convertBRLtoUSDT(amountBRL);

  return {
    transactionId,
    brl: amountBRL,
    usdt: usdtValue,
    rate: usdtValue / amountBRL
  };
}