import type { AppConfig, EmbedFn } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { drainApplyQueue, enqueueBatch } from "../batch.ts";

export function registerBatchRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  config: AppConfig,
  embed?: EmbedFn,
): void {
  app.post("/api/batch", async (request, reply) => {
    const parsed = z
      .object({
        jobIds: z.array(z.string().min(1)).min(1),
        start: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "jobIds required" });
    }
    const jobIds = enqueueBatch(sqlite, parsed.data.jobIds);
    if (parsed.data.start !== false) {
      void drainApplyQueue({ sqlite, config, embed });
    }
    return { queued: jobIds.length, jobIds };
  });
}
