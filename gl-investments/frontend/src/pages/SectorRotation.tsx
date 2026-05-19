import { useEffect, useState } from "react";
import { Layers, RefreshCw, TrendingUp, TrendingDown, Info } from "lucide-react";
import axios from "axios";

type Momentum = "LEADING" | "NEUTRAL" | "LAGGING";
type RiskOnOff = "RISK_ON" | "RISK_OFF" | "NEUTRAL";
type YieldCurveSignal = "INVERTED" | "FLAT" | "NORMAL";
type InflationSignal = "RISING" | "FALLING" | "NEUTRAL";
type FilterTab = "ALL" | Momentum;

interface SectorRotation {
  sector: string;
  etfSymbol: string;
  etfPrice: number;
  etfChangePct: number;
  etfVsSMA20pct: number;
  momentum: Momentum;
  topPick: string;
  avgSectorScore: number;
}

interface BondSnapshot {
  riskOnOff: RiskOnOff;
  yieldCurveSignal: YieldCurveSignal;
  inflationSignal: InflationSignal;
  macroRegimeHint: string;
}

const MOMENTUM_CONFIG: Record<Momentum, { label: string; color: string; bg: string; border: string }> = {
  LEADING: { label: "LEADING",  color: "text-green-300",  bg: "bg-green-900/30",  border: "border-green-700/50" },
  NEUTRAL: { label: "NEUTRAL",  color: "text-gray-400",   bg: "bg-gray-800/40",   border: "border-gray-700" },
  LAGGING: { label: "LAGGING",  color: "text-red-400",    bg: "bg-red-900/20",    border: "border-red-800/50" },
};

const RISK_CONFIG: Record<RiskOnOff, { label: string; color: string; bg: string }> = {
  RISK_ON:  { label: "RISK ON",  color: "text-green-300", bg: "bg-green-900/40 border-green-700/50" },
  RISK_OFF: { label: "RISK OFF", color: "text-red-300",   bg: "bg-red-900/40 border-red-700/50" },
  NEUTRAL:  { label: "NEUTRAL",  color: "text-gray-400",  bg: "bg-gray-800 border-gray-700" },
};

const YIELD_CONFIG: Record<YieldCurveSignal, { label: string; color: string; bg: string }> = {
  INVERTED: { label: "INVERTED", color: "text-red-300",    bg: "bg-red-900/40 border-red-700/50" },
  FLAT:     { label: "FLAT",     color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700/50" },
  NORMAL:   { label: "NORMAL",   color: "text-green-300",  bg: "bg-green-900/30 border-green-700/50" },
};

const INFLATION_CONFIG: Record<InflationSignal, { label: string; color: string; bg: string }> = {
  RISING:  { label: "INFLATION RISING",  color: "text-orange-300", bg: "bg-orange-900/30 border-orange-700/50" },
  FALLING: { label: "INFLATION FALLING", color: "text-blue-300",   bg: "bg-blue-900/30 border-blue-700/50" },
  NEUTRAL: { label: "INFLATION NEUTRAL", color: "text-gray-400",   bg: "bg-gray-800 border-gray-700" },
};

function sortSectors(sectors: SectorRotation[]): SectorRotation[] {
  const order: Momentum[] = ["LEADING", "NEUTRAL", "LAGGING"];
  return [...sectors].sort((a, b) => {
    const mo = order.indexOf(a.momentum) - order.indexOf(b.momentum);
    if (mo !== 0) return mo;
    return b.etfVsSMA20pct - a.etfVsSMA20pct;
  });
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

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 45 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-300 w-6 text-right">{Math.round(score)}</span>
    </div>
  );
}

function SectorCard({ sector }: { sector: SectorRotation }) {
  const cfg = MOMENTUM_CONFIG[sector.momentum];
  const priceUp = sector.etfChangePct >= 0;

  return (
    <div className={`rounded-xl border p-4 bg-gray-900 ${cfg.border}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold bg-gray-800 border border-gray-700 px-2 py-0.5 rounded text-brand-400">
            {sector.etfSymbol}
          </span>
          <span className="text-sm font-medium text-white">{sector.sector}</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-lg font-semibold text-white">${sector.etfPrice.toFixed(2)}</span>
        </div>
        <span className={`flex items-center gap-1 text-sm font-medium ${priceUp ? "text-green-400" : "text-red-400"}`}>
          {priceUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          {priceUp ? "+" : ""}{sector.etfChangePct.toFixed(2)}%
        </span>
      </div>

      <div className="mb-3">
        <SMA20Bar pct={sector.etfVsSMA20pct} />
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Avg Sector Score</span>
        </div>
        <ScoreBar score={sector.avgSectorScore} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <span className="text-xs text-gray-500">Top Pick</span>
        <span className="font-mono text-sm font-bold text-brand-400">{sector.topPick}</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 h-56 animate-pulse">
      <div className="flex justify-between mb-3">
        <div className="flex gap-2">
          <div className="h-5 w-10 bg-gray-800 rounded" />
          <div className="h-5 w-24 bg-gray-800 rounded" />
        </div>
        <div className="h-5 w-16 bg-gray-800 rounded-full" />
      </div>
      <div className="h-6 w-20 bg-gray-800 rounded mb-3" />
      <div className="h-2 bg-gray-800 rounded mb-4" />
      <div className="h-2 bg-gray-800 rounded mb-4" />
      <div className="h-px bg-gray-800 mb-3" />
      <div className="h-4 w-16 bg-gray-800 rounded ml-auto" />
    </div>
  );
}

export default function SectorRotation() {
  const [sectors, setSectors] = useState<SectorRotation[]>([]);
  const [bondSnapshot, setBondSnapshot] = useState<BondSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("ALL");

  const loadCached = async () => {
    try {
      const res = await axios.get("/api/sectors/rotation");
      const payload = res.data;
      setSectors(Array.isArray(payload) ? payload : (payload.sectors ?? []));
      if (payload.bondSnapshot) setBondSnapshot(payload.bondSnapshot);
    } catch {}
  };

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await axios.post("/api/sectors/rotation/scan");
      const payload = res.data;
      setSectors(Array.isArray(payload) ? payload : (payload.sectors ?? []));
      if (payload.bondSnapshot) setBondSnapshot(payload.bondSnapshot);
    } catch {
      await loadCached();
    } finally {
      setScanning(false);
    }
  };

  const sorted = sortSectors(sectors);
  const filtered = filter === "ALL" ? sorted : sorted.filter((s) => s.momentum === filter);

  const counts: Record<FilterTab, number> = {
    ALL: sectors.length,
    LEADING: sectors.filter((s) => s.momentum === "LEADING").length,
    NEUTRAL: sectors.filter((s) => s.momentum === "NEUTRAL").length,
    LAGGING: sectors.filter((s) => s.momentum === "LAGGING").length,
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">Sector Rotation</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Which of the 11 GICS sectors is leading the market right now — where institutional money is flowing
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Run Scan"}
        </button>
      </div>

      {bondSnapshot && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-gray-900 border border-gray-800 rounded-xl">
          <span className="text-xs text-gray-500 mr-1">Bond Signals:</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_CONFIG[bondSnapshot.riskOnOff].bg} ${RISK_CONFIG[bondSnapshot.riskOnOff].color}`}>
            {RISK_CONFIG[bondSnapshot.riskOnOff].label}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${YIELD_CONFIG[bondSnapshot.yieldCurveSignal].bg} ${YIELD_CONFIG[bondSnapshot.yieldCurveSignal].color}`}>
            YIELD CURVE: {YIELD_CONFIG[bondSnapshot.yieldCurveSignal].label}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${INFLATION_CONFIG[bondSnapshot.inflationSignal].bg} ${INFLATION_CONFIG[bondSnapshot.inflationSignal].color}`}>
            {INFLATION_CONFIG[bondSnapshot.inflationSignal].label}
          </span>
          {bondSnapshot.macroRegimeHint && (
            <span className="text-xs text-gray-500 ml-2 italic">{bondSnapshot.macroRegimeHint}</span>
          )}
        </div>
      )}

      {!loading && sectors.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "LEADING", "NEUTRAL", "LAGGING"] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filter === tab
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {tab === "ALL" ? `All (${counts.ALL})` : `${tab} (${counts[tab]})`}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Layers size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {sectors.length === 0
              ? "No sector data yet. Click Run Scan to analyze all 11 sectors."
              : `No sectors with ${filter} momentum.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <SectorCard key={s.etfSymbol} sector={s} />
          ))}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-brand-400" />
          <span className="text-gray-400 font-medium text-sm">How to use Sector Rotation</span>
        </div>
        <p>
          <span className="text-green-400 font-medium">LEADING sectors</span> = institutional money is flowing in now. The ETF is above its 20-day SMA and showing relative strength vs. the broad market.
        </p>
        <p>
          In bull markets, cyclical sectors (Energy, Industrials, Technology, Consumer Discretionary) tend to lead. In bear markets and recessions, defensive sectors (Utilities, Consumer Staples, Healthcare) outperform as investors rotate to safety.
        </p>
        <p>
          <span className="text-brand-400 font-medium">Strategy:</span> Concentrate new positions in LEADING sectors. Avoid initiating new longs in LAGGING sectors unless you have a specific catalyst. The Top Pick in each sector is the highest APEX-scored stock in that group.
        </p>
      </div>
    </div>
  );
}
