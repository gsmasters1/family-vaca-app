import { Router } from "express";
import { getDb } from "../services/database";

const router = Router();

router.get("/", (_req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM watchlist ORDER BY added_at DESC").all();
  res.json(rows);
});

router.post("/", (req, res) => {
  const { symbol, assetType, notes } = req.body as {
    symbol: string;
    assetType: string;
    notes?: string;
  };
  if (!symbol) return res.status(400).json({ error: "symbol is required" });
  const db = getDb();
  try {
    const result = db
      .prepare("INSERT INTO watchlist (symbol, asset_type, notes) VALUES (?, ?, ?)")
      .run(symbol.toUpperCase(), assetType ?? "stock", notes ?? "");
    res.status(201).json({ id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: "Symbol already in watchlist" });
  }
});

router.delete("/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM watchlist WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
