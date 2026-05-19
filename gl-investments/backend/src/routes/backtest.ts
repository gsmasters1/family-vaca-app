import { Router } from "express";
import { runBacktest, getBacktestHistory } from "../services/backtesterService";
import { getDb } from "../services/database";

const router = Router();

// GET /backtest — list past backtest runs
router.get("/", (_req, res) => {
  res.json(getBacktestHistory());
});

// POST /backtest/run — start a new backtest
router.post("/run", async (req, res) => {
  const {
    symbols,
    startDate,
    endDate,
    startingCapital = 10_000,
    minApexScore = 65,
  } = req.body as {
    symbols?: string[];
    startDate?: string;
    endDate?: string;
    startingCapital?: number;
    minApexScore?: number;
  };

  if (!startDate || !endDate) {
    return res.status(400).json({ error: "startDate and endDate required" });
  }

  // Default symbol universe: watchlist + top movers
  let testSymbols = symbols;
  if (!testSymbols || testSymbols.length === 0) {
    const db = getDb();
    const watchlist = db.prepare("SELECT symbol FROM watchlist").all() as Array<{ symbol: string }>;
    testSymbols = watchlist.length > 0
      ? watchlist.map((w) => w.symbol).slice(0, 15)
      : ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "JPM", "XLE", "GLD"];
  }

  try {
    // Run async — can take a few minutes for large symbol sets
    const result = await runBacktest({
      symbols: testSymbols,
      startDate,
      endDate,
      startingCapital,
      minApexScore,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Backtest failed", detail: String(err) });
  }
});

export default router;
