import Database from "better-sqlite3";
import path from "path";

const DB_PATH =
  process.env.DB_PATH ??
  path.join(__dirname, "../../database/gl_investments.db");

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
  const database = getDb();
  const { runMigrations } = require("./migrations");
  runMigrations(database);
  console.log("Database initialized at", DB_PATH);
}
