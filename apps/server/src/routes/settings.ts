import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { readSettings, writeSettings } from "../settings.ts";

export function registerSettingsRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.get("/api/settings", async () => readSettings(sqlite));

  app.put("/api/settings", async (request, reply) => {
    const parsed = z
      .object({
        sites: z.record(z.string(), z.boolean()).optional(),
        dailyCap: z.number().int().positive().optional(),
        salaryFloor: z.number().int().nonnegative().optional(),
        notify: z
          .object({
            email: z.boolean().optional(),
            desktop: z.boolean().optional(),
            telegram: z.boolean().optional(),
          })
          .optional(),
        telegramBotToken: z.string().optional(),
        telegramChatId: z.string().optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid settings" });
    }
    return writeSettings(sqlite, parsed.data);
  });
}
