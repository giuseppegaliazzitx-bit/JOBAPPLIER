import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { type AppConfig, type EmbedFn } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import Fastify from "fastify";
import { SERVER_PHASE } from "./config.ts";
import { createFetchPage, type FetchPage } from "./fetch-page.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerJobRoutes } from "./routes/jobs.ts";
import { registerProfileRoutes } from "./routes/profile.ts";
import { registerQuestionRoutes } from "./routes/questions.ts";
import { registerResolveRoutes } from "./routes/resolve.ts";
import { registerRunRoutes } from "./routes/runs.ts";

export type BuildAppOptions = {
  sqlite: SqliteDatabase;
  config: AppConfig;
  fetchPage?: FetchPage;
  embed?: EmbedFn;
};

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: false });
  const fetchPage = options.fetchPage ?? createFetchPage(options.config);

  await app.register(cors, {
    origin: [
      options.config.webOrigin,
      "http://127.0.0.1:5173",
      "http://localhost:5173",
      "http://127.0.0.1:5174",
      "http://localhost:5174",
      "http://127.0.0.1:5176",
      "http://localhost:5176",
    ],
  });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(websocket);

  app.get("/health", async () => ({ ok: true as const }));

  app.get("/api/meta", async () => ({
    name: "autoapply",
    phase: SERVER_PHASE,
    browser: "sessionkit",
  }));

  app.get("/ws", { websocket: true }, (socket) => {
    socket.on("message", (message: Buffer | string) => {
      socket.send(message);
    });
  });

  registerProfileRoutes(app, options.sqlite);
  registerDocumentRoutes(app, options.sqlite, options.config);
  registerJobRoutes(app, options.sqlite, fetchPage);
  registerQuestionRoutes(app, options.sqlite, options.embed);
  registerResolveRoutes(app, options.sqlite, options.embed);
  registerRunRoutes(app, options.sqlite, options.config.dataDir, options.embed);

  return app;
}
