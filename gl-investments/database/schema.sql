-- G&L Investments database schema
-- SQLite (WAL mode, foreign keys enabled)

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol      TEXT NOT NULL,
  name        TEXT DEFAULT '',
  asset_type  TEXT NOT NULL DEFAULT 'stock',  -- stock | crypto | etf | derivative
  shares      REAL NOT NULL,
  avg_cost    REAL NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS watchlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol      TEXT NOT NULL,
  asset_type  TEXT NOT NULL DEFAULT 'stock',
  notes       TEXT DEFAULT '',
  added_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(symbol)
);

CREATE TABLE IF NOT EXISTS price_cache (
  symbol      TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  cached_at   TEXT DEFAULT (datetime('now'))
);
