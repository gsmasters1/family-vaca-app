import { Router } from "express";
import { fetchCOTReports, getCachedCOT, getCOTSignalForTicker } from "../services/cotService";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getCachedCOT());
});

router.get("/:ticker", (req, res) => {
  const report = getCOTSignalForTicker(req.params.ticker.toUpperCase());
  if (!report) return res.status(404).json({ error: "No COT data for this ticker" });
  res.json(report);
});

router.post("/refresh", async (_req, res) => {
  try {
    const reports = await fetchCOTReports();
    res.json({ refreshed: true, count: reports.length });
  } catch {
    res.status(500).json({ error: "COT refresh failed" });
  }
});

export default router;
