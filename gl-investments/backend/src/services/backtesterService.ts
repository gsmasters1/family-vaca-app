/**
 * APEX Strategy Backtester
 *
 * Validates the APEX strategy against historical data before live capital is deployed.
 * Uses Yahoo Finance daily OHLCV history — the same data source the live system uses.
 *
 * Anti-look-ahead: For each test day D, indicators are computed from data through D-1 only.
 * Entries execute at D's closing price. Exits check each subsequent day's close.
 *
 * Guardrail: if Sharpe < 1.0, a flag is set — live trading should stay in paper mode.
 */

import yahooFinance from "yahoo-finance2";
import { computeIndicators } from "./technicalAnalysis";
import { scoreMomentum, scoreTechnical, scoreValue, type MarketRegime } from "./apexStrategy";
import { getDb } from "./database";

export interface BacktestTrade {
  symbol: string;
  action: "BUY" | "SELL";
  date: string;
  price: number;
  shares: number;
  positionValue: number;
  reason: "signal" | "stop_loss" | "target_hit" | "end_of_test";
  pnlPct?: number;         // set on exit
  holdingDays?: number;    // set on exit
}

export interface BacktestResult {
  id: string;
  symbols: string[];
  startDate: string;
  endDate: string;
  startingCapital: number;
  endingCapital: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  sharpeRatio: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  profitFactor: number;        // gross profit / gross loss
  avgWinPct: number;
  avgLossPct: number;
  equityCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
  passesLiveThreshold: boolean; // Sharpe >= 1.0
  status: "running" | "complete" | "failed";
  createdAt: string;
  completedAt?: string;
}

// Detect regime from SPY history at date D (no look-ahead)
function detectRegimeFromHistory(
  spyCloses: number[],
  idx: number
): MarketRegime {
  if (idx < 50) return "CAUTION";
  const price = spyCloses[idx];
  const sma50 = spyCloses.slice(idx - 50, idx).reduce((a, b) => a + b, 0) / 50;
  const sma200Start = Math.max(0, idx - 200);
  const sma200 = spyCloses.slice(sma200Start, idx).reduce((a, b) => a + b, 0) / (idx - sma200Start);

  if (price > sma50 && sma50 > sma200) return "BULL";
  if (price > sma200) return "CAUTION";
  if (price < sma200 && price < sma50) return "BEAR";
  return "CAUTION";
}

function calcSharpe(equityCurve: { value: number }[], riskFreeAnnual = 0.05): number {
  if (equityCurve.length < 2) return 0;
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    dailyReturns.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value);
  }
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);
  const dailyRiskFree = riskFreeAnnual / 252;
  if (stdDev === 0) return 0;
  return ((mean - dailyRiskFree) / stdDev) * Math.sqrt(252);
}

function calcMaxDrawdown(equityCurve: { value: number }[]): number {
  let peak = equityCurve[0]?.value ?? 0;
  let maxDD = 0;
  for (const point of equityCurve) {
    if (point.value > peak) peak = point.value;
    const dd = (peak - point.value) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD * 100;
}

export async function runBacktest(params: {
  symbols: string[];
  startDate: string;
  endDate: string;
  startingCapital?: number;
  minApexScore?: number;
  maxPositions?: number;
}): Promise<BacktestResult> {
  const {
    symbols,
    startDate,
    endDate,
    startingCapital = 10_000,
    minApexScore = 65,
    maxPositions = 8,
  } = params;

  const runId = `bt-${Date.now()}`;
  const createdAt = new Date().toISOString();

  // Fetch all historical data upfront (avoid repeated network calls)
  // Fetch 1 year before startDate for indicator warmup
  const fetchFrom = new Date(startDate);
  fetchFrom.setFullYear(fetchFrom.getFullYear() - 1);
  const fetchFromStr = fetchFrom.toISOString().split("T")[0];

  const allSymbols = [...new Set([...symbols, "SPY"])];

  type DayData = { date: string; close: number };
  const historyMap: Record<string, DayData[]> = {};

  await Promise.all(
    allSymbols.map(async (sym) => {
      try {
        const results = await yahooFinance.historical(sym, {
          period1: fetchFromStr,
          period2: endDate,
          interval: "1d",
        });
        historyMap[sym] = results
          .filter((r) => r.close != null)
          .map((r) => ({
            date: r.date.toISOString().split("T")[0],
            close: r.close,
          }));
      } catch {
        historyMap[sym] = [];
      }
    })
  );

  // Build a set of all trading dates in the test window
  const spyHistory = historyMap["SPY"] ?? [];
  const spyCloses = spyHistory.map((d) => d.close);
  const tradingDates = spyHistory
    .filter((d) => d.date >= startDate && d.date <= endDate)
    .map((d) => d.date);

  if (tradingDates.length === 0) {
    return {
      id: runId, symbols, startDate, endDate, startingCapital,
      endingCapital: startingCapital, totalReturnPct: 0, annualizedReturnPct: 0,
      sharpeRatio: 0, maxDrawdownPct: 0, winRatePct: 0, totalTrades: 0,
      profitFactor: 0, avgWinPct: 0, avgLossPct: 0,
      equityCurve: [], trades: [], passesLiveThreshold: false,
      status: "failed", createdAt,
    };
  }

  let cash = startingCapital;
  const openPositions: Record<string, {
    entryPrice: number; shares: number; stopLoss: number; target: number; entryDate: string;
  }> = {};
  const equityCurve: { date: string; value: number }[] = [];
  const allTrades: BacktestTrade[] = [];

  for (const date of tradingDates) {
    const spyIdx = spyHistory.findIndex((d) => d.date === date);

    // ── Check exits for open positions ──
    for (const sym of Object.keys(openPositions)) {
      const pos = openPositions[sym];
      const symHistory = historyMap[sym] ?? [];
      const dayData = symHistory.find((d) => d.date === date);
      if (!dayData) continue;

      const currentPrice = dayData.close;
      let exitReason: BacktestTrade["reason"] | null = null;

      if (currentPrice <= pos.stopLoss) {
        exitReason = "stop_loss";
      } else if (currentPrice >= pos.target) {
        exitReason = "target_hit";
      }

      if (exitReason) {
        const proceeds = pos.shares * currentPrice;
        cash += proceeds;
        const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
        const holdingDays = Math.round(
          (new Date(date).getTime() - new Date(pos.entryDate).getTime()) / 86_400_000
        );
        allTrades.push({
          symbol: sym, action: "SELL", date, price: currentPrice,
          shares: pos.shares, positionValue: proceeds,
          reason: exitReason, pnlPct, holdingDays,
        });
        delete openPositions[sym];
      }
    }

    // ── Check entries ──
    if (Object.keys(openPositions).length < maxPositions) {
      const regime = detectRegimeFromHistory(spyCloses, spyIdx);
      if (regime !== "BEAR" && regime !== "CRISIS") {
        for (const sym of symbols) {
          if (openPositions[sym]) continue;
          if (Object.keys(openPositions).length >= maxPositions) break;

          const symHistory = historyMap[sym] ?? [];
          // Use data up to (not including) current date for no look-ahead
          const historyUpToNow = symHistory.filter((d) => d.date < date);
          if (historyUpToNow.length < 60) continue;

          const closes = historyUpToNow.map((d) => d.close);
          const indicators = computeIndicators(historyUpToNow);
          const currentPrice = symHistory.find((d) => d.date === date)?.close;
          if (!currentPrice) continue;

          const mom = scoreMomentum(indicators, currentPrice);
          const tech = scoreTechnical(indicators, currentPrice);
          const val = scoreValue(currentPrice, indicators);

          // Simplified macro (no async Fear&Greed in backtest)
          const macroScore = regime === "BULL" ? 16 : regime === "CAUTION" ? 8 : 0;
          const total = mom.score + tech.score + val.score + macroScore;

          if (total >= minApexScore) {
            const stopLossPct = total >= 80 ? 0.05 : total >= 60 ? 0.07 : 0.10;
            const targetPct = stopLossPct * 2.5;
            const positionSizePct = regime === "BULL" ? 0.08 : 0.04;
            const positionValue = Math.min(cash * positionSizePct, cash * 0.15);
            if (positionValue < 100) continue;

            const shares = positionValue / currentPrice;
            cash -= positionValue;

            openPositions[sym] = {
              entryPrice: currentPrice,
              shares,
              stopLoss: currentPrice * (1 - stopLossPct),
              target: currentPrice * (1 + targetPct),
              entryDate: date,
            };
            allTrades.push({
              symbol: sym, action: "BUY", date, price: currentPrice,
              shares, positionValue, reason: "signal",
            });
          }
        }
      }
    }

    // ── Record equity ──
    let portfolioValue = cash;
    for (const [sym, pos] of Object.entries(openPositions)) {
      const symHistory = historyMap[sym] ?? [];
      const dayPrice = symHistory.find((d) => d.date === date)?.close ?? pos.entryPrice;
      portfolioValue += pos.shares * dayPrice;
    }
    equityCurve.push({ date, value: Math.round(portfolioValue * 100) / 100 });
  }

  // Close all remaining positions at end date
  const lastDate = tradingDates[tradingDates.length - 1];
  for (const [sym, pos] of Object.entries(openPositions)) {
    const symHistory = historyMap[sym] ?? [];
    const finalPrice = [...symHistory].reverse().find((d) => d.date <= lastDate)?.close ?? pos.entryPrice;
    const proceeds = pos.shares * finalPrice;
    cash += proceeds;
    const pnlPct = ((finalPrice - pos.entryPrice) / pos.entryPrice) * 100;
    allTrades.push({
      symbol: sym, action: "SELL", date: lastDate, price: finalPrice,
      shares: pos.shares, positionValue: proceeds,
      reason: "end_of_test", pnlPct,
      holdingDays: Math.round((new Date(lastDate).getTime() - new Date(pos.entryDate).getTime()) / 86_400_000),
    });
  }

  const endingCapital = equityCurve[equityCurve.length - 1]?.value ?? startingCapital;
  const totalReturnPct = ((endingCapital - startingCapital) / startingCapital) * 100;
  const years = (new Date(endDate).getTime() - new Date(startDate).getTime()) / (365.25 * 86_400_000);
  const annualizedReturnPct = years > 0
    ? (Math.pow(endingCapital / startingCapital, 1 / years) - 1) * 100
    : totalReturnPct;

  const exitTrades = allTrades.filter((t) => t.action === "SELL" && t.pnlPct !== undefined);
  const wins = exitTrades.filter((t) => (t.pnlPct ?? 0) > 0);
  const losses = exitTrades.filter((t) => (t.pnlPct ?? 0) <= 0);
  const grossProfit = wins.reduce((s, t) => s + (t.pnlPct ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnlPct ?? 0), 0));

  const result: BacktestResult = {
    id: runId, symbols, startDate, endDate, startingCapital, endingCapital,
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    annualizedReturnPct: Math.round(annualizedReturnPct * 100) / 100,
    sharpeRatio: Math.round(calcSharpe(equityCurve) * 100) / 100,
    maxDrawdownPct: Math.round(calcMaxDrawdown(equityCurve) * 100) / 100,
    winRatePct: exitTrades.length > 0 ? Math.round((wins.length / exitTrades.length) * 100) : 0,
    totalTrades: exitTrades.length,
    profitFactor: grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? 99 : 0,
    avgWinPct: wins.length > 0 ? Math.round((grossProfit / wins.length) * 100) / 100 : 0,
    avgLossPct: losses.length > 0 ? Math.round((grossLoss / losses.length) * 100) / 100 : 0,
    equityCurve,
    trades: allTrades,
    passesLiveThreshold: calcSharpe(equityCurve) >= 1.0,
    status: "complete",
    createdAt,
    completedAt: new Date().toISOString(),
  };

  // Cache in DB
  try {
    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS backtest_runs (
        id TEXT PRIMARY KEY,
        symbols TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        starting_capital REAL NOT NULL,
        ending_capital REAL NOT NULL,
        total_return_pct REAL NOT NULL,
        annualized_return_pct REAL NOT NULL,
        sharpe_ratio REAL NOT NULL,
        max_drawdown_pct REAL NOT NULL,
        win_rate_pct REAL NOT NULL,
        total_trades INTEGER NOT NULL,
        profit_factor REAL NOT NULL,
        avg_win_pct REAL NOT NULL,
        avg_loss_pct REAL NOT NULL,
        trade_log TEXT DEFAULT '[]',
        equity_curve TEXT DEFAULT '[]',
        passes_live_threshold INTEGER DEFAULT 0,
        status TEXT DEFAULT 'complete',
        created_at TEXT,
        completed_at TEXT
      )
    `);
    db.prepare(`
      INSERT OR REPLACE INTO backtest_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      result.id, JSON.stringify(result.symbols), result.startDate, result.endDate,
      result.startingCapital, result.endingCapital, result.totalReturnPct,
      result.annualizedReturnPct, result.sharpeRatio, result.maxDrawdownPct,
      result.winRatePct, result.totalTrades, result.profitFactor,
      result.avgWinPct, result.avgLossPct,
      JSON.stringify(result.trades), JSON.stringify(result.equityCurve),
      result.passesLiveThreshold ? 1 : 0, result.status,
      result.createdAt, result.completedAt ?? null
    );
  } catch {
    // DB error doesn't fail the backtest
  }

  return result;
}

export function getBacktestHistory(): BacktestResult[] {
  try {
    const db = getDb();
    db.exec(`CREATE TABLE IF NOT EXISTS backtest_runs (id TEXT PRIMARY KEY, symbols TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, starting_capital REAL NOT NULL, ending_capital REAL NOT NULL, total_return_pct REAL NOT NULL, annualized_return_pct REAL NOT NULL, sharpe_ratio REAL NOT NULL, max_drawdown_pct REAL NOT NULL, win_rate_pct REAL NOT NULL, total_trades INTEGER NOT NULL, profit_factor REAL NOT NULL, avg_win_pct REAL NOT NULL, avg_loss_pct REAL NOT NULL, trade_log TEXT DEFAULT '[]', equity_curve TEXT DEFAULT '[]', passes_live_threshold INTEGER DEFAULT 0, status TEXT DEFAULT 'complete', created_at TEXT, completed_at TEXT)`);
    const rows = db.prepare("SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT 20").all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id), symbols: JSON.parse(String(r.symbols)),
      startDate: String(r.start_date), endDate: String(r.end_date),
      startingCapital: Number(r.starting_capital), endingCapital: Number(r.ending_capital),
      totalReturnPct: Number(r.total_return_pct), annualizedReturnPct: Number(r.annualized_return_pct),
      sharpeRatio: Number(r.sharpe_ratio), maxDrawdownPct: Number(r.max_drawdown_pct),
      winRatePct: Number(r.win_rate_pct), totalTrades: Number(r.total_trades),
      profitFactor: Number(r.profit_factor), avgWinPct: Number(r.avg_win_pct),
      avgLossPct: Number(r.avg_loss_pct),
      trades: JSON.parse(String(r.trade_log ?? "[]")),
      equityCurve: JSON.parse(String(r.equity_curve ?? "[]")),
      passesLiveThreshold: Number(r.passes_live_threshold) === 1,
      status: String(r.status) as BacktestResult["status"],
      createdAt: String(r.created_at), completedAt: r.completed_at ? String(r.completed_at) : undefined,
    }));
  } catch {
    return [];
  }
}
