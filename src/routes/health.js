import express from "express";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "online", message: "Esquiva API funcionando 🚀" });
});

export default router;