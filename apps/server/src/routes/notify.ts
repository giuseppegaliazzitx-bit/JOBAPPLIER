import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listApplications } from "../applications.ts";
import { dispatchNotification, interviewsToIcs } from "../notify.ts";

export function registerNotifyRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.post("/api/notify", async (request, reply) => {
    const parsed = z
      .object({
        message: z.string().min(1),
        channels: z.array(z.enum(["email", "desktop", "telegram"])).optional(),
      })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "message required" });
    }
    await dispatchNotification(sqlite, parsed.data.message, { channels: parsed.data.channels });
    return { ok: true };
  });

  app.get("/api/calendar.ics", async (_request, reply) => {
    const events = listApplications(sqlite).flatMap((app) =>
      app.interviews.map((item) => ({
        title: `Interview: ${app.title ?? app.jobId}`,
        scheduledAt: item.scheduledAt,
        location: item.location,
      })),
    );
    return reply
      .header("content-disposition", 'attachment; filename="autoapply-interviews.ics"')
      .type("text/calendar")
      .send(interviewsToIcs(events));
  });
}
