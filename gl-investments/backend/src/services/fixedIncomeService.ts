import yahooFinance from "yahoo-finance2";
import { getDb } from "./database";

interface BondETFConfig {
  symbol: string;
  name: string;
  duration: string;
}

const BOND_ETFS: BondETFConfig[] = [
  { symbol: "TLT", name: "20+ Year Treasury", duration: "long" },
  { symbol: "IEF", name: "7-10 Year Treasury", duration: "medium" },
  { symbol: "SHY", name: "1-3 Year Treasury", duration: "short" },
  { symbol: "HYG", name: "High Yield Corporate", duration: "credit_junk" },
  { symbol: "LQD", name: "Investment Grade Corporate", duration: "credit_ig" },
  { symbol: "TIP", name: "TIPS (Inflation Protected)", duration: "inflation" },
  { symbol: "BND", name: "Total Bond Market", duration: "total" },
];

export interface BondETFSnapshot {
  symbol: string;
  name: string;
  duration: string;
  price: number;
  changePct: number;
  priceVsSMA20pct: number;
  signal: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
}

export interface BondSnapshot {
  etfs: BondETFSnapshot[];
  yieldCurveSignal: "INVERTED" | "FLAT" | "NORMAL";
  riskOnOff: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  inflationSignal: "RISING" | "FALLING" | "NEUTRAL";
  macroRegimeHint: string;
  cachedAt: string;
}

const CACHE_TTL_MINUTES = 30;

async function fetchETFSnapshot(
  config: BondETFConfig
): Promise<BondETFSnapshot> {
  const now = new Date();
  const period1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let price = 0;
  let changePct = 0;
  let sma20 = 0;

  try {
    const [quote, history] = await Promise.all([
      yahooFinance.quote(config.symbol),
      yahooFinance
        .historical(config.symbol, {
          period1: period1.toISOString().split("T")[0],
          interval: "1d",
        })
        .catch(() => []),
    ]);

    price = quote.regularMarketPrice ?? 0;
    changePct = quote.regularMarketChangePercent ?? 0;

    if (history.length >= 20) {
      const closes = history.map((h: { close: number }) => h.close);
      const slice = closes.slice(-20);
      sma20 = slice.reduce((a: number, b: number) => a + b, 0) / slice.length;
    }
  } catch {
    // Return zero-value snapshot rather than throwing
  }

  const priceVsSMA20pct = sma20 > 0 ? ((price - sma20) / sma20) * 100 : 0;

  // Risk signal per ETF: long-duration Treasuries rising = RISK_OFF environment
  // Credit (HYG, LQD) rising = RISK_ON
  let signal: "RISK_ON" | "RISK_OFF" | "NEUTRAL" = "NEUTRAL";
  if (config.duration === "long" || config.duration === "medium") {
    signal = changePct > 0.3 ? "RISK_OFF" : changePct < -0.3 ? "RISK_ON" : "NEUTRAL";
  } else if (config.duration === "credit_junk" || config.duration === "credit_ig") {
    signal = changePct > 0.3 ? "RISK_ON" : changePct < -0.3 ? "RISK_OFF" : "NEUTRAL";
  }

  return {
    symbol: config.symbol,
    name: config.name,
    duration: config.duration,
    price,
    changePct,
    priceVsSMA20pct,
    signal,
  };
}

export async function getBondSnapshot(): Promise<BondSnapshot> {
  const db = getDb();

  try {
    const cached = db
      .prepare(
        `SELECT data, cached_at FROM fixed_income_cache WHERE id = 'singleton'
         AND datetime(cached_at, '+${CACHE_TTL_MINUTES} minutes') > datetime('now')`
      )
      .get() as { data: string; cached_at: string } | undefined;

    if (cached) return JSON.parse(cached.data) as BondSnapshot;
  } catch {
    // Cache table may not exist yet
  }

  const etfs = await Promise.all(
    BOND_ETFS.map((config) => fetchETFSnapshot(config).catch(() => ({
      symbol: config.symbol,
      name: config.name,
      duration: config.duration,
      price: 0,
      changePct: 0,
      priceVsSMA20pct: 0,
      signal: "NEUTRAL" as const,
    })))
  );

  const tlt = etfs.find((e) => e.symbol === "TLT");
  const shy = etfs.find((e) => e.symbol === "SHY");
  const hyg = etfs.find((e) => e.symbol === "HYG");
  const tip = etfs.find((e) => e.symbol === "TIP");

  // Yield curve proxy: TLT (long end) vs SHY (short end) price performance
  // When TLT underperforms SHY (long rates rising faster than short), curve is steepening
  // Inverted curve: SHY changePct > TLT changePct meaningfully
  const tltChange = tlt?.changePct ?? 0;
  const shyChange = shy?.changePct ?? 0;
  const yieldCurveDelta = tltChange - shyChange;
  const yieldCurveSignal: "INVERTED" | "FLAT" | "NORMAL" =
    yieldCurveDelta < -0.5 ? "INVERTED" :
    Math.abs(yieldCurveDelta) <= 0.5 ? "FLAT" : "NORMAL";

  // Risk-on/off: HYG outperforming TLT = risk-on (investors buying junk over safety)
  const hygChange = hyg?.changePct ?? 0;
  const riskOnOff: "RISK_ON" | "RISK_OFF" | "NEUTRAL" =
    hygChange - tltChange > 0.5 ? "RISK_ON" :
    tltChange - hygChange > 0.5 ? "RISK_OFF" : "NEUTRAL";

  // Inflation signal: TIP outperforming TLT = rising inflation expectations
  const tipChange = tip?.changePct ?? 0;
  const inflationSignal: "RISING" | "FALLING" | "NEUTRAL" =
    tipChange - tltChange > 0.3 ? "RISING" :
    tltChange - tipChange > 0.3 ? "FALLING" : "NEUTRAL";

  const hintParts: string[] = [];
  if (yieldCurveSignal === "INVERTED")
    hintParts.push("Inverted yield curve signals recession risk");
  else if (yieldCurveSignal === "NORMAL")
    hintParts.push("Normal yield curve — healthy growth backdrop");
  else hintParts.push("Flat yield curve — growth uncertainty");

  if (riskOnOff === "RISK_ON")
    hintParts.push("credit spreads tightening (risk-on)");
  else if (riskOnOff === "RISK_OFF")
    hintParts.push("flight to safety (risk-off)");

  if (inflationSignal === "RISING")
    hintParts.push("TIPS outperforming — inflation re-acceleration watch");
  else if (inflationSignal === "FALLING")
    hintParts.push("disinflation in TIPS — Fed cut optionality building");

  const snapshot: BondSnapshot = {
    etfs,
    yieldCurveSignal,
    riskOnOff,
    inflationSignal,
    macroRegimeHint: hintParts.join("; "),
    cachedAt: new Date().toISOString(),
  };

  try {
    db.prepare(
      `INSERT OR REPLACE INTO fixed_income_cache (id, data, cached_at)
       VALUES ('singleton', ?, datetime('now'))`
    ).run(JSON.stringify(snapshot));
  } catch {
    // Non-fatal if cache write fails
  }

  return snapshot;
}

export async function getBondMacroScore(): Promise<number> {
  const snapshot = await getBondSnapshot().catch(() => null);
  if (!snapshot) return 0;

  let score = 0;

  if (snapshot.yieldCurveSignal === "INVERTED") score -= 5;
  else if (snapshot.yieldCurveSignal === "NORMAL") score += 3;

  if (snapshot.riskOnOff === "RISK_OFF") score -= 3;
  else if (snapshot.riskOnOff === "RISK_ON") score += 3;

  if (snapshot.inflationSignal === "RISING") score -= 2;
  else if (snapshot.inflationSignal === "FALLING") score += 2;

  return Math.max(-10, Math.min(10, score));
}
