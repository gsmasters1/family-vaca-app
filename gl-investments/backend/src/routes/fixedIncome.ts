import { Router } from "express";
import { getBondSnapshot, getBondMacroScore } from "../services/fixedIncomeService";

const router = Router();

// GET /bonds — full BondSnapshot with all ETF data and derived signals
router.get("/", async (_req, res) => {
  try {
    const snapshot = await getBondSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("bonds/ error:", err);
    res.status(500).json({ error: "Failed to fetch bond snapshot", detail: String(err) });
  }
});

// GET /bonds/signal — -10 to +10 score for APEX macro integration
router.get("/signal", async (_req, res) => {
  try {
    const score = await getBondMacroScore();
    res.json({ score, description: "Bond macro score: -10 (risk-off/inverted) to +10 (risk-on/normal)" });
  } catch (err) {
    console.error("bonds/signal error:", err);
    res.status(500).json({ error: "Failed to compute bond macro score", detail: String(err) });
  }
});

export default router;
