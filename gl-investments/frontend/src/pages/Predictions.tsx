import { useState, useEffect } from "react";
import { Search, TrendingUp, TrendingDown, Minus, RefreshCw, Target } from "lucide-react";
import axios from "axios";

interface Prediction {
  symbol: string;
  currentPrice: number;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  targetPrice1Week: number;
  targetPrice1Month: number;
  stopLoss: number;
  summary: string;
  signals: string[];
  indicators: {
    rsi: number;
    macd: number;
    trend: string;
    volumeRatio: number;
    priceVsSma20: number;
  };
  generatedAt: string;
}

export default function Predictions() {
  const [search, setSearch] = useState("");
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [batchPredictions, setBatchPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get("/api/predictions/batch/watchlist")
      .then((r) => setBatchPredictions(r.data))
      .finally(() => setBatchLoading(false));
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`/api/predictions/${search.toUpperCase()}`);
      setPrediction(res.data);
    } catch {
      setError("Prediction failed — ensure Ollama is running with llama3.1:8b pulled.");
    } finally {
      setLoading(false);
    }
  };

  const refreshPrediction = async (symbol: string) => {
    await axios.delete(`/api/predictions/${symbol}/cache`);
    setLoading(true);
    try {
      const res = await axios.get(`/api/predictions/${symbol}`);
      setPrediction(res.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">AI Predictions</h2>
        <p className="text-gray-500 text-sm mt-1">
          Technical analysis + local AI — RSI, MACD, Bollinger Bands, SMA 20/50/200
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Symbol (AAPL, BTC-USD, NVDA...)"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          <Search size={14} />
          Predict
        </button>
      </form>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {loading && <p className="text-gray-500 text-sm">Running AI analysis...</p>}

      {prediction && !loading && (
        <PredictionCard prediction={prediction} onRefresh={() => refreshPrediction(prediction.symbol)} />
      )}

      <div>
        <h3 className="text-lg font-medium mb-3">Watchlist Predictions</h3>
        {batchLoading ? (
          <p className="text-gray-500 text-sm">Generating predictions...</p>
        ) : batchPredictions.length === 0 ? (
          <p className="text-gray-600 text-sm">Add stocks to your watchlist to see predictions here.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batchPredictions.map((p) => (
              <MiniPredictionCard key={p.symbol} prediction={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PredictionCard({ prediction: p, onRefresh }: { prediction: Prediction; onRefresh: () => void }) {
  const up = p.direction === "bullish";
  const down = p.direction === "bearish";
  const weekPct = ((p.targetPrice1Week - p.currentPrice) / p.currentPrice) * 100;
  const monthPct = ((p.targetPrice1Month - p.currentPrice) / p.currentPrice) * 100;
  const stopPct = ((p.stopLoss - p.currentPrice) / p.currentPrice) * 100;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold">{p.symbol}</p>
            <DirectionBadge direction={p.direction} />
          </div>
          <p className="text-gray-400 text-sm">Current: ${p.currentPrice.toFixed(2)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="text-xs text-gray-500">Confidence</p>
            <p
              className={`text-xl font-bold ${
                p.confidence >= 70 ? "text-green-400" : p.confidence >= 50 ? "text-yellow-400" : "text-red-400"
              }`}
            >
              {p.confidence}%
            </p>
          </div>
          <button onClick={onRefresh} className="text-gray-600 hover:text-gray-400 ml-2">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed">{p.summary}</p>

      <div className="grid grid-cols-3 gap-3">
        <PriceTarget label="1-Week Target" price={p.targetPrice1Week} pct={weekPct} positive={weekPct >= 0} />
        <PriceTarget label="1-Month Target" price={p.targetPrice1Month} pct={monthPct} positive={monthPct >= 0} />
        <PriceTarget label="Stop Loss" price={p.stopLoss} pct={stopPct} positive={false} isStop />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <IndicatorRow label="RSI(14)" value={p.indicators.rsi.toFixed(1)}
          color={p.indicators.rsi > 70 ? "text-red-400" : p.indicators.rsi < 30 ? "text-green-400" : "text-gray-300"}
          note={p.indicators.rsi > 70 ? "overbought" : p.indicators.rsi < 30 ? "oversold" : "neutral"} />
        <IndicatorRow label="Trend" value={p.indicators.trend}
          color={p.indicators.trend === "uptrend" ? "text-green-400" : p.indicators.trend === "downtrend" ? "text-red-400" : "text-gray-300"} />
        <IndicatorRow label="vs SMA20" value={`${p.indicators.priceVsSma20.toFixed(2)}%`}
          color={p.indicators.priceVsSma20 >= 0 ? "text-green-400" : "text-red-400"} />
        <IndicatorRow label="Volume Ratio" value={`${p.indicators.volumeRatio.toFixed(2)}x`}
          color={p.indicators.volumeRatio > 1.5 ? "text-yellow-400" : "text-gray-300"} />
      </div>

      <div>
        <p className="text-xs text-gray-500 mb-2">Key signals</p>
        <div className="flex flex-wrap gap-2">
          {p.signals.map((s, i) => (
            <span key={i} className="text-xs bg-gray-800 border border-gray-700 rounded-full px-3 py-1">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniPredictionCard({ prediction: p }: { prediction: Prediction }) {
  const weekPct = ((p.targetPrice1Week - p.currentPrice) / p.currentPrice) * 100;
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold">{p.symbol}</p>
        <DirectionBadge direction={p.direction} />
      </div>
      <p className="text-xl font-bold">${p.currentPrice.toFixed(2)}</p>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">1-wk target</span>
        <span className={weekPct >= 0 ? "text-green-400" : "text-red-400"}>
          ${p.targetPrice1Week.toFixed(2)} ({weekPct >= 0 ? "+" : ""}{weekPct.toFixed(1)}%)
        </span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">Confidence</span>
        <span className={p.confidence >= 65 ? "text-green-400" : "text-yellow-400"}>
          {p.confidence}%
        </span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2">{p.summary}</p>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: Prediction["direction"] }) {
  if (direction === "bullish")
    return (
      <span className="flex items-center gap-1 text-xs bg-green-900/50 text-green-400 px-2 py-0.5 rounded-full">
        <TrendingUp size={12} /> Bullish
      </span>
    );
  if (direction === "bearish")
    return (
      <span className="flex items-center gap-1 text-xs bg-red-900/50 text-red-400 px-2 py-0.5 rounded-full">
        <TrendingDown size={12} /> Bearish
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
      <Minus size={12} /> Neutral
    </span>
  );
}

function PriceTarget({
  label, price, pct, positive, isStop,
}: {
  label: string; price: number; pct: number; positive: boolean; isStop?: boolean;
}) {
  return (
    <div className="bg-gray-800 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-bold">${price.toFixed(2)}</p>
      <p className={`text-xs mt-0.5 ${isStop ? "text-red-400" : positive ? "text-green-400" : "text-red-400"}`}>
        {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
      </p>
    </div>
  );
}

function IndicatorRow({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`font-medium ${color}`}>{value}</p>
      {note && <p className="text-xs text-gray-600">{note}</p>}
    </div>
  );
}
