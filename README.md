# 🚀 Esquiva — Backend (PIX → USDT)

Este é o backend oficial do sistema **Esquiva**, que converte pagamentos via **PIX (BRL)** em **USDT** e envia automaticamente para a carteira do comerciante.

Funciona em 3 etapas:

1. Cliente paga em **BRL via PIX**
2. Sistema converte **BRL → USDT**
3. USDT é enviado para a **wallet do comerciante**

O objetivo é permitir que comerciantes recebam em cripto sem depender de exchanges manualmente.

---

# 📁 Estrutura do Projeto
esquiva_backend
│ server.js
│ package.json
│ .env (criado apenas no Render)
│ .env.example
│
└── src/
├── config/
│     cors.js
│
├── routes/
│     index.js
│     pix.js
│     wallet.js
│     health.js
│
├── controllers/
│     pixController.js
│     walletController.js
│
└── services/
cryptoService.js
---

# 🧪 Testando Localmente (Render ou Replit)

### 1. Instale as dependências
### 2. Inicie o servidor
---

# 🔌 Endpoints Principais

## 📌 1. Criar Cobrança PIX (gera QR Code)
Body:
```json
{
  "value": 100
}
POST /api/pix/convert
{
  "transactionId": "id-do-pix",
  "amount": 100
}
POST /api/wallet/send
{
  "walletAddress": "TRON_WALLET",
  "amount": 20
}
