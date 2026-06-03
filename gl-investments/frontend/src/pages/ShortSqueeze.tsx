/**
 * Short Squeeze + Options Flow Scanner
 *
 * Finds stocks with high short interest + momentum — the setup that precedes
 * short squeezes. Combines FINRA short data (via Yahoo Finance) with options
 * flow to identify when institutional money is positioning ahead of a move.
 */

import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Zap, RefreshCw,
  BarChart2, AlertCircle, Activity
} from "lucide-react";
import { shortSqueezeApi, optionsFlowApi } from "../services/api";

type SqueezeSignal = "HIGH" | "ELEVATED" | "WATCH" | "NEUTRAL" | "LOW";
type OptionsSignal = "STRONG_CALL_FLOW" | "CALL_FLOW" | "NEUTRAL" | "PUT_FLOW" | "STRONG_PUT_FLOW";

interface ShortData {
  ticker: string;
  companyName: string;
  currentPrice: number;
  shortFloatPct: number;
  shortRatio: number;
  rsi14: number;
  priceVsSma50Pct: number;
  volumeRatio: number;
  squeezeScore: number;
  signal: SqueezeSignal;
  signalReason: string;
  fetchedAt: string;
}

interface OptionsData {
  ticker: string;
  currentPrice: number;
  callPutRatio: number;
  unusualCallContracts: number;
  unusualPutContracts: number;
  largestCallStrike: number;
  largestCallExpiry: string;
  impliedVolatility: number;
  signal: OptionsSignal;
  signalReason: string;
}

const SQUEEZE_CONFIG: Record<SqueezeSignal, { label: string; color: string; bg: string }> = {
  HIGH:     { label: "HIGH SQUEEZE RISK",  color: "text-red-300",    bg: "bg-red-900/50 border-red-700/50" },
  ELEVATED: { label: "ELEVATED",           color: "text-orange-300", bg: "bg-orange-900/40 border-orange-700/50" },
  WATCH:    { label: "WATCH",              color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700/50" },
  NEUTRAL:  { label: "NEUTRAL",            color: "text-gray-400",   bg: "bg-gray-900/40 border-gray-700" },
  LOW:      { label: "LOW",                color: "text-gray-600",   bg: "bg-gray-900/20 border-gray-800" },
};

const OPTIONS_CONFIG: Record<OptionsSignal, { label: string; color: string }> = {
  STRONG_CALL_FLOW: { label: "Strong Call Flow", color: "text-green-400" },
  CALL_FLOW:        { label: "Call Flow",         color: "text-emerald-400" },
  NEUTRAL:          { label: "Neutral",            color: "text-gray-500" },
  PUT_FLOW:         { label: "Put Flow",           color: "text-orange-400" },
  STRONG_PUT_FLOW:  { label: "Strong Put Flow",    color: "text-red-400" },
};

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-red-500" : score >= 55 ? "bg-orange-500" : score >= 35 ? "bg-yellow-500" : "bg-gray-600";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-300 w-6 text-right">{score}</span>
    </div>
  );
}

function SqueezeCard({ data, optionsData }: { data: ShortData; optionsData?: OptionsData }) {
  const { label, color, bg } = SQUEEZE_CONFIG[data.signal];
  const priceUp = data.priceVsSma50Pct >= 0;

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-brand-400">{data.ticker}</span>
            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${bg} ${color}`}>{label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{data.companyName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-semibold text-white">${data.currentPrice.toFixed(2)}</p>
          <span className={`text-xs flex items-center justify-end gap-0.5 ${priceUp ? "text-green-400" : "text-red-400"}`}>
            {priceUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {priceUp ? "+" : ""}{data.priceVsSma50Pct.toFixed(1)}% vs SMA50
          </span>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Squeeze Score</span>
        </div>
        <ScoreBar score={data.squeezeScore} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        <div className="bg-black/20 rounded-lg py-1.5">
          <p className={`text-sm font-bold ${data.shortFloatPct > 20 ? "text-red-300" : "text-gray-300"}`}>
            {data.shortFloatPct.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-600">Short Float</p>
        </div>
        <div className="bg-black/20 rounded-lg py-1.5">
          <p className={`text-sm font-bold ${data.shortRatio > 5 ? "text-orange-300" : "text-gray-300"}`}>
            {data.shortRatio.toFixed(1)}d
          </p>
          <p className="text-xs text-gray-600">Days to Cover</p>
        </div>
        <div className="bg-black/20 rounded-lg py-1.5">
          <p className={`text-sm font-bold ${data.rsi14 > 55 ? "text-green-300" : data.rsi14 < 40 ? "text-red-300" : "text-gray-300"}`}>
            {data.rsi14.toFixed(0)}
          </p>
          <p className="text-xs text-gray-600">RSI</p>
        </div>
      </div>

      {optionsData && optionsData.signal !== "NEUTRAL" && (
        <div className="bg-black/20 rounded-lg px-3 py-2 mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Activity size={11} className="text-purple-400" />
              <span className="text-xs text-gray-500">Options Flow</span>
            </div>
            <span className={`text-xs font-bold ${OPTIONS_CONFIG[optionsData.signal].color}`}>
              {OPTIONS_CONFIG[optionsData.signal].label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">{optionsData.signalReason}</p>
        </div>
      )}

      <p className="text-xs text-gray-500 italic">{data.signalReason}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 h-52 animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-800 rounded w-2/3 mb-4" />
      <div className="h-2 bg-gray-700 rounded mb-4" />
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded" />)}
      </div>
    </div>
  );
}

export default function ShortSqueeze() {
  const [data, setData] = useState<ShortData[]>([]);
  const [optionsMap, setOptionsMap] = useState<Record<string, OptionsData>>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<SqueezeSignal | "ALL">("ALL");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCached = async () => {
    try {
      const res = await shortSqueezeApi.getCached();
      setData(res.data as ShortData[]);
      setLastUpdated(new Date());
    } catch {}
  };

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
  }, []);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await shortSqueezeApi.scan();
      const results = res.data as ShortData[];
      setData(results);
      setLastUpdated(new Date());

      // Fetch options flow for HIGH/ELEVATED results
      const hotTickers = results.filter(r => r.signal === "HIGH" || r.signal === "ELEVATED").map(r => r.ticker);
      const optionsResults = await Promise.all(
        hotTickers.slice(0, 10).map(t =>
          optionsFlowApi.getTicker(t).then(r => ({ ticker: t, data: r.data as OptionsData })).catch(() => null)
        )
      );
      const map: Record<string, OptionsData> = {};
      optionsResults.forEach(r => { if (r) map[r.ticker] = r.data; });
      setOptionsMap(map);
    } catch (err) {
      console.error("Scan failed", err);
    } finally {
      setScanning(false);
    }
  };

  const filtered = filter === "ALL" ? data : data.filter(d => d.signal === filter);
  const highCount = data.filter(d => d.signal === "HIGH" || d.signal === "ELEVATED").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={24} className="text-brand-400" />
          <div>
            <h2 className="text-2xl font-semibold text-white">Short Squeeze Scanner</h2>
            <p className="text-sm text-gray-400">
              High short interest + momentum signals — spots setups before they explode
              {lastUpdated && <span className="ml-2 text-gray-600">— {lastUpdated.toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning..." : "Scan Watchlist"}
        </button>
      </div>

      {/* Alert banner */}
      {highCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-900/20 border border-red-700/40 rounded-xl">
          <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">
            <span className="font-bold">{highCount} symbol{highCount > 1 ? "s" : ""}</span> flagged HIGH or ELEVATED squeeze risk.
            These are not trade recommendations — combine with APEX decision before acting.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      {data.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "HIGH", "ELEVATED", "WATCH", "NEUTRAL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                filter === f
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-gray-900 border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {f === "ALL" ? `All (${data.length})` : `${f} (${data.filter(d => d.signal === f).length})`}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BarChart2 size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {data.length === 0
              ? "No data yet. Click \"Scan Watchlist\" to analyze short interest."
              : `No symbols with ${filter} signal.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((d) => (
            <SqueezeCard key={d.ticker} data={d} optionsData={optionsMap[d.ticker]} />
          ))}
        </div>
      )}

      {/* Explanation */}
      {!loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p className="text-gray-400 font-medium">How to use this scanner</p>
          <p>
            SHORT SQUEEZE RISK = HIGH when short float &gt;20%, days-to-cover &gt;5, and RSI is rising.
            This means many investors are betting the stock goes down (shorting) — if the price rises, they're forced to buy to cover, accelerating the move.
          </p>
          <p>
            This scanner does NOT make trade recommendations. Use it as a filter: if APEX has a BUY signal AND the short scanner shows HIGH/ELEVATED, that's a convergence signal worth acting on.
            Options flow (shown on HIGH/ELEVATED cards) confirms whether institutional money is also positioning calls.
          </p>
        </div>
      )}
    </div>
  );
}
