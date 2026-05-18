import { useEffect, useState } from "react";
import { Plus, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { watchlistApi, marketApi, type WatchlistItem, type Quote } from "../services/api";

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [form, setForm] = useState({ symbol: "", assetType: "stock", notes: "" });
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await watchlistApi.getItems();
    setItems(data);
    if (data.length > 0) {
      const symbols = data.map((i) => i.symbol);
      const { data: qs } = await marketApi.getQuotes(symbols);
      const map: Record<string, Quote> = {};
      qs.forEach((q) => (map[q.symbol] = q));
      setQuotes(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await watchlistApi.addItem(form.symbol.toUpperCase(), form.assetType, form.notes);
    setForm({ symbol: "", assetType: "stock", notes: "" });
    setShowForm(false);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Watchlist</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Symbol
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <input
            required
            placeholder="Symbol"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <select
            value={form.assetType}
            onChange={(e) => setForm({ ...form, assetType: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            <option value="stock">Stock</option>
            <option value="crypto">Crypto</option>
            <option value="etf">ETF</option>
            <option value="derivative">Derivative</option>
          </select>
          <input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <div className="md:col-span-3 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-sm px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-600 py-16">
          Watchlist is empty. Start tracking symbols above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const q = quotes[item.symbol];
            const up = (q?.change ?? 0) >= 0;
            return (
              <div
                key={item.id}
                className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{item.symbol}</p>
                    <span className="text-xs text-gray-500 capitalize">{item.assetType}</span>
                  </div>
                  <button
                    onClick={async () => {
                      await watchlistApi.removeItem(item.id);
                      load();
                    }}
                    className="text-gray-600 hover:text-red-400"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {q ? (
                  <div className="flex items-end justify-between">
                    <p className="text-xl font-bold">${q.price.toFixed(2)}</p>
                    <span
                      className={`flex items-center gap-1 text-sm ${up ? "text-green-400" : "text-red-400"}`}
                    >
                      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {up ? "+" : ""}
                      {q.changePct.toFixed(2)}%
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">Price unavailable</p>
                )}
                {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
