import pool, { initDB } from "./db.js";
const express = require("express");
const cors = require("cors");

const withdrawalsRoutes = require("./routes/withdrawals");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Esquiva Backend rodando 🚀");
});

app.use("/withdrawals", withdrawalsRoutes);

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => console.log("Banco inicializado"))
  .catch(err => console.error("Erro DB", err));
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});