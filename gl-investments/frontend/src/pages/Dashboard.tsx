import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { portfolioApi, marketApi, type Quote } from "../services/api";

interface Summary {
  totalValue: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  positionCount: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [movers, setMovers] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([portfolioApi.getSummary(), marketApi.getTopMovers()])
      .then(([s, m]) => {
        setSummary(s.data);
        setMovers(m.data);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Portfolio Value"
              value={`$${summary?.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "—"}`}
              icon={<DollarSign size={20} />}
            />
            <StatCard
              label="Total Gain/Loss"
              value={`${(summary?.totalGainLoss ?? 0) >= 0 ? "+" : ""}$${summary?.totalGainLoss.toLocaleString("en-US", { minimumFractionDigits: 2 }) ?? "—"}`}
              sub={`${(summary?.totalGainLossPct ?? 0).toFixed(2)}%`}
              positive={(summary?.totalGainLoss ?? 0) >= 0}
              icon={
                (summary?.totalGainLoss ?? 0) >= 0 ? (
                  <TrendingUp size={20} />
                ) : (
                  <TrendingDown size={20} />
                )
              }
            />
            <StatCard
              label="Positions"
              value={String(summary?.positionCount ?? 0)}
              icon={<Activity size={20} />}
            />
          </div>

          <div>
            <h3 className="text-lg font-medium mb-3">Top Movers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {movers.map((q) => (
                <QuoteCard key={q.symbol} quote={q} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  positive,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className="flex items-center justify-between text-gray-500 mb-2">
        <span className="text-xs uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-semibold">{value}</p>
      {sub && (
        <p className={`text-sm mt-1 ${positive ? "text-green-400" : "text-red-400"}`}>{sub}</p>
      )}
    </div>
  );
}

function QuoteCard({ quote }: { quote: Quote }) {
  const up = quote.change >= 0;
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{quote.symbol}</p>
          <p className="text-xs text-gray-500 truncate max-w-[140px]">{quote.name}</p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${up ? "bg-green-900 text-green-400" : "bg-red-900 text-red-400"}`}
        >
          {up ? "+" : ""}
          {quote.changePct.toFixed(2)}%
        </span>
      </div>
      <p className="text-lg font-bold mt-2">${quote.price.toFixed(2)}</p>
    </div>
  );
}
