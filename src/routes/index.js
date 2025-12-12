import express from "express";
import pixRoutes from "./pix.js";
import walletRoutes from "./wallet.js";
import healthRoutes from "./health.js";

const router = express.Router();

router.use("/pix", pixRoutes);
router.use("/wallet", walletRoutes);
router.use("/health", healthRoutes);

export default router;