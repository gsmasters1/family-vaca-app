import { useEffect, useState } from "react";
import { Building, RefreshCw, ChevronUp, ChevronDown, Info } from "lucide-react";
import axios from "axios";

interface HedgeFundHolding {
  fundName: string;
  ticker: string;
  valueUsd: number;
  shares: number;
  pctOfPortfolio: number;
  reportedAt: string;
}

interface TopHolding {
  ticker: string;
  fundsCount: number;
  totalValue: number;
}

interface HedgeFundSummary {
  funds: string[];
  holdings: HedgeFundHolding[];
  lastUpdated: string;
  topHoldings: TopHolding[];
}

type SortKey = "fundName" | "ticker" | "valueUsd" | "pctOfPortfolio";
type SortDir = "asc" | "desc";

function consensusBadge(fundsCount: number): { label: string; color: string; bg: string } {
  if (fundsCount >= 4) return { label: `${fundsCount} funds`, color: "text-red-300",    bg: "bg-red-900/40 border-red-700/50" };
  if (fundsCount >= 3) return { label: `${fundsCount} funds`, color: "text-orange-300", bg: "bg-orange-900/40 border-orange-700/50" };
  return                       { label: `${fundsCount} funds`, color: "text-yellow-300", bg: "bg-yellow-900/30 border-yellow-700/50" };
}

function formatValue(valueUsd: number): string {
  const billions = (valueUsd * 1000) / 1_000_000_000;
  if (billions >= 1) return `$${billions.toFixed(2)}B`;
  const millions = (valueUsd * 1000) / 1_000_000;
  if (millions >= 1) return `$${millions.toFixed(1)}M`;
  return `$${(valueUsd * 1000).toLocaleString()}`;
}

function formatTotalValue(valueUsd: number): string {
  const billions = valueUsd / 1_000_000_000;
  if (billions >= 1) return `$${billions.toFixed(2)}B`;
  const millions = valueUsd / 1_000_000;
  if (millions >= 1) return `$${millions.toFixed(1)}M`;
  return `$${valueUsd.toLocaleString()}`;
}

function SkeletonRow() {
  return (
    <tr className="border-t border-gray-800 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-800 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export default function HedgeFundTracker() {
  const [summary, setSummary] = useState<HedgeFundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("valueUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const loadData = async () => {
    try {
      const res = await axios.get("/api/sectors/hedge-funds");
      setSummary(res.data as HedgeFundSummary);
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

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedHoldings = summary
    ? [...summary.holdings].sort((a, b) => {
        let cmp = 0;
        if (sortKey === "fundName") cmp = a.fundName.localeCompare(b.fundName);
        else if (sortKey === "ticker") cmp = a.ticker.localeCompare(b.ticker);
        else if (sortKey === "valueUsd") cmp = a.valueUsd - b.valueUsd;
        else if (sortKey === "pctOfPortfolio") cmp = a.pctOfPortfolio - b.pctOfPortfolio;
        return sortDir === "asc" ? cmp : -cmp;
      })
    : [];

  const lastUpdated = summary?.lastUpdated ? new Date(summary.lastUpdated) : null;

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronDown size={12} className="text-gray-600 inline ml-1" />;
    return sortDir === "desc"
      ? <ChevronDown size={12} className="text-brand-400 inline ml-1" />
      : <ChevronUp size={12} className="text-brand-400 inline ml-1" />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">Hedge Fund 13F Tracker</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            What Berkshire, Citadel, Bridgewater and Renaissance actually own — 45-day lag but still the best signal of where smart money was
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-400 rounded-lg text-sm font-medium border border-gray-700 transition-colors"
          title="13F data updates quarterly"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh 13F Data"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-24 bg-gray-800 rounded-full animate-pulse" />
            ))}
          </div>
          <div className="h-40 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
        </div>
      ) : summary ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">Tracking:</span>
            {summary.funds.map((fund) => (
              <span key={fund} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 border border-gray-700 text-gray-300">
                {fund}
              </span>
            ))}
            {lastUpdated && (
              <span className="text-xs text-gray-600 ml-2">
                Last updated: {lastUpdated.toLocaleDateString()}
              </span>
            )}
          </div>

          {summary.topHoldings && summary.topHoldings.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 text-gray-300">Smart Money Consensus — Held by Multiple Funds</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {summary.topHoldings.slice(0, 10).map((h) => {
                  const badge = consensusBadge(h.fundsCount);
                  return (
                    <div key={h.ticker} className={`flex items-center justify-between p-3 rounded-lg border bg-gray-950 ${badge.bg}`}>
                      <div>
                        <span className="font-mono font-bold text-base text-white">{h.ticker}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{formatTotalValue(h.totalValue)} disclosed</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.bg} ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300">All Holdings</h3>
              <span className="text-xs text-gray-600">{summary.holdings.length} positions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th
                      className="px-4 py-2.5 text-left font-medium cursor-pointer hover:text-gray-300 select-none"
                      onClick={() => toggleSort("fundName")}
                    >
                      Fund <SortIcon col="fundName" />
                    </th>
                    <th
                      className="px-4 py-2.5 text-left font-medium cursor-pointer hover:text-gray-300 select-none"
                      onClick={() => toggleSort("ticker")}
                    >
                      Ticker <SortIcon col="ticker" />
                    </th>
                    <th
                      className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-gray-300 select-none"
                      onClick={() => toggleSort("valueUsd")}
                    >
                      Value <SortIcon col="valueUsd" />
                    </th>
                    <th
                      className="px-4 py-2.5 text-right font-medium cursor-pointer hover:text-gray-300 select-none"
                      onClick={() => toggleSort("pctOfPortfolio")}
                    >
                      % of Portfolio <SortIcon col="pctOfPortfolio" />
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">Reported</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoldings.length === 0
                    ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                    : sortedHoldings.map((h, i) => (
                        <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{h.fundName}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-brand-400">{h.ticker}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300 font-mono text-xs">
                            {formatValue(h.valueUsd)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-mono text-xs ${h.pctOfPortfolio >= 5 ? "text-brand-400" : "text-gray-400"}`}>
                              {h.pctOfPortfolio.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600">
                            {h.reportedAt ? new Date(h.reportedAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-16">
          <Building size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">No 13F data loaded. Click Refresh 13F Data to fetch latest filings.</p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-brand-400" />
          <span className="text-gray-400 font-medium text-sm">About 13F Filings</span>
        </div>
        <p>
          13F filings are required within 45 days of quarter end for any institutional investment manager with &gt;$100M in equity AUM. Positions shown reflect holdings as of the reporting date, not today.
        </p>
        <p>
          <span className="text-brand-400 font-medium">How to use this:</span> The consensus positions (held by 2+ funds simultaneously) represent the highest-conviction ideas in smart money. These are not timing signals — funds may have since exited. Use as a long-term conviction filter, not a trigger.
        </p>
      </div>
    </div>
  );
}
