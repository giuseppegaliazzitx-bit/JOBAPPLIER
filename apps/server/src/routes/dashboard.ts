import { listQueue, type SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listRecipes, listVersions } from "../recipes.ts";

export function registerDashboardRoutes(app: FastifyInstance, sqlite: SqliteDatabase): void {
  app.get("/api/dashboard", async () => {
    const blocked = listQueue(sqlite, { type: "blocked", status: "pending" });
    const notifies = listQueue(sqlite, { type: "notify", status: "pending" });
    const unanswered = sqlite.prepare(`SELECT COUNT(*) AS n FROM questions`).get();
    const spend = sqlite
      .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS n FROM ai_calls WHERE created_at >= ?`)
      .get(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    let degraded = 0;
    for (const recipe of listRecipes(sqlite)) {
      degraded += listVersions(sqlite, recipe.id).filter((item) => item.status === "degraded").length;
    }
    const Payload = z.object({ message: z.string().optional(), runId: z.string().optional(), reason: z.string().optional() });
    return {
      blockedRuns: blocked.length,
      unansweredQuestions: Number(
        unanswered && typeof unanswered === "object" && "n" in unanswered ? unanswered.n : 0,
      ),
      todaySpend: Number(spend && typeof spend === "object" && "n" in spend ? spend.n : 0),
      degradedRecipes: degraded,
      blocked: blocked.map((item) => {
        const payload = Payload.safeParse(JSON.parse(item.payloadJson));
        return {
          id: item.id,
          createdAt: item.createdAt,
          reason: payload.success ? payload.data.reason : item.type,
          runId: payload.success ? payload.data.runId : undefined,
        };
      }),
      notifications: notifies.map((item) => {
        const payload = Payload.safeParse(JSON.parse(item.payloadJson));
        return {
          id: item.id,
          createdAt: item.createdAt,
          message: payload.success ? (payload.data.message ?? "Notification") : "Notification",
        };
      }),
    };
  });
}
