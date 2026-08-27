import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SqliteDatabase } from "./client.ts";

export const QueueItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  payloadJson: z.string(),
  status: z.enum(["pending", "running", "done", "failed"]),
  availableAt: z.string(),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

const Row = z.object({
  id: z.string(),
  type: z.string(),
  payload_json: z.string(),
  status: z.string(),
  available_at: z.string(),
  attempts: z.number(),
  last_error: z.string().nullable(),
  created_at: z.string(),
});

function toItem(row: unknown): QueueItem {
  const parsed = Row.parse(row);
  return QueueItemSchema.parse({
    id: parsed.id,
    type: parsed.type,
    payloadJson: parsed.payload_json,
    status: parsed.status,
    availableAt: parsed.available_at,
    attempts: parsed.attempts,
    lastError: parsed.last_error,
    createdAt: parsed.created_at,
  });
}

export function enqueue(
  sqlite: SqliteDatabase,
  type: string,
  payload: unknown,
  availableAt = new Date().toISOString(),
): QueueItem {
  const item: QueueItem = {
    id: randomUUID(),
    type,
    payloadJson: JSON.stringify(payload),
    status: "pending",
    availableAt,
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
  };
  sqlite
    .prepare(
      `INSERT INTO queue (id, type, payload_json, status, available_at, attempts, last_error, created_at)
       VALUES (@id, @type, @payloadJson, @status, @availableAt, @attempts, @lastError, @createdAt)`,
    )
    .run(item);
  return item;
}

export function claimNext(sqlite: SqliteDatabase, type?: string): QueueItem | null {
  const now = new Date().toISOString();
  const row = sqlite.transaction(() => {
    const found = type
      ? sqlite
          .prepare(
            `SELECT * FROM queue
             WHERE status = 'pending' AND type = ? AND available_at <= ?
             ORDER BY created_at ASC LIMIT 1`,
          )
          .get(type, now)
      : sqlite
          .prepare(
            `SELECT * FROM queue
             WHERE status = 'pending' AND available_at <= ?
             ORDER BY created_at ASC LIMIT 1`,
          )
          .get(now);
    if (found === undefined) {
      return null;
    }
    const item = toItem(found);
    sqlite
      .prepare(
        `UPDATE queue SET status = 'running', attempts = attempts + 1 WHERE id = ? AND status = 'pending'`,
      )
      .run(item.id);
    const updated = sqlite.prepare(`SELECT * FROM queue WHERE id = ?`).get(item.id);
    return updated === undefined ? null : toItem(updated);
  })();
  return row;
}

export function completeJob(sqlite: SqliteDatabase, id: string): void {
  sqlite.prepare(`UPDATE queue SET status = 'done', last_error = NULL WHERE id = ?`).run(id);
}

export function failJob(sqlite: SqliteDatabase, id: string, error: string): void {
  sqlite.prepare(`UPDATE queue SET status = 'failed', last_error = ? WHERE id = ?`).run(error, id);
}

export function listQueue(
  sqlite: SqliteDatabase,
  filters?: { type?: string; status?: string },
): QueueItem[] {
  const rows = sqlite
    .prepare(
      `SELECT * FROM queue
       WHERE (? IS NULL OR type = ?)
         AND (? IS NULL OR status = ?)
       ORDER BY created_at DESC`,
    )
    .all(filters?.type ?? null, filters?.type ?? null, filters?.status ?? null, filters?.status ?? null);
  return rows.map((row) => toItem(row));
}
