import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, normalize, relative, sep } from "node:path";
import { PreflightSchema, RunCheckpointSchema, RunEventSchema, type EmbedFn, type Preflight } from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { abortRun, approveRun, getActive, requestStep, resumePersistedRun, setPaused, startRun } from "../runner.ts";

export function registerRunRoutes(
  app: FastifyInstance,
  sqlite: SqliteDatabase,
  dataDir: string,
  embed?: EmbedFn,
): void {
  app.post("/api/runs", async (request, reply) => {
    const body = z.object({ url: z.string().url(), jobId: z.string().optional() }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "url is required" });
    }
    const jobId = body.data.jobId ?? insertJob(sqlite, body.data.url);
    const runId = await startRun({
      sqlite,
      dataDir,
      jobId,
      url: body.data.url,
      embed,
    });
    return { id: runId, jobId };
  });

  app.get("/api/runs", async () => {
    const rows = sqlite
      .prepare(`SELECT id, job_id, mode, status, started_at, finished_at, error FROM runs ORDER BY started_at DESC`)
      .all();
    return { runs: rows };
  });

  app.get("/api/runs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const run = sqlite
      .prepare(`SELECT id, job_id, mode, status, started_at, finished_at, error, checkpoint_json FROM runs WHERE id = ?`)
      .get(params.id);
    if (!run) {
      return reply.code(404).send({ error: "not found" });
    }
    const events = sqlite
      .prepare(
        `SELECT seq, type, step_id, status, duration_ms, screenshot_path, detail_json FROM run_events WHERE run_id = ? ORDER BY seq`,
      )
      .all(params.id);
    const live = getActive(params.id);
    const runRow = z
      .object({
        id: z.string(),
        job_id: z.string(),
        mode: z.string(),
        status: z.string(),
        started_at: z.string(),
        finished_at: z.string().nullable(),
        error: z.string().nullable(),
        checkpoint_json: z.string().nullable(),
      })
      .parse(run);
    return {
      run: runRow,
      events: events.map((row) => {
        const parsed = z
          .object({
            seq: z.number(),
            type: z.string(),
            step_id: z.string().nullable(),
            status: z.string(),
            duration_ms: z.number().nullable(),
            screenshot_path: z.string().nullable(),
            detail_json: z.string().nullable(),
          })
          .parse(row);
        return RunEventSchema.parse({
          seq: parsed.seq,
          type: parsed.type,
          stepId: parsed.step_id ?? undefined,
          status: parsed.status,
          durationMs: parsed.duration_ms ?? undefined,
          screenshotPath: parsed.screenshot_path ?? undefined,
          detail: parsed.detail_json ? JSON.parse(parsed.detail_json) : undefined,
        });
      }),
      preflight: live?.preflight
        ? PreflightSchema.parse(live.preflight)
        : preflightFromCheckpoint(runRow.id, runRow.checkpoint_json),
    };
  });

  app.post("/api/runs/:id/approve", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      await approveRun(sqlite, params.id);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "approve failed";
      return reply.code(409).send({ error: message });
    }
  });

  app.post("/api/runs/:id/abort", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    abortRun(sqlite, params.id);
    return { ok: true };
  });

  app.post("/api/runs/:id/pause", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    setPaused(sqlite, params.id, true);
    return { ok: true };
  });

  app.post("/api/runs/:id/resume", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      await resumePersistedRun({ sqlite, dataDir, runId: params.id, embed });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "resume failed";
      return reply.code(409).send({ error: message });
    }
  });

  app.post("/api/runs/:id/step", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    requestStep(params.id);
    return { ok: true };
  });

  app.get("/api/runs/:id/events/:seq/screenshot", async (request, reply) => {
    const params = z.object({ id: z.string(), seq: z.coerce.number().int() }).parse(request.params);
    const row = sqlite
      .prepare(`SELECT screenshot_path FROM run_events WHERE run_id = ? AND seq = ?`)
      .get(params.id);
    const parsed = z.object({ screenshot_path: z.string().nullable() }).safeParse(row);
    if (!parsed.success || !parsed.data.screenshot_path) {
      return reply.code(404).send({ error: "not found" });
    }
    const shotsRoot = join(dataDir, "runs", params.id);
    const resolved = normalize(parsed.data.screenshot_path);
    const rel = relative(shotsRoot, resolved);
    if (rel.startsWith("..") || rel.includes(`..${sep}`) || !existsSync(resolved)) {
      return reply.code(404).send({ error: "not found" });
    }
    const type = extname(resolved) === ".png" ? "image/png" : "image/jpeg";
    return reply.type(type).send(createReadStream(resolved));
  });

  app.get("/ws/runs/:id", { websocket: true }, (socket, request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const run = getActive(params.id);
    const send = (payload: unknown) => {
      socket.send(JSON.stringify(payload));
    };
    if (run) {
      run.listeners.add(send);
      if (run.preflight) {
        send({ type: "preflight", preflight: run.preflight });
      }
    }
    socket.on("close", () => {
      run?.listeners.delete(send);
    });
  });
}

function preflightFromCheckpoint(runId: string, checkpointJson: string | null): Preflight | undefined {
  if (!checkpointJson) {
    return undefined;
  }
  let parsed: ReturnType<typeof RunCheckpointSchema.safeParse>;
  try {
    parsed = RunCheckpointSchema.safeParse(JSON.parse(checkpointJson));
  } catch {
    return undefined;
  }
  if (!parsed.success || parsed.data.history.length === 0) {
    return undefined;
  }
  return PreflightSchema.parse({
    runId,
    url: parsed.data.url,
    title: parsed.data.kind,
    rows: parsed.data.history.map((item) => ({
      fingerprint: item.fingerprint,
      labelRaw: item.labelRaw,
      value: item.resolution.value,
      source: item.resolution.source,
      confidence: item.resolution.confidence,
      status: item.resolution.status,
      readBack: item.fill.readBack,
      verified: item.fill.ok,
    })),
    ready: parsed.data.kind === "review" && parsed.data.history.every((item) => item.fill.ok),
  });
}

function insertJob(sqlite: SqliteDatabase, url: string): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO jobs (id, url, canonical_url, dedup_key, source, platform, status, created_at, apply_kind)
       VALUES (?, ?, ?, ?, 'other', 'unknown', 'running', ?, 'external')`,
    )
    .run(id, url, url, `url:${url}:${id}`, now);
  return id;
}
