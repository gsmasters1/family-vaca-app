import { useEffect, useState, useCallback } from "react";
import {
  ShieldAlert,
  Power,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  DollarSign,
  Rocket,
  ChevronRight,
} from "lucide-react";
import { tradingApi, watchlistApi } from "../services/api";

interface AlpacaAccount {
  buying_power: string;
  portfolio_value: string;
  equity: string;
  cash: string;
  daytrade_count: number;
  status: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  side: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: string;
  type: string;
  status: string;
  submitted_at: string;
}

interface MarketClock {
  is_open: boolean;
  next_open: string;
  next_close: string;
}

interface TradingStatus {
  connected: boolean;
  paperMode: boolean;
  enabled: boolean;
  killSwitch: boolean;
  minApexScore: number;
  minConviction: number;
  requireClaudeReview: boolean;
  account: AlpacaAccount | null;
  positions: AlpacaPosition[];
  openOrders: AlpacaOrder[];
  clock: MarketClock | null;
}

interface TradeLog {
  id: number;
  symbol: string;
  action: string;
  result: string;
  reason: string;
  apex_score: number;
  conviction: number;
  qty: number;
  entry_price: number;
  stop_loss: number;
  target: number;
  order_id: string;
  claude_approved: number;
  claude_reason: string;
  regime: string;
  executed_at: string;
}

interface PortfolioLive {
  totalValue: number;
  cash: number;
  buyingPower: number;
  todayPL: number;
  todayPLPct: number;
  unrealizedPL: number;
  positions: {
    symbol: string;
    qty: number;
    avgCost: number;
    currentPrice: number;
    unrealizedPL: number;
    unrealizedPLPct: number;
  }[];
}

const fmtCurrency = (val: string | number) =>
  `$${parseFloat(String(val)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (val: string | number) => {
  const n = parseFloat(String(val)) * 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

const fmtPctDirect = (val: number) =>
  `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;

function GrowthCalculator({ portfolioValue }: { portfolioValue: number }) {
  const [startingValue, setStartingValue] = useState(portfolioValue > 0 ? portfolioValue : 300);
  const [monthlyReturnPct, setMonthlyReturnPct] = useState(20);

  useEffect(() => {
    if (portfolioValue > 0) setStartingValue(portfolioValue);
  }, [portfolioValue]);

  const milestones = [1000, 5000, 10000, 25000];

  const monthsToReach = (target: number) => {
    if (startingValue >= target) return 0;
    const rate = monthlyReturnPct / 100;
    return Math.ceil(Math.log(target / startingValue) / Math.log(1 + rate));
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-sm font-medium mb-3 flex items-center gap-2">
        <TrendingUp size={14} className="text-brand-400" />
        Growth Calculator
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Starting Value ($)</label>
          <input
            type="number"
            min={100}
            max={1000000}
            value={startingValue}
            onChange={(e) => setStartingValue(parseFloat(e.target.value) || 300)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Monthly Return: <span className="text-brand-400 font-semibold">{monthlyReturnPct}%</span>
          </label>
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={monthlyReturnPct}
            onChange={(e) => setMonthlyReturnPct(parseInt(e.target.value))}
            className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500 mt-2"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left py-2">Milestone</th>
              <th className="text-right py-2">Months</th>
              <th className="text-right py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((target) => {
              const months = monthsToReach(target);
              const reached = startingValue >= target;
              return (
                <tr key={target} className="border-b border-gray-800/50">
                  <td className="py-2 font-medium">{fmtCurrency(target)}</td>
                  <td className="text-right py-2 text-brand-400 font-semibold">
                    {reached ? "—" : `${months}mo`}
                  </td>
                  <td className="text-right py-2">
                    {reached ? (
                      <span className="text-green-400 text-xs font-medium">Reached</span>
                    ) : (
                      <span className="text-gray-500 text-xs">
                        {months < 12 ? `${months} months` : `${(months / 12).toFixed(1)} years`}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-600 mt-2">Compound growth, not guaranteed.</p>
    </div>
  );
}

interface LaunchStepProps {
  number: number;
  title: string;
  description: string;
  status: "complete" | "in-progress" | "pending";
  badge?: string;
}

function LaunchStep({ number, title, description, status, badge }: LaunchStepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
            status === "complete"
              ? "bg-green-600 text-white"
              : status === "in-progress"
              ? "bg-yellow-600 text-white"
              : "bg-gray-700 text-gray-400"
          }`}
        >
          {status === "complete" ? <CheckCircle size={16} /> : number}
        </div>
        {number < 5 && <div className="w-px flex-1 bg-gray-800 my-1" />}
      </div>
      <div className="pb-5 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={`font-medium text-sm ${status === "complete" ? "text-green-400" : status === "in-progress" ? "text-yellow-400" : "text-gray-300"}`}>
            {title}
          </p>
          {badge && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                status === "complete"
                  ? "bg-green-900/40 text-green-400"
                  : status === "in-progress"
                  ? "bg-yellow-900/40 text-yellow-400"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function TradingControl() {
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [log, setLog] = useState<TradeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [showLiveConfirm, setShowLiveConfirm] = useState(false);
  const [guardSettings, setGuardSettings] = useState({
    minApexScore: 75,
    minConviction: 8,
    maxPositionPct: 5,
    dailyLossLimitPct: 3,
    maxPositions: 10,
    requireClaudeReview: true,
  });
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState<string | null>(null);
  const [portfolioLive, setPortfolioLive] = useState<PortfolioLive | null>(null);
  const [portfolioLiveLoading, setPortfolioLiveLoading] = useState(true);
  const [portfolioLiveError, setPortfolioLiveError] = useState(false);
  const [watchlistCount, setWatchlistCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, logRes] = await Promise.all([
        tradingApi.getStatus(),
        tradingApi.getLog(20),
      ]);
      const s = statusRes.data as TradingStatus;
      setStatus(s);
      setLog(logRes.data as TradeLog[]);
      setGuardSettings({
        minApexScore: s.minApexScore,
        minConviction: s.minConviction,
        maxPositionPct: parseFloat(
          (s as unknown as Record<string, string>).maxPositionPct ?? "5"
        ),
        dailyLossLimitPct: parseFloat(
          (s as unknown as Record<string, string>).dailyLossLimitPct ?? "3"
        ),
        maxPositions: parseFloat(
          (s as unknown as Record<string, string>).maxPositions ?? "10"
        ),
        requireClaudeReview: s.requireClaudeReview,
      });
    } catch (err) {
      console.error("Failed to fetch trading status:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPortfolioLive = useCallback(async () => {
    setPortfolioLiveLoading(true);
    setPortfolioLiveError(false);
    try {
      const res = await tradingApi.getPortfolioLive();
      const data = res.data as PortfolioLive;
      if (!data || (!data.totalValue && !data.cash)) {
        setPortfolioLiveError(true);
      } else {
        setPortfolioLive(data);
      }
    } catch {
      setPortfolioLiveError(true);
    } finally {
      setPortfolioLiveLoading(false);
    }
  }, []);

  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await watchlistApi.getItems();
      setWatchlistCount((res.data as { id: number }[]).length);
    } catch {
      setWatchlistCount(0);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchPortfolioLive();
    fetchWatchlist();
    const interval = setInterval(fetchStatus, 30_000);
    const liveInterval = setInterval(fetchPortfolioLive, 60_000);
    return () => {
      clearInterval(interval);
      clearInterval(liveInterval);
    };
  }, [fetchStatus, fetchPortfolioLive, fetchWatchlist]);

  const handleKill = async () => {
    setActionLoading(true);
    try {
      await tradingApi.kill();
      await fetchStatus();
    } finally {
      setActionLoading(false);
      setShowKillConfirm(false);
    }
  };

  const handleResume = async () => {
    setActionLoading(true);
    try {
      await tradingApi.resume();
      await fetchStatus();
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!status) return;
    if (status.killSwitch) return;
    setActionLoading(true);
    try {
      await tradingApi.setEnabled(!status.enabled);
      await fetchStatus();
    } finally {
      setActionLoading(false);
    }
  };

  const handleModeSwitch = async (paper: boolean) => {
    if (!paper) {
      setShowLiveConfirm(true);
      return;
    }
    setActionLoading(true);
    try {
      await tradingApi.setMode(true);
      await fetchStatus();
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmLive = async () => {
    setActionLoading(true);
    try {
      await tradingApi.setMode(false);
      await fetchStatus();
    } finally {
      setActionLoading(false);
      setShowLiveConfirm(false);
    }
  };

  const handleSettingUpdate = async (key: string, value: string) => {
    try {
      await tradingApi.updateSetting(key, value);
    } catch {
      // ignore
    }
  };

  const handleManualExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSymbol.trim()) return;
    setManualLoading(true);
    setManualResult(null);
    try {
      const res = await tradingApi.execute(manualSymbol.trim().toUpperCase());
      const { result } = res.data as { result: { action: string; reason: string } };
      setManualResult(`${result.action.toUpperCase()}: ${result.reason}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setManualResult(`Error: ${msg}`);
    } finally {
      setManualLoading(false);
      await fetchStatus();
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-gray-500 flex items-center gap-2">
        <RefreshCw size={16} className="animate-spin" />
        Loading trading control panel...
      </div>
    );
  }

  const isKillActive = status?.killSwitch ?? false;
  const equity = parseFloat(status?.account?.equity ?? "0");
  const buyingPower = parseFloat(status?.account?.buying_power ?? "0");
  const paperTradesExecuted = log.filter((l) => l.result === "executed").length;
  const isLiveAndEnabled = status?.enabled === true && status?.paperMode === false;

  const launchStep1Status = status?.connected ? "complete" : "pending";
  const launchStep2Status = buyingPower > 0 ? "complete" : "pending";
  const launchStep3Status =
    watchlistCount >= 5 ? "complete" : watchlistCount > 0 ? "in-progress" : "pending";
  const launchStep4Status =
    isLiveAndEnabled
      ? "complete"
      : paperTradesExecuted > 0
      ? "in-progress"
      : "pending";
  const launchStep5Status = isLiveAndEnabled ? "complete" : "pending";

  const showGrowthMode = equity < 2000 || equity === 0;
  const maxPositionDollar = equity > 0 ? equity * 0.25 : 0;

  const growthTrajectory = [
    { label: "Starting", value: 300, month: 0 },
    { label: "Month 3", value: 518, pct: "+73%" },
    { label: "Month 6", value: 895, pct: "+198%" },
    { label: "Month 12", value: 2674, pct: "+791%" },
    { label: "Month 18", value: 7982, pct: "+2,561%" },
    { label: "Month 24", value: 23830, note: "approaching day trading threshold" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Section A: Launch Sequence ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <ChevronRight size={18} className="text-brand-400" />
          <h3 className="font-semibold text-base">Launch Sequence</h3>
          <span className="text-xs text-gray-500 ml-1">— $0 to live trading</span>
        </div>
        <div>
          <LaunchStep
            number={1}
            title="Alpaca Account"
            description="Create free account at alpaca.markets. Verify identity (takes 1-2 days). No minimum deposit required."
            status={launchStep1Status}
            badge={launchStep1Status === "complete" ? "Connected" : "Not connected"}
          />
          <LaunchStep
            number={2}
            title="Fund Your Account"
            description="Deposit any amount. Even $300 works for swing trading. More funds = more flexibility."
            status={launchStep2Status}
            badge={launchStep2Status === "complete" ? `${fmtCurrency(buyingPower)} available` : "No funds"}
          />
          <LaunchStep
            number={3}
            title="Add Watchlist"
            description="Add stocks to your watchlist. APEX only scans symbols you're watching."
            status={launchStep3Status}
            badge={`${watchlistCount} symbol${watchlistCount !== 1 ? "s" : ""} ${watchlistCount >= 5 ? "✓" : `(need ${5 - watchlistCount} more)`}`}
          />
          <LaunchStep
            number={4}
            title="Paper Trade First"
            description="Run in paper mode for 5-7 days. Verify APEX decisions make sense before using real money."
            status={launchStep4Status}
            badge={
              launchStep4Status === "complete"
                ? "Done"
                : paperTradesExecuted > 0
                ? `${paperTradesExecuted} paper trade${paperTradesExecuted !== 1 ? "s" : ""} executed`
                : "No paper trades yet"
            }
          />
          <LaunchStep
            number={5}
            title="Go Live"
            description="Flip the switch. APEX will start placing real orders automatically."
            status={launchStep5Status}
            badge={launchStep5Status === "complete" ? "Live & Active" : "Pending"}
          />
        </div>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">Auto-Trade Control</h2>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Automated execution via Alpaca · APEX decisions · Claude risk review
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Kill Switch Banner */}
      {isKillActive && (
        <div className="bg-red-950 border border-red-600 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-red-400" />
            <div>
              <p className="font-bold text-red-300 text-lg">TRADING HALTED</p>
              <p className="text-red-400 text-sm">Kill switch is active. All automated trading is stopped.</p>
            </div>
          </div>
          <button
            onClick={handleResume}
            disabled={actionLoading}
            className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm"
          >
            Clear Kill Switch
          </button>
        </div>
      )}

      {/* Connection Status Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`border rounded-xl p-3 ${status?.connected ? "bg-green-900/20 border-green-700" : "bg-red-900/20 border-red-800"}`}>
          <p className="text-xs text-gray-500">Alpaca Connection</p>
          <div className="flex items-center gap-2 mt-1">
            {status?.connected
              ? <CheckCircle size={14} className="text-green-400" />
              : <XCircle size={14} className="text-red-400" />}
            <p className={`font-semibold text-sm ${status?.connected ? "text-green-400" : "text-red-400"}`}>
              {status?.connected ? "Connected" : "Disconnected"}
            </p>
          </div>
        </div>

        <div className={`border rounded-xl p-3 ${status?.paperMode ? "bg-yellow-900/20 border-yellow-700" : "bg-red-900/30 border-red-600"}`}>
          <p className="text-xs text-gray-500">Trading Mode</p>
          <p className={`font-semibold text-sm mt-1 ${status?.paperMode ? "text-yellow-400" : "text-red-400"}`}>
            {status?.paperMode ? "PAPER" : "LIVE"}
          </p>
        </div>

        <div className={`border rounded-xl p-3 ${status?.clock?.is_open ? "bg-green-900/20 border-green-700" : "bg-gray-800 border-gray-700"}`}>
          <p className="text-xs text-gray-500">Market</p>
          <div className="flex items-center gap-2 mt-1">
            <Clock size={12} className={status?.clock?.is_open ? "text-green-400" : "text-gray-500"} />
            <p className={`font-semibold text-sm ${status?.clock?.is_open ? "text-green-400" : "text-gray-400"}`}>
              {status?.clock?.is_open ? "Open" : "Closed"}
            </p>
          </div>
        </div>

        <div className={`border rounded-xl p-3 ${status?.enabled && !isKillActive ? "bg-brand-900/30 border-brand-600" : "bg-gray-800 border-gray-700"}`}>
          <p className="text-xs text-gray-500">Auto-Execution</p>
          <p className={`font-semibold text-sm mt-1 ${status?.enabled && !isKillActive ? "text-brand-400" : "text-gray-400"}`}>
            {status?.enabled && !isKillActive ? "ACTIVE" : "INACTIVE"}
          </p>
        </div>
      </div>

      {/* ── Section C: Portfolio Live ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-medium flex items-center gap-2">
            <DollarSign size={14} className="text-green-400" />
            Live Account
          </p>
          <button
            onClick={fetchPortfolioLive}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            <RefreshCw size={11} className={portfolioLiveLoading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {portfolioLiveLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-6 bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : portfolioLiveError || !portfolioLive ? (
          <div className="text-center py-6">
            <XCircle size={28} className="text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Connect Alpaca to see live data</p>
            <p className="text-gray-600 text-xs mt-1">
              Add ALPACA_KEY and ALPACA_SECRET to your .env file
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Total Portfolio Value</p>
                <p className="text-2xl font-bold text-white">{fmtCurrency(portfolioLive.totalValue)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Cash Available</p>
                <p className="text-lg font-semibold">{fmtCurrency(portfolioLive.cash)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Buying Power</p>
                <p className="text-lg font-semibold">{fmtCurrency(portfolioLive.buyingPower)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Today's P&L</p>
                <p className={`text-lg font-semibold ${portfolioLive.todayPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {portfolioLive.todayPL >= 0 ? "+" : ""}{fmtCurrency(portfolioLive.todayPL)}
                  <span className="text-sm ml-1 font-normal">
                    ({fmtPctDirect(portfolioLive.todayPLPct)})
                  </span>
                </p>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Unrealized P&L (all positions)</p>
                <p className={`text-sm font-semibold ${portfolioLive.unrealizedPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {portfolioLive.unrealizedPL >= 0 ? "+" : ""}{fmtCurrency(portfolioLive.unrealizedPL)}
                </p>
              </div>
            </div>

            {portfolioLive.positions.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs border-b border-gray-800">
                      <th className="text-left py-2">Symbol</th>
                      <th className="text-right py-2">Qty</th>
                      <th className="text-right py-2">Avg Cost</th>
                      <th className="text-right py-2">Current</th>
                      <th className="text-right py-2">Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolioLive.positions.map((pos) => (
                      <tr key={pos.symbol} className="border-b border-gray-800/50">
                        <td className="py-2 font-medium">{pos.symbol}</td>
                        <td className="text-right py-2 text-gray-300">{pos.qty}</td>
                        <td className="text-right py-2 text-gray-300">{fmtCurrency(pos.avgCost)}</td>
                        <td className="text-right py-2 text-gray-300">{fmtCurrency(pos.currentPrice)}</td>
                        <td className={`text-right py-2 ${pos.unrealizedPL >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {pos.unrealizedPL >= 0 ? "+" : ""}{fmtCurrency(pos.unrealizedPL)}
                          <span className="text-xs ml-1 opacity-70">
                            ({fmtPctDirect(pos.unrealizedPLPct)})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Section B: Growth Mode ── */}
      {showGrowthMode ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Rocket size={18} className="text-brand-400" />
            <h3 className="font-semibold text-base">Growth Mode</h3>
            <span className="text-xs text-gray-500">— $300 Account Settings</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">Active Settings</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Small Account Mode</span>
                  <span className="text-xs bg-green-900/40 text-green-400 px-2 py-0.5 rounded-full font-medium">ON</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Order Type</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">Notional (fractional)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Min APEX Score</span>
                  <span className="text-xs bg-brand-900/40 text-brand-400 px-2 py-0.5 rounded-full font-medium">85</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Max Position</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                    25%{maxPositionDollar > 0 ? ` (${fmtCurrency(maxPositionDollar)})` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Max Positions</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">4</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Target per Trade</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">25–35%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Stop Loss</span>
                  <span className="text-xs bg-red-900/30 text-red-400 px-2 py-0.5 rounded-full">7–10%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Hold Time</span>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">3–10 day swings</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-3">Growth Trajectory</p>
              <div className="space-y-1.5 font-mono text-sm">
                {growthTrajectory.map((row) => (
                  <div key={row.label} className="flex items-baseline gap-2">
                    <span className="text-gray-500 w-20 flex-shrink-0 text-xs">{row.label}:</span>
                    <span className="text-white font-medium">
                      {fmtCurrency(row.value)}
                    </span>
                    {"pct" in row && (
                      <span className="text-green-400 text-xs">({row.pct})</span>
                    )}
                    {"note" in row && (
                      <span className="text-yellow-400 text-xs">— {row.note}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-3">
                Based on 20% net monthly return. Not a guarantee.
              </p>
              <div className="mt-4 bg-gray-800/60 border border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-300 leading-relaxed">
                  <span className="text-yellow-400 font-semibold">$25,000 unlocks unlimited day trading (PDT rule).</span>
                  {" "}Until then, swing trade only — hold positions overnight, target 3–10 day moves.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-4 flex items-center gap-3">
          <Rocket size={16} className="text-gray-600" />
          <p className="text-gray-600 text-sm">Growth mode auto-disables when account exceeds $2,000</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kill Switch + Controls */}
        <div className="space-y-4">
          {/* Emergency Stop */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-400" />
              Emergency Controls
            </p>

            {!showKillConfirm ? (
              <button
                onClick={() => setShowKillConfirm(true)}
                disabled={actionLoading || isKillActive}
                className="w-full bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2"
              >
                <AlertTriangle size={18} />
                EMERGENCY STOP
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-red-400 text-sm font-medium">
                  This will cancel ALL open orders and halt all trading immediately. Confirm?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleKill}
                    disabled={actionLoading}
                    className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm"
                  >
                    YES, HALT TRADING
                  </button>
                  <button
                    onClick={() => setShowKillConfirm(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Master Enable */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <Power size={14} className="text-brand-400" />
              Master Enable
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm">Automated Trading</p>
                <p className="text-xs text-gray-500">
                  {isKillActive ? "Disabled — clear kill switch first" : "Controls auto-execution via scheduler"}
                </p>
              </div>
              <button
                onClick={handleToggleEnabled}
                disabled={actionLoading || isKillActive}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${
                  status?.enabled && !isKillActive ? "bg-brand-600" : "bg-gray-700"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    status?.enabled && !isKillActive ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Mode Switch — Section D: with confirmation modal wired */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3">Trading Mode</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleModeSwitch(true)}
                disabled={actionLoading}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  status?.paperMode
                    ? "bg-yellow-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                Paper
              </button>
              <button
                onClick={() => handleModeSwitch(false)}
                disabled={actionLoading}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  !status?.paperMode
                    ? "bg-red-700 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                LIVE
              </button>
            </div>
            {!status?.paperMode ? (
              <p className="text-red-400 text-xs mt-2">
                LIVE mode — real money at risk. All guardrails still apply.
              </p>
            ) : (
              <p className="text-yellow-600 text-xs mt-2">
                Paper mode — simulated trades only, no real money at risk.
              </p>
            )}
          </div>

          {/* Manual Execute */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3">Manual Execute</p>
            <form onSubmit={handleManualExecute} className="flex gap-2">
              <input
                value={manualSymbol}
                onChange={(e) => setManualSymbol(e.target.value)}
                placeholder="AAPL"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm uppercase"
              />
              <button
                type="submit"
                disabled={manualLoading || !manualSymbol.trim()}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm"
              >
                {manualLoading ? <RefreshCw size={14} className="animate-spin" /> : "Run"}
              </button>
            </form>
            {manualResult && (
              <p className={`text-xs mt-2 ${manualResult.startsWith("Error") ? "text-red-400" : manualResult.includes("executed") ? "text-green-400" : "text-gray-400"}`}>
                {manualResult}
              </p>
            )}
          </div>
        </div>

        {/* Account Summary + Guardrails */}
        <div className="space-y-4">
          {/* Account Summary */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <DollarSign size={14} className="text-green-400" />
              Account Summary
            </p>
            {status?.account ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Portfolio Value</p>
                  <p className="font-semibold text-green-400">{fmtCurrency(status.account.portfolio_value)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Buying Power</p>
                  <p className="font-semibold">{fmtCurrency(status.account.buying_power)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Cash</p>
                  <p className="font-semibold">{fmtCurrency(status.account.cash)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Open Positions</p>
                  <p className="font-semibold">{status.positions.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Open Orders</p>
                  <p className="font-semibold">{status.openOrders.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Day Trades</p>
                  <p className="font-semibold">{status.account.daytrade_count}</p>
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-sm">
                {status?.connected ? "Loading account..." : "Not connected to Alpaca"}
              </p>
            )}
          </div>

          {/* Guardrails */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-medium mb-3 flex items-center gap-2">
              <ShieldAlert size={14} className="text-brand-400" />
              Guardrails
            </p>
            <div className="space-y-3">
              <GuardrailSlider
                label="Min APEX Score"
                value={guardSettings.minApexScore}
                min={0}
                max={100}
                settingKey="trading_min_apex_score"
                onChange={(v) => {
                  setGuardSettings((g) => ({ ...g, minApexScore: v }));
                  handleSettingUpdate("trading_min_apex_score", String(v));
                }}
              />
              <GuardrailSlider
                label="Min Conviction"
                value={guardSettings.minConviction}
                min={1}
                max={10}
                settingKey="trading_min_conviction"
                onChange={(v) => {
                  setGuardSettings((g) => ({ ...g, minConviction: v }));
                  handleSettingUpdate("trading_min_conviction", String(v));
                }}
              />
              <GuardrailSlider
                label="Max Position %"
                value={guardSettings.maxPositionPct}
                min={1}
                max={20}
                step={0.5}
                settingKey="trading_max_position_pct"
                suffix="%"
                onChange={(v) => {
                  setGuardSettings((g) => ({ ...g, maxPositionPct: v }));
                  handleSettingUpdate("trading_max_position_pct", String(v));
                }}
              />
              <GuardrailSlider
                label="Daily Loss Limit %"
                value={guardSettings.dailyLossLimitPct}
                min={1}
                max={10}
                step={0.5}
                settingKey="trading_daily_loss_limit_pct"
                suffix="%"
                onChange={(v) => {
                  setGuardSettings((g) => ({ ...g, dailyLossLimitPct: v }));
                  handleSettingUpdate("trading_daily_loss_limit_pct", String(v));
                }}
              />
              <GuardrailSlider
                label="Max Positions"
                value={guardSettings.maxPositions}
                min={1}
                max={30}
                settingKey="trading_max_positions"
                onChange={(v) => {
                  setGuardSettings((g) => ({ ...g, maxPositions: v }));
                  handleSettingUpdate("trading_max_positions", String(v));
                }}
              />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Require Claude Review</p>
                  <p className="text-xs text-gray-500">Claude must approve before any trade executes</p>
                </div>
                <button
                  onClick={() => {
                    const next = !guardSettings.requireClaudeReview;
                    setGuardSettings((g) => ({ ...g, requireClaudeReview: next }));
                    handleSettingUpdate("trading_require_claude_review", String(next));
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    guardSettings.requireClaudeReview ? "bg-brand-600" : "bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      guardSettings.requireClaudeReview ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Task 3: Growth Calculator */}
          <GrowthCalculator portfolioValue={equity} />
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <TrendingUp size={14} className="text-green-400" />
          Open Positions ({status?.positions.length ?? 0})
        </p>
        {status?.positions && status.positions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-right py-2">Qty</th>
                  <th className="text-right py-2">Avg Entry</th>
                  <th className="text-right py-2">Current</th>
                  <th className="text-right py-2">Market Value</th>
                  <th className="text-right py-2">P/L</th>
                  <th className="text-right py-2">P/L %</th>
                </tr>
              </thead>
              <tbody>
                {status.positions.map((pos) => {
                  const pl = parseFloat(pos.unrealized_pl);
                  const plPct = parseFloat(pos.unrealized_plpc) * 100;
                  return (
                    <tr key={pos.symbol} className="border-b border-gray-800/50">
                      <td className="py-2 font-medium">{pos.symbol}</td>
                      <td className="text-right py-2 text-gray-300">{pos.qty}</td>
                      <td className="text-right py-2 text-gray-300">{fmtCurrency(pos.avg_entry_price)}</td>
                      <td className="text-right py-2 text-gray-300">{fmtCurrency(pos.current_price)}</td>
                      <td className="text-right py-2 text-gray-300">{fmtCurrency(pos.market_value)}</td>
                      <td className={`text-right py-2 ${pl >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {pl >= 0 ? "+" : ""}{fmtCurrency(pl)}
                      </td>
                      <td className={`text-right py-2 ${plPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmtPct(pos.unrealized_plpc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">No open positions</p>
        )}
      </div>

      {/* Trade Log */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm font-medium mb-3 flex items-center gap-2">
          <Clock size={14} className="text-gray-400" />
          Trade Log (last 20)
        </p>
        {log.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2">Time</th>
                  <th className="text-left py-2">Symbol</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Result</th>
                  <th className="text-left py-2 max-w-xs">Reason</th>
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-800/30">
                    <td className="py-1.5 text-gray-500 whitespace-nowrap">
                      {new Date(entry.executed_at).toLocaleString()}
                    </td>
                    <td className="py-1.5 font-medium">{entry.symbol}</td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        entry.action === "BUY" ? "bg-green-900/40 text-green-400" :
                        entry.action === "SELL" ? "bg-red-900/40 text-red-400" :
                        "bg-gray-800 text-gray-400"
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        entry.result === "executed" ? "bg-green-900/40 text-green-400" :
                        entry.result === "blocked" ? "bg-red-900/40 text-red-400" :
                        entry.result === "error" ? "bg-orange-900/40 text-orange-400" :
                        "bg-gray-800 text-gray-400"
                      }`}>
                        {entry.result}
                      </span>
                    </td>
                    <td className="py-1.5 text-gray-400 max-w-xs truncate" title={entry.reason}>
                      {entry.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">No trade activity yet</p>
        )}
      </div>

      {/* Section D: Live Mode Confirmation Modal */}
      {showLiveConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-600 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400" />
              <h3 className="text-lg font-bold text-red-300">REAL MONEY MODE</h3>
            </div>
            <p className="text-gray-300 text-sm mb-2">
              APEX will place real orders with your funds.
            </p>
            <p className="text-gray-400 text-xs mb-5">
              All guardrails (APEX score, conviction, Claude review, position limits) still apply. Make sure you have tested in paper mode first.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLiveConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2.5 rounded-lg text-sm font-medium"
              >
                Stay in Paper Mode
              </button>
              <button
                onClick={handleConfirmLive}
                disabled={actionLoading}
                className="flex-1 bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white font-bold py-2.5 rounded-lg text-sm"
              >
                Yes, Go Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GuardrailSlider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  settingKey: string;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm">{label}</p>
        <p className="text-sm font-semibold text-brand-400">
          {value}{suffix}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-brand-500"
      />
    </div>
  );
}
