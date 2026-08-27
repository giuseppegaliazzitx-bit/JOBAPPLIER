import { randomUUID } from "node:crypto";
import { coverLetterTemplate, jobFamily } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";

export function coverLetterForJob(
  sqlite: SqliteDatabase,
  job: { id: string; title: string | null; companyName: string | null },
): { family: string; body: string; cached: boolean } {
  const family = jobFamily(job.title ?? "general");
  const existing = sqlite.prepare(`SELECT body FROM cover_letters WHERE job_family = ?`).get(family);
  const parsed = z.object({ body: z.string() }).safeParse(existing);
  if (parsed.success) {
    return { family, body: parsed.data.body, cached: true };
  }
  const body = coverLetterTemplate({
    title: job.title ?? "this role",
    company: job.companyName ?? "your company",
  });
  sqlite
    .prepare(`INSERT INTO cover_letters (id, job_family, body, created_at) VALUES (?, ?, ?, ?)`)
    .run(randomUUID(), family, body, new Date().toISOString());
  return { family, body, cached: false };
}
