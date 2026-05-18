import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, TrendingUp, TrendingDown, Eye, Ban, Pause } from "lucide-react";
import axios from "axios";

type DecisionAction = "BUY" | "SELL" | "HOLD" | "AVOID" | "WATCH";
type DecisionUrgency = "ACT NOW" | "THIS WEEK" | "DEVELOPING" | "STANDBY";
type MarketRegime = "BULL" | "CAUTION" | "BEAR" | "CRISIS";

interface Decision {
  id: string;
  symbol: string;
  action: DecisionAction;
  urgency: DecisionUrgency;
  conviction: number;
  apexScore: number;
  rationale: string;
  execution: {
    currentPrice: number;
    entryPrice: number;
    stopLoss: number;
    target: number;
    positionSizePct: number;
    riskRewardRatio: number;
  };
  exitConditions: string[];
  regime: MarketRegime;
  generatedAt: string;
  expiresAt: string;
}

interface RegimeSnapshot {
  regime: MarketRegime;
  spyPrice: number;
  spySma200: number;
  vixLevel: number;
  fearGreed: number;
  deploymentPct: number;
  regimeReason: string;
}

const ACTION_CONFIG: Record<DecisionAction, {
  label: string; color: string; bg: string; border: string; icon: React.ReactNode;
}> = {
  BUY:   { label: "BUY",   color: "text-green-300",  bg: "bg-green-950",   border: "border-green-600",  icon: <TrendingUp size={18} /> },
  SELL:  { label: "SELL",  color: "text-red-300",    bg: "bg-red-950",     border: "border-red-600",    icon: <TrendingDown size={18} /> },
  HOLD:  { label: "HOLD",  color: "text-blue-300",   bg: "bg-blue-950",    border: "border-blue-700",   icon: <Pause size={18} /> },
  WATCH: { label: "WATCH", color: "text-yellow-300", bg: "bg-yellow-950",  border: "border-yellow-700", icon: <Eye size={18} /> },
  AVOID: { label: "AVOID", color: "text-gray-400",   bg: "bg-gray-900",    border: "border-gray-700",   icon: <Ban size={18} /> },
};

const URGENCY_CONFIG: Record<DecisionUrgency, { color: string; pulse: boolean }> = {
  "ACT NOW":    { color: "text-green-400 bg-green-900/60 border-green-600", pulse: true  },
  "THIS WEEK":  { color: "text-brand-400 bg-brand-900/40 border-brand-700", pulse: false },
  "DEVELOPING": { color: "text-yellow-400 bg-yellow-900/30 border-yellow-800", pulse: false },
  "STANDBY":    { color: "text-gray-500 bg-gray-800 border-gray-700",         pulse: false },
};

const REGIME_BAR: Record<MarketRegime, { label: string; bar: string; text: string }> = {
  BULL:    { label: "BULL — Full deployment", bar: "bg-green-500",  text: "text-green-400" },
  CAUTION: { label: "CAUTION — 50% size",     bar: "bg-yellow-500", text: "text-yellow-400" },
  BEAR:    { label: "BEAR — Cash only",        bar: "bg-red-600",    text: "text-red-400" },
  CRISIS:  { label: "CRISIS — Defensive",      bar: "bg-red-900",    text: "text-red-300" },
};

export default function CommandCenter() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [regime, setRegime] = useState<RegimeSnapshot | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [manualSymbol, setManualSymbol] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const loadCached = async () => {
    const [d, r] = await Promise.all([
      axios.get("/api/decisions"),
      axios.get("/api/apex/regime"),
    ]);
    setDecisions(d.data);
    setRegime(r.data);
    if (d.data.length > 0) setLastScan(d.data[0].generatedAt);
    setLoading(false);
  };

  useEffect(() => { loadCached(); }, []);

  const runScan = async () => {
    setScanning(true);
    const res = await axios.post("/api/decisions/scan");
    setDecisions(res.data);
    if (res.data.length > 0) setLastScan(res.data[0].generatedAt);
    setScanning(false);
  };

  const decideSymbol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSymbol.trim()) return;
    setDeciding(true);
    const res = await axios.post(`/api/decisions/decide/${manualSymbol.toUpperCase()}`);
    setDecisions((prev) => {
      const filtered = prev.filter((d) => d.symbol !== res.data.symbol);
      return [res.data, ...filtered].sort(sortDecisions);
    });
    setManualSymbol("");
    setDeciding(false);
  };

  const active = decisions.filter((d) => d.action === "BUY" || d.action === "SELL");
  const watching = decisions.filter((d) => d.action === "WATCH");
  const avoided = decisions.filter((d) => d.action === "AVOID");

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">APEX Command Center</h2>
          <p className="text-gray-500 text-sm mt-1">
            {lastScan ? `Last scan: ${timeAgo(lastScan)}` : "No scan run yet — click Run Scan to start."}
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-medium"
        >
          <RefreshCw size={15} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {/* Regime bar */}
      {regime && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className={`font-bold ${REGIME_BAR[regime.regime].text}`}>
                {REGIME_BAR[regime.regime].label}
              </span>
              <span className="text-gray-600 text-sm">·</span>
              <span className="text-gray-400 text-sm">{regime.regimeReason}</span>
            </div>
            <div className="flex gap-4 text-sm text-right">
              <span className="text-gray-500">SPY <span className="text-white">${regime.spyPrice.toFixed(2)}</span></span>
              <span className="text-gray-500">VIX <span className={regime.vixLevel > 30 ? "text-red-400" : "text-white"}>{regime.vixLevel.toFixed(1)}</span></span>
              <span className="text-gray-500">F&G <span className="text-white">{regime.fearGreed}</span></span>
            </div>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${REGIME_BAR[regime.regime].bar}`}
              style={{ width: `${regime.deploymentPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Manual symbol input */}
      <form onSubmit={decideSymbol} className="flex gap-3 max-w-sm">
        <input
          value={manualSymbol}
          onChange={(e) => setManualSymbol(e.target.value)}
          placeholder="Decide on any symbol..."
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={deciding || !manualSymbol.trim()}
          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm"
        >
          {deciding ? "..." : "Decide"}
        </button>
      </form>

      {loading ? (
        <div className="text-gray-500 text-sm py-8 text-center">
          Loading decisions... Run a scan if this is empty.
        </div>
      ) : decisions.length === 0 ? (
        <EmptyState onScan={runScan} scanning={scanning} />
      ) : (
        <div className="space-y-6">
          {/* Active decisions */}
          {active.length > 0 && (
            <section className="space-y-3">
              <SectionHeader
                label="APEX is Acting"
                count={active.length}
                color="text-green-400"
              />
              {active.map((d) => <DecisionCard key={d.id} decision={d} />)}
            </section>
          )}

          {/* Watching */}
          {watching.length > 0 && (
            <section className="space-y-3">
              <SectionHeader
                label="On Watch — Setup Developing"
                count={watching.length}
                color="text-yellow-400"
              />
              {watching.map((d) => <DecisionCard key={d.id} decision={d} compact />)}
            </section>
          )}

          {/* Avoided */}
          {avoided.length > 0 && (
            <section className="space-y-2">
              <SectionHeader
                label="APEX Passed"
                count={avoided.length}
                color="text-gray-500"
              />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {avoided.map((d) => (
                  <AvoidChip key={d.id} decision={d} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Decision card ────────────────────────────────────────────────────────
function DecisionCard({ decision: d, compact }: { decision: Decision; compact?: boolean }) {
  const cfg = ACTION_CONFIG[d.action];
  const urg = URGENCY_CONFIG[d.urgency];
  const [open, setOpen] = useState(!compact && d.action === "BUY");

  const rr = d.execution.riskRewardRatio;
  const entryPct = ((d.execution.entryPrice - d.execution.currentPrice) / d.execution.currentPrice * 100);

  return (
    <div className={`border-2 rounded-xl overflow-hidden ${cfg.bg} ${cfg.border}`}>
      {/* Main row */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        {/* Action badge */}
        <div className={`flex items-center gap-2 ${cfg.color} flex-shrink-0`}>
          {cfg.icon}
          <span className="text-xl font-black tracking-tight">{cfg.label}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-bold">{d.symbol}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${urg.color} ${urg.pulse ? "animate-pulse" : ""}`}>
              {d.urgency}
            </span>
            <ConvictionDots conviction={d.conviction} />
          </div>
          <p className="text-sm text-gray-300 mt-1 leading-snug">{d.rationale}</p>
        </div>

        {/* Key numbers */}
        {!compact && d.action === "BUY" && (
          <div className="flex-shrink-0 text-right space-y-1">
            <div className="text-xs text-gray-500">Position</div>
            <div className="text-lg font-bold text-brand-400">{d.execution.positionSizePct}%</div>
            <div className="text-xs text-gray-500">R/R {rr}:1</div>
          </div>
        )}
      </div>

      {/* Execution details — expanded */}
      {open && (
        <div className="border-t border-gray-700/50 px-4 pb-4 pt-3 grid grid-cols-3 gap-4">
          <PriceBox label="Entry" value={`$${d.execution.entryPrice}`}
            sub={entryPct !== 0 ? `${entryPct > 0 ? "+" : ""}${entryPct.toFixed(1)}% from now` : "at market"}
            color="text-white" />
          <PriceBox label="Stop Loss" value={`$${d.execution.stopLoss}`}
            sub={`−${d.execution.positionSizePct > 0 ? ((d.execution.entryPrice - d.execution.stopLoss) / d.execution.entryPrice * 100).toFixed(1) : "—"}%`}
            color="text-red-400" />
          <PriceBox label="Target" value={`$${d.execution.target}`}
            sub={`+${((d.execution.target - d.execution.entryPrice) / d.execution.entryPrice * 100).toFixed(1)}%`}
            color="text-green-400" />

          <div className="col-span-3 mt-1 space-y-1">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Exit plan</p>
            {d.exitConditions.map((c, i) => (
              <p key={i} className="text-xs text-gray-400">· {c}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function AvoidChip({ decision: d }: { decision: Decision }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center justify-between">
      <span className="font-semibold text-gray-400">{d.symbol}</span>
      <span className="text-xs text-gray-600 ml-2 truncate max-w-[100px]" title={d.rationale}>
        {d.rationale.split(" ").slice(0, 4).join(" ")}...
      </span>
    </div>
  );
}

function PriceBox({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-gray-900/60 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
    </div>
  );
}

function ConvictionDots({ conviction }: { conviction: number }) {
  return (
    <div className="flex gap-0.5 items-center">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-3 rounded-sm ${
            i < conviction
              ? conviction >= 8 ? "bg-green-400" : conviction >= 5 ? "bg-yellow-400" : "bg-red-400"
              : "bg-gray-700"
          }`}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1">{conviction}/10</span>
    </div>
  );
}

function SectionHeader({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <h3 className={`font-semibold ${color}`}>{label}</h3>
      <span className="text-xs text-gray-600 bg-gray-800 rounded-full px-2 py-0.5">{count}</span>
    </div>
  );
}

function EmptyState({ onScan, scanning }: { onScan: () => void; scanning: boolean }) {
  return (
    <div className="text-center py-16 space-y-4">
      <AlertTriangle size={40} className="text-gray-700 mx-auto" />
      <p className="text-gray-500">No decisions yet.</p>
      <p className="text-gray-600 text-sm max-w-sm mx-auto">
        Add stocks to your watchlist or import congress trades, then run a scan.
        APEX will determine what to do with each one.
      </p>
      <button
        onClick={onScan}
        disabled={scanning}
        className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-6 py-2.5 rounded-lg"
      >
        {scanning ? "Scanning..." : "Run First Scan"}
      </button>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

function sortDecisions(a: Decision, b: Decision): number {
  const urgOrder = { "ACT NOW": 0, "THIS WEEK": 1, "DEVELOPING": 2, "STANDBY": 3 };
  const actOrder = { BUY: 0, SELL: 1, WATCH: 2, HOLD: 3, AVOID: 4 };
  return (urgOrder[a.urgency] - urgOrder[b.urgency]) ||
    (actOrder[a.action] - actOrder[b.action]) ||
    (b.conviction - a.conviction);
}
