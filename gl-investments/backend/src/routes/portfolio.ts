import { Router } from "express";
import { getDb } from "../services/database";
import { getQuote } from "../services/marketData";

const router = Router();

router.get("/positions", async (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM portfolio_positions ORDER BY created_at DESC")
    .all() as Array<{
    id: number;
    symbol: string;
    name: string;
    asset_type: string;
    shares: number;
    avg_cost: number;
  }>;

  const positions = await Promise.all(
    rows.map(async (row) => {
      const quote = await getQuote(row.symbol).catch(() => null);
      const currentPrice = quote?.price ?? row.avg_cost;
      const value = currentPrice * row.shares;
      const costBasis = row.avg_cost * row.shares;
      return {
        id: row.id,
        symbol: row.symbol,
        name: quote?.name ?? row.name ?? row.symbol,
        assetType: row.asset_type,
        shares: row.shares,
        avgCost: row.avg_cost,
        currentPrice,
        value,
        gainLoss: value - costBasis,
        gainLossPct: ((value - costBasis) / costBasis) * 100,
      };
    })
  );

  res.json(positions);
});

router.get("/summary", async (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare("SELECT symbol, shares, avg_cost FROM portfolio_positions")
    .all() as Array<{ symbol: string; shares: number; avg_cost: number }>;

  let totalValue = 0;
  let totalCost = 0;

  await Promise.all(
    rows.map(async (row) => {
      const quote = await getQuote(row.symbol).catch(() => null);
      const price = quote?.price ?? row.avg_cost;
      totalValue += price * row.shares;
      totalCost += row.avg_cost * row.shares;
    })
  );

  res.json({
    totalValue,
    totalGainLoss: totalValue - totalCost,
    totalGainLossPct: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
    positionCount: rows.length,
  });
});

router.post("/positions", (req, res) => {
  const { symbol, shares, avgCost, assetType } = req.body as {
    symbol: string;
    shares: number;
    avgCost: number;
    assetType: string;
  };
  if (!symbol || !shares || !avgCost) {
    return res.status(400).json({ error: "symbol, shares, and avgCost are required" });
  }
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO portfolio_positions (symbol, asset_type, shares, avg_cost) VALUES (?, ?, ?, ?)"
    )
    .run(symbol.toUpperCase(), assetType ?? "stock", shares, avgCost);
  res.status(201).json({ id: result.lastInsertRowid });
});

router.delete("/positions/:id", (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM portfolio_positions WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

export default router;
