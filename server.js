const express = require("express");
const cors = require("cors");
require("dotenv").config();

const withdrawalsRoutes = require("./routes/withdrawals");

const app = express();

app.use(cors());
app.use(express.json());

// rota raiz
app.get("/", (req, res) => {
  res.json({ status: "Esquiva Gateway backend online" });
});

// rotas admin
app.use("/admin", withdrawalsRoutes);

// porta
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});