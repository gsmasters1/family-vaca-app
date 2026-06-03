import axios from "axios";
import { getDb } from "./database";
import type { CongressTrade } from "./congressService";
import type { Quote } from "./marketData";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "llama3.1:8b";
const SCORE_TTL_HOURS = 24;

export interface TradeSignal {
  tradeId: string;
  score: number;
  recommendation: "Strong Buy" | "Buy" | "Watch" | "Avoid" | "Strong Avoid";
  timeframe: "1-4 weeks" | "1-3 months" | "6+ months";
  reasoning: string;
  targetPct: number;
  riskLevel: "Low" | "Medium" | "High";
  scoredAt: string;
}

function buildPrompt(trade: CongressTrade, quote: Quote): string {
  return `You are a quantitative analyst. Analyze this congressional trade disclosure and score it.

TRADE:
Member: ${trade.memberName} (${trade.party}, ${trade.state})
Ticker: ${trade.ticker} - ${trade.assetDescription}
Type: ${trade.tradeType}
Amount: ${trade.amountRange}
Transaction Date: ${trade.transactionDate} (disclosed ${trade.daysToDisclose} days later)
Current Price: $${quote.price.toFixed(2)}
Day Change: ${quote.changePct.toFixed(2)}%

Score from 1-10 (10 = strongest buy signal). Respond with ONLY valid JSON:
{
  "score": <number 1-10>,
  "recommendation": "<Strong Buy|Buy|Watch|Avoid|Strong Avoid>",
  "timeframe": "<1-4 weeks|1-3 months|6+ months>",
  "reasoning": "<2 sentences max>",
  "targetPct": <estimated % gain target as number>,
  "riskLevel": "<Low|Medium|High>"
}`;
}

function parseFallback(tradeId: string): TradeSignal {
  return {
    tradeId,
    score: 5,
    recommendation: "Watch",
    timeframe: "1-3 months",
    reasoning: "Unable to generate AI analysis at this time.",
    targetPct: 0,
    riskLevel: "Medium",
    scoredAt: new Date().toISOString(),
  };
}

function isScoreCacheValid(tradeid: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT scored_at FROM signal_scores
       WHERE trade_id = ?
       AND datetime(scored_at, '+${SCORE_TTL_HOURS} hours') > datetime('now')`
    )
    .get(tradeid) as { scored_at: string } | undefined;
  return !!row;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSignal(row: any): TradeSignal {
  return {
    tradeId: row.trade_id,
    score: row.score,
    recommendation: row.recommendation,
    timeframe: row.timeframe,
    reasoning: row.reasoning,
    targetPct: row.target_pct,
    riskLevel: row.risk_level,
    scoredAt: row.scored_at,
  };
}

function getCachedScore(tradeId: string): TradeSignal | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM signal_scores WHERE trade_id = ?")
    .get(tradeId) as object | undefined;
  if (!row) return null;
  return rowToSignal(row);
}

function saveScore(signal: TradeSignal): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO signal_scores
      (trade_id, score, recommendation, timeframe, reasoning, target_pct, risk_level, scored_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    signal.tradeId,
    signal.score,
    signal.recommendation,
    signal.timeframe,
    signal.reasoning,
    signal.targetPct,
    signal.riskLevel
  );
}

export async function scoreCongressTrade(
  trade: CongressTrade,
  quote: Quote
): Promise<TradeSignal> {
  if (isScoreCacheValid(trade.id)) {
    const cached = getCachedScore(trade.id);
    if (cached) return cached;
  }

  try {
    const prompt = buildPrompt(trade, quote);
    const payload = {
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    };

    const response = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, payload, {
      timeout: 60_000,
    });

    const content: string = response.data.message?.content ?? "";

    // Extract JSON from the response (handle markdown code blocks)
    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      const fallback = parseFallback(trade.id);
      saveScore(fallback);
      return fallback;
    }

    const parsed = JSON.parse(jsonMatch[1].trim()) as {
      score?: unknown;
      recommendation?: unknown;
      timeframe?: unknown;
      reasoning?: unknown;
      targetPct?: unknown;
      riskLevel?: unknown;
    };

    const validRecommendations = ["Strong Buy", "Buy", "Watch", "Avoid", "Strong Avoid"];
    const validTimeframes = ["1-4 weeks", "1-3 months", "6+ months"];
    const validRiskLevels = ["Low", "Medium", "High"];

    const signal: TradeSignal = {
      tradeId: trade.id,
      score: typeof parsed.score === "number"
        ? Math.min(10, Math.max(1, Math.round(parsed.score)))
        : 5,
      recommendation: validRecommendations.includes(String(parsed.recommendation))
        ? (parsed.recommendation as TradeSignal["recommendation"])
        : "Watch",
      timeframe: validTimeframes.includes(String(parsed.timeframe))
        ? (parsed.timeframe as TradeSignal["timeframe"])
        : "1-3 months",
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
      targetPct: typeof parsed.targetPct === "number" ? parsed.targetPct : 0,
      riskLevel: validRiskLevels.includes(String(parsed.riskLevel))
        ? (parsed.riskLevel as TradeSignal["riskLevel"])
        : "Medium",
      scoredAt: new Date().toISOString(),
    };

    saveScore(signal);
    return signal;
  } catch {
    const fallback = parseFallback(trade.id);
    saveScore(fallback);
    return fallback;
  }
}

export function getTopSignals(minScore = 7, limit = 10): TradeSignal[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM signal_scores
       WHERE score >= ?
       ORDER BY score DESC, scored_at DESC
       LIMIT ?`
    )
    .all(minScore, limit) as object[];
  return rows.map(rowToSignal);
}

export function getAllSignals(minScore = 5): TradeSignal[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM signal_scores
       WHERE score >= ?
       ORDER BY score DESC`
    )
    .all(minScore) as object[];
  return rows.map(rowToSignal);
}

export function clearSignalScores(): void {
  const db = getDb();
  db.prepare("DELETE FROM signal_scores").run();
}
