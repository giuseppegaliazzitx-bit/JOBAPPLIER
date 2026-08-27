import { keywordGap, selectResumeVariant } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { coverLetterForJob } from "../cover.ts";
import type { FetchPage } from "../fetch-page.ts";
import { getJob, ingestPaste, listJobs } from "../ingest.ts";
import { loadProfile } from "./questions.ts";

export function registerJobRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
): void {
  app.get("/api/jobs", async (request) => {
    const query = z
      .object({
        platform: z.string().optional(),
        status: z.string().optional(),
        applyKind: z.string().optional(),
        staffingAgency: z.enum(["true", "false"]).optional(),
        stale: z.enum(["true", "false"]).optional(),
        blacklisted: z.enum(["true", "false"]).optional(),
        salaryFloor: z.coerce.number().optional(),
        locationMismatch: z.enum(["true", "false"]).optional(),
        hideReposts: z.enum(["true", "false"]).optional(),
        minFit: z.coerce.number().optional(),
      })
      .parse(request.query);
    const profile = loadProfile(sqlite);
    return {
      jobs: listJobs(sqlite, {
        platform: query.platform,
        status: query.status,
        applyKind: query.applyKind,
        staffingAgency: query.staffingAgency === undefined ? undefined : query.staffingAgency === "true",
        stale: query.stale === undefined ? undefined : query.stale === "true",
        blacklisted: query.blacklisted === undefined ? undefined : query.blacklisted === "true",
        salaryFloor: query.salaryFloor,
        locationMismatch: query.locationMismatch === undefined ? undefined : query.locationMismatch === "true",
        hideReposts: query.hideReposts === "true",
        minFit: query.minFit,
        city: typeof profile.city === "string" ? profile.city : undefined,
        country: typeof profile.country === "string" ? profile.country : undefined,
      }),
    };
  });

  app.post("/api/jobs", async (request, reply) => {
    const body = z.object({ text: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "text is required" });
    }
    const { results } = await ingestPaste(sqlite, fetchPage, body.data.text);
    return { results, jobs: listJobs(sqlite, {}) };
  });

  app.get("/api/jobs/:id/gap", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const job = getJob(sqlite, params.id);
    if (!job) {
      return reply.code(404).send({ error: "not found" });
    }
    const resumes = sqlite
      .prepare(`SELECT id, label, keywords_json FROM documents WHERE kind = 'resume'`)
      .all()
      .flatMap((row) => {
        const parsed = z.object({ id: z.string(), label: z.string(), keywords_json: z.string() }).safeParse(row);
        if (!parsed.success) {
          return [];
        }
        let keywords: string[] = [];
        try {
          keywords = z.array(z.string()).parse(JSON.parse(parsed.data.keywords_json));
        } catch {
          keywords = [];
        }
        return [{ id: parsed.data.id, label: parsed.data.label, keywords }];
      });
    const chosen = selectResumeVariant(job.description ?? "", job.title ?? "", resumes);
    return {
      resume: chosen ? { id: chosen.id, label: chosen.label } : null,
      gap: keywordGap(job.description ?? "", chosen?.keywords ?? []),
    };
  });

  app.get("/api/jobs/:id/cover-letter", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const job = getJob(sqlite, params.id);
    if (!job) {
      return reply.code(404).send({ error: "not found" });
    }
    return coverLetterForJob(sqlite, job);
  });
}
