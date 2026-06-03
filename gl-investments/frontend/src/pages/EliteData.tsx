/**
 * Elite Intel — Smart Money Signals
 *
 * Shows data that institutional traders pay millions to access — free from government sources:
 *   CFTC Commitments of Traders: what commercial hedgers are actually positioned in futures
 *   SEC Form 4 Insider Trades: C-suite buying with personal money (2-day filing deadline)
 *
 * Both signals feed directly into APEX scoring.
 */

import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, RefreshCw, Users, Layers,
  ArrowUpRight, ArrowDownRight, Minus, AlertTriangle, CheckCircle
} from "lucide-react";
import { cotApi, insiderApi } from "../services/api";

// ─── COT Types ────────────────────────────────────────────────────────────
type COTSignal = "STRONG_BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG_SELL";

interface COTReport {
  commodity: string;
  ticker: string;
  reportDate: string;
  commercialNet: number;
  managedMoneyNet: number;
  commercialNetChange: number;
  managedMoneyChange: number;
  signal: COTSignal;
  signalReason: string;
  fetchedAt: string;
}

// ─── Insider Types ────────────────────────────────────────────────────────
interface InsiderTrade {
  id: string;
  ticker: string;
  companyName: string;
  insiderName: string;
  insiderRole: string;
  transactionType: "purchase" | "sale" | "award" | "other";
  shares: number;
  pricePerShare: number;
  totalValue: number;
  transactionDate: string;
  filingDate: string;
}

// ─── COT Signal UI ────────────────────────────────────────────────────────
const COT_SIGNAL_CONFIG: Record<COTSignal, { label: string; color: string; bg: string; icon: typeof CheckCircle }> = {
  STRONG_BUY:  { label: "Strong Buy",  color: "text-green-300",  bg: "bg-green-900/50 border-green-700",  icon: TrendingUp },
  BUY:         { label: "Buy",         color: "text-emerald-300", bg: "bg-emerald-900/40 border-emerald-700", icon: TrendingUp },
  NEUTRAL:     { label: "Neutral",     color: "text-gray-400",   bg: "bg-gray-800/60 border-gray-700",    icon: Minus },
  SELL:        { label: "Sell",        color: "text-orange-300", bg: "bg-orange-900/40 border-orange-700", icon: TrendingDown },
  STRONG_SELL: { label: "Strong Sell", color: "text-red-300",    bg: "bg-red-900/50 border-red-700",      icon: TrendingDown },
};

function SignalBadge({ signal }: { signal: COTSignal }) {
  const { label, color, bg, icon: Icon } = COT_SIGNAL_CONFIG[signal];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-bold ${bg} ${color}`}>
      <Icon size={11} />
      {label}
    </span>
  );
}

function NetChangeArrow({ change }: { change: number }) {
  if (change > 0) return <ArrowUpRight size={14} className="text-green-400" />;
  if (change < 0) return <ArrowDownRight size={14} className="text-red-400" />;
  return <Minus size={14} className="text-gray-500" />;
}

function formatNet(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function COTCard({ report }: { report: COTReport }) {
  const { label: _, color, bg } = COT_SIGNAL_CONFIG[report.signal];
  const isPositiveCommercial = report.commercialNetChange > 0;
  const isPositiveManaged = report.managedMoneyChange > 0;

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-xs font-bold ${color}`}>{report.ticker}</span>
            <span className="text-xs text-gray-500">{report.commodity}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">
            Report: {report.reportDate}
          </p>
        </div>
        <SignalBadge signal={report.signal} />
      </div>

      {/* Net positions */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-black/20 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Commercial Hedgers</span>
            <div className="flex items-center gap-1">
              <NetChangeArrow change={report.commercialNetChange} />
              <span className={`text-xs font-mono ${isPositiveCommercial ? "text-green-400" : "text-red-400"}`}>
                {isPositiveCommercial ? "+" : ""}{formatNet(report.commercialNetChange)}
              </span>
            </div>
          </div>
          <p className={`text-sm font-bold ${report.commercialNet >= 0 ? "text-green-300" : "text-red-300"}`}>
            {report.commercialNet >= 0 ? "+" : ""}{formatNet(report.commercialNet)} net
          </p>
          <p className="text-xs text-gray-600 mt-0.5">Producers & processors (smart money)</p>
        </div>

        <div className="bg-black/20 rounded-lg p-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500">Managed Money</span>
            <div className="flex items-center gap-1">
              <NetChangeArrow change={report.managedMoneyChange} />
              <span className={`text-xs font-mono ${isPositiveManaged ? "text-green-400" : "text-red-400"}`}>
                {isPositiveManaged ? "+" : ""}{formatNet(report.managedMoneyChange)}
              </span>
            </div>
          </div>
          <p className={`text-sm font-bold ${report.managedMoneyNet >= 0 ? "text-blue-300" : "text-orange-300"}`}>
            {report.managedMoneyNet >= 0 ? "+" : ""}{formatNet(report.managedMoneyNet)} net
          </p>
          <p className="text-xs text-gray-600 mt-0.5">Hedge funds (trend followers)</p>
        </div>
      </div>

      <p className="text-xs text-gray-400 italic">{report.signalReason}</p>
    </div>
  );
}

function COTSection({
  reports,
  loading,
  onRefresh,
  refreshing,
}: {
  reports: COTReport[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            CFTC Commitments of Traders
          </h3>
          <span className="text-xs text-gray-600">— released Fridays 3:30 PM ET</span>
          <div className="flex-1 border-t border-gray-800" />
        </div>
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Fetching..." : "Refresh COT"}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 h-40 animate-pulse" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <Layers size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No COT data yet</p>
          <p className="text-xs text-gray-600 mt-1">Click "Refresh COT" to fetch the latest CFTC report</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reports.map((r) => <COTCard key={r.ticker} report={r} />)}
        </div>
      )}
    </section>
  );
}

// ─── Insider Trades Section ───────────────────────────────────────────────
function roleColor(role: string): string {
  if (/CEO|President|Chairman/i.test(role)) return "text-yellow-400 font-semibold";
  if (/CFO|CTO|COO|CSO/i.test(role)) return "text-amber-400";
  if (/Director/i.test(role)) return "text-blue-400";
  return "text-gray-400";
}

function InsiderRow({ trade }: { trade: InsiderTrade }) {
  const isBuy = trade.transactionType === "purchase";
  const value = trade.totalValue;
  const valueStr =
    value >= 1_000_000
      ? `$${(value / 1_000_000).toFixed(2)}M`
      : value >= 1_000
      ? `$${(value / 1_000).toFixed(0)}K`
      : `$${value.toFixed(0)}`;

  return (
    <tr className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50 transition-colors">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-bold text-brand-400">{trade.ticker}</span>
        </div>
        <p className="text-xs text-gray-600 truncate max-w-[120px]">{trade.companyName}</p>
      </td>
      <td className="py-3 pr-4">
        <p className="text-sm text-gray-200">{trade.insiderName}</p>
        <p className={`text-xs ${roleColor(trade.insiderRole)}`}>{trade.insiderRole}</p>
      </td>
      <td className="py-3 pr-4">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
            isBuy ? "bg-green-900/50 text-green-300" : "bg-gray-800 text-gray-400"
          }`}
        >
          {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {isBuy ? "PURCHASE" : "SALE"}
        </span>
      </td>
      <td className="py-3 pr-4 text-right">
        <p className={`text-sm font-mono font-semibold ${isBuy ? "text-green-300" : "text-gray-400"}`}>
          {valueStr}
        </p>
        <p className="text-xs text-gray-600">
          {trade.shares.toLocaleString()} sh @ ${trade.pricePerShare.toFixed(2)}
        </p>
      </td>
      <td className="py-3 text-right">
        <p className="text-xs text-gray-500">{trade.transactionDate}</p>
        <p className="text-xs text-gray-700">filed {trade.filingDate}</p>
      </td>
    </tr>
  );
}

function InsiderSection({
  trades,
  loading,
}: {
  trades: InsiderTrade[];
  loading: boolean;
}) {
  const purchases = trades.filter((t) => t.transactionType === "purchase");

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Users size={16} className="text-yellow-400" />
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
          SEC Form 4 — Insider Open-Market Purchases
        </h3>
        <div className="flex-1 border-t border-gray-800" />
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 animate-pulse h-40" />
      ) : purchases.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-8 text-center">
          <Users size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No insider purchase data yet</p>
          <p className="text-xs text-gray-600 mt-1">
            APEX will populate this as it analyzes symbols from your watchlist and portfolio
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 bg-gray-900/10 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="text-left text-xs text-gray-500 font-medium py-2 px-4">Ticker</th>
                <th className="text-left text-xs text-gray-500 font-medium py-2 pr-4">Insider</th>
                <th className="text-left text-xs text-gray-500 font-medium py-2 pr-4">Type</th>
                <th className="text-right text-xs text-gray-500 font-medium py-2 pr-4">Value</th>
                <th className="text-right text-xs text-gray-500 font-medium py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {purchases.map((t) => (
                <InsiderRow key={t.id} trade={t} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── How This Feeds APEX ──────────────────────────────────────────────────
function ApexIntegrationNote() {
  return (
    <div className="rounded-xl border border-brand-800/40 bg-brand-950/20 p-4">
      <div className="flex items-start gap-3">
        <CheckCircle size={18} className="text-brand-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-brand-300 mb-1">How These Signals Power APEX Decisions</p>
          <div className="text-xs text-gray-400 space-y-1">
            <p>
              <span className="text-green-400 font-medium">COT Commercial Hedgers:</span> When producers reduce
              short hedges, they expect prices to stay elevated — APEX adds macro points for the relevant commodity.
              Rising oil from COT = stagflation risk = APEX penalizes macro score for growth stocks.
            </p>
            <p>
              <span className="text-yellow-400 font-medium">Form 4 Cluster Buying:</span> When 2+ executives
              buy with personal capital, APEX adds up to +8 points to the Congressional/Insider score component.
              C-suite purchases are the highest-conviction signal in institutional research — they know the company better than any analyst.
            </p>
            <p>
              <span className="text-gray-500">
                Data sources: CFTC.gov (free, weekly), SEC EDGAR data.sec.gov (free, 2-day filing deadline).
                No subscription required. No vendor markup. Raw government data.
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Warning for Yahoo delay ──────────────────────────────────────────────
function DataSourceNote() {
  return (
    <div className="rounded-xl border border-yellow-800/30 bg-yellow-950/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-gray-400 space-y-1">
          <p className="text-yellow-400 font-medium">On Price Data & Yahoo Finance</p>
          <p>
            Price quotes (Yahoo Finance) are delayed 15–20 minutes — this is the same for ALL retail investors.
            For APEX's swing trading strategy (holding days to weeks), this delay is irrelevant.
            The true edge isn't in getting quotes 20 minutes earlier — it's in knowing what the
            <span className="text-white"> commercial hedgers and company insiders </span>
            are actually doing before it shows up in price action.
          </p>
          <p>
            Add a free <span className="text-brand-400 font-mono">finnhub_api_key</span> in Settings
            to upgrade price quotes to real-time. COT and Form 4 data here are already ahead of the market.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function EliteData() {
  const [cotReports, setCotReports] = useState<COTReport[]>([]);
  const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
  const [cotLoading, setCotLoading] = useState(true);
  const [insiderLoading, setInsiderLoading] = useState(true);
  const [cotRefreshing, setCotRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadCOT = async () => {
    try {
      const res = await cotApi.getAll();
      setCotReports(res.data as COTReport[]);
      setLastUpdated(new Date());
    } catch {
      // Silent fail — API may not have data yet
    }
  };

  const loadInsider = async () => {
    try {
      const res = await insiderApi.getLatest();
      setInsiderTrades(res.data as InsiderTrade[]);
    } catch {
      // Silent fail
    }
  };

  useEffect(() => {
    Promise.all([
      loadCOT().finally(() => setCotLoading(false)),
      loadInsider().finally(() => setInsiderLoading(false)),
    ]);
  }, []);

  const handleCOTRefresh = async () => {
    setCotRefreshing(true);
    try {
      await cotApi.refresh();
      await loadCOT();
    } finally {
      setCotRefreshing(false);
    }
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          <h2 className="text-2xl font-semibold text-white">Elite Intel</h2>
        </div>
        <p className="text-sm text-gray-400">
          CFTC institutional positioning + SEC Form 4 insider trades — the same data hedge funds pay millions for, free from government sources
          {lastUpdated && (
            <span className="ml-2 text-gray-600">— updated {lastUpdated.toLocaleTimeString()}</span>
          )}
        </p>
      </div>

      <DataSourceNote />
      <ApexIntegrationNote />

      <COTSection
        reports={cotReports}
        loading={cotLoading}
        onRefresh={handleCOTRefresh}
        refreshing={cotRefreshing}
      />

      <InsiderSection trades={insiderTrades} loading={insiderLoading} />
    </div>
  );
}
