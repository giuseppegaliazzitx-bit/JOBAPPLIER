import { describe, expect, it } from "vitest";
import { countTodaySubmits, recordApplication } from "../src/applications.ts";
import { enqueueBatch } from "../src/batch.ts";
import { isAutopilotOn, readSettings, writeSettings } from "../src/settings.ts";
import { buildApp } from "../src/app.ts";
import { tempSqlite } from "./helper.ts";

describe("autopilot settings and batch", () => {
  it("defaults per-site automation off and persists toggles plus daily cap", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      expect(isAutopilotOn(sqlite, "greenhouse")).toBe(false);
      const listed = await app.inject({ method: "GET", url: "/api/settings" });
      expect(listed.statusCode).toBe(200);
      const body = listed.json() as { sites: Record<string, boolean>; dailyCap: number; tos: string };
      expect(body.sites.greenhouse).toBe(false);
      expect(body.dailyCap).toBe(20);
      expect(body.tos).toMatch(/terms of service/i);

      const updated = await app.inject({
        method: "PUT",
        url: "/api/settings",
        payload: { sites: { greenhouse: true }, dailyCap: 3 },
      });
      expect(updated.statusCode).toBe(200);
      expect(isAutopilotOn(sqlite, "greenhouse")).toBe(true);
      expect(readSettings(sqlite).dailyCap).toBe(3);
      writeSettings(sqlite, { sites: { greenhouse: false } });
      expect(isAutopilotOn(sqlite, "greenhouse")).toBe(false);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("shuffles a batch onto the apply queue without starting browsers", async () => {
    const { sqlite, config } = tempSqlite();
    const now = new Date().toISOString();
    for (const id of ["j1", "j2", "j3"]) {
      sqlite
        .prepare(
          `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, platform, status, created_at, apply_kind)
           VALUES (?, ?, ?, ?, 'other', 'unknown', 'inbox', ?, 'external')`,
        )
        .run(id, `http://127.0.0.1:8790/apply?n=${id}`, `http://127.0.0.1:8790/apply?n=${id}`, `k:${id}`, now);
    }
    const app = await buildApp({ sqlite, config });
    try {
      const res = await app.inject({
        method: "POST",
        url: "/api/batch",
        payload: { jobIds: ["j1", "j2", "j3"], start: false },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { queued: number; jobIds: string[] };
      expect(body.queued).toBe(3);
      expect([...body.jobIds].sort()).toEqual(["j1", "j2", "j3"]);
      const queued = enqueueBatch(sqlite, []);
      expect(queued).toEqual([]);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("counts today's submits per host and stores a proof path", async () => {
    const { sqlite, config } = tempSqlite();
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, platform, status, created_at, apply_kind)
         VALUES ('j1', 'https://boards.greenhouse.io/acme/jobs/1', 'https://boards.greenhouse.io/acme/jobs/1', 'k', 'other', 'greenhouse', 'running', ?, 'external')`,
      )
      .run(now);
    sqlite
      .prepare(
        `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd)
         VALUES ('r1', 'j1', 'autopilot', 'running', ?, 0)`,
      )
      .run(now);
    expect(countTodaySubmits(sqlite, "boards.greenhouse.io")).toBe(0);
    recordApplication(sqlite, { jobId: "j1", runId: "r1", proofPath: "/tmp/proof.png" });
    expect(countTodaySubmits(sqlite, "boards.greenhouse.io")).toBe(1);
    expect(countTodaySubmits(sqlite, "jobs.lever.co")).toBe(0);
    const app = await buildApp({ sqlite, config });
    try {
      const res = await app.inject({ method: "GET", url: "/api/applications" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { applications: Array<{ status: string; proofScreenshot: string | null }> };
      expect(body.applications[0]?.status).toBe("applied");
      expect(body.applications[0]?.proofScreenshot).toBe("/tmp/proof.png");
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("toggles autopilot on an active recipe version", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const listed = await app.inject({ method: "GET", url: "/api/recipes" });
      const body = listed.json() as {
        recipes: Array<{ id: string; versions: Array<{ id: string; autopilot: boolean }> }>;
      };
      const recipe = body.recipes[0];
      const version = recipe?.versions[0];
      if (!recipe || !version) {
        throw new Error("expected seeded recipe");
      }
      sqlite.prepare(`UPDATE recipe_versions SET status = 'active' WHERE id = ?`).run(version.id);
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/recipes/${recipe.id}/versions/${version.id}`,
        payload: { autopilot: true },
      });
      expect(patched.statusCode).toBe(200);
      const next = patched.json() as { version: { autopilot: boolean } };
      expect(next.version.autopilot).toBe(true);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
