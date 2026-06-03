import { Router } from "express";
import { getEarningsDate, getEarningsForWatchlist } from "../services/earningsService";

const router = Router();

router.get("/watchlist", async (_req, res) => {
  try {
    const events = await getEarningsForWatchlist();
    res.json(events);
  } catch {
    res.status(500).json({ error: "Failed to fetch earnings data" });
  }
});

router.get("/:ticker", async (req, res) => {
  try {
    const event = await getEarningsDate(req.params.ticker.toUpperCase());
    res.json(event);
  } catch {
    res.status(500).json({ error: "Failed to fetch earnings" });
  }
});

export default router;
