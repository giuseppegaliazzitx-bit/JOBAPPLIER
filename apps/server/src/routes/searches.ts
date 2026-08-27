import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { FetchPage } from "../fetch-page.ts";
import { createSearch, listSearches, runDueSearches, runSearch } from "../searches.ts";

export function registerSearchRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  fetchPage: FetchPage,
): void {
  app.get("/api/searches", async () => ({ searches: listSearches(sqlite) }));

  app.post("/api/searches", async (request, reply) => {
    const parsed = z
      .object({
        name: z.string().min(1),
        text: z.string().min(1),
        intervalMinutes: z.number().int().positive().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "name and text required" });
    }
    return { search: createSearch(sqlite, parsed.data) };
  });

  app.post("/api/searches/:id/run", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      return await runSearch(sqlite, fetchPage, params.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "run failed";
      return reply.code(404).send({ error: message });
    }
  });

  app.post("/api/searches/tick", async () => ({ ran: await runDueSearches(sqlite, fetchPage) }));
}
