import axios from "axios";
import { getDb } from "./database";

const HOUSE_API = "https://housestockwatcher.com/api/transactions";
const SENATE_API = "https://senatestockwatcher.com/api/transactions";
const CACHE_TTL_HOURS = 1;

export interface CongressTrade {
  id: string;
  source: "house" | "senate";
  memberName: string;
  party: string;
  state: string;
  ticker: string;
  assetDescription: string;
  tradeType: "purchase" | "sale" | "sale_partial" | "exchange";
  amountRange: string;
  transactionDate: string;
  disclosureDate: string;
  daysToDisclose: number;
}

function normalizeTradeType(raw: string): CongressTrade["tradeType"] {
  const lower = (raw ?? "").toLowerCase().trim();
  if (lower.includes("partial")) return "sale_partial";
  if (lower.includes("sale") || lower.includes("sell")) return "sale";
  if (lower.includes("exchange") || lower.includes("swap")) return "exchange";
  return "purchase";
}

function calcDaysToDisclose(transactionDate: string, disclosureDate: string): number {
  try {
    const t = new Date(transactionDate);
    const d = new Date(disclosureDate);
    if (isNaN(t.getTime()) || isNaN(d.getTime())) return 0;
    return Math.max(0, Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)));
  } catch {
    return 0;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeHouseTrade(raw: any, idx: number): CongressTrade | null {
  const ticker = (raw.ticker ?? raw.symbol ?? "").toString().toUpperCase().trim();
  if (!ticker || ticker === "N/A" || ticker === "--") return null;

  const txDate = raw.transaction_date ?? raw.transactionDate ?? "";
  const discDate = raw.disclosure_date ?? raw.disclosureDate ?? raw.filed_date ?? txDate;

  return {
    id: `house-${raw.transaction_date ?? idx}-${ticker}-${idx}`,
    source: "house",
    memberName: raw.representative ?? raw.name ?? "Unknown",
    party: raw.party ?? "",
    state: raw.state ?? "",
    ticker,
    assetDescription: raw.asset_description ?? raw.description ?? ticker,
    tradeType: normalizeTradeType(raw.type ?? raw.transaction_type ?? "purchase"),
    amountRange: raw.amount ?? raw.amount_range ?? "$1 - Unknown",
    transactionDate: txDate,
    disclosureDate: discDate,
    daysToDisclose: calcDaysToDisclose(txDate, discDate),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSenateTrade(raw: any, idx: number): CongressTrade | null {
  const ticker = (raw.ticker ?? raw.symbol ?? "").toString().toUpperCase().trim();
  if (!ticker || ticker === "N/A" || ticker === "--") return null;

  const txDate = raw.transaction_date ?? raw.transactionDate ?? "";
  const discDate = raw.disclosure_date ?? raw.disclosureDate ?? raw.filed_date ?? txDate;

  return {
    id: `senate-${raw.transaction_date ?? idx}-${ticker}-${idx}`,
    source: "senate",
    memberName: raw.senator ?? raw.first_name && raw.last_name
      ? `${raw.first_name} ${raw.last_name}`
      : raw.name ?? "Unknown",
    party: raw.party ?? "",
    state: raw.state ?? "",
    ticker,
    assetDescription: raw.asset_description ?? raw.description ?? ticker,
    tradeType: normalizeTradeType(raw.type ?? raw.transaction_type ?? "purchase"),
    amountRange: raw.amount ?? raw.amount_range ?? "$1 - Unknown",
    transactionDate: txDate,
    disclosureDate: discDate,
    daysToDisclose: calcDaysToDisclose(txDate, discDate),
  };
}

function isCacheValid(): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt, MAX(fetched_at) as last_fetch FROM congress_trades`
    )
    .get() as { cnt: number; last_fetch: string | null };

  if (!row.cnt || !row.last_fetch) return false;

  const fetchedAt = new Date(row.last_fetch + "Z");
  const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_HOURS * 60 * 60 * 1000);
  return new Date() < expiresAt;
}

function saveToDb(trades: CongressTrade[]): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO congress_trades
      (id, source, member_name, party, state, ticker, asset_description,
       trade_type, amount_range, transaction_date, disclosure_date, days_to_disclose, fetched_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  const insertMany = db.transaction((items: CongressTrade[]) => {
    for (const t of items) {
      insert.run(
        t.id, t.source, t.memberName, t.party, t.state, t.ticker,
        t.assetDescription, t.tradeType, t.amountRange,
        t.transactionDate, t.disclosureDate, t.daysToDisclose
      );
    }
  });

  insertMany(trades);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToTrade(row: any): CongressTrade {
  return {
    id: row.id,
    source: row.source as "house" | "senate",
    memberName: row.member_name,
    party: row.party,
    state: row.state,
    ticker: row.ticker,
    assetDescription: row.asset_description,
    tradeType: row.trade_type as CongressTrade["tradeType"],
    amountRange: row.amount_range,
    transactionDate: row.transaction_date,
    disclosureDate: row.disclosure_date,
    daysToDisclose: row.days_to_disclose,
  };
}

export async function fetchAndCache(): Promise<void> {
  const [houseRes, senateRes] = await Promise.allSettled([
    axios.get(HOUSE_API, { timeout: 30_000 }),
    axios.get(SENATE_API, { timeout: 30_000 }),
  ]);

  const trades: CongressTrade[] = [];

  if (houseRes.status === "fulfilled") {
    const data = Array.isArray(houseRes.value.data) ? houseRes.value.data : [];
    data.forEach((raw, idx) => {
      const t = normalizeHouseTrade(raw, idx);
      if (t) trades.push(t);
    });
  }

  if (senateRes.status === "fulfilled") {
    const data = Array.isArray(senateRes.value.data) ? senateRes.value.data : [];
    data.forEach((raw, idx) => {
      const t = normalizeSenateTrade(raw, idx);
      if (t) trades.push(t);
    });
  }

  if (trades.length > 0) {
    saveToDb(trades);
  }
}

export async function ensureCache(): Promise<void> {
  if (!isCacheValid()) {
    await fetchAndCache();
  }
}

export async function getRecentTrades(limit = 50): Promise<CongressTrade[]> {
  await ensureCache();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM congress_trades
       WHERE ticker != '' AND ticker != 'N/A'
       ORDER BY transaction_date DESC, fetched_at DESC
       LIMIT ?`
    )
    .all(limit) as object[];
  return rows.map(rowToTrade);
}

export async function getTradeSummaryByTicker(ticker: string): Promise<{
  trades: CongressTrade[];
  purchaseCount: number;
  saleCount: number;
  uniqueMembers: number;
}> {
  await ensureCache();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM congress_trades
       WHERE ticker = ?
       ORDER BY transaction_date DESC`
    )
    .all(ticker.toUpperCase()) as object[];

  const trades = rows.map(rowToTrade);
  const purchaseCount = trades.filter((t) => t.tradeType === "purchase").length;
  const saleCount = trades.filter(
    (t) => t.tradeType === "sale" || t.tradeType === "sale_partial"
  ).length;
  const uniqueMembers = new Set(trades.map((t) => t.memberName)).size;

  return { trades, purchaseCount, saleCount, uniqueMembers };
}

export function clearCache(): void {
  const db = getDb();
  db.prepare("DELETE FROM congress_trades").run();
}

export function getLeaderboard(days = 90): { memberName: string; party: string; state: string; tradeCount: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT member_name, party, state, COUNT(*) as trade_count
       FROM congress_trades
       WHERE transaction_date >= date('now', ?)
       GROUP BY member_name
       ORDER BY trade_count DESC
       LIMIT 10`
    )
    .all(`-${days} days`) as { member_name: string; party: string; state: string; trade_count: number }[];

  return rows.map((r) => ({
    memberName: r.member_name,
    party: r.party,
    state: r.state,
    tradeCount: r.trade_count,
  }));
}
