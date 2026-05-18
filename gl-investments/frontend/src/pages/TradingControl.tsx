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
  TrendingDown,
  DollarSign,
} from "lucide-react";
import { tradingApi } from "../services/api";

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

const fmtCurrency = (val: string | number) =>
  `$${parseFloat(String(val)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtPct = (val: string | number) => {
  const n = parseFloat(String(val)) * 100;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

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

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

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

  return (
    <div className="p-6 space-y-6">
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

          {/* Mode Switch */}
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
            {!status?.paperMode && (
              <p className="text-red-400 text-xs mt-2">
                LIVE mode — real money at risk. All guardrails still apply.
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

      {/* Live Mode Confirmation Dialog */}
      {showLiveConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-600 rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle size={24} className="text-red-400" />
              <h3 className="text-lg font-bold text-red-300">Switch to LIVE Trading</h3>
            </div>
            <p className="text-gray-300 text-sm mb-4">
              You are switching to <strong>LIVE trading with real money</strong>.
              All guardrails (APEX score, conviction, Claude review, position limits) still apply.
              Are you absolutely sure?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmLive}
                disabled={actionLoading}
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded-lg text-sm"
              >
                Yes, Switch to LIVE
              </button>
              <button
                onClick={() => setShowLiveConfirm(false)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg text-sm"
              >
                Cancel
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
