import { Router } from "express";
import { testAlert } from "../services/telegramService";

const router = Router();

router.post("/telegram/test", async (_req, res) => {
  try {
    const result = await testAlert();
    res.json(result);
  } catch {
    res.status(500).json({ error: "Alert test failed" });
  }
});

export default router;
