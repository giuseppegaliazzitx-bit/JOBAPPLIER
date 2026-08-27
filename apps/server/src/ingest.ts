import { randomUUID } from "node:crypto";
import {
  JobPublicSchema,
  canonicalizeUrl,
  classifyApplyKind,
  deriveDedupKey,
  detectJobSource,
  detectPlatform,
  extractJobMetadata,
  extractJobUrls,
  type IngestResult,
  type JobPublic,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";
import type { FetchPage } from "./fetch-page.ts";

export type JobRow = JobPublic;

const JobJoinRow = z.object({
  id: z.string(),
  url: z.string(),
  canonical_url: z.string(),
  dedup_key: z.string(),
  source: z.string(),
  company_id: z.string().nullable(),
  company_name: z.string().nullable(),
  title: z.string().nullable(),
  location: z.string().nullable(),
  platform: z.string(),
  apply_kind: z.string(),
  status: z.string(),
  posted_at: z.string().nullable(),
  description: z.string().nullable(),
  created_at: z.string(),
});

function mapJob(row: unknown): JobRow {
  const parsed = JobJoinRow.parse(row);
  return JobPublicSchema.parse({
    id: parsed.id,
    url: parsed.url,
    canonicalUrl: parsed.canonical_url,
    dedupKey: parsed.dedup_key,
    source: parsed.source,
    companyId: parsed.company_id,
    companyName: parsed.company_name,
    title: parsed.title,
    location: parsed.location,
    platform: parsed.platform,
    applyKind: parsed.apply_kind,
    status: parsed.status,
    postedAt: parsed.posted_at,
    description: parsed.description,
    createdAt: parsed.created_at,
  });
}

const JOB_SELECT = `
  SELECT jobs.id, jobs.url, jobs.canonical_url, jobs.dedup_key, jobs.source,
         jobs.company_id, companies.name AS company_name, jobs.title, jobs.location,
         jobs.platform, jobs.apply_kind, jobs.status, jobs.posted_at, jobs.description, jobs.created_at
  FROM jobs
  LEFT JOIN companies ON companies.id = jobs.company_id
`;

export function listJobs(
  sqlite: SqliteDatabase,
  filters: { platform?: string; status?: string; applyKind?: string },
): JobRow[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filters.platform) {
    clauses.push("jobs.platform = ?");
    params.push(filters.platform);
  }
  if (filters.status) {
    clauses.push("jobs.status = ?");
    params.push(filters.status);
  }
  if (filters.applyKind) {
    clauses.push("jobs.apply_kind = ?");
    params.push(filters.applyKind);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = sqlite.prepare(`${JOB_SELECT} ${where} ORDER BY jobs.created_at DESC`).all(...params);
  return rows.map((row) => mapJob(row));
}

function findCompanyId(sqlite: SqliteDatabase, name: string): string {
  const existing = sqlite
    .prepare(`SELECT id FROM companies WHERE lower(name) = lower(?)`)
    .get(name);
  const parsed = z.object({ id: z.string() }).safeParse(existing);
  if (parsed.success) {
    return parsed.data.id;
  }
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO companies (id, name, domains_json, blacklisted) VALUES (?, ?, '[]', 0)`,
    )
    .run(id, name);
  return id;
}

function getJobByDedup(sqlite: SqliteDatabase, dedupKey: string): JobRow | null {
  const row = sqlite.prepare(`${JOB_SELECT} WHERE jobs.dedup_key = ?`).get(dedupKey);
  return row === undefined ? null : mapJob(row);
}

export async function ingestUrl(
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
  rawUrl: string,
): Promise<IngestResult> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) {
    return { url: rawUrl, status: "error", message: "not a valid http(s) URL" };
  }

  let html = "";
  let finalUrl = canonical;
  try {
    const page = await fetchPage(canonical);
    finalUrl = canonicalizeUrl(page.finalUrl) ?? canonical;
    html = page.body;
  } catch (error) {
    html = "";
    const message = error instanceof Error ? error.message : "fetch failed";
    if (message.includes("abort")) {
      // Timeout: still record the job from the URL alone.
    }
  }

  const metadata = html.length > 0 ? extractJobMetadata(html) : {
    title: null,
    company: null,
    location: null,
    description: null,
    postedAt: null,
  };
  const platform = detectPlatform(finalUrl, html.length > 0 ? html : undefined);
  const applyKind = classifyApplyKind(finalUrl, html.length > 0 ? html : undefined);
  const source = detectJobSource(rawUrl);
  const dedupKey = deriveDedupKey({
    url: finalUrl,
    html: html.length > 0 ? html : undefined,
    title: metadata.title,
    company: metadata.company,
    location: metadata.location,
  });

  const existing = getJobByDedup(sqlite, dedupKey);
  if (existing) {
    return { url: rawUrl, status: "deduped", job: existing };
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const companyId = metadata.company ? findCompanyId(sqlite, metadata.company) : null;
  sqlite
    .prepare(
      `INSERT INTO jobs (
         id, url, canonical_url, dedup_key, source, company_id, title, location,
         platform, salary_min, salary_max, posted_at, fit_score, status, created_at,
         description, apply_kind
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, 'inbox', ?, ?, ?)`,
    )
    .run(
      id,
      rawUrl,
      finalUrl,
      dedupKey,
      source,
      companyId,
      metadata.title,
      metadata.location,
      platform,
      metadata.postedAt,
      createdAt,
      metadata.description,
      applyKind,
    );

  const created = getJobByDedup(sqlite, dedupKey);
  if (!created) {
    return { url: rawUrl, status: "error", message: "job row missing after insert" };
  }
  return { url: rawUrl, status: "created", job: created };
}

export async function ingestPaste(
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
  text: string,
): Promise<{ results: IngestResult[] }> {
  const urls = extractJobUrls(text);
  const results: IngestResult[] = [];
  for (const url of urls) {
    results.push(await ingestUrl(sqlite, fetchPage, url));
  }
  return { results };
}
