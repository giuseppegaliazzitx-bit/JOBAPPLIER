import cors from "@fastify/cors";
import Fastify from "fastify";
import { SERVER_PHASE } from "./config.ts";

export async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  });

  app.get("/health", async () => ({ ok: true as const }));

  app.get("/api/meta", async () => ({
    name: "autoapply",
    phase: SERVER_PHASE,
    browser: "sessionkit",
  }));

  return app;
}
