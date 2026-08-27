import { MailMessageSchema } from "@autoapply/core";
import type { AppConfig } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fetchGmailMessages, finishGmailConnect, gmailStatus, startGmailConnect } from "../gmail.ts";
import { ingestMailbox } from "../inbox.ts";
import { sweepFollowUps } from "../applications.ts";

export function registerGmailRoutes(app: FastifyInstance, sqlite: SqliteDatabase, config: AppConfig): void {
  app.get("/api/gmail/status", async () => gmailStatus(sqlite, config));

  app.get("/api/gmail/connect", async (_request, reply) => {
    try {
      return { url: startGmailConnect(sqlite, config) };
    } catch (error) {
      const message = error instanceof Error ? error.message : "gmail not configured";
      return reply.code(409).send({ error: message });
    }
  });

  app.get("/api/gmail/callback", async (request, reply) => {
    const query = z.object({ code: z.string().optional(), state: z.string().optional() }).parse(request.query);
    try {
      await finishGmailConnect(sqlite, config, query);
      return reply.redirect(`${config.webOrigin}/settings`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "oauth failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.post("/api/gmail/sync", async (_request, reply) => {
    try {
      const messages = await fetchGmailMessages(sqlite);
      const ingested = await ingestMailbox(sqlite, messages);
      sweepFollowUps(sqlite);
      return { ingested: ingested.length, results: ingested };
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      return reply.code(409).send({ error: message });
    }
  });

  app.post("/api/inbox/ingest", async (request, reply) => {
    const parsed = z.object({ messages: z.array(MailMessageSchema).min(1) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "messages required" });
    }
    const results = await ingestMailbox(sqlite, parsed.data.messages);
    sweepFollowUps(sqlite);
    return { ingested: results.length, results };
  });
}
