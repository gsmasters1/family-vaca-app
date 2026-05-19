import { getDb } from "./database";
import { setSetting, getSetting } from "./appConfig";

export interface SignalWeights {
  momentum: number;
  technical: number;
  congressional: number;
  macro: number;
  value: number;
}

const DEFAULT_WEIGHTS: SignalWeights = {
  momentum: 25,
  technical: 20,
  congressional: 20,
  macro: 20,
  value: 15,
};

export interface TradeOutcomeParams {
  symbol: string;
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  momentumScore: number;
  technicalScore: number;
  congressScore: number;
  macroScore: number;
  valueScore: number;
  insiderSignal?: string;
  hedgeFundSignal?: boolean;
  shortSqueezeSignal?: string;
}

export interface SignalAccuracyReport {
  totalTrades: number;
  overallWinRate: number;
  signalAccuracy: {
    momentum: { winRate: number; tradeCount: number };
    technical: { winRate: number; tradeCount: number };
    congressional: { winRate: number; tradeCount: number };
    macro: { winRate: number; tradeCount: number };
    value: { winRate: number; tradeCount: number };
  };
  summary: string;
}

export async function recordTradeOutcome(
  params: TradeOutcomeParams
): Promise<void> {
  const db = getDb();
  const returnPct =
    params.entryPrice > 0
      ? ((params.exitPrice - params.entryPrice) / params.entryPrice) * 100
      : 0;

  try {
    db.prepare(
      `INSERT INTO trade_outcomes
       (symbol, entry_date, exit_date, entry_price, exit_price, return_pct,
        momentum_score, technical_score, congress_score, macro_score, value_score,
        insider_signal, hedge_fund_signal, short_squeeze_signal, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      params.symbol,
      params.entryDate,
      params.exitDate,
      params.entryPrice,
      params.exitPrice,
      returnPct,
      params.momentumScore,
      params.technicalScore,
      params.congressScore,
      params.macroScore,
      params.valueScore,
      params.insiderSignal ?? "",
      params.hedgeFundSignal ? 1 : 0,
      params.shortSqueezeSignal ?? ""
    );
  } catch {
    // Non-fatal — learning data loss is recoverable
  }
}

function normalizeWeights(raw: Record<string, number>): SignalWeights {
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  if (total === 0) return DEFAULT_WEIGHTS;
  const scale = 100 / total;
  return {
    momentum: Math.round(raw.momentum * scale),
    technical: Math.round(raw.technical * scale),
    congressional: Math.round(raw.congressional * scale),
    macro: Math.round(raw.macro * scale),
    value: Math.round(raw.value * scale),
  };
}

export function getSignalWeights(): SignalWeights {
  const db = getDb();

  // Use cached weights if computed recently (within 7 days)
  try {
    const cached = db
      .prepare(
        `SELECT momentum, technical, congressional, macro_weight, value, computed_at
         FROM signal_weights WHERE id = 'current'
         AND datetime(computed_at, '+7 days') > datetime('now')`
      )
      .get() as {
        momentum: number;
        technical: number;
        congressional: number;
        macro_weight: number;
        value: number;
        computed_at: string;
      } | undefined;

    if (cached) {
      return {
        momentum: cached.momentum,
        technical: cached.technical,
        congressional: cached.congressional,
        macro: cached.macro_weight,
        value: cached.value,
      };
    }
  } catch {
    return DEFAULT_WEIGHTS;
  }

  // Compute from 90-day trade outcomes
  let trades: Array<{
    return_pct: number;
    momentum_score: number;
    technical_score: number;
    congress_score: number;
    macro_score: number;
    value_score: number;
  }> = [];

  try {
    trades = db
      .prepare(
        `SELECT return_pct, momentum_score, technical_score, congress_score, macro_score, value_score
         FROM trade_outcomes
         WHERE date(exit_date) > date('now', '-90 days')`
      )
      .all() as typeof trades;
  } catch {
    return DEFAULT_WEIGHTS;
  }

  if (trades.length < 20) return DEFAULT_WEIGHTS;

  const HIGH_THRESHOLD = 15;
  const LOW_THRESHOLD = 10;

  function computeSignalEdge(
    scoreKey: keyof (typeof trades)[0]
  ): number {
    const high = trades.filter((t) => (t[scoreKey] as number) > HIGH_THRESHOLD);
    const low = trades.filter((t) => (t[scoreKey] as number) < LOW_THRESHOLD);
    if (high.length === 0 || low.length === 0) return 0;
    const highAvg = high.reduce((s, t) => s + t.return_pct, 0) / high.length;
    const lowAvg = low.reduce((s, t) => s + t.return_pct, 0) / low.length;
    return highAvg - lowAvg;
  }

  const momentumEdge = computeSignalEdge("momentum_score");
  const technicalEdge = computeSignalEdge("technical_score");
  const congressEdge = computeSignalEdge("congress_score");
  const macroEdge = computeSignalEdge("macro_score");
  const valueEdge = computeSignalEdge("value_score");

  // Convert edge to weight: base weight + proportional bonus for predictive signals
  const raw = {
    momentum: Math.max(5, DEFAULT_WEIGHTS.momentum + momentumEdge),
    technical: Math.max(5, DEFAULT_WEIGHTS.technical + technicalEdge),
    congressional: Math.max(5, DEFAULT_WEIGHTS.congressional + congressEdge),
    macro: Math.max(5, DEFAULT_WEIGHTS.macro + macroEdge),
    value: Math.max(5, DEFAULT_WEIGHTS.value + valueEdge),
  };

  const normalized = normalizeWeights(raw);

  try {
    db.prepare(
      `INSERT OR REPLACE INTO signal_weights
       (id, momentum, technical, congressional, macro_weight, value, computed_at)
       VALUES ('current', ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      normalized.momentum,
      normalized.technical,
      normalized.congressional,
      normalized.macro,
      normalized.value
    );
  } catch {
    // Non-fatal
  }

  return normalized;
}

export function getSignalAccuracy(): SignalAccuracyReport {
  const db = getDb();

  let trades: Array<{
    return_pct: number;
    momentum_score: number;
    technical_score: number;
    congress_score: number;
    macro_score: number;
    value_score: number;
  }> = [];

  try {
    trades = db
      .prepare(
        `SELECT return_pct, momentum_score, technical_score, congress_score, macro_score, value_score
         FROM trade_outcomes
         ORDER BY recorded_at DESC
         LIMIT 200`
      )
      .all() as typeof trades;
  } catch {
    trades = [];
  }

  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.return_pct > 0).length;
  const overallWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  function signalWinRate(
    scoreKey: keyof (typeof trades)[0],
    threshold: number
  ): { winRate: number; tradeCount: number } {
    const relevant = trades.filter((t) => (t[scoreKey] as number) >= threshold);
    if (relevant.length === 0) return { winRate: 0, tradeCount: 0 };
    const w = relevant.filter((t) => t.return_pct > 0).length;
    return {
      winRate: Math.round((w / relevant.length) * 100),
      tradeCount: relevant.length,
    };
  }

  const HIGH = 12;
  const momentum = signalWinRate("momentum_score", HIGH);
  const technical = signalWinRate("technical_score", HIGH);
  const congressional = signalWinRate("congress_score", HIGH);
  const macro = signalWinRate("macro_score", HIGH);
  const value = signalWinRate("value_score", HIGH);

  const summary = [
    `Momentum signal accuracy: ${momentum.winRate}% (${momentum.tradeCount} trades)`,
    `Technical signal accuracy: ${technical.winRate}% (${technical.tradeCount} trades)`,
    `Congressional signal accuracy: ${congressional.winRate}% (${congressional.tradeCount} trades)`,
    `Macro signal accuracy: ${macro.winRate}% (${macro.tradeCount} trades)`,
    `Value signal accuracy: ${value.winRate}% (${value.tradeCount} trades)`,
  ].join(", ");

  return {
    totalTrades,
    overallWinRate: Math.round(overallWinRate),
    signalAccuracy: { momentum, technical, congressional, macro, value },
    summary,
  };
}
