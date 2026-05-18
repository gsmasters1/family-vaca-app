import { Router } from "express";
import { getTopSignals, getAllSignals, clearSignalScores, scoreCongressTrade } from "../services/signalEngine";
import { getRecentTrades } from "../services/congressService";
import { getQuote } from "../services/marketData";
import { getDb } from "../services/database";

const router = Router();

// GET /api/signals/top?limit=10 — top-scored congress trades (score >= 7), enriched with current quote
router.get("/top", async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10)));
    const signals = getTopSignals(7, limit);

    // Enrich with trade info and current quote
    const db = getDb();
    const enriched = await Promise.all(
      signals.map(async (signal) => {
        const row = db
          .prepare("SELECT * FROM congress_trades WHERE id = ?")
          .get(signal.tradeId) as
          | {
              id: string;
              source: string;
              member_name: string;
              party: string;
              state: string;
              ticker: string;
              asset_description: string;
              trade_type: string;
              amount_range: string;
              transaction_date: string;
              disclosure_date: string;
              days_to_disclose: number;
            }
          | undefined;

        if (!row) {
          return { signal, trade: null, quote: null };
        }

        let quote = null;
        try {
          quote = await getQuote(row.ticker);
        } catch {
          // Quote fetch failed, leave null
        }

        return {
          signal,
          trade: {
            id: row.id,
            source: row.source,
            memberName: row.member_name,
            party: row.party,
            state: row.state,
            ticker: row.ticker,
            assetDescription: row.asset_description,
            tradeType: row.trade_type,
            amountRange: row.amount_range,
            transactionDate: row.transaction_date,
            disclosureDate: row.disclosure_date,
            daysToDisclose: row.days_to_disclose,
          },
          quote,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error("signals/top error:", err);
    res.status(500).json({ error: "Failed to fetch top signals" });
  }
});

// GET /api/signals/refresh — re-score all recent trades with Ollama
router.get("/refresh", async (_req, res) => {
  try {
    // Clear existing scores
    clearSignalScores();

    // Fetch recent trades
    const trades = await getRecentTrades(50);

    // Score each trade with Ollama
    const results = await Promise.allSettled(
      trades.map(async (trade) => {
        const quote = await getQuote(trade.ticker);
        return scoreCongressTrade(trade, quote);
      })
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    res.json({
      message: "Re-scoring complete",
      scored: succeeded,
      failed,
      total: trades.length,
    });
  } catch (err) {
    console.error("signals/refresh error:", err);
    res.status(500).json({ error: "Failed to refresh signals" });
  }
});

// GET /api/signals/all?minScore=5 — all signals above threshold
router.get("/all", (_req, res) => {
  try {
    const minScore = parseInt(String(_req.query.minScore ?? "5"), 10);
    const signals = getAllSignals(minScore);
    res.json(signals);
  } catch (err) {
    console.error("signals/all error:", err);
    res.status(500).json({ error: "Failed to fetch signals" });
  }
});

export default router;
