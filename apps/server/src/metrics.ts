import { computeMetrics, type MetricsSnapshot } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";

const Count = z.object({ n: z.number() });

export function funnelSql(sqlite: SqliteDatabase) {
  const jobsAdded = Count.parse(sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs`).get()).n;
  const applied = Count.parse(sqlite.prepare(`SELECT COUNT(*) AS n FROM applications`).get()).n;
  const viewed = Count.parse(
    sqlite.prepare(
      `SELECT COUNT(*) AS n FROM applications WHERE status IN ('viewed','screening','interview','offer')`,
    ).get(),
  ).n;
  const screening = Count.parse(
    sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE status IN ('screening','interview','offer')`).get(),
  ).n;
  const interview = Count.parse(
    sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE status IN ('interview','offer')`).get(),
  ).n;
  const offer = Count.parse(sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE status = 'offer'`).get()).n;
  return { jobsAdded, applied, viewed, screening, interview, offer };
}

export function loadMetrics(sqlite: SqliteDatabase): MetricsSnapshot {
  const jobsAdded = Count.parse(sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs`).get()).n;
  const apps = sqlite
    .prepare(
      `SELECT a.status AS status, a.submitted_at AS submitted_at, a.status_updated_at AS status_updated_at,
              a.last_mail_at AS last_mail_at, j.platform AS platform, j.title AS title, d.label AS resume_variant
       FROM applications a
       LEFT JOIN jobs j ON j.id = a.job_id
       LEFT JOIN documents d ON d.id = a.resume_document_id`,
    )
    .all()
    .map((row) => {
      const parsed = z
        .object({
          status: z.string(),
          submitted_at: z.string().nullable(),
          status_updated_at: z.string(),
          last_mail_at: z.string().nullable(),
          platform: z.string().nullable(),
          title: z.string().nullable(),
          resume_variant: z.string().nullable(),
        })
        .parse(row);
      return {
        status: parsed.status,
        submittedAt: parsed.submitted_at,
        statusUpdatedAt: parsed.status_updated_at,
        lastMailAt: parsed.last_mail_at,
        platform: parsed.platform ?? "unknown",
        title: parsed.title,
        resumeVariant: parsed.resume_variant,
      };
    });
  const aiCalls = sqlite
    .prepare(
      `SELECT c.created_at AS created_at, c.purpose AS purpose, c.cost_usd AS cost_usd, c.in_tokens AS in_tokens,
              c.out_tokens AS out_tokens, c.cache_hit AS cache_hit, j.platform AS platform
       FROM ai_calls c
       LEFT JOIN runs r ON r.id = c.run_id
       LEFT JOIN jobs j ON j.id = r.job_id`,
    )
    .all()
    .map((row) => {
      const parsed = z
        .object({
          created_at: z.string(),
          purpose: z.string(),
          cost_usd: z.number(),
          in_tokens: z.number(),
          out_tokens: z.number(),
          cache_hit: z.union([z.number(), z.boolean()]),
          platform: z.string().nullable(),
        })
        .parse(row);
      return {
        createdAt: parsed.created_at,
        purpose: parsed.purpose,
        costUsd: parsed.cost_usd,
        inTokens: parsed.in_tokens,
        outTokens: parsed.out_tokens,
        cacheHit: Boolean(parsed.cache_hit),
        platform: parsed.platform,
      };
    });
  const runs = sqlite
    .prepare(`SELECT wall_ms AS wall_ms, status AS status FROM runs`)
    .all()
    .map((row) => {
      const parsed = z.object({ wall_ms: z.number().nullable(), status: z.string() }).parse(row);
      return { wallMs: parsed.wall_ms, status: parsed.status };
    });
  return computeMetrics({ jobsAdded, applications: apps, aiCalls, runs });
}
