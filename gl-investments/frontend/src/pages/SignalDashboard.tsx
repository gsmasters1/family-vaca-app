import { useEffect, useState } from "react";
import { Zap, RefreshCw, ChevronDown, ChevronUp, TrendingUp, TrendingDown } from "lucide-react";
import { signalsApi } from "../services/api";

interface TradeSignal {
  score: number;
  recommendation: string;
  timeframe: string;
  reasoning: string;
  targetPct: number;
  riskLevel: string;
  scoredAt: string;
}

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
}

interface Trade {
  id: string;
  source: string;
  memberName: string;
  party: string;
  state: string;
  ticker: string;
  assetDescription: string;
  tradeType: string;
  amountRange: string;
  transactionDate: string;
}

interface EnrichedSignal {
  signal: TradeSignal;
  trade: Trade | null;
  quote: Quote | null;
}

function scoreColor(score: number): string {
  if (score >= 9) return "text-green-300";
  if (score >= 7) return "text-green-400";
  if (score >= 5) return "text-yellow-400";
  return "text-red-400";
}

function scoreRingColor(score: number): string {
  if (score >= 9) return "#4ade80";
  if (score >= 7) return "#86efac";
  if (score >= 5) return "#facc15";
  return "#f87171";
}

function ScoreRing({ score }: { score: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const fill = (score / 10) * circumference;
  const color = scoreRingColor(score);

  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg className="w-20 h-20 -rotate-90" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#374151" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - fill}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className="text-xs text-gray-500">/10</span>
      </div>
    </div>
  );
}

function RecBadge({ rec }: { rec: string }) {
  const colorMap: Record<string, string> = {
    "Strong Buy": "bg-green-600 text-green-100",
    Buy: "bg-emerald-700 text-emerald-100",
    Watch: "bg-yellow-700 text-yellow-100",
    Avoid: "bg-orange-700 text-orange-100",
    "Strong Avoid": "bg-red-700 text-red-100",
  };
  const color = colorMap[rec] ?? "bg-gray-700 text-gray-200";
  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${color}`}>{rec}</span>
  );
}

function TimeframePill({ timeframe }: { timeframe: string }) {
  return (
    <span className="inline-block px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs">
      {timeframe}
    </span>
  );
}

function HeroCard({ item }: { item: EnrichedSignal }) {
  const { signal, trade, quote } = item;
  if (!trade) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl p-5 flex gap-5">
      <ScoreRing score={signal.score} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <span className="font-mono text-xl font-bold text-brand-400">{trade.ticker}</span>
            <p className="text-xs text-gray-500 truncate">{trade.assetDescription}</p>
          </div>
          <RecBadge rec={signal.recommendation} />
        </div>
        <p className="text-xs text-gray-400 mb-2 leading-relaxed">{signal.reasoning}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <TimeframePill timeframe={signal.timeframe} />
          <span>Target: <span className="text-green-400 font-medium">{signal.targetPct}%</span></span>
          <span>Risk: <span className="text-yellow-400">{signal.riskLevel}</span></span>
          {quote && (
            <span className="flex items-center gap-1">
              ${quote.price.toFixed(2)}
              {quote.changePct >= 0
                ? <TrendingUp size={11} className="text-green-400" />
                : <TrendingDown size={11} className="text-red-400" />}
              <span className={quote.changePct >= 0 ? "text-green-400" : "text-red-400"}>
                {quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%
              </span>
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 mt-2">
          {trade.memberName} ({trade.party}, {trade.state}) —{" "}
          <span className="capitalize">{trade.tradeType}</span> on {trade.transactionDate}
        </p>
      </div>
    </div>
  );
}

type SortKey = "score" | "targetPct";

function SignalTable({ items }: { items: EnrichedSignal[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = [...items].sort((a, b) => {
    const av = sortKey === "score" ? a.signal.score : a.signal.targetPct;
    const bv = sortKey === "score" ? b.signal.score : b.signal.targetPct;
    return sortAsc ? av - bv : bv - av;
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((p) => !p);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortAsc ? <ChevronUp size={13} /> : <ChevronDown size={13} />
    ) : null;

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 select-none"
                onClick={() => toggleSort("score")}
              >
                <span className="flex items-center gap-1">Score <SortIcon k="score" /></span>
              </th>
              <th className="px-4 py-3 text-left">Ticker</th>
              <th className="px-4 py-3 text-left">Recommendation</th>
              <th className="px-4 py-3 text-left">Timeframe</th>
              <th
                className="px-4 py-3 text-left cursor-pointer hover:text-gray-200 select-none"
                onClick={() => toggleSort("targetPct")}
              >
                <span className="flex items-center gap-1">Target % <SortIcon k="targetPct" /></span>
              </th>
              <th className="px-4 py-3 text-left">Risk</th>
              <th className="px-4 py-3 text-left">Member</th>
              <th className="px-4 py-3 text-left">Price</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, i) => {
              if (!item.trade) return null;
              return (
                <tr key={i} className="border-b border-gray-800 hover:bg-gray-800 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-base font-bold ${scoreColor(item.signal.score)}`}>
                      {item.signal.score}
                    </span>
                    <span className="text-xs text-gray-600">/10</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-brand-400">{item.trade.ticker}</span>
                  </td>
                  <td className="px-4 py-3">
                    <RecBadge rec={item.signal.recommendation} />
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{item.signal.timeframe}</td>
                  <td className="px-4 py-3 text-green-400 font-medium">
                    {item.signal.targetPct > 0 ? "+" : ""}{item.signal.targetPct}%
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs font-medium ${
                        item.signal.riskLevel === "Low"
                          ? "text-green-400"
                          : item.signal.riskLevel === "High"
                            ? "text-red-400"
                            : "text-yellow-400"
                      }`}
                    >
                      {item.signal.riskLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {item.trade.memberName}
                    <div className="text-gray-600">{item.trade.party}, {item.trade.state}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 text-sm">
                    {item.quote ? `$${item.quote.price.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-300 hover:text-white transition-colors"
      >
        <span>How the Signal Engine Works</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="px-5 pb-5 text-sm text-gray-400 space-y-3 border-t border-gray-800 pt-4">
          <div>
            <p className="font-semibold text-gray-200 mb-1">STOCK Act Disclosures</p>
            <p>
              The Stop Trading on Congressional Knowledge (STOCK) Act requires members of Congress
              to disclose stock trades within 45 days of the transaction. These disclosures are
              public and accessible via HouseStockWatcher and SenateStockWatcher APIs.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-200 mb-1">Scoring Methodology</p>
            <p>
              Each trade is submitted to an Ollama-hosted LLM (llama3.1:8b) along with current
              market data (price, % change). The model analyzes factors such as the member's
              party affiliation, state, trade type (buy vs sell), amount range, days to disclose,
              and current market conditions. It returns a score from 1–10, a recommendation,
              projected timeframe, and estimated target percentage gain.
            </p>
          </div>
          <div>
            <p className="font-semibold text-gray-200 mb-1">Limitations</p>
            <p>
              Congressional trading signals are not a guarantee of future performance. Scores
              are AI-generated estimates for educational purposes only and should not be considered
              professional financial advice. Always perform your own due diligence.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignalDashboard() {
  const [items, setItems] = useState<EnrichedSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSignals = async () => {
    try {
      const res = await signalsApi.getTop(20);
      setItems(res.data as EnrichedSignal[]);
    } catch (err) {
      console.error("Failed to load signals", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchSignals().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await signalsApi.refresh();
      await fetchSignals();
    } catch (err) {
      console.error("Failed to refresh signals", err);
    } finally {
      setRefreshing(false);
    }
  };

  const heroItems = items.slice(0, 3);
  const tableItems = items.filter((item) => item.signal.score >= 5);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={24} className="text-brand-400" />
          <div>
            <h2 className="text-2xl font-semibold text-white">Signal Engine — Top Opportunities Now</h2>
            <p className="text-sm text-gray-400">
              AI-scored trades based on congressional disclosures + market data
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Scoring..." : "Refresh Signals"}
        </button>
      </div>

      {/* Hero section */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-gray-800 border border-gray-700 rounded-2xl p-5 animate-pulse h-36" />
          ))}
        </div>
      ) : heroItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {heroItems.map((item, i) => (
            <HeroCard key={i} item={item} />
          ))}
        </div>
      ) : (
        <div className="bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center">
          <Zap size={32} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 font-medium">No scored signals yet</p>
          <p className="text-sm text-gray-600 mt-1">
            Click "Refresh Signals" to score congressional trades with AI
          </p>
        </div>
      )}

      {/* Full table */}
      {!loading && tableItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            All Signals (Score &ge; 5)
          </h3>
          <SignalTable items={tableItems} />
        </div>
      )}

      {/* How it works */}
      <HowItWorks />
    </div>
  );
}
