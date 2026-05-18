import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { portfolioApi, type PortfolioPosition } from "../services/api";

export default function Portfolio() {
  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    shares: "",
    avgCost: "",
    assetType: "stock",
  });
  const [loading, setLoading] = useState(true);

  const load = () =>
    portfolioApi
      .getPositions()
      .then((r) => setPositions(r.data))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await portfolioApi.addPosition({
      symbol: form.symbol.toUpperCase(),
      shares: parseFloat(form.shares),
      avgCost: parseFloat(form.avgCost),
      assetType: form.assetType,
    });
    setForm({ symbol: "", shares: "", avgCost: "", assetType: "stock" });
    setShowForm(false);
    load();
  };

  const handleRemove = async (id: number) => {
    await portfolioApi.removePosition(id);
    load();
  };

  const totalValue = positions.reduce((s, p) => s + p.value, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Portfolio</h2>
          <p className="text-gray-500 text-sm mt-1">
            Total value:{" "}
            <span className="text-white font-medium">
              ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Position
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-gray-900 border border-gray-800 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <input
            required
            placeholder="Symbol (e.g. AAPL)"
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            placeholder="Shares"
            value={form.shares}
            onChange={(e) => setForm({ ...form, shares: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          />
          <input
            required
            type="number"
            placeholder="Avg Cost ($)"
            value={form.avgCost}
            onChange={(e) => setForm({ ...form, avgCost: e.target.value })}
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
          <div className="col-span-2 md:col-span-4 flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="text-sm px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors"
            >
              Add
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : positions.length === 0 ? (
        <div className="text-center text-gray-600 py-16">
          No positions yet. Add your first one above.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                <th className="text-left pb-3">Symbol</th>
                <th className="text-left pb-3">Type</th>
                <th className="text-right pb-3">Shares</th>
                <th className="text-right pb-3">Avg Cost</th>
                <th className="text-right pb-3">Current</th>
                <th className="text-right pb-3">Value</th>
                <th className="text-right pb-3">Gain/Loss</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {positions.map((p) => (
                <tr key={p.id} className="hover:bg-gray-900 transition-colors">
                  <td className="py-3 font-medium">{p.symbol}</td>
                  <td className="py-3 text-gray-400 capitalize">{p.assetType}</td>
                  <td className="py-3 text-right">{p.shares}</td>
                  <td className="py-3 text-right">${p.avgCost.toFixed(2)}</td>
                  <td className="py-3 text-right">${p.currentPrice.toFixed(2)}</td>
                  <td className="py-3 text-right font-medium">
                    ${p.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`py-3 text-right ${p.gainLoss >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {p.gainLoss >= 0 ? "+" : ""}${p.gainLoss.toFixed(2)} ({p.gainLossPct.toFixed(2)}%)
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleRemove(p.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
