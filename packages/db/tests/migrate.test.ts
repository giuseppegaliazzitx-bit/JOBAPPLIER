import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openSqlite, type SqliteDatabase } from "../src/client.ts";
import { migrate } from "../src/migrate.ts";
import { resolveDataDir, resolveDbPath } from "../src/paths.ts";

const TableRow = z.object({ name: z.string() });

function tableNames(sqlite: SqliteDatabase): string[] {
  const rows = sqlite.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all();
  return rows.map((row) => TableRow.parse(row).name);
}

describe("paths", () => {
  it("uses AUTOAPPLY_HOME and AUTOAPPLY_DB when set", () => {
    const previousHome = process.env.AUTOAPPLY_HOME;
    const previousDb = process.env.AUTOAPPLY_DB;
    process.env.AUTOAPPLY_HOME = join("tmp-home", "autoapply");
    delete process.env.AUTOAPPLY_DB;
    try {
      expect(resolveDataDir()).toBe(join("tmp-home", "autoapply"));
      expect(resolveDbPath()).toBe(join("tmp-home", "autoapply", "autoapply.db"));
      process.env.AUTOAPPLY_DB = join("other", "custom.db");
      expect(resolveDbPath()).toBe(join("other", "custom.db"));
    } finally {
      if (previousHome === undefined) {
        delete process.env.AUTOAPPLY_HOME;
      } else {
        process.env.AUTOAPPLY_HOME = previousHome;
      }
      if (previousDb === undefined) {
        delete process.env.AUTOAPPLY_DB;
      } else {
        process.env.AUTOAPPLY_DB = previousDb;
      }
    }
  });
});

describe("migrate", () => {
  const handles: SqliteDatabase[] = [];

  afterEach(() => {
    for (const sqlite of handles.splice(0)) {
      sqlite.close();
    }
  });

  it("creates the data-model tables on a fresh database", () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-db-"));
    const sqlite = openSqlite(join(dir, "autoapply.db"));
    handles.push(sqlite);

    const first = migrate(sqlite);
    expect(first).toEqual(["0000_init", "0001_intake"]);

    const names = tableNames(sqlite);
    expect(names).toEqual(
      expect.arrayContaining([
        "schema_migrations",
        "profile",
        "documents",
        "companies",
        "jobs",
        "recipes",
        "recipe_versions",
        "runs",
        "run_events",
        "fields_seen",
        "questions",
        "question_aliases",
        "question_embeddings",
        "answers",
        "option_mappings",
        "ai_calls",
        "credentials",
        "browser_sessions",
        "applications",
        "application_events",
        "contacts",
        "interviews",
        "notes",
        "queue",
      ]),
    );

    const second = migrate(sqlite);
    expect(second).toEqual([]);
  });

  it("enables WAL", () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-db-"));
    const sqlite = openSqlite(join(dir, "autoapply.db"));
    handles.push(sqlite);
    const mode = sqlite.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
  });
});
