/**
 * APEX Decision Engine
 *
 * This is not a scorer. It does not present options.
 * It makes decisions — BUY, SELL, HOLD, AVOID — with exact execution parameters.
 *
 * The user's job is to review and execute.
 * APEX's job is to determine the action.
 */

import { getQuote, getHistory } from "./marketData";
import { computeIndicators } from "./technicalAnalysis";
import { computeApexScore, type MarketRegime } from "./apexStrategy";
import { detectMarketRegime } from "./marketRegimeService";
import { getSetting } from "./appConfig";
import { getDb } from "./database";
import axios from "axios";
import { getOllamaConfig } from "./appConfig";

export type DecisionAction = "BUY" | "SELL" | "HOLD" | "AVOID" | "WATCH";
export type DecisionUrgency = "ACT NOW" | "THIS WEEK" | "DEVELOPING" | "STANDBY";

export interface ApexDecision {
  id: string;
  symbol: string;
  action: DecisionAction;
  urgency: DecisionUrgency;
  conviction: number;       // 1–10
  apexScore: number;        // 0–100
  rationale: string;        // one decisive sentence — the reason in plain language
  execution: {
    currentPrice: number;
    entryPrice: number;     // exact recommended entry
    stopLoss: number;       // non-negotiable exit if wrong
    target: number;         // minimum take-profit
    positionSizePct: number;
    riskRewardRatio: number;
  };
  exitConditions: string[]; // specific conditions that close this trade
  regime: MarketRegime;
  generatedAt: string;
  expiresAt: string;        // decision is stale after this
}

// ─── Map APEX score → decisive action ────────────────────────────────────
function scoreToAction(
  score: number,
  regime: MarketRegime,
  hasCongressBuy: boolean
): { action: DecisionAction; urgency: DecisionUrgency; conviction: number } {
  // Regime overrides everything — Druckenmiller's rule
  if (regime === "CRISIS") {
    return { action: "AVOID", urgency: "STANDBY", conviction: 10 };
  }
  if (regime === "BEAR") {
    return { action: "AVOID", urgency: "STANDBY", conviction: 9 };
  }

  const boost = hasCongressBuy ? 8 : 0; // congressional edge lifts the signal
  const effective = Math.min(score + boost, 100);

  if (effective >= 80) {
    return {
      action: "BUY",
      urgency: "ACT NOW",
      conviction: 10,
    };
  }
  if (effective >= 68) {
    return {
      action: "BUY",
      urgency: regime === "CAUTION" ? "THIS WEEK" : "ACT NOW",
      conviction: Math.round(effective / 10),
    };
  }
  if (effective >= 55) {
    return { action: "WATCH", urgency: "DEVELOPING", conviction: 6 };
  }
  if (effective >= 40) {
    return { action: "WATCH", urgency: "DEVELOPING", conviction: 4 };
  }
  return { action: "AVOID", urgency: "STANDBY", conviction: 2 };
}

// ─── Generate a one-sentence decisive rationale via Ollama ───────────────
async function generateRationale(
  symbol: string,
  action: DecisionAction,
  apexScore: number,
  entryNotes: string[],
  riskNotes: string[],
  regime: MarketRegime
): Promise<string> {
  const { baseUrl, model } = getOllamaConfig();

  const prompt = `You are APEX, a decisive portfolio manager. Write ONE sentence (max 20 words) explaining why you are making this decision. Be direct. No hedging. State the dominant reason only.

Symbol: ${symbol}
Decision: ${action}
APEX Score: ${apexScore}/100
Market: ${regime}
Key signals: ${entryNotes.slice(0, 2).join("; ")}
Key risks: ${riskNotes.slice(0, 1).join("; ")}

Write only the one sentence. No preamble. No "I think" or "consider". Just the reason.`;

  try {
    const res = await axios.post(
      `${baseUrl}/api/chat`,
      {
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: { temperature: 0.3 },
      },
      { timeout: 30_000 }
    );
    const text: string = res.data.message?.content ?? "";
    // Clean up — one sentence only
    return text.split(/[.\n]/)[0].trim().replace(/^["']|["']$/g, "") + ".";
  } catch {
    // Fallback: build from signals
    if (action === "BUY") return `${symbol} meets Stage 2 criteria with ${entryNotes[0] ?? "strong momentum"} in a ${regime.toLowerCase()} market.`;
    if (action === "SELL") return `${symbol} violating key support with ${riskNotes[0] ?? "deteriorating signals"}.`;
    if (action === "AVOID") return `${regime === "BEAR" || regime === "CRISIS" ? "Market regime requires cash" : `${symbol} does not meet APEX entry criteria`}.`;
    return `${symbol} approaching setup — monitoring for entry trigger.`;
  }
}

// ─── Build one decision for a symbol ─────────────────────────────────────
export async function makeDecision(symbol: string): Promise<ApexDecision | null> {
  const riskProfile = getSetting("risk_profile") ?? "moderate";

  try {
    const [quote, history, regime] = await Promise.all([
      getQuote(symbol),
      getHistory(symbol, "1y"),
      detectMarketRegime(),
    ]);

    if (history.length < 20) return null;

    const indicators = computeIndicators(history);
    const apex = computeApexScore({
      symbol,
      price: quote.price,
      indicators,
      regime: regime.regime,
      fearGreedScore: regime.fearGreed,
      riskProfile,
    });

    // Check congressional backing
    const db = getDb();
    const congBuy = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM congress_trades
         WHERE ticker = ? AND trade_type = 'purchase'
           AND date(transaction_date) > date('now', '-45 days')`
      )
      .get(symbol) as { cnt: number };

    const { action, urgency, conviction } = scoreToAction(
      apex.total,
      regime.regime,
      congBuy.cnt > 0
    );

    // Exact execution levels
    const price = quote.price;
    const stopLossPct = apex.stopLossPct / 100;
    const targetPct = apex.targetPct / 100;
    const entryPrice = action === "BUY"
      ? Math.round(price * 1.001 * 100) / 100   // buy slightly above for breakout confirmation
      : price;
    const stopLoss = Math.round(entryPrice * (1 - stopLossPct) * 100) / 100;
    const target = Math.round(entryPrice * (1 + targetPct) * 100) / 100;
    const riskRewardRatio = Math.round((targetPct / stopLossPct) * 10) / 10;

    // Exit conditions — specific, not vague
    const exitConditions = [
      `Stop: close below $${stopLoss} — no exceptions`,
      `Target: take partial at $${target} (${apex.targetPct}% gain)`,
      `Trail: raise stop to entry cost once +${Math.round(apex.stopLossPct * 0.75)}% is reached`,
      ...(regime.regime !== "BULL"
        ? ["Regime exit: go to cash if SPY breaks 200MA on volume"]
        : []),
    ];

    const rationale = await generateRationale(
      symbol, action, apex.total,
      apex.entryNotes, apex.riskNotes, regime.regime
    );

    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h validity

    const decision: ApexDecision = {
      id: `${symbol}-${now.toISOString().split("T")[0]}`,
      symbol,
      action,
      urgency,
      conviction,
      apexScore: apex.total,
      rationale,
      execution: {
        currentPrice: price,
        entryPrice,
        stopLoss,
        target,
        positionSizePct: apex.positionSizePct,
        riskRewardRatio,
      },
      exitConditions,
      regime: regime.regime,
      generatedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    };

    // Cache the decision
    db.prepare(
      `INSERT OR REPLACE INTO apex_decisions
         (id, symbol, action, urgency, conviction, apex_score, rationale,
          execution_json, exit_conditions_json, regime, generated_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      decision.id, symbol, action, urgency, conviction, apex.total, rationale,
      JSON.stringify(decision.execution),
      JSON.stringify(exitConditions),
      regime.regime,
      decision.generatedAt,
      decision.expiresAt
    );

    return decision;
  } catch {
    return null;
  }
}

// ─── Run the full scan — all candidate symbols ────────────────────────────
export async function runFullScan(): Promise<ApexDecision[]> {
  const db = getDb();

  // Gather all candidate symbols: watchlist + portfolio + recent congress buys
  const watchlist = db.prepare("SELECT symbol FROM watchlist").all() as Array<{ symbol: string }>;
  const portfolio = db.prepare("SELECT DISTINCT symbol FROM portfolio_positions").all() as Array<{ symbol: string }>;
  const congress = db
    .prepare(
      `SELECT DISTINCT ticker as symbol FROM congress_trades
       WHERE trade_type = 'purchase' AND ticker != ''
         AND date(transaction_date) > date('now', '-30 days')`
    )
    .all() as Array<{ symbol: string }>;

  const allSymbols = [
    ...new Set([
      ...watchlist.map((r) => r.symbol),
      ...portfolio.map((r) => r.symbol),
      ...congress.map((r) => r.symbol),
    ]),
  ].slice(0, 30);

  if (allSymbols.length === 0) return [];

  const decisions = await Promise.all(
    allSymbols.map((s) => makeDecision(s).catch(() => null))
  );

  return decisions
    .filter((d): d is ApexDecision => d !== null)
    .sort((a, b) => {
      // Sort: BUY ACT NOW first, then by conviction desc
      const urgencyOrder = { "ACT NOW": 0, "THIS WEEK": 1, "DEVELOPING": 2, "STANDBY": 3 };
      const actionOrder = { BUY: 0, SELL: 1, WATCH: 2, HOLD: 3, AVOID: 4 };
      const uDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (uDiff !== 0) return uDiff;
      const aDiff = actionOrder[a.action] - actionOrder[b.action];
      if (aDiff !== 0) return aDiff;
      return b.conviction - a.conviction;
    });
}

// ─── Load cached decisions from DB ────────────────────────────────────────
export function getCachedDecisions(): ApexDecision[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM apex_decisions
       WHERE datetime(expires_at) > datetime('now')
       ORDER BY
         CASE action WHEN 'BUY' THEN 0 WHEN 'SELL' THEN 1 WHEN 'WATCH' THEN 2 ELSE 3 END,
         conviction DESC`
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    symbol: String(r.symbol),
    action: String(r.action) as DecisionAction,
    urgency: String(r.urgency) as DecisionUrgency,
    conviction: Number(r.conviction),
    apexScore: Number(r.apex_score),
    rationale: String(r.rationale),
    execution: JSON.parse(String(r.execution_json)),
    exitConditions: JSON.parse(String(r.exit_conditions_json)),
    regime: String(r.regime) as MarketRegime,
    generatedAt: String(r.generated_at),
    expiresAt: String(r.expires_at),
  }));
}
