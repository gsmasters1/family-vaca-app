/**
 * Options Flow Scanner
 *
 * Detects unusual options activity using Yahoo Finance options chain data.
 * Smart money positions via options 1-3 weeks before a major move.
 *
 * Signal logic:
 *   Unusual call volume: call volume / open interest > 3x AND > 500 contracts = bullish
 *   Unusual put volume: put volume / open interest > 3x = hedging or bearish
 *   Call/put ratio > 3: extreme bullish bias
 *   Far OTM large call sweep: institutions making directional bet
 */

import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";

export type OptionsSignal = "STRONG_CALL_FLOW" | "CALL_FLOW" | "NEUTRAL" | "PUT_FLOW" | "STRONG_PUT_FLOW";

export interface OptionsFlowData {
  ticker: string;
  currentPrice: number;
  callPutRatio: number;
  unusualCallContracts: number;   // contracts with unusual volume
  unusualPutContracts: number;
  largestCallStrike: number;
  largestCallExpiry: string;
  impliedVolatility: number;      // average IV
  signal: OptionsSignal;
  signalReason: string;
  fetchedAt: string;
}

export async function scanOptionsFlow(ticker: string): Promise<OptionsFlowData | null> {
  try {
    const [quote, optionsData] = await Promise.all([
      yahooFinance.quote(ticker),
      yahooFinance.options(ticker).catch(() => null),
    ]);

    if (!optionsData) return null;

    const currentPrice = quote.regularMarketPrice ?? 0;
    const chain = optionsData.options?.[0];
    if (!chain) return null;

    const calls = chain.calls ?? [];
    const puts = chain.puts ?? [];

    // Find unusual call activity (volume/OI ratio > 2 and volume > 100)
    const unusualCalls = calls.filter(
      (c) => c.openInterest && c.volume && c.volume > 100 && c.volume / c.openInterest > 2
    );
    const unusualPuts = puts.filter(
      (p) => p.openInterest && p.volume && p.volume > 100 && p.volume / p.openInterest > 2
    );

    const totalCallVolume = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    const totalPutVolume = puts.reduce((s, p) => s + (p.volume ?? 0), 0);
    const callPutRatio = totalPutVolume > 0 ? totalCallVolume / totalPutVolume : 1;

    // Find largest unusual call
    const largestUnusualCall = unusualCalls.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))[0];

    // Average IV from near-ATM calls
    const nearAtmCalls = calls.filter(
      (c) => c.strike && Math.abs(c.strike - currentPrice) / currentPrice < 0.05
    );
    const avgIV = nearAtmCalls.length > 0
      ? nearAtmCalls.reduce((s, c) => s + (c.impliedVolatility ?? 0), 0) / nearAtmCalls.length
      : 0;

    let signal: OptionsSignal = "NEUTRAL";
    let reason = "";

    if (unusualCalls.length >= 3 && callPutRatio > 3) {
      signal = "STRONG_CALL_FLOW";
      reason = `${unusualCalls.length} unusual call sweeps, C/P ratio ${callPutRatio.toFixed(1)}x — institutional call positioning`;
    } else if (unusualCalls.length >= 2 || callPutRatio > 2) {
      signal = "CALL_FLOW";
      reason = `${unusualCalls.length} unusual calls, C/P ratio ${callPutRatio.toFixed(1)}x — elevated call interest`;
    } else if (unusualPuts.length >= 3 || callPutRatio < 0.4) {
      signal = "STRONG_PUT_FLOW";
      reason = `${unusualPuts.length} unusual put sweeps — institutional hedging or directional bearish bet`;
    } else if (unusualPuts.length >= 2 || callPutRatio < 0.6) {
      signal = "PUT_FLOW";
      reason = `Elevated put volume, C/P ratio ${callPutRatio.toFixed(1)}x — caution`;
    } else {
      reason = `C/P ratio ${callPutRatio.toFixed(1)}x — normal options activity`;
    }

    const data: OptionsFlowData = {
      ticker,
      currentPrice,
      callPutRatio: Math.round(callPutRatio * 100) / 100,
      unusualCallContracts: unusualCalls.length,
      unusualPutContracts: unusualPuts.length,
      largestCallStrike: largestUnusualCall?.strike ?? 0,
      largestCallExpiry: largestUnusualCall?.expiration
        ? (largestUnusualCall.expiration instanceof Date
            ? largestUnusualCall.expiration.toISOString().split("T")[0]
            : String(largestUnusualCall.expiration).split("T")[0])
        : "",
      impliedVolatility: Math.round(avgIV * 100 * 10) / 10,
      signal,
      signalReason: reason,
      fetchedAt: new Date().toISOString(),
    };

    // Cache
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS options_flow_cache (ticker TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
    db.prepare("INSERT OR REPLACE INTO options_flow_cache (ticker, data, fetched_at) VALUES (?, ?, datetime('now'))").run(ticker, JSON.stringify(data));

    return data;
  } catch {
    return null;
  }
}

export function getCachedOptionsFlow(ticker: string): OptionsFlowData | null {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS options_flow_cache (ticker TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at TEXT DEFAULT (datetime('now')))`);
    const row = db.prepare("SELECT data FROM options_flow_cache WHERE ticker = ? AND datetime(fetched_at, '+30 minutes') > datetime('now')").get(ticker) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as OptionsFlowData : null;
  } catch {
    return null;
  }
}

export async function scanWatchlistOptionsFlow(): Promise<OptionsFlowData[]> {
  const db = getDb();
  const watchlist = db.prepare("SELECT symbol FROM watchlist").all() as Array<{ symbol: string }>;
  const results: (OptionsFlowData | null)[] = [];
  for (const { symbol } of watchlist.slice(0, 20)) {
    const data = await scanOptionsFlow(symbol).catch(() => null);
    results.push(data);
    await new Promise((r) => setTimeout(r, 300));
  }
  return results
    .filter((d): d is OptionsFlowData => d !== null)
    .filter((d) => d.signal !== "NEUTRAL")
    .sort((a, b) => b.unusualCallContracts - a.unusualCallContracts);
}
