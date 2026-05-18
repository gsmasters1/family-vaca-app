import { Router } from "express";
import { getSetting, setSetting } from "../services/appConfig";
import { getDb } from "../services/database";

const router = Router();

// Status — everything the UI needs
router.get("/status", async (req, res) => {
  const {
    isConnected,
    getAccount,
    getPositions,
    getOpenOrders,
    getMarketClock,
  } = require("../services/alpacaService");

  const connected = await isConnected().catch(() => false);
  let account = null,
    positions = [],
    orders = [],
    clock = null;

  if (connected) {
    [account, positions, orders, clock] = await Promise.all([
      getAccount().catch(() => null),
      getPositions().catch(() => []),
      getOpenOrders().catch(() => []),
      getMarketClock().catch(() => null),
    ]);
  }

  res.json({
    connected,
    paperMode: getSetting("trading_paper_mode") !== "false",
    enabled: getSetting("trading_enabled") === "true",
    killSwitch: getSetting("trading_kill_switch") === "true",
    minApexScore: parseInt(getSetting("trading_min_apex_score") ?? "75"),
    minConviction: parseInt(getSetting("trading_min_conviction") ?? "8"),
    requireClaudeReview: getSetting("trading_require_claude_review") !== "false",
    account,
    positions,
    openOrders: orders,
    clock,
  });
});

// Kill switch — emergency stop
router.post("/kill", async (req, res) => {
  setSetting("trading_kill_switch", "true");
  setSetting("trading_enabled", "false");
  const { cancelAllOrders } = require("../services/alpacaService");
  await cancelAllOrders().catch(() => {});
  res.json({
    ok: true,
    message: "Kill switch activated. All orders cancelled. Trading halted.",
  });
});

// Resume after kill
router.post("/resume", (req, res) => {
  setSetting("trading_kill_switch", "false");
  res.json({ ok: true, message: "Kill switch cleared. Enable trading to resume." });
});

// Enable/disable trading
router.put("/enabled", (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  setSetting("trading_enabled", String(enabled));
  res.json({ ok: true, enabled });
});

// Switch paper/live mode
router.put("/mode", (req, res) => {
  const { paper } = req.body as { paper: boolean };
  setSetting("trading_paper_mode", String(paper));
  res.json({ ok: true, paperMode: paper });
});

// Update trading settings
router.put("/settings", (req, res) => {
  const allowed = [
    "trading_min_apex_score",
    "trading_min_conviction",
    "trading_max_position_pct",
    "trading_daily_loss_limit_pct",
    "trading_max_positions",
    "trading_require_claude_review",
  ];
  const { key, value } = req.body as { key: string; value: string };
  if (!allowed.includes(key)) {
    return res.status(400).json({ error: "Unknown setting" });
  }
  setSetting(key, value);
  res.json({ ok: true, key, value });
});

// Trade log
router.get("/log", (req, res) => {
  const limit = parseInt(String(req.query.limit ?? "50"), 10);
  const rows = getDb()
    .prepare("SELECT * FROM trade_log ORDER BY executed_at DESC LIMIT ?")
    .all(limit);
  res.json(rows);
});

// Manual execute a symbol right now
router.post("/execute/:symbol", async (req, res) => {
  const { makeDecision } = require("../services/apexDecisionEngine");
  const { executeDecision } = require("../services/tradeExecutor");
  const decision = await makeDecision(req.params.symbol.toUpperCase());
  if (!decision) {
    return res.status(400).json({ error: "Could not generate decision" });
  }
  const result = await executeDecision(decision);
  res.json({ decision, result });
});

// Close all positions (emergency)
router.post("/close-all", async (req, res) => {
  const { closeAllPositions } = require("../services/alpacaService");
  await closeAllPositions();
  res.json({ ok: true });
});

export default router;
