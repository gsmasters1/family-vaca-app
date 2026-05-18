/**
 * SEC Form 4 Insider Trades Service
 *
 * Form 4 is filed by directors, officers, and 10%+ shareholders within 2 business days of a transaction.
 * This is the same data hedge funds pay millions to access via private vendors — it's free via SEC EDGAR.
 *
 * Signal edge:
 *   - C-suite open-market purchases = they're using personal money, highest conviction signal
 *   - Cluster buying (2+ insiders) = historically strongest predictive signal (+20-30% over 12mo)
 *   - Insider sales: less reliable (estate planning, diversification — not necessarily bearish)
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { getDb } from "./database";

export type TransactionType = "purchase" | "sale" | "award" | "other";
export type InsiderSignalType = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

export interface InsiderTrade {
  id: string;
  ticker: string;
  companyName: string;
  insiderName: string;
  insiderRole: string;
  transactionType: TransactionType;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  transactionDate: string;
  filingDate: string;
}

export interface InsiderSignal {
  ticker: string;
  signal: InsiderSignalType;
  clusterBuying: boolean;
  recentPurchases: InsiderTrade[];
  recentSales: InsiderTrade[];
  signalReason: string;
  fetchedAt: string;
}

const CIK_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL = "https://data.sec.gov/submissions";
const EDGAR_FILES_URL = "https://www.sec.gov/Archives/edgar/data";
const SEC_UA = "GL-Investments/3.0 research@glinvestments.local";

async function getCIK(ticker: string): Promise<{ cik: string; companyName: string } | null> {
  const db = getDb();
  const cached = db
    .prepare("SELECT cik, company_name FROM sec_cik_cache WHERE ticker = ?")
    .get(ticker) as { cik: string; company_name: string } | undefined;
  if (cached) return { cik: cached.cik, companyName: cached.company_name };

  try {
    const res = await axios.get<Record<string, { cik_str: number; ticker: string; title: string }>>(
      CIK_URL,
      { timeout: 15_000, headers: { "User-Agent": SEC_UA } }
    );
    const entry = Object.values(res.data).find(
      (e) => e.ticker.toLowerCase() === ticker.toLowerCase()
    );
    if (!entry) return null;
    const cik = String(entry.cik_str).padStart(10, "0");
    db.prepare(
      "INSERT OR REPLACE INTO sec_cik_cache (ticker, cik, company_name) VALUES (?, ?, ?)"
    ).run(ticker, cik, entry.title);
    return { cik, companyName: entry.title };
  } catch {
    return null;
  }
}

interface RawFiling {
  accessionNo: string;
  filingDate: string;
  primaryDocument: string;
}

async function getRecentForm4(cik: string, days: number): Promise<RawFiling[]> {
  const res = await axios.get<{
    filings: {
      recent: {
        accessionNumber: string[];
        filingDate: string[];
        primaryDocument: string[];
        form: string[];
      };
    };
  }>(`${SUBMISSIONS_URL}/CIK${cik}.json`, {
    timeout: 15_000,
    headers: { "User-Agent": SEC_UA },
  });

  const { recent } = res.data.filings;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().split("T")[0];
  const results: RawFiling[] = [];

  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] !== "4") continue;
    if (recent.filingDate[i] < cutoff) break;
    results.push({
      accessionNo: recent.accessionNumber[i].replace(/-/g, ""),
      filingDate: recent.filingDate[i],
      primaryDocument: recent.primaryDocument[i],
    });
    if (results.length >= 8) break;
  }
  return results;
}

async function parseFilingXML(cik: string, filing: RawFiling): Promise<InsiderTrade[]> {
  const cikInt = parseInt(cik, 10);
  const url = `${EDGAR_FILES_URL}/${cikInt}/${filing.accessionNo}/${filing.primaryDocument}`;

  const res = await axios.get<string>(url, {
    timeout: 10_000,
    headers: { "User-Agent": SEC_UA },
  });

  const $ = cheerio.load(res.data, { xmlMode: true });

  const insiderName =
    $("rptOwnerName").first().text().trim() ||
    $("reportingOwnerName").first().text().trim() ||
    "Unknown";

  const isOfficer = $("isOfficer").first().text().trim() === "1";
  const isDirector = $("isDirector").first().text().trim() === "1";
  const officerTitle = $("officerTitle").first().text().trim();
  const isTenPct = $("isTenPercentOwner").first().text().trim() === "1";
  const roleParts = [
    isOfficer && (officerTitle || "Officer"),
    isDirector && "Director",
    isTenPct && "10%+ Owner",
  ].filter(Boolean);
  const insiderRole = roleParts.join(" / ") || "Insider";

  const ticker = $("issuerTradingSymbol").first().text().trim();
  const companyName = $("issuerName").first().text().trim();
  const trades: InsiderTrade[] = [];

  $("nonDerivativeTransaction").each((_, el) => {
    const code = $(el).find("transactionCode").text().trim();
    const shares = parseFloat($(el).find("transactionShares value").text().trim() || "0");
    const price = parseFloat($(el).find("transactionPricePerShare value").text().trim() || "0");
    const date = $(el).find("transactionDate value").text().trim();
    if (shares <= 0 || !date) return;

    let transactionType: TransactionType;
    if (code === "P") transactionType = "purchase";
    else if (code === "S" || code === "D") transactionType = "sale";
    else if (["A", "M", "G", "F"].includes(code)) transactionType = "award";
    else transactionType = "other";

    trades.push({
      id: `${filing.accessionNo}-${date}-${code}-${shares}`,
      ticker: ticker || "UNKNOWN",
      companyName: companyName || "Unknown",
      insiderName,
      insiderRole,
      transactionType,
      shares,
      pricePerShare: price,
      totalValue: shares * price,
      transactionDate: date,
      filingDate: filing.filingDate,
    });
  });

  return trades;
}

function mapDbRows(rows: Array<Record<string, unknown>>): InsiderTrade[] {
  return rows.map((r) => ({
    id: String(r.id),
    ticker: String(r.ticker),
    companyName: String(r.company_name),
    insiderName: String(r.insider_name),
    insiderRole: String(r.insider_role),
    transactionType: String(r.transaction_type) as TransactionType,
    shares: Number(r.shares),
    pricePerShare: Number(r.price_per_share),
    totalValue: Number(r.total_value),
    transactionDate: String(r.transaction_date),
    filingDate: String(r.filing_date),
  }));
}

export async function fetchInsiderTrades(ticker: string, days = 90): Promise<InsiderTrade[]> {
  const db = getDb();

  const fresh = db
    .prepare(
      `SELECT * FROM insider_trades WHERE ticker = ?
       AND datetime(fetched_at, '+6 hours') > datetime('now')
       ORDER BY transaction_date DESC`
    )
    .all(ticker) as Array<Record<string, unknown>>;

  if (fresh.length > 0) return mapDbRows(fresh);

  db.prepare("DELETE FROM insider_trades WHERE ticker = ?").run(ticker);

  const cikData = await getCIK(ticker).catch(() => null);
  if (!cikData) return [];

  const filings = await getRecentForm4(cikData.cik, days).catch(() => []);
  const allTrades: InsiderTrade[] = [];

  for (const filing of filings) {
    try {
      const trades = await parseFilingXML(cikData.cik, filing);
      allTrades.push(...trades);
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      // Skip failed filings
    }
  }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO insider_trades
      (id, ticker, company_name, insider_name, insider_role, transaction_type,
       shares, price_per_share, total_value, transaction_date, filing_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const trade of allTrades) {
    stmt.run(
      trade.id, trade.ticker, trade.companyName, trade.insiderName,
      trade.insiderRole, trade.transactionType, trade.shares,
      trade.pricePerShare, trade.totalValue, trade.transactionDate, trade.filingDate
    );
  }

  return allTrades;
}

export function generateInsiderSignal(trades: InsiderTrade[]): InsiderSignal {
  const purchases = trades.filter((t) => t.transactionType === "purchase" && t.totalValue > 10_000);
  const sales = trades.filter((t) => t.transactionType === "sale" && t.totalValue > 10_000);
  const ticker = trades[0]?.ticker ?? "UNKNOWN";
  const now = new Date().toISOString();

  const uniqueBuyers = new Set(purchases.map((p) => p.insiderName));
  const totalBuyValue = purchases.reduce((s, p) => s + p.totalValue, 0);
  const totalSellValue = sales.reduce((s, p) => s + p.totalValue, 0);
  const clusterBuying = uniqueBuyers.size >= 2;
  const cSuiteBuying = purchases.some((p) =>
    /CEO|CFO|COO|President|Chairman|CTO|CSO/i.test(p.insiderRole)
  );

  if (clusterBuying && totalBuyValue > 500_000) {
    return {
      ticker, clusterBuying, signal: "STRONG_BUY",
      recentPurchases: purchases, recentSales: sales,
      signalReason: `${uniqueBuyers.size} insiders bought $${(totalBuyValue / 1000).toFixed(0)}k total — cluster buying, historically the strongest forward-looking signal`,
      fetchedAt: now,
    };
  }
  if (cSuiteBuying && totalBuyValue > 100_000) {
    return {
      ticker, clusterBuying, signal: "BUY",
      recentPurchases: purchases, recentSales: sales,
      signalReason: `C-suite buying $${(totalBuyValue / 1000).toFixed(0)}k with personal capital — executives don't spend their own money unless confident`,
      fetchedAt: now,
    };
  }
  if (purchases.length > 0 && totalBuyValue > totalSellValue) {
    return {
      ticker, clusterBuying, signal: "BUY",
      recentPurchases: purchases, recentSales: sales,
      signalReason: `Net insider buying: $${(totalBuyValue / 1000).toFixed(0)}k buys vs $${(totalSellValue / 1000).toFixed(0)}k sells`,
      fetchedAt: now,
    };
  }
  if (sales.length >= 3 && totalSellValue > totalBuyValue * 3) {
    return {
      ticker, clusterBuying: false, signal: "SELL",
      recentPurchases: purchases, recentSales: sales,
      signalReason: `Multiple insiders selling $${(totalSellValue / 1000).toFixed(0)}k — distribution signal, not necessarily bearish but worth monitoring`,
      fetchedAt: now,
    };
  }

  return {
    ticker, clusterBuying: false, signal: "NEUTRAL",
    recentPurchases: purchases, recentSales: sales,
    signalReason: purchases.length === 0 && sales.length === 0
      ? "No significant open-market insider transactions in the last 90 days"
      : `Mixed insider activity: $${(totalBuyValue / 1000).toFixed(0)}k buys, $${(totalSellValue / 1000).toFixed(0)}k sells`,
    fetchedAt: now,
  };
}

export function getLatestInsiderActivity(limit = 50): InsiderTrade[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM insider_trades WHERE transaction_type = 'purchase'
       ORDER BY transaction_date DESC LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
  return mapDbRows(rows);
}

// Used by APEX decision engine — reads from DB cache only, no network call
export function getInsiderSignalFromCache(ticker: string): InsiderSignalType {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM insider_trades WHERE ticker = ?
       AND date(transaction_date) > date('now', '-90 days')
       ORDER BY transaction_date DESC`
    )
    .all(ticker) as Array<Record<string, unknown>>;

  if (rows.length === 0) return "NEUTRAL";
  return generateInsiderSignal(mapDbRows(rows)).signal;
}
