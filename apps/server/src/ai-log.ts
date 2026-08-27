import { randomUUID } from "node:crypto";
import type { AiCallLog } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";

export function logAiCall(sqlite: SqliteDatabase, log: AiCallLog): void {
  sqlite
    .prepare(
      `INSERT INTO ai_calls (id, run_id, purpose, model, in_tokens, out_tokens, cost_usd, cache_hit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      log.runId ?? null,
      log.purpose,
      log.model,
      log.inTokens,
      log.outTokens,
      log.costUsd,
      log.cacheHit ? 1 : 0,
      new Date().toISOString(),
    );
}

export function daySpendUsd(sqlite: SqliteDatabase): number {
  const today = new Date().toISOString().slice(0, 10);
  const row = sqlite
    .prepare(`SELECT COALESCE(SUM(cost_usd), 0) AS n FROM ai_calls WHERE created_at >= ?`)
    .get(`${today}T00:00:00.000Z`);
  return Number(row && typeof row === "object" && "n" in row ? row.n : 0);
}
