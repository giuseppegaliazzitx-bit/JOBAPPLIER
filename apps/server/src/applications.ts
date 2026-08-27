import { randomUUID } from "node:crypto";
import { hostFromUrl } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";

export type ApplicationRecord = {
  id: string;
  jobId: string;
  runId: string | null;
  submittedAt: string | null;
  proofScreenshot: string | null;
  status: string;
  url: string | null;
  title: string | null;
};

export function recordApplication(
  sqlite: SqliteDatabase,
  input: { jobId: string; runId: string; proofPath: string },
): ApplicationRecord {
  const now = new Date().toISOString();
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO applications (id, job_id, run_id, submitted_at, proof_screenshot, status, status_updated_at, source_of_status)
       VALUES (?, ?, ?, ?, ?, 'applied', ?, 'submit')`,
    )
    .run(id, input.jobId, input.runId, now, input.proofPath, now);
  sqlite.prepare(`UPDATE jobs SET status = 'applied' WHERE id = ?`).run(input.jobId);
  return {
    id,
    jobId: input.jobId,
    runId: input.runId,
    submittedAt: now,
    proofScreenshot: input.proofPath,
    status: "applied",
    url: null,
    title: null,
  };
}

export function listApplications(sqlite: SqliteDatabase): ApplicationRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT a.id AS id, a.job_id AS job_id, a.run_id AS run_id, a.submitted_at AS submitted_at,
              a.proof_screenshot AS proof_screenshot, a.status AS status, j.url AS url, j.title AS title
       FROM applications a
       LEFT JOIN jobs j ON j.id = a.job_id
       ORDER BY a.submitted_at DESC`,
    )
    .all();
  return rows.map((row) => {
    const parsed = z
      .object({
        id: z.string(),
        job_id: z.string(),
        run_id: z.string().nullable(),
        submitted_at: z.string().nullable(),
        proof_screenshot: z.string().nullable(),
        status: z.string(),
        url: z.string().nullable(),
        title: z.string().nullable(),
      })
      .parse(row);
    return {
      id: parsed.id,
      jobId: parsed.job_id,
      runId: parsed.run_id,
      submittedAt: parsed.submitted_at,
      proofScreenshot: parsed.proof_screenshot,
      status: parsed.status,
      url: parsed.url,
      title: parsed.title,
    };
  });
}

export function countTodaySubmits(sqlite: SqliteDatabase, host: string, now = new Date()): number {
  const start = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const rows = sqlite
    .prepare(
      `SELECT j.url AS url FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.submitted_at IS NOT NULL AND a.submitted_at >= ?`,
    )
    .all(start);
  return rows.filter((row) => {
    const parsed = z.object({ url: z.string() }).safeParse(row);
    return parsed.success && hostFromUrl(parsed.data.url) === host;
  }).length;
}
