/**
 * Market Regime Detection
 * Druckenmiller: "The first thing I want to know is what is the trend."
 * Dalio: Markets cycle through four environments — know which one you're in.
 *
 * BULL:    Full capital deployment, ride trend
 * CAUTION: Reduce position sizes 50%, tighten stops
 * BEAR:    Cash and defense only (O'Neil: wait for confirmed uptrend)
 * CRISIS:  Gold, short Treasuries, cash — survival mode
 */

import { getHistory, getQuote } from "./marketData";
import { computeIndicators } from "./technicalAnalysis";
import { getFearAndGreed } from "./webScraperService";
import { getDb } from "./database";
import type { MarketRegime } from "./apexStrategy";

export interface RegimeSnapshot {
  regime: MarketRegime;
  spyPrice: number;
  spySma200: number;
  vixLevel: number;
  fearGreed: number;
  breadthSignal: string;
  regimeReason: string;
  deploymentPct: number;    // % of cash to deploy in this regime
  updatedAt: string;
}

const CACHE_KEY = "__market_regime__";
const CACHE_TTL_MINUTES = 30;

export async function detectMarketRegime(): Promise<RegimeSnapshot> {
  const db = getDb();

  // Check cache
  const cached = db
    .prepare(
      `SELECT data FROM price_cache WHERE symbol = ?
       AND datetime(cached_at, '+${CACHE_TTL_MINUTES} minutes') > datetime('now')`
    )
    .get(CACHE_KEY) as { data: string } | undefined;

  if (cached) return JSON.parse(cached.data) as RegimeSnapshot;

  // Fetch SPY and VIX data
  const [spyQuote, vixQuote, spyHistory] = await Promise.all([
    getQuote("SPY").catch(() => null),
    getQuote("^VIX").catch(() => null),
    getHistory("SPY", "1y").catch(() => []),
  ]);

  const fearGreedData = await getFearAndGreed().catch(() => ({ score: 50 }));

  const spyPrice = spyQuote?.price ?? 0;
  const vixLevel = vixQuote?.price ?? 20;
  const fearGreed = fearGreedData.score;

  let spySma200 = spyPrice;
  if (spyHistory.length >= 200) {
    const prices = spyHistory.map((h) => h.close);
    spySma200 = prices.slice(-200).reduce((a, b) => a + b, 0) / 200;
  } else if (spyHistory.length > 0) {
    const prices = spyHistory.map((h) => h.close);
    spySma200 = prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  const indicators = spyHistory.length > 20
    ? computeIndicators(spyHistory)
    : null;

  // Regime classification logic
  let regime: MarketRegime;
  let regimeReason: string;
  let deploymentPct: number;

  const aboveSma200 = spyPrice > spySma200;
  const spyTrend = indicators?.trend ?? "sideways";

  if (vixLevel > 40) {
    regime = "CRISIS";
    regimeReason = `VIX ${vixLevel.toFixed(1)} — systemic fear. Dalio: rotate to gold and short-duration treasuries.`;
    deploymentPct = 0;
  } else if (!aboveSma200 && vixLevel > 25) {
    regime = "BEAR";
    regimeReason = `SPY below 200MA ($${spySma200.toFixed(2)}) + VIX ${vixLevel.toFixed(1)}. O'Neil: 100% cash, wait for confirmed uptrend.`;
    deploymentPct = 0;
  } else if (!aboveSma200 || vixLevel > 22 || fearGreed < 25) {
    regime = "CAUTION";
    regimeReason = `Mixed signals: ${!aboveSma200 ? "SPY below 200MA" : ""}${vixLevel > 22 ? ` VIX ${vixLevel.toFixed(1)}` : ""}${fearGreed < 25 ? ` extreme fear (${fearGreed})` : ""}. Druckenmiller: size down 50%.`;
    deploymentPct = 50;
  } else {
    regime = "BULL";
    regimeReason = `SPY above 200MA ($${spySma200.toFixed(2)}), VIX ${vixLevel.toFixed(1)}, Fear & Greed ${fearGreed}. Trend: ${spyTrend}. Full deployment authorized.`;
    deploymentPct = 100;
  }

  // Breadth signal (simplified — SPY trend as proxy)
  const breadthSignal =
    spyTrend === "uptrend" ? "Advancing" :
    spyTrend === "downtrend" ? "Declining" : "Mixed";

  const snapshot: RegimeSnapshot = {
    regime,
    spyPrice,
    spySma200,
    vixLevel,
    fearGreed,
    breadthSignal,
    regimeReason,
    deploymentPct,
    updatedAt: new Date().toISOString(),
  };

  // Cache it
  db.prepare(
    "INSERT OR REPLACE INTO price_cache (symbol, data, cached_at) VALUES (?, ?, datetime('now'))"
  ).run(CACHE_KEY, JSON.stringify(snapshot));

  return snapshot;
}
