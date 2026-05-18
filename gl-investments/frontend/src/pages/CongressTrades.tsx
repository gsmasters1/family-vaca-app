import { useEffect, useState } from "react";
import { RefreshCw, ChevronDown, ChevronRight, Landmark } from "lucide-react";
import { congressApi } from "../services/api";

interface TradeSignal {
  score: number;
  recommendation: string;
  timeframe: string;
  reasoning: string;
  targetPct: number;
  riskLevel: string;
  scoredAt: string;
}

interface CongressTrade {
  id: string;
  source: "house" | "senate";
  memberName: string;
  party: string;
  state: string;
  ticker: string;
  assetDescription: string;
  tradeType: "purchase" | "sale" | "sale_partial" | "exchange";
  amountRange: string;
  transactionDate: string;
  disclosureDate: string;
  daysToDisclose: number;
  signal: TradeSignal | null;
}

type FilterOption = "all" | "house" | "senate" | "purchases" | "sales" | "signals";

const FILTERS: { value: FilterOption; label: string }[] = [
  { value: "all", label: "All" },
  { value: "house", label: "House" },
  { value: "senate", label: "Senate" },
  { value: "purchases", label: "Purchases" },
  { value: "sales", label: "Sales" },
  { value: "signals", label: "Score ≥ 7" },
];

function PartyBadge({ party }: { party: string }) {
  const p = party.toUpperCase();
  const color =
    p === "D" || p === "DEM" || p === "DEMOCRAT"
      ? "bg-blue-600 text-white"
      : p === "R" || p === "REP" || p === "REPUBLICAN"
        ? "bg-red-600 text-white"
        : "bg-gray-600 text-white";
  const label =
    p === "D" || p === "DEM" || p === "DEMOCRAT"
      ? "D"
      : p === "R" || p === "REP" || p === "REPUBLICAN"
        ? "R"
        : p.slice(0, 1) || "I";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {label}
    </span>
  );
}

function TradeTypeBadge({ type }: { type: string }) {
  const isPurchase = type === "purchase";
  const isPartial = type === "sale_partial";
  const label = isPurchase
    ? "BUY"
    : isPartial
      ? "SELL (P)"
      : type === "exchange"
        ? "SWAP"
        : "SELL";
  const color = isPurchase
    ? "bg-green-700 text-green-100"
    : type === "exchange"
      ? "bg-yellow-700 text-yellow-100"
      : "bg-red-700 text-red-100";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function ScoreGauge({ score }: { score: number | undefined }) {
  if (score === undefined || score === null) {
    return <span className="text-gray-500 text-xs">—</span>;
  }
  const color =
    score >= 8
      ? "text-green-400"
      : score >= 6
        ? "text-yellow-400"
        : score >= 4
          ? "text-orange-400"
          : "text-red-400";
  return (
    <span className={`font-bold text-lg ${color}`} title={`Score: ${score}/10`}>
      {score}
      <span className="text-xs text-gray-500">/10</span>
    </span>
  );
}

function RecommendationBadge({ rec }: { rec: string | undefined }) {
  if (!rec) return <span className="text-gray-600 text-xs">—</span>;
  const colorMap: Record<string, string> = {
    "Strong Buy": "bg-green-600 text-green-100",
    Buy: "bg-emerald-700 text-emerald-100",
    Watch: "bg-yellow-700 text-yellow-100",
    Avoid: "bg-orange-700 text-orange-100",
    "Strong Avoid": "bg-red-700 text-red-100",
  };
  const color = colorMap[rec] ?? "bg-gray-700 text-gray-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${color}`}>
      {rec}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-gray-800 animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-700 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

function StatsBar({ trades }: { trades: CongressTrade[] }) {
  const now = new Date();
  const thisMonth = trades.filter((t) => {
    const d = new Date(t.transactionDate);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const buyerCounts: Record<string, number> = {};
  const sellerCounts: Record<string, number> = {};
  trades.forEach((t) => {
    if (t.tradeType === "purchase") {
      buyerCounts[t.memberName] = (buyerCounts[t.memberName] ?? 0) + 1;
    } else if (t.tradeType === "sale" || t.tradeType === "sale_partial") {
      sellerCounts[t.memberName] = (sellerCounts[t.memberName] ?? 0) + 1;
    }
  });

  const topBuyer = Object.entries(buyerCounts).sort((a, b) => b[1] - a[1])[0];
  const topSeller = Object.entries(sellerCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Trades This Month</p>
        <p className="text-2xl font-bold text-white">{thisMonth.length}</p>
      </div>
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Top Buyer</p>
        <p className="text-sm font-semibold text-green-400 truncate">
          {topBuyer ? `${topBuyer[0]} (${topBuyer[1]})` : "—"}
        </p>
      </div>
      <div className="bg-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Top Seller</p>
        <p className="text-sm font-semibold text-red-400 truncate">
          {topSeller ? `${topSeller[0]} (${topSeller[1]})` : "—"}
        </p>
      </div>
    </div>
  );
}

export default function CongressTrades() {
  const [trades, setTrades] = useState<CongressTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterOption>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchTrades = async (activeFilter: FilterOption) => {
    setLoading(true);
    try {
      const res = await congressApi.getTrades(50, activeFilter === "all" ? undefined : activeFilter);
      setTrades(res.data as CongressTrade[]);
    } catch (err) {
      console.error("Failed to load congress trades", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrades(filter);
  }, [filter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await congressApi.refresh();
      await fetchTrades(filter);
    } catch (err) {
      console.error("Failed to refresh congress trades", err);
    } finally {
      setRefreshing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Landmark size={24} className="text-brand-400" />
          <div>
            <h2 className="text-2xl font-semibold text-white">Congress Trades</h2>
            <p className="text-sm text-gray-400">STOCK Act disclosures from House & Senate</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh Data"}
        </button>
      </div>

      {/* Stats bar */}
      {!loading && <StatsBar trades={trades} />}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === value
                ? "bg-brand-600 text-white"
                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Party</th>
                <th className="px-4 py-3 text-left">Ticker</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">AI Score</th>
                <th className="px-4 py-3 text-left">Recommendation</th>
                <th className="px-4 py-3 text-left">Timeframe</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                : trades.length === 0
                  ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No trades found.
                      </td>
                    </tr>
                  )
                  : trades.map((trade) => {
                    const isExpanded = expanded.has(trade.id);
                    return (
                      <>
                        <tr
                          key={trade.id}
                          onClick={() => toggleExpand(trade.id)}
                          className="border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
                              ) : (
                                <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
                              )}
                              <span className="font-medium text-gray-100 truncate max-w-[160px]">
                                {trade.memberName}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 pl-5 capitalize">{trade.source}</div>
                          </td>
                          <td className="px-4 py-3">
                            <PartyBadge party={trade.party} />
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-brand-400">{trade.ticker}</span>
                          </td>
                          <td className="px-4 py-3">
                            <TradeTypeBadge type={trade.tradeType} />
                          </td>
                          <td className="px-4 py-3 text-gray-300 text-xs">{trade.amountRange}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{trade.transactionDate}</td>
                          <td className="px-4 py-3">
                            <ScoreGauge score={trade.signal?.score} />
                          </td>
                          <td className="px-4 py-3">
                            <RecommendationBadge rec={trade.signal?.recommendation} />
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {trade.signal?.timeframe ?? "—"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${trade.id}-expanded`} className="border-b border-gray-800 bg-gray-850">
                            <td colSpan={9} className="px-8 py-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Asset</p>
                                  <p className="text-sm text-gray-200">{trade.assetDescription}</p>
                                  <p className="text-xs text-gray-500 mt-2">
                                    Disclosed {trade.daysToDisclose} days after transaction
                                  </p>
                                </div>
                                {trade.signal ? (
                                  <div className="bg-gray-800 rounded-lg p-3">
                                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">
                                      AI Analysis
                                    </p>
                                    <p className="text-sm text-gray-200 leading-relaxed">
                                      {trade.signal.reasoning}
                                    </p>
                                    <div className="flex gap-4 mt-2 text-xs text-gray-400">
                                      <span>Target: <span className="text-green-400">{trade.signal.targetPct}%</span></span>
                                      <span>Risk: <span className="text-yellow-400">{trade.signal.riskLevel}</span></span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-gray-800 rounded-lg p-3 flex items-center justify-center">
                                    <p className="text-xs text-gray-500">No AI analysis yet</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
