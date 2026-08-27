import { randomUUID } from "node:crypto";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";
import type { FetchPage } from "./fetch-page.ts";
import { ingestPaste } from "./ingest.ts";

const SearchRow = z.object({
  id: z.string(),
  name: z.string(),
  query_json: z.string(),
  interval_minutes: z.number(),
  last_run_at: z.string().nullable(),
  created_at: z.string(),
});

export type SavedSearch = {
  id: string;
  name: string;
  urlsText: string;
  intervalMinutes: number;
  lastRunAt: string | null;
  createdAt: string;
};

function mapSearch(row: unknown): SavedSearch {
  const parsed = SearchRow.parse(row);
  const query = z.object({ text: z.string() }).parse(JSON.parse(parsed.query_json));
  return {
    id: parsed.id,
    name: parsed.name,
    urlsText: query.text,
    intervalMinutes: parsed.interval_minutes,
    lastRunAt: parsed.last_run_at,
    createdAt: parsed.created_at,
  };
}

export function listSearches(sqlite: SqliteDatabase): SavedSearch[] {
  return sqlite.prepare(`SELECT * FROM saved_searches ORDER BY created_at`).all().map(mapSearch);
}

export function createSearch(
  sqlite: SqliteDatabase,
  input: { name: string; text: string; intervalMinutes?: number },
): SavedSearch {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO saved_searches (id, name, query_json, interval_minutes, last_run_at, created_at)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    )
    .run(id, input.name, JSON.stringify({ text: input.text }), input.intervalMinutes ?? 1440, now);
  const row = sqlite.prepare(`SELECT * FROM saved_searches WHERE id = ?`).get(id);
  return mapSearch(row);
}

export async function runSearch(
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
  id: string,
): Promise<{ created: number; deduped: number }> {
  const search = listSearches(sqlite).find((item) => item.id === id);
  if (!search) {
    throw new Error("search not found");
  }
  const { results } = await ingestPaste(sqlite, fetchPage, search.urlsText);
  sqlite.prepare(`UPDATE saved_searches SET last_run_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  return {
    created: results.filter((item) => item.status === "created").length,
    deduped: results.filter((item) => item.status === "deduped").length,
  };
}

export async function runDueSearches(
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
  now = new Date(),
): Promise<number> {
  let ran = 0;
  for (const search of listSearches(sqlite)) {
    const due =
      !search.lastRunAt ||
      now.getTime() - new Date(search.lastRunAt).getTime() >= search.intervalMinutes * 60_000;
    if (!due) {
      continue;
    }
    await runSearch(sqlite, fetchPage, search.id);
    ran += 1;
  }
  return ran;
}
