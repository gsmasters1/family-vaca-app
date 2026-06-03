import { Router } from "express";
import {
  getRecentTrades,
  getTradeSummaryByTicker,
  clearCache,
  fetchAndCache,
  getLeaderboard,
} from "../services/congressService";
import { scoreCongressTrade } from "../services/signalEngine";
import { getQuote } from "../services/marketData";
import { getDb } from "../services/database";

const router = Router();

// GET /api/congress/trades?limit=50&filter=house|senate|purchases|sales|signals
router.get("/trades", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const filter = String(req.query.filter ?? "").toLowerCase();

    let trades = await getRecentTrades(limit * 2); // fetch extra to apply filters

    if (filter === "house") {
      trades = trades.filter((t) => t.source === "house");
    } else if (filter === "senate") {
      trades = trades.filter((t) => t.source === "senate");
    } else if (filter === "purchases") {
      trades = trades.filter((t) => t.tradeType === "purchase");
    } else if (filter === "sales") {
      trades = trades.filter(
        (t) => t.tradeType === "sale" || t.tradeType === "sale_partial"
      );
    }

    trades = trades.slice(0, limit);

    // Join signal scores from DB
    const db = getDb();
    const tradeIds = trades.map((t) => `'${t.id.replace(/'/g, "''")}'`).join(",");
    const scores =
      tradeIds.length > 0
        ? (db
            .prepare(`SELECT * FROM signal_scores WHERE trade_id IN (${tradeIds})`)
            .all() as {
            trade_id: string;
            score: number;
            recommendation: string;
            timeframe: string;
            reasoning: string;
            target_pct: number;
            risk_level: string;
            scored_at: string;
          }[])
        : [];

    const scoreMap = new Map(scores.map((s) => [s.trade_id, s]));

    const enriched = trades.map((t) => {
      const s = scoreMap.get(t.id);
      return {
        ...t,
        signal: s
          ? {
              score: s.score,
              recommendation: s.recommendation,
              timeframe: s.timeframe,
              reasoning: s.reasoning,
              targetPct: s.target_pct,
              riskLevel: s.risk_level,
              scoredAt: s.scored_at,
            }
          : null,
      };
    });

    // Apply signal score filter after enrichment
    const filtered =
      filter === "signals"
        ? enriched.filter((t) => t.signal && t.signal.score >= 7)
        : enriched;

    res.json(filtered);
  } catch (err) {
    console.error("congress/trades error:", err);
    res.status(500).json({ error: "Failed to fetch congress trades" });
  }
});

// GET /api/congress/trades/:ticker
router.get("/trades/:ticker", async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const summary = await getTradeSummaryByTicker(ticker);
    res.json(summary);
  } catch (err) {
    console.error("congress/trades/:ticker error:", err);
    res.status(500).json({ error: "Failed to fetch trades for ticker" });
  }
});

// GET /api/congress/score/:tradeId — trigger AI scoring for one trade
router.get("/score/:tradeId", async (req, res) => {
  try {
    const tradeId = req.params.tradeId;
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM congress_trades WHERE id = ?")
      .get(tradeId) as
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
      return res.status(404).json({ error: "Trade not found" });
    }

    const trade = {
      id: row.id,
      source: row.source as "house" | "senate",
      memberName: row.member_name,
      party: row.party,
      state: row.state,
      ticker: row.ticker,
      assetDescription: row.asset_description,
      tradeType: row.trade_type as "purchase" | "sale" | "sale_partial" | "exchange",
      amountRange: row.amount_range,
      transactionDate: row.transaction_date,
      disclosureDate: row.disclosure_date,
      daysToDisclose: row.days_to_disclose,
    };

    const quote = await getQuote(trade.ticker);
    const signal = await scoreCongressTrade(trade, quote);
    res.json(signal);
  } catch (err) {
    console.error("congress/score/:tradeId error:", err);
    res.status(500).json({ error: "Scoring failed" });
  }
});

// GET /api/congress/leaderboard
router.get("/leaderboard", (_req, res) => {
  try {
    const leaderboard = getLeaderboard(90);
    res.json(leaderboard);
  } catch (err) {
    console.error("congress/leaderboard error:", err);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// POST /api/congress/refresh
router.post("/refresh", async (_req, res) => {
  try {
    clearCache();
    await fetchAndCache();
    const db = getDb();
    const count = (
      db.prepare("SELECT COUNT(*) as cnt FROM congress_trades").get() as {
        cnt: number;
      }
    ).cnt;
    res.json({ message: "Cache refreshed", tradeCount: count });
  } catch (err) {
    console.error("congress/refresh error:", err);
    res.status(500).json({ error: "Failed to refresh cache" });
  }
});

export default router;
