/**
 * Short Squeeze Scanner
 *
 * Combines Yahoo Finance short interest data with momentum signals to find
 * potential short squeeze candidates. High short float + rising price + volume =
 * the setup that preceded GME, AMC, BBBY, and hundreds of smaller plays.
 *
 * Signal logic:
 *   Short float > 20% + RSI rising + volume surge = SQUEEZE_WATCH
 *   Short float > 30% + Stage 2 uptrend = HIGH_SQUEEZE_RISK
 */

import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";
import { computeIndicators } from "./technicalAnalysis";
import { getHistory } from "./marketData";

export type SqueezeSignal = "HIGH" | "ELEVATED" | "WATCH" | "NEUTRAL" | "LOW";

export interface ShortInterestData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  shortFloatPct: number;     // % of float that is short
  shortRatio: number;        // days to cover
  sharesShort: number;
  rsi14: number;
  priceVsSma50Pct: number;  // % above/below SMA50
  volumeRatio: number;       // current vs avg
  squeezeScore: number;      // 0-100
  signal: SqueezeSignal;
  signalReason: string;
  fetchedAt: string;
}

function calcSqueezeScore(data: {
  shortFloatPct: number;
  shortRatio: number;
  rsi14: number;
  priceVsSma50Pct: number;
  volumeRatio: number;
}): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  // Short float component (max 40 points)
  if (data.shortFloatPct > 40) { score += 40; reasons.push(`${data.shortFloatPct.toFixed(0)}% short float (extreme)`); }
  else if (data.shortFloatPct > 30) { score += 30; reasons.push(`${data.shortFloatPct.toFixed(0)}% short float (very high)`); }
  else if (data.shortFloatPct > 20) { score += 20; reasons.push(`${data.shortFloatPct.toFixed(0)}% short float (high)`); }
  else if (data.shortFloatPct > 10) { score += 8; }

  // Days to cover (max 20 points) — higher = harder for shorts to exit
  if (data.shortRatio > 10) { score += 20; reasons.push(`${data.shortRatio.toFixed(1)} days to cover`); }
  else if (data.shortRatio > 5) { score += 12; reasons.push(`${data.shortRatio.toFixed(1)} days to cover`); }
  else if (data.shortRatio > 3) { score += 6; }

  // RSI momentum (max 20 points) — rising but not overbought
  if (data.rsi14 >= 55 && data.rsi14 <= 72) { score += 20; reasons.push(`RSI ${data.rsi14.toFixed(0)} — momentum building`); }
  else if (data.rsi14 > 72) { score += 8; reasons.push(`RSI ${data.rsi14.toFixed(0)} — overbought but squeeze can extend`); }
  else if (data.rsi14 >= 45) { score += 8; }

  // Price above SMA50 (max 10 points) — uptrend forcing short covering
  if (data.priceVsSma50Pct > 10) { score += 10; reasons.push(`${data.priceVsSma50Pct.toFixed(1)}% above SMA50 — shorts underwater`); }
  else if (data.priceVsSma50Pct > 0) { score += 5; }

  // Volume surge (max 10 points) — covering happening now
  if (data.volumeRatio > 3) { score += 10; reasons.push(`Volume ${data.volumeRatio.toFixed(1)}x avg — heavy covering`); }
  else if (data.volumeRatio > 2) { score += 7; reasons.push(`Volume ${data.volumeRatio.toFixed(1)}x avg — elevated`); }
  else if (data.volumeRatio > 1.5) { score += 3; }

  return { score: Math.min(score, 100), reason: reasons.slice(0, 3).join("; ") || "No significant squeeze setup" };
}

function scoreToSignal(score: number): SqueezeSignal {
  if (score >= 75) return "HIGH";
  if (score >= 55) return "ELEVATED";
  if (score >= 35) return "WATCH";
  if (score >= 15) return "NEUTRAL";
  return "LOW";
}

export async function scanShortSqueeze(tickers: string[]): Promise<ShortInterestData[]> {
  const results: ShortInterestData[] = [];

  for (const ticker of tickers.slice(0, 30)) {
    try {
      const [quote, history] = await Promise.all([
        yahooFinance.quote(ticker),
        getHistory(ticker, "3mo").catch(() => []),
      ]);

      const shortFloatPct = ((quote as Record<string, unknown>).shortPercentOfFloat as number ?? 0) * 100;
      const shortRatio = (quote as Record<string, unknown>).shortRatio as number ?? 0;
      const sharesShort = (quote as Record<string, unknown>).sharesShort as number ?? 0;
      const currentPrice = quote.regularMarketPrice ?? 0;
      const name = quote.longName ?? quote.shortName ?? ticker;

      let rsi14 = 50;
      let priceVsSma50Pct = 0;
      let volumeRatio = 1;

      if (history.length >= 20) {
        const indicators = computeIndicators(history);
        rsi14 = indicators.rsi14;
        priceVsSma50Pct = indicators.sma50 > 0
          ? ((currentPrice - indicators.sma50) / indicators.sma50) * 100
          : 0;
        volumeRatio = indicators.volumeRatio;
      }

      const { score, reason } = calcSqueezeScore({ shortFloatPct, shortRatio, rsi14, priceVsSma50Pct, volumeRatio });

      const data: ShortInterestData = {
        ticker,
        companyName: name,
        currentPrice,
        shortFloatPct: Math.round(shortFloatPct * 10) / 10,
        shortRatio: Math.round(shortRatio * 10) / 10,
        sharesShort,
        rsi14: Math.round(rsi14 * 10) / 10,
        priceVsSma50Pct: Math.round(priceVsSma50Pct * 10) / 10,
        volumeRatio: Math.round(volumeRatio * 10) / 10,
        squeezeScore: score,
        signal: scoreToSignal(score),
        signalReason: reason,
        fetchedAt: new Date().toISOString(),
      };

      results.push(data);

      // Cache in DB
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS short_interest (
          ticker TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          fetched_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.prepare("INSERT OR REPLACE INTO short_interest (ticker, data, fetched_at) VALUES (?, ?, datetime('now'))").run(ticker, JSON.stringify(data));

      await new Promise((r) => setTimeout(r, 200)); // rate limit
    } catch {
      // Skip failed symbols
    }
  }

  return results.sort((a, b) => b.squeezeScore - a.squeezeScore);
}

export function getCachedSqueezeData(): ShortInterestData[] {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS short_interest (ticker TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
    const rows = db.prepare("SELECT data FROM short_interest ORDER BY fetched_at DESC").all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as ShortInterestData).sort((a, b) => b.squeezeScore - a.squeezeScore);
  } catch {
    return [];
  }
}
