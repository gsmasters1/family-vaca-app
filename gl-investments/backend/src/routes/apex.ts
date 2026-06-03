import { Router } from "express";
import { getQuote, getHistory, getQuotes } from "../services/marketData";
import { computeIndicators } from "../services/technicalAnalysis";
import { computeApexScore, rateApex } from "../services/apexStrategy";
import { detectMarketRegime } from "../services/marketRegimeService";
import { getSetting } from "../services/appConfig";
import { getDb } from "../services/database";

const router = Router();

// Score a single symbol
router.get("/score/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const riskProfile = getSetting("risk_profile") ?? "moderate";

  try {
    const [quote, history, regime] = await Promise.all([
      getQuote(symbol),
      getHistory(symbol, "1y"),
      detectMarketRegime(),
    ]);

    if (history.length < 20) {
      return res.status(400).json({ error: "Insufficient price history for analysis" });
    }

    const indicators = computeIndicators(history);
    const apex = computeApexScore({
      symbol,
      price: quote.price,
      indicators,
      regime: regime.regime,
      fearGreedScore: regime.fearGreed,
      riskProfile,
    });

    res.json({ ...apex, quote, regime });
  } catch (err) {
    res.status(500).json({ error: "APEX scoring failed", detail: String(err) });
  }
});

// Score all watchlist items
router.get("/watchlist", async (_req, res) => {
  const db = getDb();
  const riskProfile = getSetting("risk_profile") ?? "moderate";

  const watchlist = db
    .prepare("SELECT symbol, asset_type FROM watchlist")
    .all() as Array<{ symbol: string; asset_type: string }>;

  if (watchlist.length === 0) {
    return res.json([]);
  }

  const regime = await detectMarketRegime();
  const results = await Promise.all(
    watchlist.map(async ({ symbol }) => {
      try {
        const [quote, history] = await Promise.all([
          getQuote(symbol),
          getHistory(symbol, "1y"),
        ]);
        if (history.length < 20) return null;
        const indicators = computeIndicators(history);
        const apex = computeApexScore({
          symbol,
          price: quote.price,
          indicators,
          regime: regime.regime,
          fearGreedScore: regime.fearGreed,
          riskProfile,
        });
        return { ...apex, currentPrice: quote.price, changePct: quote.changePct };
      } catch {
        return null;
      }
    })
  );

  const scored = results
    .filter(Boolean)
    .sort((a, b) => (b?.total ?? 0) - (a?.total ?? 0));

  res.json(scored);
});

// Score all portfolio positions
router.get("/portfolio", async (_req, res) => {
  const db = getDb();
  const riskProfile = getSetting("risk_profile") ?? "moderate";

  const positions = db
    .prepare("SELECT DISTINCT symbol, asset_type FROM portfolio_positions")
    .all() as Array<{ symbol: string; asset_type: string }>;

  if (positions.length === 0) return res.json([]);

  const regime = await detectMarketRegime();
  const results = await Promise.all(
    positions.map(async ({ symbol }) => {
      try {
        const [quote, history] = await Promise.all([
          getQuote(symbol),
          getHistory(symbol, "1y"),
        ]);
        if (history.length < 20) return null;
        const indicators = computeIndicators(history);
        const apex = computeApexScore({
          symbol,
          price: quote.price,
          indicators,
          regime: regime.regime,
          fearGreedScore: regime.fearGreed,
          riskProfile,
        });
        return { ...apex, currentPrice: quote.price, changePct: quote.changePct };
      } catch {
        return null;
      }
    })
  );

  res.json(results.filter(Boolean).sort((a, b) => (b?.total ?? 0) - (a?.total ?? 0)));
});

// Market regime
router.get("/regime", async (_req, res) => {
  const regime = await detectMarketRegime();
  res.json(regime);
});

// Top APEX opportunities (congress trades + watchlist combined, scored)
router.get("/top", async (_req, res) => {
  const db = getDb();
  const riskProfile = getSetting("risk_profile") ?? "moderate";
  const regime = await detectMarketRegime();

  // Get tickers from congressional trades (purchases, last 30 days)
  const congTickers = db
    .prepare(
      `SELECT DISTINCT ticker FROM congress_trades
       WHERE trade_type = 'purchase'
         AND ticker IS NOT NULL AND ticker != ''
         AND date(transaction_date) > date('now', '-30 days')`
    )
    .all() as Array<{ ticker: string }>;

  // Get watchlist tickers
  const watchTickers = db
    .prepare("SELECT symbol as ticker FROM watchlist")
    .all() as Array<{ ticker: string }>;

  const allTickers = [
    ...new Set([
      ...congTickers.map((r) => r.ticker),
      ...watchTickers.map((r) => r.ticker),
    ]),
  ].slice(0, 25);

  const results = await Promise.all(
    allTickers.map(async (symbol) => {
      try {
        const [quote, history] = await Promise.all([
          getQuote(symbol),
          getHistory(symbol, "1y"),
        ]);
        if (history.length < 20) return null;
        const indicators = computeIndicators(history);
        const apex = computeApexScore({
          symbol,
          price: quote.price,
          indicators,
          regime: regime.regime,
          fearGreedScore: regime.fearGreed,
          riskProfile,
        });
        return { ...apex, currentPrice: quote.price, changePct: quote.changePct };
      } catch {
        return null;
      }
    })
  );

  const top = results
    .filter((r) => r !== null && r.total >= 40)
    .sort((a, b) => (b?.total ?? 0) - (a?.total ?? 0))
    .slice(0, 15);

  res.json({ regime, opportunities: top });
});

export default router;
