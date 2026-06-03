import { Router } from "express";
import { getAllSettingsWithMeta, setSetting } from "../services/appConfig";

const router = Router();

router.get("/", (_req, res) => {
  res.json(getAllSettingsWithMeta());
});

router.put("/:key", (req, res) => {
  const { key } = req.params;
  const { value } = req.body as { value: string };
  if (value === undefined) {
    return res.status(400).json({ error: "value is required" });
  }
  setSetting(key, String(value));
  res.json({ ok: true, key, value });
});

router.get("/modules", (_req, res) => {
  const { isModuleEnabled } = require("../services/appConfig");
  const moduleIds = [
    "core",
    "congress-tracker",
    "commodities",
    "ipo-tracker",
    "predictions",
    "signals",
  ];
  res.json(
    moduleIds.map((id) => ({
      id,
      enabled: isModuleEnabled(id),
    }))
  );
});

export default router;
