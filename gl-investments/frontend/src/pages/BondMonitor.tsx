import { useEffect, useState } from "react";
import { TrendingDown, RefreshCw, Info } from "lucide-react";
import axios from "axios";

type BondSignal = "RISK_ON" | "RISK_OFF" | "NEUTRAL";
type YieldCurveSignal = "INVERTED" | "FLAT" | "NORMAL";
type RiskOnOff = "RISK_ON" | "RISK_OFF" | "NEUTRAL";
type InflationSignal = "RISING" | "FALLING" | "NEUTRAL";

interface BondETF {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  priceVsSMA20pct: number;
  signal: BondSignal;
}

interface BondSnapshot {
  etfs: BondETF[];
  yieldCurveSignal: YieldCurveSignal;
  riskOnOff: RiskOnOff;
  inflationSignal: InflationSignal;
  macroRegimeHint: string;
  macroScore: number;
  cachedAt: string;
}

const ETF_SIGNAL_CONFIG: Record<BondSignal, { label: string; color: string; bg: string; border: string }> = {
  RISK_ON:  { label: "RISK ON",  color: "text-green-300",  bg: "bg-green-900/30",  border: "border-green-700/50" },
  RISK_OFF: { label: "RISK OFF", color: "text-red-300",    bg: "bg-red-900/30",    border: "border-red-700/50" },
  NEUTRAL:  { label: "NEUTRAL",  color: "text-gray-400",   bg: "bg-gray-800/40",   border: "border-gray-700" },
};

const YIELD_CURVE_CONFIG: Record<YieldCurveSignal, { label: string; color: string; bg: string }> = {
  INVERTED: { label: "INVERTED",      color: "text-red-300",    bg: "bg-red-900/40 border-red-700/50" },
  FLAT:     { label: "FLAT",          color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700/50" },
  NORMAL:   { label: "NORMAL",        color: "text-green-300",  bg: "bg-green-900/30 border-green-700/50" },
};

const RISK_MODE_CONFIG: Record<RiskOnOff, { label: string; color: string; bg: string }> = {
  RISK_ON:  { label: "RISK ON",  color: "text-green-300", bg: "bg-green-900/40 border-green-700/50" },
  RISK_OFF: { label: "RISK OFF", color: "text-red-300",   bg: "bg-red-900/40 border-red-700/50" },
  NEUTRAL:  { label: "NEUTRAL",  color: "text-gray-400",  bg: "bg-gray-800 border-gray-700" },
};

const INFLATION_CONFIG: Record<InflationSignal, { label: string; color: string; bg: string }> = {
  RISING:  { label: "RISING",  color: "text-orange-300", bg: "bg-orange-900/30 border-orange-700/50" },
  FALLING: { label: "FALLING", color: "text-blue-300",   bg: "bg-blue-900/30 border-blue-700/50" },
  NEUTRAL: { label: "NEUTRAL", color: "text-gray-400",   bg: "bg-gray-800 border-gray-700" },
};

function macroScoreColor(score: number): string {
  if (score >= 6) return "text-green-400";
  if (score >= 2) return "text-emerald-400";
  if (score >= -2) return "text-gray-300";
  if (score >= -6) return "text-orange-400";
  return "text-red-400";
}

function SMA20Bar({ pct }: { pct: number }) {
  const clamped = Math.max(-15, Math.min(15, pct));
  const isPositive = pct >= 0;
  const barWidth = Math.abs(clamped / 15) * 50;
  const color = isPositive ? "bg-green-500" : "bg-red-500";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">vs SMA20</span>
        <span className={`text-xs font-mono ${isPositive ? "text-green-400" : "text-red-400"}`}>
          {isPositive ? "+" : ""}{pct.toFixed(2)}%
        </span>
      </div>
      <div className="relative h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-gray-600" />
        <div
          className={`absolute h-full rounded-full ${color}`}
          style={{
            left: isPositive ? "50%" : `${50 - barWidth}%`,
            width: `${barWidth}%`,
          }}
        />
      </div>
    </div>
  );
}

function ETFCard({ etf }: { etf: BondETF }) {
  const cfg = ETF_SIGNAL_CONFIG[etf.signal];
  const priceUp = etf.changePct >= 0;

  return (
    <div className={`rounded-xl border p-4 bg-gray-900 ${cfg.border}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className="font-mono text-sm font-bold text-brand-400">{etf.symbol}</span>
          <p className="text-xs text-gray-500 mt-0.5 max-w-[160px] truncate">{etf.name}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-lg font-semibold text-white">${etf.price.toFixed(2)}</span>
        <span className={`text-sm font-medium ${priceUp ? "text-green-400" : "text-red-400"}`}>
          {priceUp ? "+" : ""}{etf.changePct.toFixed(2)}%
        </span>
      </div>

      <SMA20Bar pct={etf.priceVsSMA20pct} />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 h-40 animate-pulse">
      <div className="flex justify-between mb-2">
        <div className="space-y-1.5">
          <div className="h-4 w-12 bg-gray-800 rounded" />
          <div className="h-3 w-28 bg-gray-800 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-800 rounded-full" />
      </div>
      <div className="h-6 w-20 bg-gray-800 rounded mb-3" />
      <div className="h-2 bg-gray-800 rounded" />
    </div>
  );
}

export default function BondMonitor() {
  const [snapshot, setSnapshot] = useState<BondSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await axios.get("/api/bonds");
      setSnapshot(res.data as BondSnapshot);
    } catch {}
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const cachedDate = snapshot?.cachedAt ? new Date(snapshot.cachedAt) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <TrendingDown size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">Bond Monitor</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Fixed income signals — bonds tell you where the smart money sees the economy heading
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 w-32 bg-gray-800 rounded-full animate-pulse" />
            ))}
          </div>
          <div className="h-24 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 7 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : snapshot ? (
        <>
          <div className="flex flex-wrap gap-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${YIELD_CURVE_CONFIG[snapshot.yieldCurveSignal].bg} ${YIELD_CURVE_CONFIG[snapshot.yieldCurveSignal].color}`}>
              YIELD CURVE: {YIELD_CURVE_CONFIG[snapshot.yieldCurveSignal].label}
            </span>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${RISK_MODE_CONFIG[snapshot.riskOnOff].bg} ${RISK_MODE_CONFIG[snapshot.riskOnOff].color}`}>
              {RISK_MODE_CONFIG[snapshot.riskOnOff].label}
            </span>
            <span className={`text-xs font-bold px-3 py-1.5 rounded-full border ${INFLATION_CONFIG[snapshot.inflationSignal].bg} ${INFLATION_CONFIG[snapshot.inflationSignal].color}`}>
              INFLATION: {INFLATION_CONFIG[snapshot.inflationSignal].label}
            </span>
            {cachedDate && (
              <span className="text-xs text-gray-600 self-center ml-1">
                — updated {cachedDate.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 flex items-center gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">Bond Macro Score</p>
                <p className={`text-5xl font-bold tabular-nums ${macroScoreColor(snapshot.macroScore)}`}>
                  {snapshot.macroScore > 0 ? "+" : ""}{snapshot.macroScore}
                </p>
                <p className="text-xs text-gray-600 mt-1">range: −10 to +10</p>
              </div>
              <div className="flex-1">
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${macroScoreColor(snapshot.macroScore).replace("text-", "bg-")}`}
                    style={{ width: `${((snapshot.macroScore + 10) / 20) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-2">APEX macro input</p>
              </div>
            </div>

            {snapshot.macroRegimeHint && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-start gap-3">
                <Info size={14} className="text-brand-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-400 leading-relaxed">{snapshot.macroRegimeHint}</p>
              </div>
            )}
          </div>

          {snapshot.etfs && snapshot.etfs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {snapshot.etfs.map((etf) => (
                <ETFCard key={etf.symbol} etf={etf} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <TrendingDown size={40} className="mx-auto mb-3 text-gray-700" />
              <p className="text-sm text-gray-500">No ETF data. Click Refresh to load bond signals.</p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16">
          <TrendingDown size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">No bond data. Click Refresh to load.</p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-brand-400" />
          <span className="text-gray-400 font-medium text-sm">How bonds predict stocks</span>
        </div>
        <p>
          <span className="text-red-400 font-medium">Inverted yield curve</span> (short-term rates &gt; long-term rates) has historically preceded every US recession within 6–18 months. When 2Y yield &gt; 10Y yield, institutions are pricing in economic slowdown.
        </p>
        <p>
          <span className="text-brand-400 font-medium">TLT rising</span> = flight to safety. Institutions selling stocks and buying long-duration Treasury bonds. Classic risk-off signal.
          <span className="text-orange-400 font-medium ml-2">HYG outperforming</span> = risk-on appetite. High-yield (junk) bonds rallying means investors are willing to accept credit risk — bullish for equities.
        </p>
        <p>
          <span className="text-brand-400 font-medium">TIP vs IEF</span> — when TIP outperforms IEF, the market is pricing in higher inflation. Watch for commodity sectors (Energy, Materials) to benefit.
        </p>
      </div>
    </div>
  );
}
