/**
 * Earnings Calendar Service
 *
 * Fetches upcoming earnings dates via Yahoo Finance.
 * APEX uses this to warn when a symbol has earnings within 5 days —
 * holding through earnings without a plan is gambling, not investing.
 */

import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";

export interface EarningsEvent {
  ticker: string;
  nextEarningsDate: string | null;
  daysUntilEarnings: number | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  isWithin5Days: boolean;
  isWithin30Days: boolean;
  fetchedAt: string;
}

export async function getEarningsDate(ticker: string): Promise<EarningsEvent> {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS earnings_calendar (
      ticker TEXT PRIMARY KEY,
      next_earnings_date TEXT,
      eps_estimate REAL,
      revenue_estimate REAL,
      fetched_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Use cache if fresh (within 12 hours)
  const cached = db
    .prepare("SELECT * FROM earnings_calendar WHERE ticker = ? AND datetime(fetched_at, '+12 hours') > datetime('now')")
    .get(ticker) as Record<string, unknown> | undefined;

  if (cached) return buildEvent(ticker, cached);

  try {
    const summary = await yahooFinance.quoteSummary(ticker, {
      modules: ["calendarEvents"],
    });
    const cal = summary.calendarEvents;
    const earningsArray = cal?.earnings?.earningsDate;
    const nextDate = earningsArray?.[0]
      ? (earningsArray[0] instanceof Date
          ? earningsArray[0].toISOString().split("T")[0]
          : String(earningsArray[0]).split("T")[0])
      : null;

    const row = {
      next_earnings_date: nextDate,
      eps_estimate: null as number | null,
      revenue_estimate: null as number | null,
      fetched_at: new Date().toISOString(),
    };

    db.prepare(`
      INSERT OR REPLACE INTO earnings_calendar (ticker, next_earnings_date, eps_estimate, revenue_estimate, fetched_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(ticker, row.next_earnings_date, row.eps_estimate, row.revenue_estimate, row.fetched_at);

    return buildEvent(ticker, row);
  } catch {
    return {
      ticker, nextEarningsDate: null, daysUntilEarnings: null,
      epsEstimate: null, revenueEstimate: null,
      isWithin5Days: false, isWithin30Days: false,
      fetchedAt: new Date().toISOString(),
    };
  }
}

function buildEvent(ticker: string, row: Record<string, unknown>): EarningsEvent {
  const nextDate = row.next_earnings_date ? String(row.next_earnings_date) : null;
  let daysUntil: number | null = null;
  if (nextDate) {
    daysUntil = Math.ceil((new Date(nextDate).getTime() - Date.now()) / 86_400_000);
    if (daysUntil < 0) daysUntil = null; // past date
  }
  return {
    ticker,
    nextEarningsDate: nextDate,
    daysUntilEarnings: daysUntil,
    epsEstimate: row.eps_estimate != null ? Number(row.eps_estimate) : null,
    revenueEstimate: row.revenue_estimate != null ? Number(row.revenue_estimate) : null,
    isWithin5Days: daysUntil !== null && daysUntil <= 5 && daysUntil >= 0,
    isWithin30Days: daysUntil !== null && daysUntil <= 30 && daysUntil >= 0,
    fetchedAt: row.fetched_at ? String(row.fetched_at) : new Date().toISOString(),
  };
}

export async function getEarningsForWatchlist(): Promise<EarningsEvent[]> {
  const db = getDb();
  const symbols = db.prepare("SELECT symbol FROM watchlist").all() as Array<{ symbol: string }>;
  const results = await Promise.all(
    symbols.map((s) => getEarningsDate(s.symbol).catch(() => null))
  );
  return results.filter((r): r is EarningsEvent => r !== null && r.nextEarningsDate !== null);
}
