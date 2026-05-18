import { getDb } from "./database";

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
    )
    .run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb()
    .prepare("SELECT key, value, description, updated_at FROM app_settings ORDER BY key")
    .all() as Array<{ key: string; value: string; description: string; updated_at: string }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export function getAllSettingsWithMeta(): Array<{
  key: string;
  value: string;
  description: string;
  updated_at: string;
}> {
  return getDb()
    .prepare("SELECT key, value, description, updated_at FROM app_settings ORDER BY key")
    .all() as Array<{ key: string; value: string; description: string; updated_at: string }>;
}

export function isModuleEnabled(moduleId: string): boolean {
  const raw = getSetting("enabled_modules");
  if (!raw) return true;
  try {
    const modules: string[] = JSON.parse(raw);
    return modules.includes(moduleId);
  } catch {
    return true;
  }
}

export function getOllamaConfig(): { baseUrl: string; model: string } {
  return {
    baseUrl: getSetting("ollama_base_url") ?? "http://localhost:11434",
    model: getSetting("ollama_model") ?? "llama3.1:8b",
  };
}
