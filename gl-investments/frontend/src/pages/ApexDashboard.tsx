import { useEffect, useState } from "react";
import { Zap, RefreshCw, TrendingUp, TrendingDown, Shield, AlertTriangle, Target, ChevronDown, ChevronUp } from "lucide-react";
import axios from "axios";

type ApexRating = "PRIME" | "STRONG" | "DEVELOPING" | "WEAK" | "AVOID";
type MarketRegime = "BULL" | "CAUTION" | "BEAR" | "CRISIS";

interface ApexResult {
  symbol: string;
  total: number;
  rating: ApexRating;
  components: {
    momentum: number;
    technical: number;
    congressional: number;
    macro: number;
    value: number;
  };
  positionSizePct: number;
  entryNotes: string[];
  riskNotes: string[];
  stopLossPct: number;
  targetPct: number;
  regime: MarketRegime;
  currentPrice?: number;
  changePct?: number;
}

interface RegimeSnapshot {
  regime: MarketRegime;
  spyPrice: number;
  spySma200: number;
  vixLevel: number;
  fearGreed: number;
  breadthSignal: string;
  regimeReason: string;
  deploymentPct: number;
}

interface SearchResult extends ApexResult {
  quote?: { price: number; changePct: number; name: string };
}

const RATING_CONFIG: Record<ApexRating, { label: string; color: string; bg: string; glow: string }> = {
  PRIME:      { label: "APEX PRIME",  color: "text-green-300",  bg: "bg-green-900/50 border-green-600",  glow: "shadow-green-900/50" },
  STRONG:     { label: "STRONG",      color: "text-brand-300",  bg: "bg-brand-900/40 border-brand-600",  glow: "shadow-brand-900/50" },
  DEVELOPING: { label: "DEVELOPING",  color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700",glow: "" },
  WEAK:       { label: "WEAK",        color: "text-orange-400", bg: "bg-orange-900/20 border-orange-800",glow: "" },
  AVOID:      { label: "AVOID",       color: "text-red-400",    bg: "bg-red-900/20 border-red-800",      glow: "" },
};

const REGIME_CONFIG: Record<MarketRegime, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  BULL:    { label: "BULL MARKET",  color: "text-green-400",  bg: "bg-green-900/30 border-green-700",  icon: <TrendingUp size={16} /> },
  CAUTION: { label: "CAUTION",      color: "text-yellow-400", bg: "bg-yellow-900/30 border-yellow-700",icon: <AlertTriangle size={16} /> },
  BEAR:    { label: "BEAR MARKET",  color: "text-red-400",    bg: "bg-red-900/30 border-red-700",      icon: <TrendingDown size={16} /> },
  CRISIS:  { label: "CRISIS",       color: "text-red-300",    bg: "bg-red-950 border-red-600",         icon: <AlertTriangle size={16} /> },
};

const COMPONENT_LABELS: Record<string, { label: string; source: string; max: number }> = {
  momentum:     { label: "Momentum",    source: "Minervini/O'Neil",    max: 25 },
  technical:    { label: "Entry Setup", source: "Livermore/Turtle",    max: 20 },
  congressional:{ label: "Congress",    source: "STOCK Act Edge",      max: 20 },
  macro:        { label: "Macro Fit",   source: "Druckenmiller/Dalio", max: 20 },
  value:        { label: "Value Safety",source: "Graham",              max: 15 },
};

export default function ApexDashboard() {
  const [regime, setRegime] = useState<RegimeSnapshot | null>(null);
  const [opportunities, setOpportunities] = useState<ApexResult[]>([]);
  const [searchSymbol, setSearchSymbol] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [reg, top] = await Promise.all([
      axios.get("/api/apex/regime"),
      axios.get("/api/apex/top"),
    ]);
    setRegime(reg.data);
    setOpportunities(top.data.opportunities ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchSymbol.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`/api/apex/score/${searchSymbol.toUpperCase()}`);
      setSearchResult(res.data);
      setExpanded(searchSymbol.toUpperCase());
    } catch {
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">APEX Strategy Engine</h2>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Minervini · O'Neil · Graham · Livermore · Turtle · Druckenmiller · Dalio · Minority Mindset
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Market Regime Banner */}
      {regime && (
        <div className={`border rounded-xl p-4 ${REGIME_CONFIG[regime.regime].bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={REGIME_CONFIG[regime.regime].color}>
                {REGIME_CONFIG[regime.regime].icon}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className={`font-bold text-lg ${REGIME_CONFIG[regime.regime].color}`}>
                    {REGIME_CONFIG[regime.regime].label}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${REGIME_CONFIG[regime.regime].bg} ${REGIME_CONFIG[regime.regime].color}`}>
                    Deploy {regime.deploymentPct}% of capital
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{regime.regimeReason}</p>
              </div>
            </div>
            <div className="flex gap-4 text-right flex-shrink-0">
              <div>
                <p className="text-xs text-gray-500">SPY</p>
                <p className="font-semibold">${regime.spyPrice.toFixed(2)}</p>
                <p className="text-xs text-gray-600">SMA200: ${regime.spySma200.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">VIX</p>
                <p className={`font-semibold ${regime.vixLevel > 30 ? "text-red-400" : regime.vixLevel > 20 ? "text-yellow-400" : "text-green-400"}`}>
                  {regime.vixLevel.toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Fear/Greed</p>
                <p className={`font-semibold ${regime.fearGreed > 70 ? "text-green-400" : regime.fearGreed < 30 ? "text-red-400" : "text-gray-300"}`}>
                  {regime.fearGreed}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Symbol search */}
      <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
        <input
          value={searchSymbol}
          onChange={(e) => setSearchSymbol(e.target.value)}
          placeholder="APEX-score any symbol (AAPL, BTC-USD...)"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
        >
          <Target size={14} />
          Score
        </button>
      </form>

      {searching && <p className="text-gray-500 text-sm">Running APEX analysis...</p>}

      {searchResult && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">Search Result</p>
          <ApexCard
            result={searchResult}
            expanded={expanded === searchResult.symbol}
            onToggle={() => setExpanded(expanded === searchResult.symbol ? null : searchResult.symbol)}
          />
        </div>
      )}

      {/* Top Opportunities */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">Top Opportunities</h3>
          <p className="text-xs text-gray-600">Congress trades + watchlist, APEX scored</p>
        </div>

        {loading ? (
          <div className="text-gray-500 text-sm">Scoring opportunities...</div>
        ) : opportunities.length === 0 ? (
          <div className="text-center text-gray-600 py-12">
            <p>No opportunities scored yet.</p>
            <p className="text-sm mt-1">Add stocks to your watchlist or load congress trades to generate signals.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map((opp) => (
              <ApexCard
                key={opp.symbol}
                result={opp}
                expanded={expanded === opp.symbol}
                onToggle={() => setExpanded(expanded === opp.symbol ? null : opp.symbol)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Framework legend */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm font-medium mb-3">APEX Score Components</p>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(COMPONENT_LABELS).map(([key, meta]) => (
            <div key={key} className="text-center">
              <p className="text-xs text-gray-500">{meta.source}</p>
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-brand-400">{meta.max} pts</p>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-2 md:grid-cols-5 gap-2 text-center text-xs">
          {(["PRIME", "STRONG", "DEVELOPING", "WEAK", "AVOID"] as ApexRating[]).map((r) => (
            <div key={r} className={`py-1 rounded border ${RATING_CONFIG[r].bg}`}>
              <span className={RATING_CONFIG[r].color}>{RATING_CONFIG[r].label}</span>
              <p className="text-gray-600">
                {r === "PRIME" ? "80+" : r === "STRONG" ? "60+" : r === "DEVELOPING" ? "40+" : r === "WEAK" ? "20+" : "<20"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ApexCard({ result, expanded, onToggle }: {
  result: ApexResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const cfg = RATING_CONFIG[result.rating];
  const maxScore = 100;

  return (
    <div className={`border rounded-xl overflow-hidden shadow ${cfg.glow} ${cfg.bg}`}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={onToggle}>
        {/* Score ring */}
        <div className="relative flex-shrink-0 w-14 h-14">
          <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
            <circle cx="28" cy="28" r="24" stroke="#1f2937" strokeWidth="4" fill="none" />
            <circle
              cx="28" cy="28" r="24"
              stroke={result.total >= 80 ? "#4ade80" : result.total >= 60 ? "#22c55e" : result.total >= 40 ? "#eab308" : "#ef4444"}
              strokeWidth="4"
              fill="none"
              strokeDasharray={`${(result.total / maxScore) * 150.8} 150.8`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-sm font-bold ${cfg.color}`}>{result.total}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-lg">{result.symbol}</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {result.currentPrice && (
              <span className="text-gray-400 text-sm">${result.currentPrice.toFixed(2)}</span>
            )}
            {result.changePct !== undefined && (
              <span className={`text-xs ${result.changePct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {result.changePct >= 0 ? "+" : ""}{result.changePct.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Component bars */}
          <div className="flex gap-1 mt-2">
            {Object.entries(result.components).map(([key, val]) => {
              const meta = COMPONENT_LABELS[key];
              const pct = (val / meta.max) * 100;
              return (
                <div key={key} className="flex-1" title={`${meta.label}: ${val}/${meta.max}`}>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">{meta.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-4 text-right">
          <div>
            <p className="text-xs text-gray-500">Position</p>
            <p className="font-semibold text-brand-400">{result.positionSizePct}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Stop / Target</p>
            <p className="text-xs text-red-400">−{result.stopLossPct}%</p>
            <p className="text-xs text-green-400">+{result.targetPct}%</p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-800/60 pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-green-400 font-medium mb-2 flex items-center gap-1">
              <Shield size={12} /> Entry Signals
            </p>
            <ul className="space-y-1">
              {result.entryNotes.map((note, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                  <span className="text-green-500 mt-0.5">✓</span> {note}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs text-red-400 font-medium mb-2 flex items-center gap-1">
              <AlertTriangle size={12} /> Risk Flags
            </p>
            <ul className="space-y-1">
              {result.riskNotes.length === 0 ? (
                <li className="text-xs text-gray-600">No major risk flags</li>
              ) : (
                result.riskNotes.map((note, i) => (
                  <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                    <span className="text-red-500 mt-0.5">⚠</span> {note}
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
