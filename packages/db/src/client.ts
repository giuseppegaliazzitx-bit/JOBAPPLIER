import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { resolveDbPath } from "./paths.ts";
import * as schema from "./schema.ts";

export type SqliteDatabase = Database.Database;

export function openSqlite(dbPath = resolveDbPath()): SqliteDatabase {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function openDb(dbPath = resolveDbPath()) {
  const sqlite = openSqlite(dbPath);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}
