import { enqueue } from "@autoapply/db";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { quarantineIfNeeded } from "../src/recipes.ts";
import { tempSqlite } from "./helper.ts";

describe("dashboard and quarantine", () => {
  it("lists blocked queue items and notifications", async () => {
    const { sqlite, config } = tempSqlite();
    enqueue(sqlite, "blocked", { runId: "run-1", reason: "heal_exhausted" });
    enqueue(sqlite, "notify", { message: "Run paused to Blocked: heal_exhausted", runId: "run-1" });
    const app = await buildApp({ sqlite, config });
    try {
      const res = await app.inject({ method: "GET", url: "/api/dashboard" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        blockedRuns: number;
        notifications: Array<{ message: string }>;
        blocked: Array<{ reason?: string }>;
      };
      expect(body.blockedRuns).toBe(1);
      expect(body.blocked[0]?.reason).toBe("heal_exhausted");
      expect(body.notifications[0]?.message).toMatch(/Blocked/);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("quarantines an active recipe when failure rate exceeds 30% of 10 runs", () => {
    const { sqlite, config: _config } = tempSqlite();
    sqlite
      .prepare(`INSERT INTO recipes (id, scope, platform, match_json) VALUES (?, 'platform', 'greenhouse', ?)`)
      .run("r1", JSON.stringify({ urlPatterns: [], domFingerprints: [] }));
    sqlite
      .prepare(
        `INSERT INTO recipe_versions (id, recipe_id, version, status, steps_json, hints_json, created_by, runs, successes, failures)
         VALUES ('v1', 'r1', 1, 'retired', '[]', '{}', 'manual', 3, 3, 0)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO recipe_versions (id, recipe_id, version, status, steps_json, hints_json, created_by, runs, successes, failures)
         VALUES ('v2', 'r1', 2, 'active', '[]', '{}', 'manual', 10, 6, 4)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, platform, status, created_at, apply_kind)
         VALUES ('j1', 'http://example.test', 'http://example.test', 'k', 'other', 'greenhouse', 'running', ?, 'external')`,
      )
      .run(new Date().toISOString());
    const now = Date.now();
    for (let i = 0; i < 10; i += 1) {
      sqlite
        .prepare(
          `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd, recipe_version_id)
           VALUES (?, 'j1', 'preflight', ?, ?, 0, 'v2')`,
        )
        .run(`run-${i}`, i < 4 ? "failed" : "succeeded", new Date(now + i * 1000).toISOString());
    }
    quarantineIfNeeded(sqlite, "v2");
    const v2 = sqlite.prepare(`SELECT status FROM recipe_versions WHERE id = 'v2'`).get() as { status: string };
    const v1 = sqlite.prepare(`SELECT status FROM recipe_versions WHERE id = 'v1'`).get() as { status: string };
    const auto = sqlite.prepare(`SELECT value FROM settings WHERE key = 'autopilot:greenhouse'`).get() as
      | { value: string }
      | undefined;
    expect(v2.status).toBe("retired");
    expect(v1.status).toBe("active");
    expect(auto?.value).toBe("off");
  });
});
