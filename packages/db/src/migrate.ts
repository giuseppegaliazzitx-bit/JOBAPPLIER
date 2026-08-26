import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SqliteDatabase } from "./client.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, "../drizzle");

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function appliedIds(sqlite: SqliteDatabase): Set<string> {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  const rows = sqlite.prepare("SELECT id FROM schema_migrations").all();
  const ids = new Set<string>();
  for (const row of rows) {
    if (typeof row === "object" && row !== null && "id" in row && typeof row.id === "string") {
      ids.add(row.id);
    }
  }
  return ids;
}

export function migrate(sqlite: SqliteDatabase): string[] {
  const applied = appliedIds(sqlite);
  const ran: string[] = [];
  const insert = sqlite.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
  );

  for (const file of listMigrationFiles()) {
    const id = file.replace(/\.sql$/, "");
    if (applied.has(id)) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    sqlite.exec(sql);
    insert.run(id, new Date().toISOString());
    ran.push(id);
  }
  return ran;
}
