import { Router } from "express";
import { getPrediction, getBatchPredictions } from "../services/predictionEngine";
import { getDb } from "../services/database";

const router = Router();

const WATCHLIST_DEFAULTS = [
  "AAPL", "MSFT", "NVDA", "TSLA", "SPY",
  "QQQ", "GLD", "BTC-USD", "AMZN", "META",
];

router.get("/:symbol", async (req, res) => {
  try {
    const prediction = await getPrediction(req.params.symbol.toUpperCase());
    res.json(prediction);
  } catch {
    res.status(500).json({ error: "Prediction failed. Is Ollama running?" });
  }
});

router.delete("/:symbol/cache", (req, res) => {
  getDb()
    .prepare("DELETE FROM prediction_cache WHERE symbol = ?")
    .run(req.params.symbol.toUpperCase());
  res.json({ ok: true });
});

router.get("/batch/watchlist", async (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT symbol FROM watchlist LIMIT 20")
    .all() as Array<{ symbol: string }>;

  const symbols =
    rows.length > 0 ? rows.map((r) => r.symbol) : WATCHLIST_DEFAULTS;

  const predictions = await getBatchPredictions(symbols);
  res.json(predictions);
});

router.get("/batch/portfolio", async (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT symbol FROM portfolio_positions LIMIT 20")
    .all() as Array<{ symbol: string }>;

  if (rows.length === 0) {
    return res.json([]);
  }

  const predictions = await getBatchPredictions(rows.map((r) => r.symbol));
  res.json(predictions);
});

export default router;
