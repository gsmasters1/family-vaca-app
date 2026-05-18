/**
 * CFTC Commitment of Traders (COT) Service
 *
 * The COT report is released every Friday at 3:30 PM ET by the CFTC.
 * It shows the actual positioning of the largest institutional players in futures markets.
 *
 * Key categories:
 *   - Commercial Hedgers: producers/processors who KNOW the commodity (smart money)
 *   - Managed Money (hedge funds): trend-following large specs
 *   - Small Speculators: retail / noise traders
 *
 * Signal logic (used by professional traders):
 *   - When commercials are REDUCING short hedges → they expect prices to RISE
 *   - When managed money is at extreme NET LONG → contrarian bearish signal
 *   - Divergence (commercials buying while specs selling) = high-conviction reversal setup
 */

import axios from "axios";
import { getDb } from "./database";

export type COTSignal = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export interface COTReport {
  commodity: string;
  ticker: string;
  reportDate: string;
  commercialNet: number;       // net long position of commercial hedgers
  managedMoneyNet: number;     // net long position of hedge funds
  commercialNetChange: number; // change from previous week
  managedMoneyChange: number;
  signal: COTSignal;
  signalReason: string;
  fetchedAt: string;
}

// Maps CFTC market names (partial match) to our tickers
const MARKET_MAP: { match: string; ticker: string; commodity: string }[] = [
  { match: "GOLD",        ticker: "GC=F",  commodity: "Gold" },
  { match: "SILVER",      ticker: "SI=F",  commodity: "Silver" },
  { match: "CRUDE OIL",   ticker: "CL=F",  commodity: "WTI Crude Oil" },
  { match: "NATURAL GAS", ticker: "NG=F",  commodity: "Natural Gas" },
  { match: "COPPER",      ticker: "HG=F",  commodity: "Copper" },
  { match: "S&P 500",     ticker: "SPY",   commodity: "S&P 500" },
  { match: "NASDAQ",      ticker: "QQQ",   commodity: "Nasdaq 100" },
  { match: "10-YEAR",     ticker: "^TNX",  commodity: "10-Year Treasury" },
  { match: "EURO FX",     ticker: "FXE",   commodity: "Euro" },
  { match: "BITCOIN",     ticker: "BTC-USD", commodity: "Bitcoin" },
];

// CFTC disaggregated COT report (legacy format — fixed-width CSV)
// Released weekly, covers all major futures markets
const COT_URL = "https://www.cftc.gov/dea/newcot/c_disagg.txt";

interface RawCOTRow {
  marketName: string;
  reportDate: string;
  commercialLong: number;
  commercialShort: number;
  managedLong: number;
  managedShort: number;
  prevCommercialLong: number;
  prevCommercialShort: number;
  prevManagedLong: number;
  prevManagedShort: number;
}

function parseDisaggRow(line: string): RawCOTRow | null {
  const cols = line.split(",");
  if (cols.length < 60) return null;

  try {
    return {
      marketName: cols[0]?.replace(/"/g, "").trim().toUpperCase() ?? "",
      reportDate: cols[2]?.replace(/"/g, "").trim() ?? "",
      // Disaggregated format: Producer/Merchant long=8, short=9, Swap Dealer long=10, short=11
      // Managed Money long=13, short=14
      commercialLong: parseInt(cols[8] ?? "0", 10),
      commercialShort: parseInt(cols[9] ?? "0", 10),
      managedLong: parseInt(cols[13] ?? "0", 10),
      managedShort: parseInt(cols[14] ?? "0", 10),
      // Changes (cols 24-34 area)
      prevCommercialLong: parseInt(cols[8] ?? "0", 10) - parseInt(cols[24] ?? "0", 10),
      prevCommercialShort: parseInt(cols[9] ?? "0", 10) - parseInt(cols[25] ?? "0", 10),
      prevManagedLong: parseInt(cols[13] ?? "0", 10) - parseInt(cols[28] ?? "0", 10),
      prevManagedShort: parseInt(cols[14] ?? "0", 10) - parseInt(cols[29] ?? "0", 10),
    };
  } catch {
    return null;
  }
}

function deriveSignal(row: RawCOTRow): { signal: COTSignal; reason: string } {
  const commercialNet = row.commercialLong - row.commercialShort;
  const managedNet = row.managedLong - row.managedShort;
  const prevCommercialNet = row.prevCommercialLong - row.prevCommercialShort;
  const prevManagedNet = row.prevManagedLong - row.prevManagedShort;
  const commercialChange = commercialNet - prevCommercialNet;
  const managedChange = managedNet - prevManagedNet;

  // Strong buy: commercials reducing shorts (less hedging = they expect price to stay high/rise)
  // AND managed money is adding longs
  if (commercialChange > 5000 && managedChange > 2000) {
    return {
      signal: "STRONG_BUY",
      reason: `Commercials covered ${commercialChange.toLocaleString()} shorts; funds added ${managedChange.toLocaleString()} longs`,
    };
  }

  // Buy: either signal individually
  if (commercialChange > 5000) {
    return {
      signal: "BUY",
      reason: `Commercials reduced short hedges by ${commercialChange.toLocaleString()} — expecting sustained high prices`,
    };
  }
  if (managedChange > 3000 && commercialChange >= 0) {
    return {
      signal: "BUY",
      reason: `Hedge funds added ${managedChange.toLocaleString()} net longs with no commercial resistance`,
    };
  }

  // Strong sell: commercials adding shorts aggressively (locking in current high prices)
  // AND managed money also liquidating
  if (commercialChange < -5000 && managedChange < -2000) {
    return {
      signal: "STRONG_SELL",
      reason: `Commercials added ${Math.abs(commercialChange).toLocaleString()} short hedges; funds cut ${Math.abs(managedChange).toLocaleString()} longs — institutional distribution`,
    };
  }

  if (commercialChange < -5000) {
    return {
      signal: "SELL",
      reason: `Commercials added ${Math.abs(commercialChange).toLocaleString()} short hedges — hedging against expected price decline`,
    };
  }

  // Divergence: commercials selling while specs buying = classic top setup
  if (commercialChange < -2000 && managedChange > 2000) {
    return {
      signal: "SELL",
      reason: `Divergence: funds buying while commercials hedge — historically precedes reversal`,
    };
  }

  return {
    signal: "NEUTRAL",
    reason: `Net commercial: ${commercialNet.toLocaleString()}, managed money: ${managedNet.toLocaleString()} — no directional edge`,
  };
}

export async function fetchCOTReports(): Promise<COTReport[]> {
  try {
    const res = await axios.get<string>(COT_URL, {
      timeout: 30_000,
      headers: { "User-Agent": "GL-Investments/3.0 research@glinvestments.local" },
    });

    const lines = res.data.split("\n").slice(1); // skip header
    const reports: COTReport[] = [];
    const now = new Date().toISOString();

    for (const line of lines) {
      if (!line.trim()) continue;
      const row = parseDisaggRow(line);
      if (!row) continue;

      const match = MARKET_MAP.find((m) => row.marketName.includes(m.match));
      if (!match) continue;

      const commercialNet = row.commercialLong - row.commercialShort;
      const managedNet = row.managedLong - row.managedShort;
      const { signal, reason } = deriveSignal(row);

      reports.push({
        commodity: match.commodity,
        ticker: match.ticker,
        reportDate: row.reportDate,
        commercialNet,
        managedMoneyNet: managedNet,
        commercialNetChange: commercialNet - (row.prevCommercialLong - row.prevCommercialShort),
        managedMoneyChange: managedNet - (row.prevManagedLong - row.prevManagedShort),
        signal,
        signalReason: reason,
        fetchedAt: now,
      });
    }

    // Cache in DB
    if (reports.length > 0) {
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS cot_cache (
          ticker TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          cached_at TEXT DEFAULT (datetime('now'))
        )
      `);
      const stmt = db.prepare("INSERT OR REPLACE INTO cot_cache (ticker, data, cached_at) VALUES (?, ?, datetime('now'))");
      for (const r of reports) {
        stmt.run(r.ticker, JSON.stringify(r));
      }
    }

    return reports;
  } catch (err) {
    // Return cached data on failure
    return getCachedCOT();
  }
}

export function getCachedCOT(): COTReport[] {
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS cot_cache (
        ticker TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at TEXT DEFAULT (datetime('now'))
      )
    `);
    const rows = db.prepare("SELECT data FROM cot_cache ORDER BY cached_at DESC").all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as COTReport);
  } catch {
    return [];
  }
}

// Convenience: get COT signal for a specific ticker
export function getCOTSignalForTicker(ticker: string): COTReport | null {
  const all = getCachedCOT();
  return all.find((r) => r.ticker === ticker) ?? null;
}
