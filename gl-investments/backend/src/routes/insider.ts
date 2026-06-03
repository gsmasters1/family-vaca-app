import { Router } from "express";
import {
  fetchInsiderTrades,
  generateInsiderSignal,
  getLatestInsiderActivity,
} from "../services/insiderTradesService";

const router = Router();

router.get("/latest", (_req, res) => {
  res.json(getLatestInsiderActivity(50));
});

router.get("/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const trades = await fetchInsiderTrades(ticker);
    const signal = generateInsiderSignal(trades);
    res.json(signal);
  } catch {
    res.status(500).json({ error: "Failed to fetch insider data from SEC EDGAR" });
  }
});

export default router;
