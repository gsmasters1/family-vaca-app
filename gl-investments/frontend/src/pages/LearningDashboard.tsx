import { useEffect, useState } from "react";
import { Brain, RefreshCw, Info, TrendingUp, TrendingDown } from "lucide-react";
import axios from "axios";

interface SignalAccuracy {
  component: string;
  tradeCount: number;
  winRate: number;
  avgReturnWhenHigh: number;
  avgReturnWhenLow: number;
  predictivePower: number;
}

interface SignalWeights {
  momentum: number;
  technical: number;
  congressional: number;
  macro_weight: number;
  value: number;
  computedAt: string;
}

interface LearningData {
  signalAccuracy: SignalAccuracy[];
  currentWeights: SignalWeights;
  defaultWeights: SignalWeights;
  totalTradesAnalyzed: number;
  lastRecomputed: string;
}

const COMPONENT_META: Record<string, { label: string; description: string }> = {
  momentum:      { label: "Momentum",      description: "Minervini / O'Neil" },
  technical:     { label: "Entry Setup",   description: "Livermore / Turtle" },
  congressional: { label: "Congress",      description: "STOCK Act Edge" },
  macro_weight:  { label: "Macro Fit",     description: "Druckenmiller / Dalio" },
  value:         { label: "Value Safety",  description: "Graham" },
};

const WEIGHT_KEYS: (keyof Omit<SignalWeights, "computedAt">)[] = [
  "momentum",
  "technical",
  "congressional",
  "macro_weight",
  "value",
];

function winRateColor(rate: number): string {
  if (rate >= 65) return "text-green-400";
  if (rate >= 50) return "text-yellow-400";
  return "text-red-400";
}

function weightDriftColor(current: number, def: number): string {
  const diff = current - def;
  if (Math.abs(diff) < 2) return "text-gray-400";
  return diff > 0 ? "text-green-400" : "text-red-400";
}

function PredictiveBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-400 w-6 text-right">{Math.round(score)}</span>
    </div>
  );
}

function SignalCard({ accuracy, current, def }: {
  accuracy: SignalAccuracy;
  current: number;
  def: number;
}) {
  const meta = COMPONENT_META[accuracy.component] ?? { label: accuracy.component, description: "" };
  const weightDiff = current - def;
  const weightChanged = Math.abs(weightDiff) >= 1;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{meta.label}</p>
          <p className="text-xs text-gray-600">{meta.description}</p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-bold tabular-nums ${winRateColor(accuracy.winRate)}`}>
            {accuracy.winRate.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-500">win rate</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-gray-950 rounded-lg py-2">
          <p className={`text-sm font-bold ${accuracy.avgReturnWhenHigh >= 0 ? "text-green-400" : "text-red-400"}`}>
            {accuracy.avgReturnWhenHigh >= 0 ? "+" : ""}{accuracy.avgReturnWhenHigh.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-600">when signal HIGH</p>
        </div>
        <div className="bg-gray-950 rounded-lg py-2">
          <p className={`text-sm font-bold ${accuracy.avgReturnWhenLow >= 0 ? "text-green-400" : "text-red-400"}`}>
            {accuracy.avgReturnWhenLow >= 0 ? "+" : ""}{accuracy.avgReturnWhenLow.toFixed(1)}%
          </p>
          <p className="text-xs text-gray-600">when signal LOW</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-500">Predictive Power</span>
        </div>
        <PredictiveBar score={accuracy.predictivePower} />
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-800">
        <div>
          <p className="text-xs text-gray-500">Weight</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-sm font-bold ${weightChanged ? weightDriftColor(current, def) : "text-gray-300"}`}>
              {current.toFixed(1)}
            </span>
            {weightChanged && (
              <span className={`text-xs flex items-center gap-0.5 ${weightDiff > 0 ? "text-green-400" : "text-red-400"}`}>
                {weightDiff > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {weightDiff > 0 ? "+" : ""}{weightDiff.toFixed(1)} from default
              </span>
            )}
            {!weightChanged && (
              <span className="text-xs text-gray-600">({def.toFixed(1)} default)</span>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-600">{accuracy.tradeCount} trades</p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 h-52 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="space-y-1.5">
          <div className="h-4 w-24 bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-800 rounded" />
        </div>
        <div className="h-8 w-16 bg-gray-800 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="h-12 bg-gray-800 rounded-lg" />
        <div className="h-12 bg-gray-800 rounded-lg" />
      </div>
      <div className="h-2 bg-gray-800 rounded" />
    </div>
  );
}

export default function LearningDashboard() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      const res = await axios.get("/api/sectors/learning");
      setData(res.data as LearningData);
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

  const totalWeightDrift = data
    ? WEIGHT_KEYS.reduce((sum, k) => {
        const cur = data.currentWeights[k] as number;
        const def = data.defaultWeights[k] as number;
        return sum + Math.abs(cur - def);
      }, 0)
    : 0;

  const lastRecomputed = data?.lastRecomputed ? new Date(data.lastRecomputed) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Brain size={24} className="text-brand-400" />
            <h2 className="text-2xl font-semibold">APEX Learning Engine</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            How APEX improves with each trade — signal accuracy and auto-adjusted weights
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 w-40 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : !data ? (
        <div className="text-center py-16">
          <Brain size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">No learning data available. Click Refresh to load.</p>
        </div>
      ) : data.totalTradesAnalyzed < 20 ? (
        <div className="text-center py-16">
          <Brain size={48} className="mx-auto mb-4 text-gray-700" />
          <p className="text-lg font-medium text-gray-400 mb-2">Not enough data to learn yet</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            APEX needs at least 20 completed trades to learn. Currently has{" "}
            <span className="text-brand-400 font-semibold">{data.totalTradesAnalyzed}</span>. Keep trading and check back.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500">Trades Analyzed</p>
              <p className="text-xl font-bold text-white">{data.totalTradesAnalyzed}</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
              <p className="text-xs text-gray-500">Last Recomputed</p>
              <p className="text-sm font-semibold text-white">
                {lastRecomputed ? lastRecomputed.toLocaleDateString() : "—"}
              </p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${totalWeightDrift > 15 ? "bg-orange-900/20 border-orange-800/50" : "bg-gray-900 border-gray-800"}`}>
              <p className="text-xs text-gray-500">Weight Drift</p>
              <p className={`text-xl font-bold ${totalWeightDrift > 15 ? "text-orange-400" : totalWeightDrift > 5 ? "text-yellow-400" : "text-gray-300"}`}>
                {totalWeightDrift.toFixed(1)} pts
              </p>
              <p className="text-xs text-gray-600">from defaults</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.signalAccuracy.map((acc) => (
              <SignalCard
                key={acc.component}
                accuracy={acc}
                current={(data.currentWeights[acc.component as keyof SignalWeights] as number) ?? 20}
                def={(data.defaultWeights[acc.component as keyof SignalWeights] as number) ?? 20}
              />
            ))}
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300">Weight Comparison — Current vs Default</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-600 border-b border-gray-800">
                  <th className="px-4 py-2.5 text-left font-medium">Component</th>
                  <th className="px-4 py-2.5 text-right font-medium">Default</th>
                  <th className="px-4 py-2.5 text-right font-medium">Current</th>
                  <th className="px-4 py-2.5 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {WEIGHT_KEYS.map((key) => {
                  const cur = data.currentWeights[key] as number;
                  const def = data.defaultWeights[key] as number;
                  const diff = cur - def;
                  const significant = Math.abs(diff) > 5;
                  const meta = COMPONENT_META[key] ?? { label: key, description: "" };

                  return (
                    <tr key={key} className={`border-t border-gray-800 ${significant ? "bg-brand-950/20" : ""}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-300">{meta.label}</p>
                        <p className="text-xs text-gray-600">{meta.description}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">{def.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-semibold ${significant ? (diff > 0 ? "text-green-400" : "text-red-400") : "text-gray-300"}`}>
                          {cur.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {Math.abs(diff) < 0.5 ? (
                          <span className="text-xs text-gray-600">—</span>
                        ) : (
                          <span className={`text-xs font-medium flex items-center justify-end gap-0.5 ${diff > 0 ? "text-green-400" : "text-red-400"}`}>
                            {diff > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                            {significant && <span className="ml-1 text-yellow-500">●</span>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.currentWeights.computedAt && (
              <div className="px-4 py-2 border-t border-gray-800">
                <p className="text-xs text-gray-600">
                  Weights computed at: {new Date(data.currentWeights.computedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-500 space-y-2">
        <div className="flex items-center gap-1.5 mb-1">
          <Info size={13} className="text-brand-400" />
          <span className="text-gray-400 font-medium text-sm">How APEX learns</span>
        </div>
        <p>
          APEX recomputes weights weekly using the last 90 days of closed trades. Components that predicted winning trades get more weight; components that failed to predict winners get less. This is statistical feedback, not machine learning.
        </p>
        <p>
          <span className="text-brand-400 font-medium">Predictive Power</span> = how well a component's high score correlates with a profitable trade outcome. A component at 80+ is a strong leading indicator. Below 50 means it's close to random for your specific trading history.
        </p>
        <p>
          <span className="text-yellow-400 font-medium">●</span> = weight has shifted more than 5 points from the default. Large drift suggests this component is either consistently nailing or missing your trades. Worth reviewing your thesis for that component.
        </p>
      </div>
    </div>
  );
}
