import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { funnelIsMonotonic } from "@autoapply/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { recordApplication } from "../src/applications.ts";
import { funnelSql, loadMetrics } from "../src/metrics.ts";
import { interviewsToIcs } from "../src/notify.ts";
import { tempSqlite } from "./helper.ts";

const here = dirname(fileURLToPath(import.meta.url));

function seedJob(
  sqlite: ReturnType<typeof tempSqlite>["sqlite"],
  input: { id: string; title: string; platform?: string; description?: string },
) {
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, title, platform, status, created_at, apply_kind, description, staffing_agency)
       VALUES (?, ?, ?, ?, 'other', ?, ?, 'inbox', ?, 'external', ?, 0)`,
    )
    .run(
      input.id,
      `https://example.test/${input.id}`,
      `https://example.test/${input.id}`,
      `k:${input.id}`,
      input.title,
      input.platform ?? "greenhouse",
      now,
      input.description ?? "python backend",
    );
}

describe("scale metrics", () => {
  it("reconciles the funnel against raw table counts and stays monotonic", () => {
    const { sqlite } = tempSqlite();
    seedJob(sqlite, { id: "j1", title: "A" });
    seedJob(sqlite, { id: "j2", title: "B" });
    seedJob(sqlite, { id: "j3", title: "C" });
    seedJob(sqlite, { id: "j4", title: "D" });
    seedJob(sqlite, { id: "j5", title: "E" });
    sqlite
      .prepare(
        `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd, wall_ms) VALUES ('r1', 'j1', 'autopilot', 'succeeded', ?, 0, 1000)`,
      )
      .run(new Date().toISOString());
    sqlite
      .prepare(
        `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd) VALUES ('r2', 'j2', 'autopilot', 'succeeded', ?, 0)`,
      )
      .run(new Date().toISOString());
    recordApplication(sqlite, { jobId: "j1", runId: "r1", proofPath: "/tmp/p1.png" });
    recordApplication(sqlite, { jobId: "j2", runId: "r2", proofPath: "/tmp/p2.png" });
    sqlite.prepare(`UPDATE applications SET status = 'viewed' WHERE job_id = 'j1'`).run();
    sqlite.prepare(`UPDATE applications SET status = 'offer' WHERE job_id = 'j2'`).run();
    sqlite
      .prepare(
        `INSERT INTO ai_calls (id, run_id, purpose, model, in_tokens, out_tokens, cost_usd, cache_hit, created_at)
         VALUES ('c1', 'r1', 'repair_step', 'grok-4-fast-non-reasoning', 10, 5, 0.4, 0, ?)`,
      )
      .run(new Date().toISOString());

    const sql = funnelSql(sqlite);
    const loaded = loadMetrics(sqlite);
    expect(loaded.funnel).toEqual(sql);
    expect(funnelIsMonotonic(loaded.funnel)).toBe(true);
    expect(sql).toEqual({
      jobsAdded: 5,
      applied: 2,
      viewed: 2,
      screening: 1,
      interview: 1,
      offer: 1,
    });
    expect(loaded.costPerApplication.applications).toBe(2);
    expect(loaded.costPerApplication.usd).toBe(0.2);
    sqlite.close();
  });

  it("auto-selects a resume by posting keywords and caches cover letters by job family", async () => {
    const { sqlite, config } = tempSqlite();
    sqlite
      .prepare(
        `INSERT INTO documents (id, kind, label, path, keywords_json, is_default) VALUES ('d1', 'resume', 'frontend.pdf', 'f.pdf', '["react"]', 0)`,
      )
      .run();
    sqlite
      .prepare(
        `INSERT INTO documents (id, kind, label, path, keywords_json, is_default) VALUES ('d2', 'resume', 'backend.pdf', 'b.pdf', '["python","postgres"]', 1)`,
      )
      .run();
    seedJob(sqlite, { id: "j1", title: "Backend Engineer", description: "python postgres services" });
    sqlite
      .prepare(`INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd) VALUES ('r1', 'j1', 'preflight', 'succeeded', ?, 0)`)
      .run(new Date().toISOString());
    const app = await buildApp({ sqlite, config });
    try {
      const recorded = recordApplication(sqlite, { jobId: "j1", runId: "r1", proofPath: "/tmp/p.png" });
      expect(recorded.resumeVariant).toBe("backend.pdf");
      const first = await app.inject({ method: "GET", url: "/api/jobs/j1/cover-letter" });
      expect(first.statusCode).toBe(200);
      const letter = first.json() as { family: string; cached: boolean; body: string };
      expect(letter.family).toBe("backend");
      expect(letter.cached).toBe(false);
      expect(letter.body).toMatch(/Backend Engineer/);
      const second = await app.inject({ method: "GET", url: "/api/jobs/j1/cover-letter" });
      expect((second.json() as { cached: boolean }).cached).toBe(true);
      const gap = await app.inject({ method: "GET", url: "/api/jobs/j1/gap" });
      expect(gap.statusCode).toBe(200);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("runs a saved search and serves an interview calendar", async () => {
    const { sqlite, config } = tempSqlite();
    const pages: Record<string, string> = {
      "https://boards.greenhouse.io/acme/jobs/1":
        '<script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","hiringOrganization":{"name":"Acme"}}</script>',
    };
    const app = await buildApp({
      sqlite,
      config,
      fetchPage: async (url) => ({
        requestedUrl: url,
        finalUrl: url,
        status: 200,
        body: pages[url] ?? "<html></html>",
        contentType: "text/html",
      }),
    });
    try {
      const created = await app.inject({
        method: "POST",
        url: "/api/searches",
        payload: { name: "GH", text: "https://boards.greenhouse.io/acme/jobs/1", intervalMinutes: 60 },
      });
      expect(created.statusCode).toBe(200);
      const id = (created.json() as { search: { id: string } }).search.id;
      const ran = await app.inject({ method: "POST", url: `/api/searches/${id}/run` });
      expect(ran.statusCode).toBe(200);
      expect((ran.json() as { created: number }).created).toBe(1);
      const again = await app.inject({ method: "POST", url: `/api/searches/${id}/run` });
      expect((again.json() as { deduped: number }).deduped).toBe(1);

      const notify = await app.inject({
        method: "POST",
        url: "/api/notify",
        payload: { message: "hello", channels: ["desktop"] },
      });
      expect(notify.statusCode).toBe(200);

      const ics = interviewsToIcs([
        { title: "Interview: Engineer", scheduledAt: "2026-09-15T14:00:00.000Z", location: "Zoom" },
      ]);
      expect(ics).toMatch(/BEGIN:VCALENDAR/);
      expect(ics).toMatch(/DTSTART:20260915T140000Z/);
      const cal = await app.inject({ method: "GET", url: "/api/calendar.ics" });
      expect(cal.statusCode).toBe(200);
      expect(String(cal.headers["content-type"])).toMatch(/calendar/);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("ships an Apply with my profile extension that posts to the local API", () => {
    const root = join(here, "../../../extension");
    const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { name: string };
    const content = readFileSync(join(root, "content.js"), "utf8");
    const background = readFileSync(join(root, "background.js"), "utf8");
    expect(manifest.name).toBe("Autoapply");
    expect(content).toMatch(/Apply with my profile/);
    expect(background).toMatch(/\/api\/jobs/);
  });
});
