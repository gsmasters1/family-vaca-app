import { useEffect, useState, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Globe, Flame, RefreshCw } from "lucide-react";
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

const INDEX_SYMBOLS = new Set(["^FTSE", "^GDAXI", "^N225", "^HSI", "^GSPC", "^DJI", "^IXIC"]);
const RATE_SYMBOLS = new Set(["^TNX", "^IRX"]);

function formatPrice(price: number, symbol: string): string {
  if (RATE_SYMBOLS.has(symbol)) return `${price.toFixed(3)}%`;
  if (INDEX_SYMBOLS.has(symbol)) {
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1000) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

function ChangeIndicator({ changePct }: { changePct: number }) {
  const positive = changePct >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-sm font-medium ${positive ? "text-green-400" : "text-red-400"}`}>
      {positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {positive ? "+" : ""}
      {changePct.toFixed(2)}%
    </span>
  );
}

function QuoteRow({ quote }: { quote: Quote }) {
  const isRate = RATE_SYMBOLS.has(quote.symbol);
  const isIndex = INDEX_SYMBOLS.has(quote.symbol);

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-brand-400">{quote.symbol}</span>
          {isRate && <span className="text-xs bg-blue-900 text-blue-300 px-1.5 py-0.5 rounded">RATE</span>}
          {isIndex && <span className="text-xs bg-purple-900 text-purple-300 px-1.5 py-0.5 rounded">INDEX</span>}
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
  energy: "🛢️",
  "clean-energy": "☀️",
  "global-indices": "🌐",
  "global-etfs": "🗺️",
};

const CATEGORY_COLORS: Record<string, string> = {
  gold: "border-yellow-600/40 bg-yellow-950/20",
  silver: "border-gray-500/40 bg-gray-900/40",
  lithium: "border-emerald-600/40 bg-emerald-950/20",
  bonds: "border-blue-600/40 bg-blue-950/20",
  metals: "border-orange-600/40 bg-orange-950/20",
  energy: "border-red-600/40 bg-red-950/20",
  "clean-energy": "border-green-600/40 bg-green-950/20",
  "global-indices": "border-purple-600/40 bg-purple-950/20",
  "global-etfs": "border-indigo-600/40 bg-indigo-950/20",
};

const CATEGORY_HEADER: Record<string, string> = {
  gold: "text-yellow-400",
  silver: "text-gray-300",
  lithium: "text-emerald-400",
  bonds: "text-blue-400",
  metals: "text-orange-400",
  energy: "text-red-400",
  "clean-energy": "text-green-400",
  "global-indices": "text-purple-400",
  "global-etfs": "text-indigo-400",
};

// Energy is a macro signal — flag it visually if moving sharply
function EnergyAlert({ category }: { category: CommodityCategory }) {
  if (category.category !== "energy") return null;
  const wti = category.quotes.find((q) => q.symbol === "CL=F");
  if (!wti) return null;
  const pct = wti.changePct;
  if (Math.abs(pct) < 2) return null;

  const isSpike = pct > 2;
  return (
    <div className={`mt-2 mb-1 px-2 py-1.5 rounded text-xs flex items-center gap-1.5 ${
      isSpike ? "bg-red-900/40 text-red-300" : "bg-green-900/40 text-green-300"
    }`}>
      <Flame size={12} />
      {isSpike
        ? `WTI +${pct.toFixed(1)}% — APEX flagging inflation pressure in macro score`
        : `WTI ${pct.toFixed(1)}% — oil easing, consumer/growth tailwind`}
    </div>
  );
}

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
        <EnergyAlert category={category} />
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

// Group categories into sections for visual separation
const SECTION_GROUPS: { label: string; icon: ReactNode; categories: string[] }[] = [
  {
    label: "Hard Assets & Rates",
    icon: <span className="text-yellow-400">🏦</span>,
    categories: ["gold", "silver", "lithium", "metals", "bonds"],
  },
  {
    label: "Energy",
    icon: <Flame size={16} className="text-red-400" />,
    categories: ["energy", "clean-energy"],
  },
  {
    label: "Global Markets",
    icon: <Globe size={16} className="text-purple-400" />,
    categories: ["global-indices", "global-etfs"],
  },
];

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

  const getCatData = (catId: string) => categories.find((c) => c.category === catId);

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe size={24} className="text-brand-400" />
          <div>
            <h2 className="text-2xl font-semibold text-white">Global Markets & Commodities</h2>
            <p className="text-sm text-gray-400">
              Metals, energy, bonds, and international markets
              {lastUpdated && (
                <span className="ml-2 text-gray-600">— updated {lastUpdated.toLocaleTimeString()}</span>
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

      {/* Sectioned grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        SECTION_GROUPS.map((section) => {
          const sectionCats = section.categories
            .map(getCatData)
            .filter((c): c is CommodityCategory => c !== undefined);

          return (
            <div key={section.label}>
              <div className="flex items-center gap-2 mb-4">
                {section.icon}
                <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                  {section.label}
                </h3>
                <div className="flex-1 border-t border-gray-800" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sectionCats.map((cat) => <CommodityCard key={cat.category} category={cat} />)}
              </div>
            </div>
          );
        })
      )}

      {/* Info footer */}
      {!loading && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p>
            Prices sourced via Yahoo Finance (15–20 min delay during market hours).
            Futures (GC=F, SI=F, CL=F, BZ=F, NG=F, HG=F) are front-month contracts.
            Yield symbols (^TNX, ^IRX) are annualized Treasury yields in percent.
          </p>
          <p>
            Global indices (^FTSE, ^GDAXI, ^N225, ^HSI) show native points — not USD.
            International ETFs (EWJ, EEM, FXI, EWZ, EWG) trade in USD on US exchanges.
            WTI crude (CL=F) price direction feeds directly into APEX macro scoring as an inflation signal.
          </p>
        </div>
      )}
    </div>
  );
}
