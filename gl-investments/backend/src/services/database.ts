import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../database/gl_investments.db");

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDb(): void {
  const db = getDb();
  db.exec(`
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
  `);
  console.log("Database initialized at", DB_PATH);
}
