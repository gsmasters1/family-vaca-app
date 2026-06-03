import { Router } from "express";
import { runFullScan, makeDecision, getCachedDecisions } from "../services/apexDecisionEngine";

const router = Router();

// Get current cached decisions (fast)
router.get("/", (_req, res) => {
  res.json(getCachedDecisions());
});

// Run a fresh scan (slow — calls Ollama for each symbol)
router.post("/scan", async (_req, res) => {
  const decisions = await runFullScan();
  res.json(decisions);
});

// Make a single decision for one symbol
router.post("/decide/:symbol", async (req, res) => {
  const decision = await makeDecision(req.params.symbol.toUpperCase());
  if (!decision) return res.status(400).json({ error: "Could not generate decision" });
  res.json(decision);
});

export default router;
