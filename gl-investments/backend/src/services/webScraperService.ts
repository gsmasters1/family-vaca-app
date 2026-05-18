import axios from "axios";
import Parser from "rss-parser";
import * as cheerio from "cheerio";
import { getDb } from "./database";
import { scoreContent, type FilterResult } from "./truthFilter";

const rssParser = new Parser({ timeout: 10_000 });

export interface IntelligenceItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  tickers: string[];
  category: string;
  trustScore: number;
  trustTier: string;
  flags: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

// ─── Curated source registry ──────────────────────────────────────────────
// Only primary sources + tier-1/2 media. No newsletters, no influencers.
const RSS_SOURCES = [
  // Official / regulatory (Tier 1)
  { url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&dateb=&owner=include&count=20&output=atom", label: "SEC 8-K", category: "regulatory" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", label: "Federal Reserve", category: "macro" },
  // Wire services (Tier 2)
  { url: "https://feeds.reuters.com/reuters/businessNews", label: "Reuters Business", category: "news" },
  { url: "https://feeds.reuters.com/reuters/companyNews", label: "Reuters Companies", category: "news" },
  { url: "https://feeds.reuters.com/reuters/economicNews", label: "Reuters Economy", category: "macro" },
  // Established financial media (Tier 2-3)
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", label: "MarketWatch", category: "news" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", label: "WSJ Markets", category: "news" },
  { url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml", label: "WSJ Business", category: "news" },
  // MarketBeat — analyst ratings, earnings, institutional data (Tier 3, data-rich)
  { url: "https://www.marketbeat.com/rss/", label: "MarketBeat", category: "analyst" },
  // Minority Mindset newsletter feed (financial literacy / wealth-building angle)
  { url: "https://minoritymindset.com/feed/", label: "Minority Mindset", category: "education" },
];

// ─── Fear & Greed Index (CNN Money) ──────────────────────────────────────
async function fetchFearAndGreed(): Promise<{
  score: number;
  label: string;
  timestamp: string;
}> {
  try {
    const res = await axios.get(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      { timeout: 8_000 }
    );
    const current = res.data?.fear_and_greed;
    return {
      score: Math.round(current?.score ?? 50),
      label: current?.rating ?? "neutral",
      timestamp: current?.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return { score: 50, label: "unavailable", timestamp: new Date().toISOString() };
  }
}

// ─── FRED macro snapshot ─────────────────────────────────────────────────
async function fetchFredSeries(seriesId: string, apiKey: string): Promise<number | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&limit=1&sort_order=desc&file_type=json`;
    const res = await axios.get(url, { timeout: 8_000 });
    const val = res.data?.observations?.[0]?.value;
    return val && val !== "." ? parseFloat(val) : null;
  } catch {
    return null;
  }
}

export async function fetchMacroSnapshot(fredApiKey: string): Promise<Record<string, number | null>> {
  if (!fredApiKey || fredApiKey === "none") {
    return { fedFundsRate: null, cpi: null, unemployment: null, gdp: null };
  }
  const [fedFundsRate, cpi, unemployment, vix] = await Promise.all([
    fetchFredSeries("FEDFUNDS", fredApiKey),
    fetchFredSeries("CPIAUCSL", fredApiKey),
    fetchFredSeries("UNRATE", fredApiKey),
    fetchFredSeries("VIXCLS", fredApiKey),
  ]);
  return { fedFundsRate, cpi, unemployment, vix };
}

// ─── Reddit sentiment (WSB + r/investing, no auth needed) ────────────────
async function fetchRedditSentiment(subreddit: string, limit = 25): Promise<IntelligenceItem[]> {
  try {
    const res = await axios.get(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`,
      {
        timeout: 8_000,
        headers: { "User-Agent": "gl-investments/2.0" },
      }
    );
    const posts = res.data?.data?.children ?? [];
    return posts
      .filter((p: Record<string, unknown>) => {
        const d = p.data as Record<string, unknown>;
        return (d.score as number) > 100;
      })
      .map((p: Record<string, unknown>) => {
        const d = p.data as Record<string, unknown>;
        const title = String(d.title ?? "");
        const body = `${title} ${d.selftext ?? ""}`;
        const filter = scoreContent(body, "https://reddit.com", new Date((d.created_utc as number) * 1000));
        return buildItem({
          title,
          summary: String(d.selftext ?? "").slice(0, 300),
          url: `https://reddit.com${d.permalink}`,
          source: `r/${subreddit}`,
          publishedAt: new Date((d.created_utc as number) * 1000).toISOString(),
          category: "sentiment",
          filter,
        });
      });
  } catch {
    return [];
  }
}

// ─── RSS feed scraper ────────────────────────────────────────────────────
async function scrapeFeed(
  feedUrl: string,
  label: string,
  category: string
): Promise<IntelligenceItem[]> {
  try {
    const feed = await rssParser.parseURL(feedUrl);
    return (feed.items ?? []).slice(0, 20).map((item) => {
      const body = `${item.title ?? ""} ${item.contentSnippet ?? item.content ?? ""}`;
      const published = item.pubDate ? new Date(item.pubDate) : new Date();
      const filter = scoreContent(body, feedUrl, published);
      return buildItem({
        title: item.title ?? "",
        summary: (item.contentSnippet ?? item.content ?? "").slice(0, 400),
        url: item.link ?? feedUrl,
        source: label,
        publishedAt: published.toISOString(),
        category,
        filter,
      });
    });
  } catch {
    return [];
  }
}

// ─── Ticker extraction ────────────────────────────────────────────────────
const TICKER_RE = /\b([A-Z]{1,5})\b/g;
const COMMON_WORDS = new Set([
  "A", "I", "AT", "BE", "BY", "DO", "GO", "IN", "IS", "IT", "MY", "NO",
  "OF", "ON", "OR", "SO", "TO", "UP", "US", "WE", "AM", "AN", "AS", "HE",
  "HI", "IF", "ME", "OK", "SHE", "THE", "AND", "FOR", "ARE", "BUT", "NOT",
  "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "DAY", "GET",
  "HAS", "HIM", "HIS", "HOW", "MAN", "NEW", "NOW", "OLD", "SEE", "TWO",
  "WAY", "WHO", "BOY", "DID", "ITS", "LET", "PUT", "SAY", "SHE", "TOO",
  "USE", "API", "CEO", "CFO", "IPO", "ETF", "SEC", "USD", "GDP", "CPI",
  "FED", "BLS", "NYSE", "NASDAQ", "DOW", "IOT", "ESG", "ETF",
]);

function extractTickers(text: string): string[] {
  const matches = text.match(TICKER_RE) ?? [];
  return [...new Set(matches.filter((t) => t.length >= 2 && !COMMON_WORDS.has(t)))].slice(0, 5);
}

function detectSentiment(text: string): "bullish" | "bearish" | "neutral" {
  const bull = /(surge|rally|jump|soar|gain|rise|bull|beat|exceed|record\s+high|upgrade)/i.test(text);
  const bear = /(fall|drop|crash|decline|sink|bear|miss|below|downgrade|layoff|loss|selloff)/i.test(text);
  if (bull && !bear) return "bullish";
  if (bear && !bull) return "bearish";
  return "neutral";
}

function buildItem(params: {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  category: string;
  filter: FilterResult;
}): IntelligenceItem {
  const { title, summary, url, source, publishedAt, category, filter } = params;
  const text = `${title} ${summary}`;
  return {
    id: Buffer.from(url).toString("base64").slice(0, 32),
    title,
    summary,
    url,
    source,
    publishedAt,
    tickers: extractTickers(text),
    category,
    trustScore: filter.score,
    trustTier: filter.tier,
    flags: filter.flags,
    sentiment: detectSentiment(text),
  };
}

// ─── Main refresh ─────────────────────────────────────────────────────────
export async function refreshIntelligenceFeed(): Promise<IntelligenceItem[]> {
  const results = await Promise.all([
    ...RSS_SOURCES.map((s) => scrapeFeed(s.url, s.label, s.category)),
    fetchRedditSentiment("wallstreetbets"),
    fetchRedditSentiment("investing"),
  ]);

  const all = results.flat();
  // Drop TRASH tier before storing
  const filtered = all.filter((i) => i.trustTier !== "TRASH");

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO intelligence_feed
      (id, title, summary, url, source, published_at, tickers,
       category, trust_score, trust_tier, flags, sentiment, fetched_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `);
  const insertAll = db.transaction((items: IntelligenceItem[]) => {
    for (const item of items) {
      stmt.run(
        item.id, item.title, item.summary.slice(0, 800), item.url,
        item.source, item.publishedAt,
        JSON.stringify(item.tickers), item.category,
        item.trustScore, item.trustTier,
        JSON.stringify(item.flags), item.sentiment
      );
    }
  });
  insertAll(filtered);

  return filtered.sort((a, b) => b.trustScore - a.trustScore);
}

export async function getFearAndGreed() {
  return fetchFearAndGreed();
}

export function getCachedFeed(
  minScore = 0,
  category?: string,
  limit = 100
): IntelligenceItem[] {
  const db = getDb();
  const where: string[] = ["trust_score >= ?"];
  const params: (string | number)[] = [minScore];
  if (category) { where.push("category = ?"); params.push(category); }
  params.push(limit);
  const rows = db.prepare(
    `SELECT * FROM intelligence_feed WHERE ${where.join(" AND ")}
     ORDER BY trust_score DESC, published_at DESC LIMIT ?`
  ).all(...params) as Array<Record<string, unknown>>;
  return rows.map(rowToItem);
}

function rowToItem(r: Record<string, unknown>): IntelligenceItem {
  return {
    id: String(r.id),
    title: String(r.title),
    summary: String(r.summary),
    url: String(r.url),
    source: String(r.source),
    publishedAt: String(r.published_at),
    tickers: JSON.parse(String(r.tickers || "[]")),
    category: String(r.category),
    trustScore: Number(r.trust_score),
    trustTier: String(r.trust_tier),
    flags: JSON.parse(String(r.flags || "[]")),
    sentiment: String(r.sentiment) as IntelligenceItem["sentiment"],
  };
}
