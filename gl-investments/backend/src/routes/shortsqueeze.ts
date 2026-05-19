import { Router } from "express";
import { scanShortSqueeze, getCachedSqueezeData } from "../services/shortInterestService";
import { getDb } from "../services/database";

const router = Router();

// GET /shortsqueeze — return cached data
router.get("/", (_req, res) => {
  res.json(getCachedSqueezeData());
});

// POST /shortsqueeze/scan — scan watchlist + specified tickers
router.post("/scan", async (req, res) => {
  try {
    const { tickers } = req.body as { tickers?: string[] };
    const db = getDb();
    const watchlist = db.prepare("SELECT symbol FROM watchlist").all() as Array<{ symbol: string }>;
    const portfolio = db.prepare("SELECT DISTINCT symbol FROM portfolio_positions").all() as Array<{ symbol: string }>;

    const allTickers = [
      ...new Set([
        ...(tickers ?? []),
        ...watchlist.map((w) => w.symbol),
        ...portfolio.map((p) => p.symbol),
      ]),
    ].slice(0, 25);

    const results = await scanShortSqueeze(allTickers);
    res.json(results);
  } catch {
    res.status(500).json({ error: "Short squeeze scan failed" });
  }
});

export default router;
