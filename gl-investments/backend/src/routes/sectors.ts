import { Router } from "express";
import { runFullHierarchy } from "../services/sectorAgentOrchestrator";
import { getBondSnapshot } from "../services/fixedIncomeService";
import { getCachedHoldings, refreshAllFunds } from "../services/hedgeFundService";
import { getSignalAccuracy, getSignalWeights } from "../services/learningService";
import { getProfitRules } from "../services/profitManagementService";
import { getDb } from "../services/database";
import { setSetting } from "../services/appConfig";

const router = Router();

// In-memory cache for the last hierarchy result — hierarchy runs are expensive
let lastHierarchyResult: Awaited<ReturnType<typeof runFullHierarchy>> | null = null;

// GET /sectors/rotation — sector rotation table from the last hierarchy run
router.get("/rotation", (_req, res) => {
  if (!lastHierarchyResult) {
    return res.status(404).json({
      error: "No hierarchy data available — POST /sectors/scan to run it",
    });
  }
  res.json(lastHierarchyResult.managerOutput.sectorRotation);
});

// GET /sectors/report — full last HierarchyResult
router.get("/report", (_req, res) => {
  if (!lastHierarchyResult) {
    return res.status(404).json({
      error: "No hierarchy data available — POST /sectors/scan to run it",
    });
  }
  res.json(lastHierarchyResult);
});

// POST /sectors/scan — triggers runFullHierarchy()
router.post("/scan", async (req, res) => {
  try {
    const universe: string[] | undefined =
      Array.isArray(req.body?.universe) ? req.body.universe : undefined;

    const result = await runFullHierarchy(universe);
    lastHierarchyResult = result;

    res.json({
      message: "Hierarchy scan complete",
      regime: result.regime,
      duration: result.duration,
      sectorCount: result.sectorReports.length,
      topCandidates: result.managerOutput.topCandidates.length,
      commanderDecisions: result.commanderDecisions.length,
    });
  } catch (err) {
    console.error("sectors/scan error:", err);
    res.status(500).json({ error: "Hierarchy scan failed", detail: String(err) });
  }
});

// GET /sectors/bonds — BondSnapshot
router.get("/bonds", async (_req, res) => {
  try {
    const snapshot = await getBondSnapshot();
    res.json(snapshot);
  } catch (err) {
    console.error("sectors/bonds error:", err);
    res.status(500).json({ error: "Failed to fetch bond snapshot", detail: String(err) });
  }
});

// GET /sectors/hedge-funds — cached 13F holdings
router.get("/hedge-funds", async (_req, res) => {
  try {
    const holdings = await getCachedHoldings();
    res.json(holdings);
  } catch (err) {
    console.error("sectors/hedge-funds error:", err);
    res.status(500).json({ error: "Failed to fetch hedge fund holdings", detail: String(err) });
  }
});

// POST /sectors/hedge-funds/refresh — re-fetch all 13Fs from SEC EDGAR
router.post("/hedge-funds/refresh", async (_req, res) => {
  try {
    await refreshAllFunds();
    res.json({ message: "Hedge fund refresh complete" });
  } catch (err) {
    console.error("sectors/hedge-funds/refresh error:", err);
    res.status(500).json({ error: "Hedge fund refresh failed", detail: String(err) });
  }
});

// GET /sectors/learning — signal accuracy + weights
router.get("/learning", (_req, res) => {
  try {
    const accuracy = getSignalAccuracy();
    const weights = getSignalWeights();
    res.json({ accuracy, weights });
  } catch (err) {
    console.error("sectors/learning error:", err);
    res.status(500).json({ error: "Failed to fetch learning data", detail: String(err) });
  }
});

// GET /sectors/profit-rules — current profit management settings
router.get("/profit-rules", (_req, res) => {
  try {
    const rules = getProfitRules();
    res.json(rules);
  } catch (err) {
    console.error("sectors/profit-rules error:", err);
    res.status(500).json({ error: "Failed to fetch profit rules", detail: String(err) });
  }
});

// PUT /sectors/profit-rules — update profit management settings
router.put("/profit-rules", (req, res) => {
  try {
    const body = req.body as Partial<{
      takeProfitTiers: { gainPct: number; sellPct: number }[];
      trailingStopPct: number;
      reservePct: number;
      maxDrawdownBeforeHalt: number;
      doubleDownThreshold: number;
    }>;

    if (body.takeProfitTiers !== undefined) {
      setSetting("profit_take_tiers", JSON.stringify(body.takeProfitTiers));
    }
    if (body.trailingStopPct !== undefined) {
      setSetting("profit_trailing_stop_pct", String(body.trailingStopPct));
    }
    if (body.reservePct !== undefined) {
      setSetting("profit_reserve_pct", String(body.reservePct));
    }
    if (body.maxDrawdownBeforeHalt !== undefined) {
      setSetting("profit_max_drawdown_halt", String(body.maxDrawdownBeforeHalt));
    }
    if (body.doubleDownThreshold !== undefined) {
      setSetting("profit_double_down_threshold", String(body.doubleDownThreshold));
    }

    res.json({ message: "Profit rules updated", rules: getProfitRules() });
  } catch (err) {
    console.error("sectors/profit-rules PUT error:", err);
    res.status(500).json({ error: "Failed to update profit rules", detail: String(err) });
  }
});

export default router;
