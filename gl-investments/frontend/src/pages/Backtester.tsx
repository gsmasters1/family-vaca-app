/**
 * APEX Strategy Backtester
 *
 * Validates the strategy against historical data before live capital is deployed.
 * Sharpe ratio >= 1.0 is required before live trading should be enabled.
 */

import { useEffect, useState } from "react";
import {
  PlayCircle, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, BarChart2, RefreshCw, Clock
} from "lucide-react";
import { backtestApi } from "../services/api";

interface BacktestTrade {
  symbol: string;
  action: "BUY" | "SELL";
  date: string;
  price: number;
  shares: number;
  positionValue: number;
  reason: string;
  pnlPct?: number;
  holdingDays?: number;
}

interface BacktestResult {
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
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  equityCurve: { date: string; value: number }[];
  trades: BacktestTrade[];
  passesLiveThreshold: boolean;
  status: "running" | "complete" | "failed";
  createdAt: string;
  completedAt?: string;
}

// ─── Simple SVG equity curve chart ───────────────────────────────────────
function EquityCurveChart({ curve, startingCapital }: { curve: { date: string; value: number }[]; startingCapital: number }) {
  if (curve.length < 2) return null;

  const W = 800;
  const H = 180;
  const PAD = { top: 10, right: 10, bottom: 30, left: 60 };

  const values = curve.map((p) => p.value);
  const minV = Math.min(...values, startingCapital * 0.85);
  const maxV = Math.max(...values, startingCapital * 1.05);
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (i / (curve.length - 1)) * (W - PAD.left - PAD.right);
  const toY = (v: number) => H - PAD.bottom - ((v - minV) / range) * (H - PAD.top - PAD.bottom);

  const path = curve.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const fill = curve.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ") +
    ` L${toX(curve.length - 1).toFixed(1)},${toY(minV).toFixed(1)} L${toX(0).toFixed(1)},${toY(minV).toFixed(1)} Z`;

  const baselineY = toY(startingCapital);
  const finalValue = values[values.length - 1];
  const isProfit = finalValue >= startingCapital;

  // Y axis labels
  const yLabels = [minV, (minV + maxV) / 2, maxV];

  // X axis labels (first, middle, last dates)
  const xLabels = [
    { i: 0, label: curve[0].date.slice(0, 7) },
    { i: Math.floor(curve.length / 2), label: curve[Math.floor(curve.length / 2)].date.slice(0, 7) },
    { i: curve.length - 1, label: curve[curve.length - 1].date.slice(0, 7) },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }}>
      <defs>
        <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isProfit ? "#16a34a" : "#dc2626"} stopOpacity="0.3" />
          <stop offset="100%" stopColor={isProfit ? "#16a34a" : "#dc2626"} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map((v, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)}
            stroke="#374151" strokeWidth="0.5" strokeDasharray="4"
          />
          <text x={PAD.left - 5} y={toY(v) + 4} textAnchor="end" fill="#6b7280" fontSize="10">
            ${(v / 1000).toFixed(0)}k
          </text>
        </g>
      ))}

      {/* Baseline (starting capital) */}
      <line
        x1={PAD.left} y1={baselineY} x2={W - PAD.right} y2={baselineY}
        stroke="#4b5563" strokeWidth="1" strokeDasharray="6 3"
      />

      {/* Fill */}
      <path d={fill} fill="url(#curveGrad)" />

      {/* Line */}
      <path d={path} fill="none" stroke={isProfit ? "#4ade80" : "#f87171"} strokeWidth="2" />

      {/* X axis labels */}
      {xLabels.map(({ i, label }) => (
        <text key={i} x={toX(i)} y={H - 5} textAnchor="middle" fill="#6b7280" fontSize="10">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, good, bad, neutral
}: {
  label: string;
  value: string;
  sub?: string;
  good?: boolean;
  bad?: boolean;
  neutral?: boolean;
}) {
  const color = good ? "text-green-400" : bad ? "text-red-400" : neutral ? "text-gray-300" : "text-white";
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Pass/Fail threshold banner ───────────────────────────────────────────
function ThresholdBanner({ result }: { result: BacktestResult }) {
  if (result.passesLiveThreshold) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-green-900/20 border border-green-700/40">
        <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-green-300 font-semibold">Strategy Passes Live Trading Threshold</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Sharpe ratio {result.sharpeRatio.toFixed(2)} ≥ 1.0. You may enable live trading in Auto-Trade settings.
            Continue paper trading for 30 days before committing significant capital.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-900/20 border border-red-700/40">
      <AlertTriangle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-red-300 font-semibold">Strategy Does Not Meet Live Trading Threshold</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Sharpe ratio {result.sharpeRatio.toFixed(2)} &lt; 1.0. Keep trading in paper mode.
          The live trading guardrail will enforce this automatically.
          Consider adjusting the minimum APEX score threshold and re-running.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function Backtester() {
  const [history, setHistory] = useState<BacktestResult[]>([]);
  const [activeResult, setActiveResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTrades, setShowTrades] = useState(false);

  // Form state
  const [startDate, setStartDate] = useState("2020-01-01");
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [startingCapital, setStartingCapital] = useState(10000);
  const [minApexScore, setMinApexScore] = useState(65);

  useEffect(() => {
    backtestApi.getHistory()
      .then((res) => {
        const results = res.data as BacktestResult[];
        setHistory(results);
        if (results.length > 0) setActiveResult(results[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await backtestApi.run({ startDate, endDate, startingCapital, minApexScore });
      const result = res.data as BacktestResult;
      setActiveResult(result);
      setHistory((prev) => [result, ...prev.slice(0, 9)]);
    } catch (err) {
      console.error("Backtest failed", err);
    } finally {
      setRunning(false);
    }
  };

  const exitTrades = activeResult?.trades.filter((t) => t.action === "SELL" && t.pnlPct !== undefined) ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BarChart2 size={24} className="text-brand-400" />
        <div>
          <h2 className="text-2xl font-semibold text-white">APEX Backtester</h2>
          <p className="text-sm text-gray-400">Validate the strategy against real historical data before deploying capital</p>
        </div>
      </div>

      {/* Config + Run */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Test Configuration</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Starting Capital ($)</label>
            <input
              type="number"
              value={startingCapital}
              onChange={(e) => setStartingCapital(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min APEX Score (0–100)</label>
            <input
              type="number"
              value={minApexScore}
              onChange={(e) => setMinApexScore(Number(e.target.value))}
              min={40} max={90}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {running ? <RefreshCw size={15} className="animate-spin" /> : <PlayCircle size={15} />}
            {running ? "Running backtest… (may take 2–5 min)" : "Run Backtest"}
          </button>
          <p className="text-xs text-gray-500">
            Uses your watchlist symbols. Symbols without history are skipped.
          </p>
        </div>
      </div>

      {/* Past runs selector */}
      {!loading && history.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {history.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveResult(r)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                activeResult?.id === r.id
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Clock size={10} />
                {r.startDate.slice(0, 7)} → {r.endDate.slice(0, 7)}
                <span className={r.passesLiveThreshold ? "text-green-400" : "text-red-400"}>
                  ({r.sharpeRatio.toFixed(2)} Sharpe)
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {loading && <div className="text-center py-12 text-gray-600">Loading backtest history...</div>}

      {!loading && !activeResult && !running && (
        <div className="text-center py-16 text-gray-600">
          <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No backtests run yet. Configure and run your first test above.</p>
          <p className="text-xs mt-1 text-gray-700">Uses your watchlist symbols. Add some to the watchlist first.</p>
        </div>
      )}

      {activeResult && activeResult.status === "complete" && (
        <div className="space-y-5">
          <ThresholdBanner result={activeResult} />

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              label="Total Return"
              value={`${activeResult.totalReturnPct >= 0 ? "+" : ""}${activeResult.totalReturnPct.toFixed(1)}%`}
              sub={`$${activeResult.startingCapital.toLocaleString()} → $${activeResult.endingCapital.toLocaleString()}`}
              good={activeResult.totalReturnPct > 0}
              bad={activeResult.totalReturnPct <= 0}
            />
            <MetricCard
              label="Annualized Return"
              value={`${activeResult.annualizedReturnPct >= 0 ? "+" : ""}${activeResult.annualizedReturnPct.toFixed(1)}%`}
              sub={`${activeResult.startDate.slice(0,7)} to ${activeResult.endDate.slice(0,7)}`}
              good={activeResult.annualizedReturnPct > 10}
              bad={activeResult.annualizedReturnPct <= 0}
              neutral={activeResult.annualizedReturnPct > 0 && activeResult.annualizedReturnPct <= 10}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={activeResult.sharpeRatio.toFixed(2)}
              sub={activeResult.sharpeRatio >= 1.0 ? "✓ Passes live threshold" : "✗ Below 1.0 threshold"}
              good={activeResult.sharpeRatio >= 1.0}
              bad={activeResult.sharpeRatio < 0.5}
              neutral={activeResult.sharpeRatio >= 0.5 && activeResult.sharpeRatio < 1.0}
            />
            <MetricCard
              label="Max Drawdown"
              value={`-${activeResult.maxDrawdownPct.toFixed(1)}%`}
              sub="Worst peak-to-trough decline"
              good={activeResult.maxDrawdownPct < 15}
              bad={activeResult.maxDrawdownPct > 30}
              neutral={activeResult.maxDrawdownPct >= 15 && activeResult.maxDrawdownPct <= 30}
            />
            <MetricCard
              label="Win Rate"
              value={`${activeResult.winRatePct.toFixed(0)}%`}
              sub={`${activeResult.totalTrades} total trades`}
              good={activeResult.winRatePct >= 55}
              bad={activeResult.winRatePct < 40}
              neutral={activeResult.winRatePct >= 40 && activeResult.winRatePct < 55}
            />
            <MetricCard
              label="Profit Factor"
              value={activeResult.profitFactor.toFixed(2)}
              sub="Gross profit / gross loss"
              good={activeResult.profitFactor >= 1.5}
              bad={activeResult.profitFactor < 1.0}
              neutral={activeResult.profitFactor >= 1.0 && activeResult.profitFactor < 1.5}
            />
            <MetricCard
              label="Avg Win"
              value={`+${activeResult.avgWinPct.toFixed(1)}%`}
              good
            />
            <MetricCard
              label="Avg Loss"
              value={`-${activeResult.avgLossPct.toFixed(1)}%`}
              sub={activeResult.avgLossPct > 0 ? `R/R: ${(activeResult.avgWinPct / activeResult.avgLossPct).toFixed(2)}x` : ""}
              neutral
            />
          </div>

          {/* Equity curve */}
          {activeResult.equityCurve.length > 1 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Equity Curve</h3>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-400 inline-block" /> Portfolio</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-600 inline-block border-dashed" /> Starting capital</span>
                </div>
              </div>
              <EquityCurveChart curve={activeResult.equityCurve} startingCapital={activeResult.startingCapital} />
            </div>
          )}

          {/* Trade list */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Trade History ({exitTrades.length} completed trades)</h3>
              <button
                onClick={() => setShowTrades(!showTrades)}
                className="text-xs text-brand-400 hover:text-brand-300"
              >
                {showTrades ? "Hide" : "Show all"}
              </button>
            </div>
            {showTrades && (
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900 border-b border-gray-800">
                    <tr>
                      <th className="text-left text-gray-500 font-medium py-2 px-4">Symbol</th>
                      <th className="text-left text-gray-500 font-medium py-2 pr-4">Exit Date</th>
                      <th className="text-left text-gray-500 font-medium py-2 pr-4">Reason</th>
                      <th className="text-right text-gray-500 font-medium py-2 pr-4">P&L</th>
                      <th className="text-right text-gray-500 font-medium py-2">Days Held</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exitTrades.map((t, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2 px-4 font-mono font-bold text-brand-400">{t.symbol}</td>
                        <td className="py-2 pr-4 text-gray-400">{t.date}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            t.reason === "target_hit" ? "bg-green-900/50 text-green-300" :
                            t.reason === "stop_loss" ? "bg-red-900/50 text-red-300" :
                            "bg-gray-800 text-gray-400"
                          }`}>
                            {t.reason.replace("_", " ")}
                          </span>
                        </td>
                        <td className={`py-2 pr-4 text-right font-mono font-semibold ${(t.pnlPct ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {(t.pnlPct ?? 0) >= 0 ? "+" : ""}{(t.pnlPct ?? 0).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right text-gray-500">{t.holdingDays ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
