import { FieldInventorySchema, resolveInventory, type EmbedFn } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { importInventory, loadBank, loadOptionAliases } from "../bank.ts";
import { loadProfile } from "./questions.ts";

export function registerResolveRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  embed?: EmbedFn,
): void {
  app.post("/api/resolve", async (request, reply) => {
    const body = z
      .object({
        inventory: FieldInventorySchema,
        companyName: z.string().optional(),
        jobTitle: z.string().optional(),
        jobUrl: z.string().optional(),
        jobId: z.string().optional(),
        persistQuestions: z.boolean().optional(),
      })
      .safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    if (body.data.persistQuestions !== false) {
      const blocker = body.data.jobTitle
        ? { jobId: body.data.jobId, title: body.data.jobTitle, url: body.data.jobUrl }
        : undefined;
      importInventory(sqlite, body.data.inventory, blocker);
    }
    const resolutions = await resolveInventory(body.data.inventory, loadBank(sqlite), {
      embed,
      company: body.data.companyName,
      profile: loadProfile(sqlite),
      optionAliases: loadOptionAliases(sqlite),
    });
    return { resolutions };
  });
}
