import { Routes, Route, NavLink } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, Star, Bot, TrendingUp,
  Zap, Landmark, Gem, Rocket, LineChart, Settings2,
  Newspaper, ShieldCheck
} from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Watchlist from "./pages/Watchlist";
import AIAdvisor from "./pages/AIAdvisor";
import Markets from "./pages/Markets";
import SignalDashboard from "./pages/SignalDashboard";
import CongressTrades from "./pages/CongressTrades";
import Commodities from "./pages/Commodities";
import IPOTracker from "./pages/IPOTracker";
import Predictions from "./pages/Predictions";
import Settings from "./pages/Settings";
import Intelligence from "./pages/Intelligence";
import RiskManager from "./pages/RiskManager";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/signals", icon: Zap, label: "Signals" },
  { to: "/intelligence", icon: Newspaper, label: "Intelligence" },
  { to: "/risk", icon: ShieldCheck, label: "Risk Manager" },
  { to: "/congress", icon: Landmark, label: "Congress Trades" },
  { to: "/predictions", icon: LineChart, label: "Predictions" },
  { to: "/ipo", icon: Rocket, label: "IPO Tracker" },
  { to: "/commodities", icon: Gem, label: "Commodities" },
  { to: "/markets", icon: TrendingUp, label: "Markets" },
  { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { to: "/watchlist", icon: Star, label: "Watchlist" },
  { to: "/ai-advisor", icon: Bot, label: "AI Advisor" },
  { to: "/settings", icon: Settings2, label: "Settings" },
];

export default function App() {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="px-5 py-6">
          <h1 className="text-lg font-bold text-brand-500 tracking-tight">
            G&amp;L Investments
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">Self-hosted platform</p>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-brand-600 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-600">Powered by Ollama + llama3.1</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-gray-950">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/ai-advisor" element={<AIAdvisor />} />
          <Route path="/signals" element={<SignalDashboard />} />
          <Route path="/congress" element={<CongressTrades />} />
          <Route path="/commodities" element={<Commodities />} />
          <Route path="/ipo" element={<IPOTracker />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/risk" element={<RiskManager />} />
        </Routes>
      </main>
    </div>
  );
}
