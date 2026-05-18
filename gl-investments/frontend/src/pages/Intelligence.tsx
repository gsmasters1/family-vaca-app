import { useEffect, useState } from "react";
import { RefreshCw, Shield, AlertTriangle, XCircle, Info, TrendingUp, TrendingDown, Minus, ExternalLink } from "lucide-react";
import axios from "axios";

interface IntelItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
  tickers: string[];
  category: string;
  trustScore: number;
  trustTier: string;
  flags: string[];
  sentiment: "bullish" | "bearish" | "neutral";
}

interface FearGreed {
  score: number;
  label: string;
  timestamp: string;
}

type TierFilter = "ALL" | "VERIFIED" | "RELIABLE" | "MIXED" | "NOISE";
type SentimentFilter = "all" | "bullish" | "bearish" | "neutral";

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  VERIFIED: { label: "Verified", color: "text-green-400", bg: "bg-green-900/40 border-green-800", icon: <Shield size={12} /> },
  RELIABLE: { label: "Reliable", color: "text-blue-400",  bg: "bg-blue-900/40 border-blue-800",  icon: <Shield size={12} /> },
  MIXED:    { label: "Mixed",    color: "text-yellow-400",bg: "bg-yellow-900/30 border-yellow-800",icon: <Info size={12} /> },
  NOISE:    { label: "Noise",    color: "text-orange-400",bg: "bg-orange-900/30 border-orange-800",icon: <AlertTriangle size={12} /> },
  TRASH:    { label: "Trash",    color: "text-red-400",   bg: "bg-red-900/30 border-red-800",    icon: <XCircle size={12} /> },
};

export default function Intelligence() {
  const [feed, setFeed] = useState<IntelItem[]>([]);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tierFilter, setTierFilter] = useState<TierFilter>("ALL");
  const [sentFilter, setSentFilter] = useState<SentimentFilter>("all");
  const [catFilter, setCatFilter] = useState("all");
  const [minScore, setMinScore] = useState(40);

  const load = async () => {
    const [f, fg] = await Promise.all([
      axios.get(`/api/intelligence/feed?minScore=${minScore}&limit=150`),
      axios.get("/api/intelligence/fear-greed"),
    ]);
    setFeed(f.data);
    setFearGreed(fg.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [minScore]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await axios.post("/api/intelligence/refresh");
    await load();
    setRefreshing(false);
  };

  const displayed = feed.filter((item) => {
    if (tierFilter !== "ALL" && item.trustTier !== tierFilter) return false;
    if (sentFilter !== "all" && item.sentiment !== sentFilter) return false;
    if (catFilter !== "all" && item.category !== catFilter) return false;
    return true;
  });

  const categories = ["all", ...new Set(feed.map((i) => i.category))];

  const tierCounts = feed.reduce<Record<string, number>>((acc, i) => {
    acc[i.trustTier] = (acc[i.trustTier] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Intelligence Feed</h2>
          <p className="text-gray-500 text-sm mt-1">
            Real data only — SEC, Fed, Reuters, AP. Sales trash auto-filtered.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Scrape Now
        </button>
      </div>

      {/* Fear & Greed + Trust breakdown */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {fearGreed && (
          <div className="col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Fear & Greed Index</p>
            <div className="flex items-end gap-3">
              <p className={`text-4xl font-bold ${
                fearGreed.score >= 75 ? "text-green-400" :
                fearGreed.score >= 55 ? "text-brand-400" :
                fearGreed.score >= 45 ? "text-gray-300" :
                fearGreed.score >= 25 ? "text-orange-400" : "text-red-400"
              }`}>{fearGreed.score}</p>
              <p className="text-gray-400 text-lg capitalize pb-1">{fearGreed.label}</p>
            </div>
            <FearGreedBar score={fearGreed.score} />
          </div>
        )}
        {(["VERIFIED", "RELIABLE"] as const).map((tier) => {
          const cfg = TIER_CONFIG[tier];
          return (
            <div key={tier} className={`border rounded-xl p-4 ${cfg.bg}`}>
              <div className={`flex items-center gap-1 text-xs mb-1 ${cfg.color}`}>
                {cfg.icon}{cfg.label}
              </div>
              <p className="text-2xl font-bold">{tierCounts[tier] ?? 0}</p>
              <p className="text-xs text-gray-500">items in feed</p>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1">
          {(["ALL", "VERIFIED", "RELIABLE", "MIXED", "NOISE"] as TierFilter[]).map((t) => {
            const cfg = t === "ALL" ? null : TIER_CONFIG[t];
            return (
              <button
                key={t}
                onClick={() => setTierFilter(t)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  tierFilter === t
                    ? "bg-brand-600 border-brand-600 text-white"
                    : `border-gray-700 text-gray-400 hover:bg-gray-800 ${cfg?.color ?? ""}`
                }`}
              >
                {t === "ALL" ? `All (${feed.length})` : `${t} (${tierCounts[t] ?? 0})`}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1 ml-2">
          {(["all", "bullish", "bearish", "neutral"] as SentimentFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setSentFilter(s)}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${
                sentFilter === s ? "bg-gray-700 border-gray-600" : "border-gray-800 text-gray-500 hover:bg-gray-900"
              }`}
            >
              {s === "bullish" ? "🟢" : s === "bearish" ? "🔴" : s === "neutral" ? "⚪" : "All Sentiment"}
            </button>
          ))}
        </div>

        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-gray-400 ml-auto"
        >
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Min trust:</span>
          <input
            type="range" min="0" max="80" step="10" value={minScore}
            onChange={(e) => setMinScore(parseInt(e.target.value))}
            className="w-20"
          />
          <span>{minScore}</span>
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="text-gray-500 text-sm">Loading intelligence feed...</div>
      ) : displayed.length === 0 ? (
        <div className="text-center text-gray-600 py-16">
          No items match your filters. Click "Scrape Now" to fetch fresh data.
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((item) => (
            <IntelCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function IntelCard({ item }: { item: IntelItem }) {
  const cfg = TIER_CONFIG[item.trustTier] ?? TIER_CONFIG.NOISE;
  const age = getAge(item.publishedAt);

  return (
    <div className={`border rounded-xl p-4 ${cfg.bg} transition-colors hover:opacity-90`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <TrustBadge tier={item.trustTier} score={item.trustScore} />
            <SentimentIcon sentiment={item.sentiment} />
            <span className="text-xs text-gray-600">{item.source}</span>
            <span className="text-xs text-gray-700">{age}</span>
            {item.tickers.map((t) => (
              <span key={t} className="text-xs font-mono bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-300">{t}</span>
            ))}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:text-brand-400 transition-colors line-clamp-2 group"
          >
            {item.title}
            <ExternalLink size={11} className="inline ml-1 opacity-0 group-hover:opacity-100" />
          </a>
          {item.summary && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.summary}</p>
          )}
          {item.flags.includes("MARKETING_COPY") && (
            <p className="text-xs text-red-400 mt-1">⚠ Contains marketing language</p>
          )}
          {item.flags.includes("DATA_RICH") && (
            <p className="text-xs text-green-400 mt-1">✓ Contains specific financial data</p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-lg font-bold ${cfg.color}`}>{item.trustScore}</p>
          <p className="text-xs text-gray-600">trust</p>
        </div>
      </div>
    </div>
  );
}

function TrustBadge({ tier, score }: { tier: string; score: number }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.NOISE;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label} {score}
    </span>
  );
}

function SentimentIcon({ sentiment }: { sentiment: string }) {
  if (sentiment === "bullish") return <TrendingUp size={14} className="text-green-400" />;
  if (sentiment === "bearish") return <TrendingDown size={14} className="text-red-400" />;
  return <Minus size={14} className="text-gray-500" />;
}

function FearGreedBar({ score }: { score: number }) {
  const colors = ["bg-red-600", "bg-orange-500", "bg-yellow-500", "bg-brand-500", "bg-green-500"];
  const labels = ["Extreme Fear", "Fear", "Neutral", "Greed", "Extreme Greed"];
  const idx = Math.floor(score / 20);
  return (
    <div className="mt-2">
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
        {colors.map((c, i) => (
          <div key={i} className={`flex-1 ${c} ${i <= idx ? "opacity-100" : "opacity-20"}`} />
        ))}
      </div>
      <p className="text-xs text-gray-600 mt-1">{labels[Math.min(idx, 4)]}</p>
    </div>
  );
}

function getAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
