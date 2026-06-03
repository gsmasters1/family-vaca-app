import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Shield, CheckCircle, XCircle } from "lucide-react";
import axios from "axios";

type RiskLevel = "LOW" | "MID" | "HIGH";
type RiskProfile = "conservative" | "moderate" | "aggressive";

interface PositionRisk {
  id: number;
  symbol: string;
  assetType: string;
  value: number;
  riskLevel: RiskLevel;
  allocation: number;
  returnTarget: { low: number; high: number };
  maxDrawdown: number;
  action?: string;
}

interface RiskTierConfig {
  low: { min: number; max: number };
  mid: { min: number; max: number };
  high: { min: number; max: number };
}

interface RiskReport {
  totalValue: number;
  distribution: Record<RiskLevel, { value: number; pct: number }>;
  positions: PositionRisk[];
  profile: RiskProfile;
  profileTargets: RiskTierConfig;
  isCompliant: boolean;
  recommendations: string[];
  overallRiskScore: number;
}

const RISK_COLORS: Record<RiskLevel, string> = {
  LOW:  "text-green-400",
  MID:  "text-yellow-400",
  HIGH: "text-red-400",
};

const RISK_BG: Record<RiskLevel, string> = {
  LOW:  "bg-green-900/30 border-green-800",
  MID:  "bg-yellow-900/30 border-yellow-800",
  HIGH: "bg-red-900/30 border-red-800",
};

const PROFILE_DESC: Record<RiskProfile, string> = {
  conservative: "60–75% low risk · 20–30% mid · 0–10% high · Target: 5–12%/yr",
  moderate:     "35–50% low risk · 35–45% mid · 10–25% high · Target: 12–25%/yr",
  aggressive:   "10–25% low risk · 25–40% mid · 35–60% high · Target: 20–60%/yr",
};

export default function RiskManager() {
  const [report, setReport] = useState<RiskReport | null>(null);
  const [profile, setProfile] = useState<RiskProfile>("moderate");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async (p: RiskProfile) => {
    setLoading(true);
    const res = await axios.get(`/api/risk/portfolio?profile=${p}`);
    setReport(res.data);
    setLoading(false);
  };

  useEffect(() => {
    axios.get("/api/risk/profile").then((r) => {
      setProfile(r.data.profile);
      load(r.data.profile);
    });
  }, []);

  const handleProfileChange = async (p: RiskProfile) => {
    setProfile(p);
    setSaving(true);
    await axios.put("/api/risk/profile", { profile: p });
    setSaving(false);
    load(p);
  };

  if (loading) {
    return <div className="p-6 text-gray-500 text-sm">Analyzing portfolio risk...</div>;
  }

  if (!report) return null;

  const { distribution: dist } = report;

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold">Risk Manager</h2>
        <p className="text-gray-500 text-sm mt-1">
          Conservative allocation with targeted upside. Position sizing based on risk tier.
        </p>
      </div>

      {/* Profile selector */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium">Risk Profile</p>
        <div className="grid grid-cols-3 gap-3">
          {(["conservative", "moderate", "aggressive"] as RiskProfile[]).map((p) => (
            <button
              key={p}
              onClick={() => handleProfileChange(p)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                profile === p
                  ? "border-brand-500 bg-brand-900/30"
                  : "border-gray-700 hover:border-gray-600"
              }`}
            >
              <p className="font-medium capitalize text-sm">{p}</p>
              <p className="text-xs text-gray-500 mt-1">{PROFILE_DESC[p]}</p>
            </button>
          ))}
        </div>
        {saving && <p className="text-xs text-brand-400">Saving profile...</p>}
      </div>

      {/* Overall risk score */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Risk Score</p>
          <p className={`text-3xl font-bold ${
            report.overallRiskScore <= 3 ? "text-green-400" :
            report.overallRiskScore <= 6 ? "text-yellow-400" : "text-red-400"
          }`}>
            {report.overallRiskScore}/10
          </p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase mb-1">Compliance</p>
          <div className="flex items-center gap-2 mt-1">
            {report.isCompliant
              ? <CheckCircle size={24} className="text-green-400" />
              : <XCircle size={24} className="text-red-400" />
            }
            <p className="text-sm">{report.isCompliant ? "In target range" : "Rebalance needed"}</p>
          </div>
        </div>
        {(["LOW", "MID", "HIGH"] as RiskLevel[]).slice(0, 2).map((tier) => (
          <div key={tier} className={`border rounded-xl p-4 ${RISK_BG[tier]}`}>
            <p className="text-xs text-gray-500 uppercase mb-1">{tier} Risk</p>
            <p className={`text-3xl font-bold ${RISK_COLORS[tier]}`}>
              {dist[tier].pct.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>

      {/* Distribution bars */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
        <p className="font-medium">Allocation vs Target</p>
        {(["LOW", "MID", "HIGH"] as RiskLevel[]).map((tier) => {
          const target = report.profileTargets[tier.toLowerCase() as keyof RiskTierConfig];
          const actual = dist[tier].pct;
          const inRange = actual >= target.min && actual <= target.max;
          return (
            <div key={tier} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={RISK_COLORS[tier]}>{tier} Risk</span>
                <span className={inRange ? "text-green-400" : "text-amber-400"}>
                  {actual.toFixed(1)}% (target {target.min}–{target.max}%)
                </span>
              </div>
              <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden">
                {/* target range band */}
                <div
                  className="absolute top-0 h-full bg-gray-700 opacity-50"
                  style={{ left: `${target.min}%`, width: `${target.max - target.min}%` }}
                />
                {/* actual bar */}
                <div
                  className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                    inRange ? "bg-green-500" : "bg-amber-500"
                  }`}
                  style={{ width: `${Math.min(actual, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      {report.recommendations.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <p className="font-medium">Recommendations</p>
          {report.recommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Shield size={14} className="text-brand-400 flex-shrink-0 mt-0.5" />
              <p className="text-gray-300">{rec}</p>
            </div>
          ))}
        </div>
      )}

      {/* Positions table */}
      {report.positions.length > 0 && (
        <div className="space-y-2">
          <p className="font-medium">Positions by Risk Tier</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs uppercase border-b border-gray-800">
                  <th className="text-left pb-3">Symbol</th>
                  <th className="text-left pb-3">Type</th>
                  <th className="text-left pb-3">Risk</th>
                  <th className="text-right pb-3">Allocation</th>
                  <th className="text-right pb-3">Return Target</th>
                  <th className="text-right pb-3">Max Drawdown</th>
                  <th className="text-left pb-3 pl-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {report.positions
                  .sort((a, b) => {
                    const order = { HIGH: 0, MID: 1, LOW: 2 };
                    return order[a.riskLevel] - order[b.riskLevel];
                  })
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-gray-900/50">
                      <td className="py-3 font-medium">{p.symbol}</td>
                      <td className="py-3 text-gray-400 capitalize">{p.assetType}</td>
                      <td className="py-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${RISK_BG[p.riskLevel]} ${RISK_COLORS[p.riskLevel]}`}>
                          {p.riskLevel}
                        </span>
                      </td>
                      <td className="py-3 text-right">{p.allocation.toFixed(1)}%</td>
                      <td className="py-3 text-right text-brand-400">
                        {p.returnTarget.low}–{p.returnTarget.high}%/yr
                      </td>
                      <td className="py-3 text-right text-red-400">−{p.maxDrawdown}%</td>
                      <td className="py-3 pl-4 text-xs text-amber-400 max-w-xs">{p.action ?? ""}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
