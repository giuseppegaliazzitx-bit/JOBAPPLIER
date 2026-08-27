import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { listApplications } from "../applications.ts";

export function registerApplicationRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.get("/api/applications", async () => ({ applications: listApplications(sqlite) }));
}
