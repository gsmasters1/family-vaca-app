/**
 * APEX Strategy Engine
 *
 * A synthesized framework drawing from:
 *   Minervini  — Stage 2 uptrend, VCP entry, RS rank
 *   O'Neil     — Earnings acceleration, institutional sponsorship, CAN SLIM filters
 *   Graham     — Margin of safety floor, value anchor
 *   Livermore  — Pivot timing, let winners run, cut losers fast
 *   Turtle     — ATR position sizing, trend confirmation
 *   Druckenmiller — Macro regime filter, Fed policy awareness
 *   Dalio      — Risk parity, uncorrelated allocation
 *   Lopez de Prado — Confidence-weighted signal scoring
 *   Congress   — Committee-relevant information edge
 *
 * APEX Score 0–100 → rating: PRIME (80+) | STRONG (60+) | DEVELOPING (40+) | WEAK | AVOID
 */

import { TechnicalIndicators } from "./technicalAnalysis";
import { getDb } from "./database";

export type ApexRating = "PRIME" | "STRONG" | "DEVELOPING" | "WEAK" | "AVOID";
export type MarketRegime = "BULL" | "CAUTION" | "BEAR" | "CRISIS";

export interface ApexScore {
  symbol: string;
  total: number;            // 0–100
  rating: ApexRating;
  components: {
    momentum: number;       // 0–25  Minervini/O'Neil
    technical: number;      // 0–20  Livermore/Turtle entry quality
    congressional: number;  // 0–20  STOCK Act edge
    macro: number;          // 0–20  Druckenmiller/Dalio regime fit
    value: number;          // 0–15  Graham safety net
  };
  positionSizePct: number;  // % of portfolio (Turtle ATR-adjusted)
  entryNotes: string[];     // specific triggers met
  riskNotes: string[];      // specific risks flagged
  stopLossPct: number;      // suggested stop below entry
  targetPct: number;        // minimum target
  regime: MarketRegime;
}

// ─── Component weights ────────────────────────────────────────────────────
const WEIGHTS = {
  momentum:     25,
  technical:    20,
  congressional:20,
  macro:        20,
  value:        15,
};

// ─── Momentum scorer (Minervini/O'Neil) ───────────────────────────────────
export function scoreMomentum(
  indicators: TechnicalIndicators,
  price: number
): { score: number; notes: string[]; risks: string[] } {
  let score = 0;
  const notes: string[] = [];
  const risks: string[] = [];

  // Stage 2 uptrend: price > SMA50 > SMA200 (Minervini core rule)
  if (price > indicators.sma50 && indicators.sma50 > indicators.sma200) {
    score += 12;
    notes.push("Stage 2 uptrend confirmed (price > SMA50 > SMA200)");
  } else if (price > indicators.sma200) {
    score += 5;
    risks.push("Above SMA200 but not full Stage 2 — partial setup");
  } else {
    risks.push("Below SMA200 — O'Neil/Minervini rule: do not buy");
  }

  // RSI in the power zone 50–70 (neither overbought nor weak)
  if (indicators.rsi14 >= 50 && indicators.rsi14 <= 70) {
    score += 8;
    notes.push(`RSI ${indicators.rsi14.toFixed(1)} — power zone (50–70)`);
  } else if (indicators.rsi14 > 70) {
    score += 2;
    risks.push(`RSI ${indicators.rsi14.toFixed(1)} — overbought, wait for pullback`);
  } else {
    risks.push(`RSI ${indicators.rsi14.toFixed(1)} — weak momentum`);
  }

  // Within 15% of 52-week high (O'Neil: buy leaders near highs)
  const pctFromHigh = ((indicators.high52w - price) / indicators.high52w) * 100;
  if (pctFromHigh <= 10) {
    score += 5;
    notes.push(`${pctFromHigh.toFixed(1)}% from 52-week high — leader territory`);
  } else if (pctFromHigh <= 20) {
    score += 2;
  } else {
    risks.push(`${pctFromHigh.toFixed(1)}% off 52-week high — not a leader`);
  }

  return { score: Math.min(score, WEIGHTS.momentum), notes, risks };
}

// ─── Technical entry scorer (Livermore/Turtle) ───────────────────────────
export function scoreTechnical(
  indicators: TechnicalIndicators,
  price: number
): { score: number; notes: string[]; risks: string[] } {
  let score = 0;
  const notes: string[] = [];
  const risks: string[] = [];

  // MACD histogram positive and crossing — Livermore momentum confirmation
  if (indicators.macdHistogram > 0 && indicators.macd > 0) {
    score += 6;
    notes.push("MACD bullish: both line and histogram positive");
  } else if (indicators.macdHistogram > 0) {
    score += 3;
    notes.push("MACD histogram turning positive — early signal");
  } else {
    risks.push("MACD bearish — Livermore: don't fight the tape");
  }

  // Volatility contraction — VCP precursor (Minervini)
  const bbWidth = (indicators.bbUpper - indicators.bbLower) / indicators.bbMiddle;
  if (bbWidth < 0.08) {
    score += 6;
    notes.push("Tight Bollinger Bands — VCP contraction, breakout potential");
  } else if (bbWidth < 0.15) {
    score += 3;
  } else {
    risks.push("Wide Bollinger Bands — volatile, wait for contraction");
  }

  // Near Bollinger midline or lower band — good entry zone (not extended)
  const bbPos = (price - indicators.bbLower) / (indicators.bbUpper - indicators.bbLower);
  if (bbPos < 0.6) {
    score += 4;
    notes.push("Price near BB midline — not extended, safe entry zone");
  } else if (bbPos > 0.9) {
    risks.push("Price near BB upper — extended, Livermore: wait for re-test");
  }

  // Volume surge confirmation (Turtle: trend needs volume)
  if (indicators.volumeRatio >= 1.5) {
    score += 4;
    notes.push(`Volume ${indicators.volumeRatio.toFixed(1)}x average — institutional accumulation signal`);
  } else if (indicators.volumeRatio < 0.8) {
    risks.push("Below-average volume — weak conviction");
  }

  return { score: Math.min(score, WEIGHTS.technical), notes, risks };
}

// ─── Congressional edge scorer ────────────────────────────────────────────
export function scoreCongressional(
  symbol: string,
  insiderSignal: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL" = "NEUTRAL",
  hedgeFundSignal: "SMART_MONEY" | "NONE" = "NONE"
): {
  score: number;
  notes: string[];
  risks: string[];
} {
  const db = getDb();
  const notes: string[] = [];
  const risks: string[] = [];

  // Look for recent purchases (last 90 days)
  const trades = db
    .prepare(
      `SELECT ct.*, ss.score, ss.recommendation
       FROM congress_trades ct
       LEFT JOIN signal_scores ss ON ct.id = ss.trade_id
       WHERE ct.ticker = ? AND ct.trade_type = 'purchase'
         AND date(ct.transaction_date) > date('now', '-90 days')
       ORDER BY ct.transaction_date DESC`
    )
    .all(symbol) as Array<Record<string, unknown>>;

  if (trades.length === 0) {
    return { score: 0, notes: ["No recent congressional buying activity"], risks: [] };
  }

  let score = 0;
  const buyers = new Set(trades.map((t) => String(t.member_name)));

  // Multiple members buying = conviction
  if (buyers.size >= 3) {
    score += 20;
    notes.push(`${buyers.size} congress members bought in last 90 days — high conviction`);
  } else if (buyers.size === 2) {
    score += 14;
    notes.push(`2 congress members buying — notable accumulation`);
  } else {
    score += 8;
    notes.push(`Congressional purchase: ${[...buyers][0]}`);
  }

  // Check if any have AI scores >= 7
  const highScored = trades.filter((t) => Number(t.score ?? 0) >= 7);
  if (highScored.length > 0) {
    score = Math.min(score + 5, WEIGHTS.congressional);
    notes.push(`AI signal score ≥7 on ${highScored.length} trade(s)`);
  }

  // Check for sales (bearish signal — insiders exiting)
  const sales = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM congress_trades
       WHERE ticker = ? AND trade_type = 'sale'
         AND date(transaction_date) > date('now', '-60 days')`
    )
    .get(symbol) as { cnt: number };

  if (sales.cnt > 0) {
    score = Math.max(0, score - 10);
    risks.push(`${sales.cnt} congressional sale(s) in last 60 days — mixed signal`);
  }

  // Hedge fund 13F consensus: 2+ major funds holding = smart money conviction
  if (hedgeFundSignal === "SMART_MONEY") {
    score = Math.min(score + 6, WEIGHTS.congressional);
    notes.push("Smart money consensus — 2+ major hedge funds hold this position (13F data)");
  }

  // Insider signal (Form 4): C-suite spending personal money = aligned interest
  if (insiderSignal === "STRONG_BUY") {
    score = Math.min(score + 8, WEIGHTS.congressional);
    notes.push("Cluster insider buying detected (Form 4) — multiple insiders putting personal capital at risk");
  } else if (insiderSignal === "BUY") {
    score = Math.min(score + 5, WEIGHTS.congressional);
    notes.push("Insider open-market purchase (Form 4) — executive buying with personal money");
  } else if (insiderSignal === "SELL" || insiderSignal === "STRONG_SELL") {
    score = Math.max(0, score - 4);
    risks.push("Multiple insiders selling (Form 4) — distribution pattern, monitor carefully");
  }

  return { score: Math.min(score, WEIGHTS.congressional), notes, risks };
}

// ─── Macro regime scorer (Druckenmiller/Dalio) ───────────────────────────
export function scoreMacro(
  regime: MarketRegime,
  fearGreedScore: number,
  energyChangePct = 0,
  bondMacroScore = 0   // -10 to +10 from fixedIncomeService
): { score: number; notes: string[]; risks: string[] } {
  let score = 0;
  const notes: string[] = [];
  const risks: string[] = [];

  switch (regime) {
    case "BULL":
      score += 14;
      notes.push("Bull market regime — Druckenmiller: ride the trend");
      break;
    case "CAUTION":
      score += 7;
      risks.push("Caution regime — reduce position sizes by 50%");
      break;
    case "BEAR":
      score += 0;
      risks.push("Bear regime — O'Neil: 100% cash until confirmed uptrend");
      break;
    case "CRISIS":
      score -= 5;
      risks.push("Crisis regime — Dalio: rotate to gold/treasuries only");
      break;
  }

  // Fear & Greed: Buffett's rule — greedy when others are fearful
  if (fearGreedScore >= 25 && fearGreedScore <= 55) {
    score += 6;
    notes.push(`Fear & Greed ${fearGreedScore} — market not euphoric, safe entry territory`);
  } else if (fearGreedScore > 75) {
    score += 1;
    risks.push(`Fear & Greed ${fearGreedScore} — extreme greed, Buffett: be fearful`);
  } else if (fearGreedScore < 20) {
    score += 4;
    notes.push(`Fear & Greed ${fearGreedScore} — extreme fear, contrarian opportunity`);
  } else {
    score += 3;
  }

  // Energy overlay: oil price direction = real-time inflation pressure signal
  // Sharp oil spike → stagflation risk → Fed stays hawkish → headwind for growth stocks
  if (energyChangePct > 5) {
    score -= 2;
    risks.push(`WTI crude +${energyChangePct.toFixed(1)}% today — stagflation risk, Fed hawkish pressure`);
  } else if (energyChangePct > 2) {
    score -= 1;
    risks.push(`WTI crude +${energyChangePct.toFixed(1)}% — inflationary signal, watch Fed response`);
  } else if (energyChangePct < -4) {
    score += 1;
    notes.push(`WTI crude ${energyChangePct.toFixed(1)}% — demand-side easing, consumer tailwind`);
  }

  // Bond market signal: yield curve inversion and risk-off flows are leading indicators
  // bondMacroScore -10 to +10, scaled to ±5 pts
  const bondAdj = Math.round(bondMacroScore * 0.5);
  if (bondAdj > 0) {
    score += bondAdj;
    notes.push(`Bond market risk-on (score +${bondAdj}) — credit spreads and yield curve supportive`);
  } else if (bondAdj < 0) {
    score += bondAdj;
    risks.push(`Bond market risk-off (score ${bondAdj}) — yield curve or credit spreads flashing caution`);
  }

  return { score: Math.max(0, Math.min(score, WEIGHTS.macro)), notes, risks };
}

// ─── Value safety scorer (Graham) ────────────────────────────────────────
export function scoreValue(
  price: number,
  indicators: TechnicalIndicators
): { score: number; notes: string[]; risks: string[] } {
  let score = 7; // neutral baseline — we rarely have full fundamental data
  const notes: string[] = [];
  const risks: string[] = [];

  // Graham: never buy at 52-week high without earnings support
  // Proxy: if near 52w high, require strong momentum as safety
  const pctFromLow = ((price - indicators.low52w) / indicators.low52w) * 100;
  if (pctFromLow < 30) {
    score += 5;
    notes.push("Near 52-week low range — potential margin of safety");
  } else if (pctFromLow > 100) {
    score -= 3;
    risks.push("Extended from 52-week low — pay attention to fundamentals");
  }

  // Bollinger band position as value proxy — lower = cheaper relative to recent range
  const bbPos = (price - indicators.bbLower) / (indicators.bbUpper - indicators.bbLower);
  if (bbPos < 0.35) {
    score += 3;
    notes.push("Trading at lower end of recent range — value entry zone");
  }

  return { score: Math.max(0, Math.min(score, WEIGHTS.value)), notes, risks };
}

// ─── Position sizing (Turtle ATR-based) ──────────────────────────────────
export function calcPositionSize(
  regime: MarketRegime,
  apexScore: number,
  riskProfile: string
): { sizePct: number; stopLossPct: number; targetPct: number } {
  // Base size by profile
  const baseSize =
    riskProfile === "conservative" ? 2.5 :
    riskProfile === "aggressive" ? 8 : 5;

  // Scale by APEX score confidence
  const scoreMultiplier = apexScore / 100;

  // Regime multiplier (Druckenmiller: size up in bull, down in caution)
  const regimeMultiplier =
    regime === "BULL" ? 1.0 :
    regime === "CAUTION" ? 0.5 : 0;

  const sizePct = Math.round(baseSize * scoreMultiplier * regimeMultiplier * 10) / 10;

  // Stop loss: Livermore rule — below the last pivot
  // Approximated as 2x ATR below entry (tighter for higher scores)
  const stopLossPct = apexScore >= 80 ? 5 : apexScore >= 60 ? 7 : 10;

  // Target: 2:1 minimum risk/reward (Turtle rule)
  const targetPct = stopLossPct * 2.5;

  return { sizePct: Math.min(sizePct, baseSize * 1.2), stopLossPct, targetPct };
}

// ─── Rating from score ────────────────────────────────────────────────────
export function rateApex(score: number): ApexRating {
  if (score >= 80) return "PRIME";
  if (score >= 60) return "STRONG";
  if (score >= 40) return "DEVELOPING";
  if (score >= 20) return "WEAK";
  return "AVOID";
}

// ─── Main APEX composite scorer ───────────────────────────────────────────
export function computeApexScore(params: {
  symbol: string;
  price: number;
  indicators: TechnicalIndicators;
  regime: MarketRegime;
  fearGreedScore: number;
  riskProfile: string;
  energyChangePct?: number;
  insiderSignal?: "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";
  bondMacroScore?: number;
  hedgeFundSignal?: "SMART_MONEY" | "NONE";
}): ApexScore {
  const {
    symbol, price, indicators, regime, fearGreedScore, riskProfile,
    energyChangePct = 0, insiderSignal = "NEUTRAL",
    bondMacroScore = 0, hedgeFundSignal = "NONE",
  } = params;

  const mom = scoreMomentum(indicators, price);
  const tech = scoreTechnical(indicators, price);
  const cong = scoreCongressional(symbol, insiderSignal, hedgeFundSignal);
  const macro = scoreMacro(regime, fearGreedScore, energyChangePct, bondMacroScore);
  const val = scoreValue(price, indicators);

  const total = mom.score + tech.score + cong.score + macro.score + val.score;
  const rating = rateApex(total);
  const { sizePct, stopLossPct, targetPct } = calcPositionSize(regime, total, riskProfile);

  return {
    symbol,
    total,
    rating,
    components: {
      momentum: mom.score,
      technical: tech.score,
      congressional: cong.score,
      macro: macro.score,
      value: val.score,
    },
    positionSizePct: sizePct,
    entryNotes: [...mom.notes, ...tech.notes, ...cong.notes, ...macro.notes, ...val.notes],
    riskNotes: [...mom.risks, ...tech.risks, ...cong.risks, ...macro.risks, ...val.risks],
    stopLossPct,
    targetPct,
    regime,
  };
}
