import type Database from "better-sqlite3";

interface Migration {
  version: number;
  description: string;
  up: string;
}

// To upgrade the schema: add a new entry here. Never modify existing ones.
const migrations: Migration[] = [
  {
    version: 1,
    description: "Initial schema: portfolio, watchlist, price_cache",
    up: `
      CREATE TABLE IF NOT EXISTS portfolio_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        name TEXT DEFAULT '',
        asset_type TEXT NOT NULL DEFAULT 'stock',
        shares REAL NOT NULL,
        avg_cost REAL NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        asset_type TEXT NOT NULL DEFAULT 'stock',
        notes TEXT DEFAULT '',
        added_at TEXT DEFAULT (datetime('now')),
        UNIQUE(symbol)
      );
      CREATE TABLE IF NOT EXISTS price_cache (
        symbol TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at TEXT DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 2,
    description: "Add congress_trades and signal_scores",
    up: `
      CREATE TABLE IF NOT EXISTS congress_trades (
        id TEXT PRIMARY KEY,
        source TEXT,
        member_name TEXT,
        party TEXT,
        state TEXT,
        ticker TEXT,
        asset_description TEXT,
        trade_type TEXT,
        amount_range TEXT,
        transaction_date TEXT,
        disclosure_date TEXT,
        days_to_disclose INTEGER,
        fetched_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS signal_scores (
        trade_id TEXT PRIMARY KEY,
        score INTEGER,
        recommendation TEXT,
        timeframe TEXT,
        reasoning TEXT,
        target_pct REAL,
        risk_level TEXT,
        scored_at TEXT DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 3,
    description: "Add app_settings for runtime configuration",
    up: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
        ('ollama_model', 'llama3.1:8b', 'Ollama model for AI analysis'),
        ('ollama_base_url', 'http://localhost:11434', 'Ollama server URL'),
        ('market_cache_ttl', '5', 'Price cache TTL in minutes'),
        ('congress_refresh_hours', '1', 'Congress data refresh interval in hours'),
        ('auto_score_trades', 'true', 'Automatically AI-score new congress trades'),
        ('enabled_modules', '["core","congress-tracker","commodities","ipo-tracker","predictions","signals"]', 'Active modules JSON array'),
        ('ipo_lookback_days', '30', 'Days to look back for SEC S-1 filings'),
        ('prediction_confidence_threshold', '65', 'Min confidence % to show a prediction');
    `,
  },
  {
    version: 4,
    description: "Add IPO tracking tables",
    up: `
      CREATE TABLE IF NOT EXISTS ipo_filings (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        ticker TEXT DEFAULT '',
        filing_date TEXT NOT NULL,
        form_type TEXT DEFAULT 'S-1',
        estimated_ipo_date TEXT DEFAULT '',
        price_range_low REAL DEFAULT 0,
        price_range_high REAL DEFAULT 0,
        shares_offered INTEGER DEFAULT 0,
        ai_score INTEGER DEFAULT 0,
        ai_analysis TEXT DEFAULT '',
        status TEXT DEFAULT 'pending',
        lockup_expiry TEXT DEFAULT '',
        fetched_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS ipo_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipo_id TEXT NOT NULL,
        alert_type TEXT NOT NULL,
        message TEXT NOT NULL,
        triggered_at TEXT DEFAULT (datetime('now')),
        acknowledged INTEGER DEFAULT 0
      );
    `,
  },
  {
    version: 5,
    description: "Add prediction cache and technical analysis snapshots",
    up: `
      CREATE TABLE IF NOT EXISTS prediction_cache (
        symbol TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        cached_at TEXT DEFAULT (datetime('now'))
      );
    `,
  },
  {
    version: 6,
    description: "Add intelligence feed (web scraper results with trust scores)",
    up: `
      CREATE TABLE IF NOT EXISTS intelligence_feed (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        summary TEXT DEFAULT '',
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        published_at TEXT,
        tickers TEXT DEFAULT '[]',
        category TEXT DEFAULT 'news',
        trust_score INTEGER DEFAULT 0,
        trust_tier TEXT DEFAULT 'MIXED',
        flags TEXT DEFAULT '[]',
        sentiment TEXT DEFAULT 'neutral',
        fetched_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_intel_trust ON intelligence_feed(trust_score DESC);
      CREATE INDEX IF NOT EXISTS idx_intel_ticker ON intelligence_feed(tickers);
    `,
  },
  {
    version: 7,
    description: "Add risk_profile to app_settings",
    up: `
      INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
        ('risk_profile', 'moderate', 'Portfolio risk profile: conservative | moderate | aggressive'),
        ('fred_api_key', 'none', 'FRED API key for macro data (free at fred.stlouisfed.org/docs/api/api_key.html)'),
        ('intel_min_trust_score', '40', 'Minimum trust score to display in intelligence feed');
    `,
  },
  {
    version: 8,
    description: "Add APEX decisions table",
    up: `
      CREATE TABLE IF NOT EXISTS apex_decisions (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        urgency TEXT NOT NULL,
        conviction INTEGER DEFAULT 5,
        apex_score INTEGER DEFAULT 0,
        rationale TEXT DEFAULT '',
        execution_json TEXT DEFAULT '{}',
        exit_conditions_json TEXT DEFAULT '[]',
        regime TEXT DEFAULT 'BULL',
        generated_at TEXT DEFAULT (datetime('now')),
        expires_at TEXT DEFAULT (datetime('now', '+24 hours'))
      );
      CREATE INDEX IF NOT EXISTS idx_decisions_action ON apex_decisions(action, conviction DESC);
    `,
  },
  {
    version: 9,
    description: "Add trading settings, trade log, and daily equity tracker",
    up: `
      INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
        ('trading_enabled', 'false', 'Master switch — must be explicitly enabled'),
        ('trading_paper_mode', 'true', 'true = paper trading, false = LIVE real money'),
        ('trading_min_apex_score', '75', 'Minimum APEX score to auto-execute (0-100)'),
        ('trading_min_conviction', '8', 'Minimum conviction level to auto-execute (1-10)'),
        ('trading_max_position_pct', '5', 'Max % of portfolio in any single position'),
        ('trading_daily_loss_limit_pct', '3', 'Stop all trading if portfolio drops this % in a day'),
        ('trading_max_positions', '10', 'Maximum simultaneous open positions'),
        ('trading_require_claude_review', 'true', 'Claude API must approve before execution'),
        ('trading_kill_switch', 'false', 'Emergency stop — halts all trading immediately');

      CREATE TABLE IF NOT EXISTS trade_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        action TEXT NOT NULL,
        result TEXT NOT NULL,
        reason TEXT NOT NULL,
        apex_score INTEGER DEFAULT 0,
        conviction INTEGER DEFAULT 0,
        qty REAL DEFAULT 0,
        entry_price REAL DEFAULT 0,
        stop_loss REAL DEFAULT 0,
        target REAL DEFAULT 0,
        position_size_pct REAL DEFAULT 0,
        order_id TEXT DEFAULT '',
        claude_approved INTEGER DEFAULT 0,
        claude_reason TEXT DEFAULT '',
        regime TEXT DEFAULT '',
        executed_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS daily_equity (
        date TEXT PRIMARY KEY,
        starting_equity REAL NOT NULL,
        recorded_at TEXT DEFAULT (datetime('now'))
      );
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const row = db
    .prepare("SELECT COALESCE(MAX(version), 0) as v FROM schema_migrations")
    .get() as { v: number };
  const currentVersion = row.v;

  const pending = migrations.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  for (const migration of pending) {
    db.exec(migration.up);
    db.prepare(
      "INSERT INTO schema_migrations (version, description) VALUES (?, ?)"
    ).run(migration.version, migration.description);
    console.log(`  Migration ${migration.version}: ${migration.description}`);
  }
  console.log(`Database schema at version ${migrations[migrations.length - 1].version}`);
}
