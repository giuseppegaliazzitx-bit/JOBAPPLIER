import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { funnelSql, loadMetrics } from "../metrics.ts";

export function registerMetricsRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.get("/api/metrics", async () => loadMetrics(sqlite));

  app.get("/api/metrics/funnel", async () => funnelSql(sqlite));
}
