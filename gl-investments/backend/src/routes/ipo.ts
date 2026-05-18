import { Router } from "express";
import {
  fetchRecentFilings,
  scoreIpoWithAI,
  getLockupExpiringFilings,
  getCachedFilings,
} from "../services/ipoService";
import { getSetting } from "../services/appConfig";

// Re-export for use in routes
function getCachedFilingsInternal() {
  const { getDb } = require("../services/database");
  const rows = getDb()
    .prepare("SELECT * FROM ipo_filings ORDER BY filing_date DESC LIMIT 100")
    .all() as Array<Record<string, unknown>>;
  return rows;
}

const router = Router();

router.get("/filings", async (_req, res) => {
  const lookbackDays = parseInt(getSetting("ipo_lookback_days") ?? "30", 10);
  const filings = await fetchRecentFilings(lookbackDays);
  res.json(filings);
});

router.get("/filings/refresh", async (_req, res) => {
  const { getDb } = require("../services/database");
  getDb().prepare("DELETE FROM ipo_filings").run();
  const lookbackDays = parseInt(getSetting("ipo_lookback_days") ?? "30", 10);
  const filings = await fetchRecentFilings(lookbackDays);
  res.json({ count: filings.length, filings });
});

router.post("/score/:id", async (req, res) => {
  const { getDb } = require("../services/database");
  const row = getDb()
    .prepare("SELECT * FROM ipo_filings WHERE id = ?")
    .get(req.params.id) as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Filing not found" });

  const filing = {
    id: String(row.id),
    companyName: String(row.company_name),
    ticker: String(row.ticker ?? ""),
    filingDate: String(row.filing_date),
    formType: String(row.form_type),
    estimatedIpoDate: String(row.estimated_ipo_date ?? ""),
    priceRangeLow: Number(row.price_range_low),
    priceRangeHigh: Number(row.price_range_high),
    sharesOffered: Number(row.shares_offered),
    aiScore: Number(row.ai_score),
    aiAnalysis: String(row.ai_analysis ?? ""),
    status: String(row.status) as "pending",
    lockupExpiry: String(row.lockup_expiry ?? ""),
    daysUntilLockupExpiry: 0,
  };

  const scored = await scoreIpoWithAI(filing);
  res.json(scored);
});

router.get("/lockup-expiring", (_req, res) => {
  const days = parseInt(String(req.query?.within ?? "30"), 10);
  res.json(getLockupExpiringFilings(days));
});

router.get("/alerts", (_req, res) => {
  const { getDb } = require("../services/database");
  const rows = getDb()
    .prepare(
      `SELECT ia.*, f.company_name, f.ticker FROM ipo_alerts ia
       JOIN ipo_filings f ON ia.ipo_id = f.id
       ORDER BY ia.triggered_at DESC LIMIT 50`
    )
    .all();
  res.json(rows);
});

export default router;
