import { Router } from "express";
import { scanOptionsFlow, getCachedOptionsFlow, scanWatchlistOptionsFlow } from "../services/optionsFlowService";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  try {
    const data = await scanWatchlistOptionsFlow();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Options flow scan failed" });
  }
});

router.get("/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const cached = getCachedOptionsFlow(ticker);
    if (cached) return res.json(cached);
    const data = await scanOptionsFlow(ticker);
    if (!data) return res.status(404).json({ error: "No options data available" });
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to fetch options flow" });
  }
});

export default router;
