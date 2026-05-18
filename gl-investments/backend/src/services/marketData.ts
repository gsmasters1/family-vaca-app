import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";

const CACHE_TTL_MINUTES = 5;

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  marketCap?: number;
  assetType: "stock" | "crypto" | "etf" | "derivative";
}

function detectAssetType(symbol: string): Quote["assetType"] {
  if (symbol.includes("-USD") || symbol.includes("BTC") || symbol.includes("ETH")) {
    return "crypto";
  }
  return "stock";
}

async function fetchLiveQuote(symbol: string): Promise<Quote> {
  const result = await yahooFinance.quote(symbol);
  return {
    symbol: result.symbol,
    name: result.longName ?? result.shortName ?? symbol,
    price: result.regularMarketPrice ?? 0,
    change: result.regularMarketChange ?? 0,
    changePct: result.regularMarketChangePercent ?? 0,
    volume: result.regularMarketVolume ?? 0,
    marketCap: result.marketCap,
    assetType:
      result.quoteType === "ETF"
        ? "etf"
        : result.quoteType === "CRYPTOCURRENCY"
          ? "crypto"
          : detectAssetType(symbol),
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  const db = getDb();
  const cached = db
    .prepare(
      `SELECT data, cached_at FROM price_cache WHERE symbol = ? AND
       datetime(cached_at, '+${CACHE_TTL_MINUTES} minutes') > datetime('now')`
    )
    .get(symbol) as { data: string; cached_at: string } | undefined;

  if (cached) {
    return JSON.parse(cached.data) as Quote;
  }

  const quote = await fetchLiveQuote(symbol);
  db.prepare(
    "INSERT OR REPLACE INTO price_cache (symbol, data, cached_at) VALUES (?, ?, datetime('now'))"
  ).run(symbol, JSON.stringify(quote));
  return quote;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  return Promise.all(symbols.map((s) => getQuote(s).catch(() => null))).then((results) =>
    results.filter(Boolean) as Quote[]
  );
}

export async function getHistory(
  symbol: string,
  period: string
): Promise<{ date: string; close: number }[]> {
  const periodMap: Record<string, { period1: string }> = {
    "1wk": { period1: daysAgo(7) },
    "1mo": { period1: daysAgo(30) },
    "3mo": { period1: daysAgo(90) },
    "6mo": { period1: daysAgo(180) },
    "1y": { period1: daysAgo(365) },
  };

  const range = periodMap[period] ?? periodMap["1mo"];
  const results = await yahooFinance.historical(symbol, {
    period1: range.period1,
    interval: period === "1wk" ? "1d" : "1wk",
  });

  return results.map((r) => ({
    date: r.date.toISOString().split("T")[0],
    close: r.close,
  }));
}

export async function getTopMovers(): Promise<Quote[]> {
  const defaultSymbols = [
    "AAPL", "MSFT", "NVDA", "TSLA", "SPY",
    "BTC-USD", "ETH-USD", "QQQ", "AMZN", "META",
  ];
  return getQuotes(defaultSymbols);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
