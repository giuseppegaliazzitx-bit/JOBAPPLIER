import { randomUUID } from "node:crypto";
import {
  JobPublicSchema,
  canonicalizeUrl,
  classifyApplyKind,
  computeFitScore,
  deriveDedupKey,
  detectJobSource,
  detectPlatform,
  extractJobMetadata,
  extractJobUrls,
  isStaffingAgency,
  isStale,
  locationMismatch,
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
  fit_score: z.number().nullable().optional(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  staffing_agency: z.union([z.number(), z.boolean()]).optional(),
  blacklisted: z.union([z.number(), z.boolean()]).nullable().optional(),
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
    fitScore: parsed.fit_score ?? null,
    salaryMin: parsed.salary_min ?? null,
    salaryMax: parsed.salary_max ?? null,
    staffingAgency: Boolean(parsed.staffing_agency),
    blacklisted: Boolean(parsed.blacklisted),
  });
}

const JOB_SELECT = `
  SELECT jobs.id, jobs.url, jobs.canonical_url, jobs.dedup_key, jobs.source,
         jobs.company_id, companies.name AS company_name, jobs.title, jobs.location,
         jobs.platform, jobs.apply_kind, jobs.status, jobs.posted_at, jobs.description, jobs.created_at,
         jobs.fit_score, jobs.salary_min, jobs.salary_max, jobs.staffing_agency, companies.blacklisted
  FROM jobs
  LEFT JOIN companies ON companies.id = jobs.company_id
`;

export type JobListFilters = {
  platform?: string;
  status?: string;
  applyKind?: string;
  staffingAgency?: boolean;
  stale?: boolean;
  blacklisted?: boolean;
  salaryFloor?: number;
  locationMismatch?: boolean;
  hideReposts?: boolean;
  minFit?: number;
  city?: string;
  country?: string;
};

export function listJobs(sqlite: SqliteDatabase, filters: JobListFilters): JobRow[] {
  const clauses: string[] = [];
  const params: Array<string | number> = [];
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
  if (filters.staffingAgency === true) {
    clauses.push("jobs.staffing_agency = 1");
  }
  if (filters.staffingAgency === false) {
    clauses.push("jobs.staffing_agency = 0");
  }
  if (filters.blacklisted === true) {
    clauses.push("companies.blacklisted = 1");
  }
  if (filters.blacklisted === false) {
    clauses.push("(companies.blacklisted = 0 OR companies.blacklisted IS NULL)");
  }
  if (filters.salaryFloor !== undefined) {
    clauses.push("(jobs.salary_min IS NULL OR jobs.salary_min >= ?)");
    params.push(filters.salaryFloor);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  let rows = sqlite.prepare(`${JOB_SELECT} ${where} ORDER BY jobs.created_at DESC`).all(...params).map(mapJob);
  if (filters.stale === true) {
    rows = rows.filter((job) => isStale(job.postedAt, job.createdAt));
  }
  if (filters.stale === false) {
    rows = rows.filter((job) => !isStale(job.postedAt, job.createdAt));
  }
  if (filters.locationMismatch === true) {
    rows = rows.filter((job) => locationMismatch(job.location, { city: filters.city, country: filters.country }));
  }
  if (filters.minFit !== undefined) {
    const minFit = filters.minFit;
    rows = rows.filter((job) => (job.fitScore ?? 0) >= minFit);
  }
  if (filters.hideReposts) {
    const seen = new Set<string>();
    rows = rows.filter((job) => {
      const key = `${(job.title ?? "").toLowerCase()}|${(job.companyName ?? "").toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  return rows;
}

export function getJob(sqlite: SqliteDatabase, id: string): JobRow | undefined {
  const row = sqlite.prepare(`${JOB_SELECT} WHERE jobs.id = ?`).get(id);
  return row === undefined ? undefined : mapJob(row);
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
  const staffing = isStaffingAgency(metadata.company ?? "", metadata.description ?? "") ? 1 : 0;
  const resumes = sqlite
    .prepare(`SELECT keywords_json FROM documents WHERE kind = 'resume'`)
    .all()
    .flatMap((row) => {
      const parsed = z.object({ keywords_json: z.string() }).safeParse(row);
      if (!parsed.success) {
        return [];
      }
      try {
        return z.array(z.string()).parse(JSON.parse(parsed.data.keywords_json));
      } catch {
        return [];
      }
    });
  const fit = computeFitScore({
    description: metadata.description ?? "",
    title: metadata.title ?? "",
    resumeKeywords: resumes,
  });
  sqlite
    .prepare(
      `INSERT INTO jobs (
         id, url, canonical_url, dedup_key, source, company_id, title, location,
         platform, salary_min, salary_max, posted_at, fit_score, status, created_at,
         description, apply_kind, staffing_agency
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, 'inbox', ?, ?, ?, ?)`,
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
      fit,
      createdAt,
      metadata.description,
      applyKind,
      staffing,
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
