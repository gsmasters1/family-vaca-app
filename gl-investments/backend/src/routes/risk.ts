import { Router } from "express";
import { analyzePortfolioRisk, scoreSignalRisk, PROFILE_TARGETS, type RiskProfile } from "../services/riskEngine";
import { getSetting, setSetting } from "../services/appConfig";

const router = Router();

router.get("/portfolio", async (req, res) => {
  const profile = (req.query.profile as RiskProfile) ??
    (getSetting("risk_profile") as RiskProfile) ?? "moderate";
  const report = await analyzePortfolioRisk(profile);
  res.json(report);
});

router.put("/profile", (req, res) => {
  const { profile } = req.body as { profile: RiskProfile };
  const valid: RiskProfile[] = ["conservative", "moderate", "aggressive"];
  if (!valid.includes(profile)) {
    return res.status(400).json({ error: "profile must be conservative, moderate, or aggressive" });
  }
  setSetting("risk_profile", profile);
  res.json({ ok: true, profile, targets: PROFILE_TARGETS[profile] });
});

router.get("/profile", (_req, res) => {
  const profile = (getSetting("risk_profile") as RiskProfile) ?? "moderate";
  res.json({ profile, targets: PROFILE_TARGETS[profile] });
});

router.get("/signal/:symbol", (req, res) => {
  const { symbol } = req.params;
  const assetType = String(req.query.assetType ?? "stock");
  const confidence = parseInt(String(req.query.confidence ?? "60"), 10);
  const profile = (getSetting("risk_profile") as RiskProfile) ?? "moderate";
  res.json(scoreSignalRisk(symbol, assetType, confidence, profile));
});

export default router;
