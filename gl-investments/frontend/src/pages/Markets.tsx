import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { marketApi, type Quote } from "../services/api";

export default function Markets() {
  const [search, setSearch] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<{ date: string; close: number }[]>([]);
  const [period, setPeriod] = useState("1mo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setLoading(true);
    setError("");
    try {
      const [q, h] = await Promise.all([
        marketApi.getQuote(search.toUpperCase()),
        marketApi.getHistory(search.toUpperCase(), period),
      ]);
      setQuote(q.data);
      setHistory(h.data);
    } catch {
      setError("Symbol not found. Try AAPL, BTC-USD, SPY, etc.");
      setQuote(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quote) {
      marketApi.getHistory(quote.symbol, period).then((r) => setHistory(r.data));
    }
  }, [period]);

  const up = (quote?.change ?? 0) >= 0;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Markets</h2>

      <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search symbol (AAPL, BTC-USD, SPY...)"
          className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm"
        />
        <button
          type="submit"
          className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm"
        >
          <Search size={16} />
          Search
        </button>
      </form>

      {loading && <p className="text-gray-500 text-sm">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {quote && (
        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold">{quote.symbol}</p>
                <p className="text-gray-400">{quote.name}</p>
              </div>
              <span className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-400 capitalize">
                {quote.assetType}
              </span>
            </div>
            <div className="mt-4 flex items-end gap-4">
              <p className="text-3xl font-bold">${quote.price.toFixed(2)}</p>
              <p className={`text-lg ${up ? "text-green-400" : "text-red-400"}`}>
                {up ? "+" : ""}
                {quote.change.toFixed(2)} ({quote.changePct.toFixed(2)}%)
              </p>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-medium">Price History</p>
              <div className="flex gap-2">
                {["1wk", "1mo", "3mo", "6mo", "1y"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`text-xs px-2 py-1 rounded ${
                      period === p
                        ? "bg-brand-600 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={history}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#4b5563" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#4b5563"
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  contentStyle={{ background: "#111827", border: "1px solid #1f2937" }}
                  labelStyle={{ color: "#9ca3af" }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={up ? "#22c55e" : "#ef4444"}
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
