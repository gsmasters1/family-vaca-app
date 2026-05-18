import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Gem, RefreshCw } from "lucide-react";
import { commoditiesApi } from "../services/api";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  assetType: string;
}

interface CommodityCategory {
  category: string;
  label: string;
  whyItMatters: string;
  symbols: string[];
  quotes: Quote[];
}

function formatPrice(price: number, symbol: string): string {
  if (symbol === "^TNX" || symbol === "^IRX") {
    return `${price.toFixed(3)}%`;
  }
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

function ChangeIndicator({ changePct }: { changePct: number }) {
  const positive = changePct >= 0;
  return (
    <span
      className={`flex items-center gap-0.5 text-sm font-medium ${
        positive ? "text-green-400" : "text-red-400"
      }`}
    >
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {positive ? "+" : ""}
      {changePct.toFixed(2)}%
    </span>
  );
}

function QuoteRow({ quote }: { quote: Quote }) {
  const isRate = quote.symbol === "^TNX" || quote.symbol === "^IRX";
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-brand-400">{quote.symbol}</span>
          {isRate && (
            <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">RATE</span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate max-w-[180px]">{quote.name}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-semibold text-gray-100">{formatPrice(quote.price, quote.symbol)}</p>
        <ChangeIndicator changePct={quote.changePct} />
      </div>
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  gold: "🥇",
  silver: "🥈",
  lithium: "⚡",
  bonds: "📊",
  metals: "🔧",
};

const CATEGORY_COLORS: Record<string, string> = {
  gold: "border-yellow-600/40 bg-yellow-950/20",
  silver: "border-gray-500/40 bg-gray-900/40",
  lithium: "border-emerald-600/40 bg-emerald-950/20",
  bonds: "border-blue-600/40 bg-blue-950/20",
  metals: "border-orange-600/40 bg-orange-950/20",
};

const CATEGORY_HEADER: Record<string, string> = {
  gold: "text-yellow-400",
  silver: "text-gray-300",
  lithium: "text-emerald-400",
  bonds: "text-blue-400",
  metals: "text-orange-400",
};

function CommodityCard({ category }: { category: CommodityCategory }) {
  const icon = CATEGORY_ICONS[category.category] ?? "📈";
  const cardColor = CATEGORY_COLORS[category.category] ?? "border-gray-700 bg-gray-900/40";
  const headerColor = CATEGORY_HEADER[category.category] ?? "text-white";

  return (
    <div className={`rounded-xl border p-4 ${cardColor}`}>
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{icon}</span>
          <h3 className={`text-base font-bold ${headerColor}`}>{category.label}</h3>
        </div>
        <p className="text-xs text-gray-400 italic">{category.whyItMatters}</p>
      </div>

      <div>
        {category.quotes.length === 0 ? (
          <p className="text-xs text-gray-600 py-4 text-center">No data available</p>
        ) : (
          category.quotes.map((quote) => <QuoteRow key={quote.symbol} quote={quote} />)
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 animate-pulse">
      <div className="h-5 bg-gray-700 rounded w-1/3 mb-2" />
      <div className="h-3 bg-gray-800 rounded w-3/4 mb-4" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex justify-between py-2.5 border-b border-gray-800">
          <div className="space-y-1">
            <div className="h-3 bg-gray-700 rounded w-16" />
            <div className="h-3 bg-gray-800 rounded w-24" />
          </div>
          <div className="space-y-1 text-right">
            <div className="h-3 bg-gray-700 rounded w-16" />
            <div className="h-3 bg-gray-800 rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Commodities() {
  const [categories, setCategories] = useState<CommodityCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const res = await commoditiesApi.getAll();
      setCategories(res.data as CommodityCategory[]);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to load commodities", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gem size={24} className="text-brand-400" />
          <div>
            <h2 className="text-2xl font-semibold text-white">Commodities</h2>
            <p className="text-sm text-gray-400">
              Precious metals, battery metals, and bond yields
              {lastUpdated && (
                <span className="ml-2 text-gray-600">
                  — updated {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Updating..." : "Refresh"}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)
          : categories.map((cat) => <CommodityCard key={cat.category} category={cat} />)}
      </div>

      {/* Info footer */}
      {!loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500">
          <p>
            Prices sourced via Yahoo Finance. Futures symbols (GC=F, SI=F, HG=F) are front-month
            contracts. Yield symbols (^TNX, ^IRX) represent annualized Treasury yields in percent.
            Data may be delayed by 15-20 minutes during market hours.
          </p>
        </div>
      )}
    </div>
  );
}
