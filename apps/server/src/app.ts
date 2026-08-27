import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { type AppConfig, type EmbedFn } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import Fastify from "fastify";
import { SERVER_PHASE } from "./config.ts";
import { createFetchPage, type FetchPage } from "./fetch-page.ts";
import { registerApplicationRoutes } from "./routes/applications.ts";
import { registerBatchRoutes } from "./routes/batch.ts";
import { registerDashboardRoutes } from "./routes/dashboard.ts";
import { registerDocumentRoutes } from "./routes/documents.ts";
import { registerJobRoutes } from "./routes/jobs.ts";
import { registerProfileRoutes } from "./routes/profile.ts";
import { registerQuestionRoutes } from "./routes/questions.ts";
import { registerResolveRoutes } from "./routes/resolve.ts";
import { registerRecipeRoutes } from "./routes/recipes.ts";
import { registerRunRoutes } from "./routes/runs.ts";
import { registerGmailRoutes } from "./routes/gmail.ts";
import { registerMetricsRoutes } from "./routes/metrics.ts";
import { registerNotifyRoutes } from "./routes/notify.ts";
import { registerSearchRoutes } from "./routes/searches.ts";
import { registerSettingsRoutes } from "./routes/settings.ts";
import { seedBundledRecipes } from "./recipes.ts";

export type BuildAppOptions = {
  sqlite: SqliteDatabase;
  config: AppConfig;
  fetchPage?: FetchPage;
  embed?: EmbedFn;
};

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: false });
  const fetchPage = options.fetchPage ?? createFetchPage(options.config);

  const allowed = new Set([
    options.config.webOrigin,
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:5176",
    "http://localhost:5176",
  ]);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowed.has(origin) || origin.startsWith("chrome-extension://")) {
        callback(null, true);
        return;
      }
      callback(new Error("origin not allowed"), false);
    },
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

  registerDashboardRoutes(app, options.sqlite);
  registerProfileRoutes(app, options.sqlite);
  registerDocumentRoutes(app, options.sqlite, options.config);
  registerJobRoutes(app, options.sqlite, fetchPage);
  registerQuestionRoutes(app, options.sqlite, options.embed);
  registerResolveRoutes(app, options.sqlite, options.embed);
  registerRunRoutes(app, options.sqlite, options.config, options.embed);
  seedBundledRecipes(options.sqlite);
  registerRecipeRoutes(app, options.sqlite, options.embed);
  registerSettingsRoutes(app, options.sqlite);
  registerApplicationRoutes(app, options.sqlite, options.config);
  registerGmailRoutes(app, options.sqlite, options.config);
  registerMetricsRoutes(app, options.sqlite);
  registerSearchRoutes(app, options.sqlite, fetchPage);
  registerNotifyRoutes(app, options.sqlite);
  registerBatchRoutes(app, options.sqlite, options.config, options.embed);

  return app;
}
