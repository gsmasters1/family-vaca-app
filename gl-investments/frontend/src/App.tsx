import { Routes, Route, NavLink } from "react-router-dom";
import { LayoutDashboard, Briefcase, Star, Bot, TrendingUp } from "lucide-react";
import Dashboard from "./pages/Dashboard";
import Portfolio from "./pages/Portfolio";
import Watchlist from "./pages/Watchlist";
import AIAdvisor from "./pages/AIAdvisor";
import Markets from "./pages/Markets";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/portfolio", icon: Briefcase, label: "Portfolio" },
  { to: "/watchlist", icon: Star, label: "Watchlist" },
  { to: "/markets", icon: TrendingUp, label: "Markets" },
  { to: "/ai-advisor", icon: Bot, label: "AI Advisor" },
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
        </Routes>
      </main>
    </div>
  );
}
