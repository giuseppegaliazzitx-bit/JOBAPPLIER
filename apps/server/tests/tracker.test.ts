import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp } from "../src/app.ts";
import { recordApplication, sweepFollowUps } from "../src/applications.ts";
import { takeUnusedVerificationCode } from "../src/inbox.ts";
import { tempSqlite } from "./helper.ts";

const here = dirname(fileURLToPath(import.meta.url));
const inboxDir = join(here, "../../../fixtures/inbox");

const Fixture = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string(),
  text: z.string(),
  occurredAt: z.string(),
  expectedKind: z.string(),
  company: z.string(),
  jobTitle: z.string(),
});

function fixtures() {
  return readdirSync(inboxDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => Fixture.parse(JSON.parse(readFileSync(join(inboxDir, name), "utf8"))));
}

function seedApplication(
  sqlite: ReturnType<typeof tempSqlite>["sqlite"],
  input: { id: string; company: string; title: string },
) {
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO companies (id, name, domains_json) VALUES (?, ?, '[]')`).run(input.id, input.company);
  sqlite
    .prepare(
      `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, company_id, title, platform, status, created_at, apply_kind)
       VALUES (?, ?, ?, ?, 'other', ?, ?, 'unknown', 'running', ?, 'external')`,
    )
    .run(input.id, `https://example.test/${input.id}`, `https://example.test/${input.id}`, `k:${input.id}`, input.id, input.title, now);
  sqlite
    .prepare(
      `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd) VALUES (?, ?, 'preflight', 'succeeded', ?, 0)`,
    )
    .run(`run-${input.id}`, input.id, now);
  recordApplication(sqlite, { jobId: input.id, runId: `run-${input.id}`, proofPath: join("runs", `run-${input.id}`, "proof.png") });
}

describe("tracker inbox", () => {
  it("classifies a seeded inbox and applies the matching status transitions", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const mail = fixtures();
      for (const item of mail) {
        seedApplication(sqlite, { id: item.id, company: item.company, title: item.jobTitle });
      }
      const res = await app.inject({
        method: "POST",
        url: "/api/inbox/ingest",
        payload: {
          messages: mail.map((item) => ({
            id: item.id,
            from: item.from,
            subject: item.subject,
            text: item.text,
            occurredAt: item.occurredAt,
          })),
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { results: Array<{ kind: string | null; status: string | null }> };
      expect(body.results.map((item) => item.kind).sort()).toEqual(mail.map((item) => item.expectedKind).sort());

      const listed = await app.inject({ method: "GET", url: "/api/applications" });
      const apps = (
        listed.json() as { applications: Array<{ title: string | null; status: string; companyName: string | null }> }
      ).applications;
      const byTitle = new Map(apps.map((item) => [item.title, item.status]));
      expect(byTitle.get("Platform Engineer")).toBe("applied");
      expect(byTitle.get("Staff Engineer")).toBe("applied");
      expect(byTitle.get("Backend Engineer")).toBe("viewed");
      expect(byTitle.get("QA Engineer")).toBe("screening");
      expect(byTitle.get("Site Reliability Engineer")).toBe("interview");
      expect(byTitle.get("Data Analyst")).toBe("rejected");
      expect(byTitle.get("Chocolate Engineer")).toBe("offer");
      expect(takeUnusedVerificationCode(sqlite)).toBe("482193");
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("never lets a rejection email overwrite a manually set status", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const rejection = fixtures().find((item) => item.expectedKind === "rejection");
      if (!rejection) {
        throw new Error("missing rejection fixture");
      }
      seedApplication(sqlite, { id: rejection.id, company: rejection.company, title: rejection.jobTitle });
      const listed = await app.inject({ method: "GET", url: "/api/applications" });
      const id = (listed.json() as { applications: Array<{ id: string }> }).applications[0]?.id;
      if (!id) {
        throw new Error("missing application");
      }
      const patched = await app.inject({
        method: "PATCH",
        url: `/api/applications/${id}`,
        payload: { status: "interview" },
      });
      expect(patched.statusCode).toBe(200);
      expect((patched.json() as { application: { sourceOfStatus: string } }).application.sourceOfStatus).toBe("manual");

      const ingested = await app.inject({
        method: "POST",
        url: "/api/inbox/ingest",
        payload: {
          messages: [
            {
              id: rejection.id,
              from: rejection.from,
              subject: rejection.subject,
              text: rejection.text,
              occurredAt: rejection.occurredAt,
            },
          ],
        },
      });
      expect(ingested.statusCode).toBe(200);
      const result = (ingested.json() as { results: Array<{ skippedReason?: string; status: string | null }> }).results[0];
      expect(result?.skippedReason).toBe("manual_override");
      expect(result?.status).toBe("interview");
      const after = await app.inject({ method: "GET", url: `/api/applications/${id}` });
      expect((after.json() as { application: { status: string } }).application.status).toBe("interview");
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("exports CSV and requests Gmail read-only OAuth", async () => {
    const { sqlite, config } = tempSqlite();
    const withGmail = { ...config, gmailClientId: "client", gmailClientSecret: "secret" };
    const app = await buildApp({ sqlite, config: withGmail });
    try {
      const csv = await app.inject({ method: "GET", url: "/api/applications.csv" });
      expect(csv.statusCode).toBe(200);
      expect(csv.headers["content-type"]).toMatch(/csv/);
      expect(csv.body).toMatch(/status/);

      const connect = await app.inject({ method: "GET", url: "/api/gmail/connect" });
      expect(connect.statusCode).toBe(200);
      const url = (connect.json() as { url?: string }).url;
      expect(url).toBeTruthy();
      expect(url).toContain("gmail.readonly");
      expect(url).not.toMatch(/gmail\.modify/);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("nudges after seven silent days", () => {
    const { sqlite } = tempSqlite();
    seedApplication(sqlite, { id: "silent", company: "Acme", title: "Quiet Role" });
    const old = "2026-08-01T00:00:00.000Z";
    sqlite.prepare(`UPDATE applications SET submitted_at = ?, status_updated_at = ?`).run(old, old);
    const nudged = sweepFollowUps(sqlite, new Date("2026-08-27T00:00:00.000Z"));
    expect(nudged).toBe(1);
    sqlite.close();
  });
});
