import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FetchPage } from "../fetch-page.ts";
import { ingestPaste, listJobs } from "../ingest.ts";

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
      })
      .parse(request.query);
    return { jobs: listJobs(sqlite, query) };
  });

  app.post("/api/jobs", async (request, reply) => {
    const body = z.object({ text: z.string().min(1) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "text is required" });
    }
    const { results } = await ingestPaste(sqlite, fetchPage, body.data.text);
    return { results, jobs: listJobs(sqlite, {}) };
  });
}
