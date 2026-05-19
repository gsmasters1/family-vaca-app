import { useEffect, useState } from "react";
import { Wallet, Save, Plus, Trash2, Info } from "lucide-react";
import axios from "axios";

interface ProfitTier {
  gainPct: number;
  sellPct: number;
}

interface ProfitRules {
  takeProfitTiers: ProfitTier[];
  trailingStopPct: number;
  reservePct: number;
  maxDrawdownBeforeHalt: number;
  doubleDownThreshold: number;
}

interface ReserveAllocation {
  date: string;
  ticker: string;
  realizedGain: number;
  reservedAmount: number;
}

interface ReserveSummary {
  totalReserved: number;
  totalRealized: number;
  reservePct: number;
  recentAllocations?: ReserveAllocation[];
}

const DEFAULT_RULES: ProfitRules = {
  takeProfitTiers: [
    { gainPct: 20, sellPct: 33 },
    { gainPct: 40, sellPct: 33 },
    { gainPct: 60, sellPct: 34 },
  ],
  trailingStopPct: 8,
  reservePct: 20,
  maxDrawdownBeforeHalt: 15,
  doubleDownThreshold: 8,
};

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step ?? 1}
          className="w-24 bg-gray-950 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none"
        />
        {suffix && <span className="text-xs text-gray-500">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-gray-600 mt-1">{hint}</p>}
    </div>
  );
}

function ReserveBar({ reserved, total }: { reserved: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (reserved / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">Reserved vs Total Realized</span>
        <span className="text-xs text-gray-400">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function ProfitManager() {
  const [rules, setRules] = useState<ProfitRules>(DEFAULT_RULES);
  const [reserve, setReserve] = useState<ReserveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = async () => {
    try {
      const [rulesRes, reserveRes] = await Promise.all([
        axios.get("/api/sectors/profit-rules"),
        axios.get("/api/sectors/profit-rules/reserve").catch(() => null),
      ]);
      if (rulesRes.data?.takeProfitTiers) {
        setRules(rulesRes.data as ProfitRules);
      } else if (rulesRes.data?.rules) {
        setRules(rulesRes.data.rules as ProfitRules);
      }
      if (reserveRes?.data) {
        setReserve(reserveRes.data as ReserveSummary);
      }
    } catch {}
  };

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put("/api/sectors/profit-rules", rules);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const updateTier = (index: number, field: keyof ProfitTier, value: number) => {
    setRules((r) => ({
      ...r,
      takeProfitTiers: r.takeProfitTiers.map((t, i) =>
        i === index ? { ...t, [field]: value } : t
      ),
    }));
  };

  const addTier = () => {
    setRules((r) => ({
      ...r,
      takeProfitTiers: [...r.takeProfitTiers, { gainPct: 80, sellPct: 25 }],
    }));
  };

  const removeTier = (index: number) => {
    setRules((r) => ({
      ...r,
      takeProfitTiers: r.takeProfitTiers.filter((_, i) => i !== index),
    }));
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-8 w-56 bg-gray-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-96 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
          <div className="h-96 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Wallet size={24} className="text-brand-400" />
          <h2 className="text-2xl font-semibold">Profit Manager</h2>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Rules for taking profits, protecting gains, and storing earnings
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
          <h3 className="text-sm font-semibold text-gray-300">Profit Rules</h3>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500 font-medium">Take-Profit Tiers</p>
              <button
                onClick={addTier}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Plus size={12} /> Add Tier
              </button>
            </div>
            <div className="space-y-2">
              {rules.takeProfitTiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-950 border border-gray-800 rounded-lg">
                  <span className="text-xs text-gray-500 w-10 flex-shrink-0">Sell</span>
                  <input
                    type="number"
                    value={tier.sellPct}
                    onChange={(e) => updateTier(i, "sellPct", parseFloat(e.target.value) || 0)}
                    min={1}
                    max={100}
                    className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white text-center focus:border-brand-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">% at +</span>
                  <input
                    type="number"
                    value={tier.gainPct}
                    onChange={(e) => updateTier(i, "gainPct", parseFloat(e.target.value) || 0)}
                    min={1}
                    max={1000}
                    className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-white text-center focus:border-brand-500 focus:outline-none"
                  />
                  <span className="text-xs text-gray-500">% gain</span>
                  {rules.takeProfitTiers.length > 1 && (
                    <button
                      onClick={() => removeTier(i)}
                      className="ml-auto text-gray-600 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <NumberInput
            label="Trailing Stop %"
            value={rules.trailingStopPct}
            onChange={(v) => setRules((r) => ({ ...r, trailingStopPct: v }))}
            min={1}
            max={50}
            suffix="%"
            hint="Stop follows price up but never down. Triggers sell if price falls this % from its peak."
          />

          <div>
            <label className="block text-xs text-gray-500 mb-1">Reserve % <span className="text-gray-600">(of realized gains moved to cash)</span></label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={50}
                value={rules.reservePct}
                onChange={(e) => setRules((r) => ({ ...r, reservePct: parseInt(e.target.value) }))}
                className="flex-1 accent-brand-500"
              />
              <span className="text-sm font-medium text-white w-10 text-right">{rules.reservePct}%</span>
            </div>
            <p className="text-xs text-gray-600 mt-1">Move {rules.reservePct}% of realized gains to cash reserve.</p>
          </div>

          <NumberInput
            label="Max Drawdown Halt %"
            value={rules.maxDrawdownBeforeHalt}
            onChange={(v) => setRules((r) => ({ ...r, maxDrawdownBeforeHalt: v }))}
            min={1}
            max={50}
            suffix="%"
            hint="Stop all trading if portfolio drops this % from its peak."
          />

          <NumberInput
            label="Double Down Threshold %"
            value={rules.doubleDownThreshold}
            onChange={(v) => setRules((r) => ({ ...r, doubleDownThreshold: v }))}
            min={1}
            max={50}
            suffix="% drop required"
            hint="Allow adding to a position only if price drops this % (must have ACT NOW + conviction ≥9)."
          />

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Save size={14} />
            {saving ? "Saving..." : saved ? "Saved!" : "Save Rules"}
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-300">Reserve Account</h3>

            {reserve ? (
              <>
                <div className="text-center py-4">
                  <p className="text-xs text-gray-500 mb-1">Total Reserved</p>
                  <p className="text-4xl font-bold text-brand-400">
                    ${reserve.totalReserved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">
                    from ${reserve.totalRealized.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total realized
                  </p>
                </div>
                <ReserveBar reserved={reserve.totalReserved} total={reserve.totalRealized} />
              </>
            ) : (
              <div className="text-center py-8">
                <Wallet size={32} className="mx-auto mb-2 text-gray-700" />
                <p className="text-sm text-gray-500">No reserve data yet.</p>
                <p className="text-xs text-gray-600 mt-1">Reserve builds automatically as you close profitable trades.</p>
              </div>
            )}

            <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 flex items-start gap-2">
              <Info size={13} className="text-brand-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-gray-500 leading-relaxed">
                When a trade is closed for profit, {rules.reservePct}% automatically moves into your reserve. Think of it as your trading business paying itself first. The reserve is not used for new trades.
              </p>
            </div>
          </div>

          {reserve?.recentAllocations && reserve.recentAllocations.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800">
                <h4 className="text-xs font-semibold text-gray-400">Recent Reserve Allocations</h4>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-600 border-b border-gray-800">
                    <th className="px-4 py-2 text-left font-medium">Date</th>
                    <th className="px-4 py-2 text-left font-medium">Ticker</th>
                    <th className="px-4 py-2 text-right font-medium">Gain</th>
                    <th className="px-4 py-2 text-right font-medium">Reserved</th>
                  </tr>
                </thead>
                <tbody>
                  {reserve.recentAllocations.slice(0, 10).map((alloc, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/40">
                      <td className="px-4 py-2.5 text-gray-500">
                        {new Date(alloc.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-bold text-brand-400">{alloc.ticker}</td>
                      <td className="px-4 py-2.5 text-right text-green-400">
                        +${alloc.realizedGain.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-300">
                        ${alloc.reservedAmount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-brand-400" />
          <span className="text-gray-400 font-medium text-sm">Strategy Guide — Take-Profit Tiers</span>
        </div>
        <p>
          The tiered take-profit system prevents two common mistakes: selling too early (leaving gains on the table) and holding too long (giving profits back). By selling in thirds at +20%, +40%, and +60%, you lock in real money at each level while letting a portion of your winner continue running.
        </p>
        <p>
          <span className="text-brand-400 font-medium">Example:</span> You buy 100 shares at $50. At +20% ($60), sell 33 shares — locked in $330. At +40% ($70), sell 33 more — locked in $660 more. The remaining 34 shares ride with a trailing stop. If the stock goes to $100, you captured the whole move. If it reverses, your trailing stop protects the remaining position.
        </p>
        <p>
          The trailing stop turns off the need to guess a top. It follows the price up but never down — so if the stock hits $80 and falls 8%, you exit at $73.60. Not the top, but close enough.
        </p>
      </div>
    </div>
  );
}
