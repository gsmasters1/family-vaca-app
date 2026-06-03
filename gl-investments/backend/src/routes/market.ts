import { Router } from "express";
import { getQuote, getQuotes, getHistory, getTopMovers } from "../services/marketData";

const router = Router();

router.get("/quote/:symbol", async (req, res) => {
  try {
    const quote = await getQuote(req.params.symbol.toUpperCase());
    res.json(quote);
  } catch (err) {
    res.status(404).json({ error: "Symbol not found" });
  }
});

router.get("/quotes", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => s.toUpperCase());
  if (!symbols.length) return res.json([]);
  const quotes = await getQuotes(symbols);
  res.json(quotes);
});

router.get("/history/:symbol", async (req, res) => {
  try {
    const period = String(req.query.period ?? "1mo");
    const history = await getHistory(req.params.symbol.toUpperCase(), period);
    res.json(history);
  } catch {
    res.status(404).json({ error: "History not found" });
  }
});

router.get("/movers", async (_req, res) => {
  const movers = await getTopMovers();
  res.json(movers);
});

export default router;
