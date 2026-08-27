import {
  PROFILE_FIELDS,
  ProfileValuesSchema,
  isProfileKey,
  profileValuesFromStore,
  serializeProfileValue,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const ProfileRow = z.object({
  key: z.string(),
  value: z.string(),
});

export function registerProfileRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.get("/api/profile", async () => {
    const rows = sqlite.prepare(`SELECT key, value FROM profile`).all().map((row) => ProfileRow.parse(row));
    return { values: profileValuesFromStore(rows), fields: PROFILE_FIELDS };
  });

  app.put("/api/profile", async (request, reply) => {
    const parsed = ProfileValuesSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }
    const now = new Date().toISOString();
    const upsert = sqlite.prepare(
      `INSERT INTO profile (id, key, value, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    const entries = Object.entries(parsed.data);
    sqlite.transaction(() => {
      for (const [key, value] of entries) {
        if (!isProfileKey(key) || value === undefined) {
          continue;
        }
        upsert.run(randomUUID(), key, serializeProfileValue(key, value), now);
      }
    })();
    const rows = sqlite.prepare(`SELECT key, value FROM profile`).all().map((row) => ProfileRow.parse(row));
    return { values: profileValuesFromStore(rows), fields: PROFILE_FIELDS };
  });
}
