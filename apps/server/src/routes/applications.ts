import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import type { AppConfig } from "@autoapply/core";
import { ApplicationStatusSchema } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  addContact,
  addInterview,
  addNote,
  applicationsCsv,
  getApplication,
  listApplications,
  parseStatus,
  setApplicationStatus,
  sweepFollowUps,
} from "../applications.ts";

export function registerApplicationRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  config: AppConfig,
): void {
  app.get("/api/applications", async () => ({ applications: listApplications(sqlite) }));

  app.get("/api/applications.csv", async (_request, reply) => {
    return reply
      .header("content-disposition", 'attachment; filename="applications.csv"')
      .type("text/csv")
      .send(applicationsCsv(sqlite));
  });

  app.post("/api/applications/sweep", async () => ({ nudged: sweepFollowUps(sqlite) }));

  app.get("/api/applications/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const application = getApplication(sqlite, params.id);
    if (!application) {
      return reply.code(404).send({ error: "not found" });
    }
    return { application };
  });

  app.patch("/api/applications/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ status: ApplicationStatusSchema }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "status required" });
    }
    const updated = setApplicationStatus(sqlite, params.id, parseStatus(body.data.status), "manual");
    if (!updated) {
      return reply.code(404).send({ error: "not found" });
    }
    return { application: updated };
  });

  app.post("/api/applications/:id/notes", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ body: z.string().min(1) }).safeParse(request.body);
    if (!body.success || !getApplication(sqlite, params.id)) {
      return reply.code(400).send({ error: "note required" });
    }
    return { note: addNote(sqlite, params.id, body.data.body) };
  });

  app.post("/api/applications/:id/contacts", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1),
        email: z.string().optional(),
        role: z.string().optional(),
        notes: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success || !getApplication(sqlite, params.id)) {
      return reply.code(400).send({ error: "name required" });
    }
    return { contact: addContact(sqlite, params.id, body.data) };
  });

  app.post("/api/applications/:id/interviews", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        scheduledAt: z.string().min(1),
        kind: z.string().min(1),
        location: z.string().optional(),
        notes: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success || !getApplication(sqlite, params.id)) {
      return reply.code(400).send({ error: "interview required" });
    }
    return { interview: addInterview(sqlite, params.id, body.data) };
  });

  app.get("/api/applications/:id/proof", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const application = getApplication(sqlite, params.id);
    if (!application?.proofScreenshot) {
      return reply.code(404).send({ error: "not found" });
    }
    const resolved = normalize(application.proofScreenshot);
    const root = join(config.dataDir, "runs");
    const rel = relative(root, resolved);
    if (rel.startsWith("..") || rel.includes(`..${sep}`) || !existsSync(resolved)) {
      return reply.code(404).send({ error: "not found" });
    }
    const type = extname(resolved) === ".jpg" || extname(resolved) === ".jpeg" ? "image/jpeg" : "image/png";
    return reply.type(type).send(createReadStream(resolved));
  });
}
