import { useEffect, useState } from "react";
import { Save, ToggleLeft, ToggleRight, Settings2 } from "lucide-react";
import axios from "axios";

interface Setting {
  key: string;
  value: string;
  description: string;
  updated_at: string;
}

interface Module {
  id: string;
  enabled: boolean;
}

const MODULE_LABELS: Record<string, { name: string; description: string }> = {
  core: { name: "Core", description: "Portfolio, watchlist, market data (always on)" },
  "congress-tracker": { name: "Congress Tracker", description: "STOCK Act disclosure feed + AI scoring" },
  commodities: { name: "Commodities", description: "Gold, silver, lithium, bonds dashboard" },
  "ipo-tracker": { name: "IPO Tracker", description: "SEC EDGAR S-1 filings + lock-up expiry alerts" },
  predictions: { name: "AI Predictions", description: "Technical analysis + Ollama price forecasts" },
  signals: { name: "Signal Engine", description: "Top-ranked trade opportunities" },
};

export default function Settings() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      axios.get("/api/settings"),
      axios.get("/api/settings/modules"),
    ]).then(([s, m]) => {
      setSettings(s.data);
      setModules(m.data);
    });
  }, []);

  const handleEdit = (key: string, value: string) => {
    setEditing((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    const value = editing[key];
    if (value === undefined) return;
    setSaving(key);
    await axios.put(`/api/settings/${key}`, { value });
    setSettings((prev) => prev.map((s) => (s.key === key ? { ...s, value } : s)));
    setSaved(key);
    setSaving(null);
    setTimeout(() => setSaved(null), 2000);
  };

  const toggleModule = async (moduleId: string, currentlyEnabled: boolean) => {
    const current = settings.find((s) => s.key === "enabled_modules");
    if (!current) return;
    let modules: string[] = JSON.parse(current.value);
    if (currentlyEnabled) {
      modules = modules.filter((m) => m !== moduleId);
    } else {
      if (!modules.includes(moduleId)) modules.push(moduleId);
    }
    const value = JSON.stringify(modules);
    await axios.put("/api/settings/enabled_modules", { value });
    setSettings((prev) =>
      prev.map((s) => (s.key === "enabled_modules" ? { ...s, value } : s))
    );
    setModules((prev) =>
      prev.map((m) => (m.id === moduleId ? { ...m, enabled: !currentlyEnabled } : m))
    );
  };

  const displaySettings = settings.filter(
    (s) => s.key !== "enabled_modules"
  );

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings2 size={24} className="text-brand-500" />
        <div>
          <h2 className="text-2xl font-semibold">Settings</h2>
          <p className="text-gray-500 text-sm">Runtime configuration — no restart needed</p>
        </div>
      </div>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Modules</h3>
        <p className="text-sm text-gray-500">
          Enable or disable feature modules. Changes take effect immediately.
        </p>
        <div className="space-y-2">
          {modules.map((mod) => {
            const meta = MODULE_LABELS[mod.id];
            const isCore = mod.id === "core";
            return (
              <div
                key={mod.id}
                className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4"
              >
                <div>
                  <p className="font-medium">{meta?.name ?? mod.id}</p>
                  <p className="text-xs text-gray-500">{meta?.description}</p>
                </div>
                <button
                  onClick={() => !isCore && toggleModule(mod.id, mod.enabled)}
                  disabled={isCore}
                  className={`flex items-center gap-1 text-sm disabled:opacity-40 ${
                    mod.enabled ? "text-brand-400" : "text-gray-600"
                  }`}
                >
                  {mod.enabled ? (
                    <ToggleRight size={28} />
                  ) : (
                    <ToggleLeft size={28} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-medium">Configuration</h3>
        <div className="space-y-3">
          {displaySettings.map((s) => (
            <div key={s.key} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-sm text-brand-400">{s.key}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.description}</p>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  value={editing[s.key] ?? s.value}
                  onChange={(e) => handleEdit(s.key, e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm font-mono"
                />
                <button
                  onClick={() => handleSave(s.key)}
                  disabled={saving === s.key || editing[s.key] === undefined}
                  className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm"
                >
                  <Save size={14} />
                  {saved === s.key ? "Saved!" : saving === s.key ? "..." : "Save"}
                </button>
              </div>
              <p className="text-xs text-gray-700 mt-1">Last updated: {s.updated_at}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <h3 className="font-medium">Adding New Modules</h3>
        <p className="text-sm text-gray-400">
          The module registry supports plug-in expansion. To add a new data source or signal type:
        </p>
        <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
          <li>Create a new service in <code className="text-gray-400">backend/src/services/</code></li>
          <li>Create a route in <code className="text-gray-400">backend/src/routes/</code></li>
          <li>Register it in <code className="text-gray-400">backend/src/index.ts</code></li>
          <li>Add a migration in <code className="text-gray-400">migrations.ts</code> if new tables are needed</li>
          <li>Add it to the <code className="text-gray-400">enabled_modules</code> setting above</li>
        </ol>
      </section>
    </div>
  );
}
