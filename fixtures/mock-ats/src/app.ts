import Fastify from "fastify";

export async function buildMockAts() {
  const app = Fastify({ logger: false });
  app.get("/health", async () => ({ ok: true as const, name: "mock-ats" as const }));
  return app;
}
