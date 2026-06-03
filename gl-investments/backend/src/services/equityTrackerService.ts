/**
 * Portfolio Equity Tracker
 *
 * Tracks portfolio value over time vs SPY benchmark.
 * Records daily equity snapshots. Used for the performance chart.
 */

import { getDb } from "./database";
import { getQuote } from "./marketData";

export interface EquitySnapshot {
  date: string;
  portfolioValue: number;
  spyValue: number;          // SPY performance from same start date
  portfolioPct: number;      // cumulative % return
  spyPct: number;
}

export interface PerformanceStats {
  totalReturnPct: number;
  spyReturnPct: number;
  alpha: number;             // outperformance vs SPY
  startDate: string;
  currentValue: number;
  startValue: number;
  snapshots: EquitySnapshot[];
}

export async function recordDailyEquity(portfolioValue: number): Promise<void> {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_equity (
      date TEXT PRIMARY KEY,
      starting_equity REAL NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const today = new Date().toISOString().split("T")[0];
  const existing = db.prepare("SELECT date FROM daily_equity WHERE date = ?").get(today);
  if (!existing) {
    db.prepare("INSERT OR IGNORE INTO daily_equity (date, starting_equity) VALUES (?, ?)").run(today, portfolioValue);
  }
}

export async function getPerformanceStats(): Promise<PerformanceStats> {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS daily_equity (date TEXT PRIMARY KEY, starting_equity REAL NOT NULL, recorded_at TEXT DEFAULT (datetime('now')))`);

  const rows = db
    .prepare("SELECT date, starting_equity FROM daily_equity ORDER BY date ASC")
    .all() as Array<{ date: string; starting_equity: number }>;

  if (rows.length < 2) {
    return {
      totalReturnPct: 0, spyReturnPct: 0, alpha: 0,
      startDate: new Date().toISOString().split("T")[0],
      currentValue: 0, startValue: 0, snapshots: [],
    };
  }

  const startValue = rows[0].starting_equity;
  const currentValue = rows[rows.length - 1].starting_equity;
  const startDate = rows[0].date;

  // Get SPY history for the same period
  let spySnapshots: Record<string, number> = {};
  try {
    const yahooFinance = require("yahoo-finance2").default;
    const spyHistory = await yahooFinance.historical("SPY", {
      period1: startDate,
      interval: "1d",
    });
    const spyStart = spyHistory[0]?.close ?? 1;
    spyHistory.forEach((d: { date: Date; close: number }) => {
      const dateStr = d.date.toISOString().split("T")[0];
      spySnapshots[dateStr] = (d.close / spyStart) * startValue; // normalized to same start
    });
  } catch {
    // SPY data unavailable — show portfolio only
  }

  const snapshots: EquitySnapshot[] = rows.map((r) => {
    const portfolioPct = ((r.starting_equity - startValue) / startValue) * 100;
    const spyVal = spySnapshots[r.date] ?? startValue;
    const spyPct = ((spyVal - startValue) / startValue) * 100;
    return {
      date: r.date,
      portfolioValue: r.starting_equity,
      spyValue: spyVal,
      portfolioPct: Math.round(portfolioPct * 100) / 100,
      spyPct: Math.round(spyPct * 100) / 100,
    };
  });

  const spyCurrentValue = spySnapshots[rows[rows.length - 1].date] ?? startValue;
  const totalReturnPct = ((currentValue - startValue) / startValue) * 100;
  const spyReturnPct = ((spyCurrentValue - startValue) / startValue) * 100;

  return {
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    spyReturnPct: Math.round(spyReturnPct * 100) / 100,
    alpha: Math.round((totalReturnPct - spyReturnPct) * 100) / 100,
    startDate,
    currentValue,
    startValue,
    snapshots,
  };
}
