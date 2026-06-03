import { Router } from "express";
import { getPerformanceStats } from "../services/equityTrackerService";

const router = Router();

router.get("/performance", async (_req, res) => {
  try {
    const stats = await getPerformanceStats();
    res.json(stats);
  } catch {
    res.status(500).json({ error: "Failed to compute performance stats" });
  }
});

export default router;
