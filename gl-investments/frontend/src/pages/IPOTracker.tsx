import { useEffect, useState } from "react";
import { RefreshCw, AlertTriangle, Clock, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import axios from "axios";

interface IpoFiling {
  id: string;
  companyName: string;
  ticker: string;
  filingDate: string;
  formType: string;
  estimatedIpoDate: string;
  priceRangeLow: number;
  priceRangeHigh: number;
  aiScore: number;
  aiAnalysis: string;
  status: string;
  lockupExpiry: string;
  daysUntilLockupExpiry: number;
}

export default function IPOTracker() {
  const [filings, setFilings] = useState<IpoFiling[]>([]);
  const [lockupExpiring, setLockupExpiring] = useState<IpoFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scoring, setScoring] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "scored" | "lockup">("all");

  const load = async () => {
    const [f, l] = await Promise.all([
      axios.get("/api/ipo/filings"),
      axios.get("/api/ipo/lockup-expiring?within=60"),
    ]);
    setFilings(f.data);
    setLockupExpiring(l.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await axios.get("/api/ipo/filings/refresh");
    await load();
    setRefreshing(false);
  };

  const handleScore = async (id: string) => {
    setScoring(id);
    const res = await axios.post(`/api/ipo/score/${id}`);
    setFilings((prev) => prev.map((f) => (f.id === id ? res.data : f)));
    setScoring(null);
  };

  const displayed = filings.filter((f) => {
    if (filter === "scored") return f.aiScore > 0;
    if (filter === "lockup") return f.daysUntilLockupExpiry > 0 && f.daysUntilLockupExpiry <= 60;
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">IPO Tracker</h2>
          <p className="text-gray-500 text-sm mt-1">
            SEC EDGAR S-1 filings — get in early, exit before lock-up expires
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh SEC Data
        </button>
      </div>

      {lockupExpiring.length > 0 && (
        <div className="bg-amber-950 border border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-400 font-medium mb-3">
            <AlertTriangle size={16} />
            Lock-up Expirations in Next 60 Days — Potential Selling Pressure
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lockupExpiring.map((f) => (
              <div key={f.id} className="bg-amber-900/40 rounded-lg p-3 text-sm">
                <p className="font-semibold text-amber-200">{f.companyName}</p>
                <div className="flex items-center gap-1 text-amber-400 mt-1">
                  <Clock size={12} />
                  <span>Lock-up expires in {f.daysUntilLockupExpiry} days ({f.lockupExpiry})</span>
                </div>
                <p className="text-amber-500 text-xs mt-1">
                  Consider exiting before insiders can sell
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {(["all", "scored", "lockup"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
              filter === f
                ? "bg-brand-600 text-white"
                : "text-gray-400 hover:bg-gray-800"
            }`}
          >
            {f === "all" ? "All Filings" : f === "scored" ? "AI Scored" : "Lock-up Expiring"}
          </button>
        ))}
        <span className="text-gray-600 text-sm ml-2">{displayed.length} results</span>
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Fetching SEC EDGAR filings...</div>
      ) : (
        <div className="space-y-2">
          {displayed.map((filing) => (
            <div
              key={filing.id}
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
            >
              <div
                className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-800/50"
                onClick={() => setExpanded(expanded === filing.id ? null : filing.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold truncate">{filing.companyName}</p>
                    <span className="text-xs px-2 py-0.5 bg-gray-800 rounded-full text-gray-400 flex-shrink-0">
                      {filing.formType}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Filed {filing.filingDate}</p>
                </div>

                <div className="flex items-center gap-4 flex-shrink-0">
                  {filing.daysUntilLockupExpiry > 0 && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Lock-up expires</p>
                      <p
                        className={`text-sm font-medium ${
                          filing.daysUntilLockupExpiry <= 30
                            ? "text-amber-400"
                            : "text-gray-300"
                        }`}
                      >
                        {filing.daysUntilLockupExpiry}d
                      </p>
                    </div>
                  )}

                  {filing.aiScore > 0 ? (
                    <ScoreBadge score={filing.aiScore} />
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleScore(filing.id); }}
                      disabled={scoring === filing.id}
                      className="text-xs px-3 py-1.5 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-40 flex items-center gap-1"
                    >
                      <TrendingUp size={12} />
                      {scoring === filing.id ? "Scoring..." : "AI Score"}
                    </button>
                  )}

                  {expanded === filing.id ? (
                    <ChevronUp size={16} className="text-gray-500" />
                  ) : (
                    <ChevronDown size={16} className="text-gray-500" />
                  )}
                </div>
              </div>

              {expanded === filing.id && filing.aiAnalysis && (
                <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                  <p className="text-sm text-gray-300 leading-relaxed">{filing.aiAnalysis}</p>
                  {filing.lockupExpiry && (
                    <p className="text-xs text-amber-400 mt-2">
                      180-day lock-up expiry estimate: {filing.lockupExpiry}
                      {filing.daysUntilLockupExpiry > 0
                        ? ` (${filing.daysUntilLockupExpiry} days away)`
                        : " (expired)"}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 8 ? "text-green-400 bg-green-900/50" :
    score >= 6 ? "text-brand-400 bg-brand-900/50" :
    score >= 4 ? "text-yellow-400 bg-yellow-900/50" :
    "text-red-400 bg-red-900/50";
  return (
    <span className={`text-sm font-bold px-2 py-1 rounded-lg ${color}`}>
      {score}/10
    </span>
  );
}
