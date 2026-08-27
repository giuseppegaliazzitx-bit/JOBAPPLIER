import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RunCheckpointSchema,
  inventoryToDistilled,
  resolveInventory,
  type EmbedFn,
  type HealReport,
  type Preflight,
  type ProfileValues,
  type RunCheckpoint,
  type RunEvent,
  type WalkHistoryItem,
} from "@autoapply/core";
import { enqueue, type SqliteDatabase } from "@autoapply/db";
import type { AiHandle } from "@autoapply/ai";
import { BudgetExceededError } from "@autoapply/ai";
import { clickSubmit, healField, pageKind, walkUntilPreflight, writeIncomingFixture } from "@autoapply/engine";
import {
  incrementStats,
  matchLiveRecipe,
  proposeHealedVersion,
  quarantineIfNeeded,
  type RecipeVersionRecord,
} from "./recipes.ts";
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "playwright";
import { loadBank, loadOptionAliases } from "./bank.ts";
import { loadProfile } from "./routes/questions.ts";

type FrameHandler = (payload: unknown) => void;

export type ActiveRun = {
  id: string;
  page: Page;
  browser: Browser;
  paused: boolean;
  aborted: boolean;
  pauseAfterNext: boolean;
  preflight: Preflight | null;
  listeners: Set<FrameHandler>;
  recipe?: RecipeVersionRecord;
  pendingRepairs: HealReport[];
};

const active = new Map<string, ActiveRun>();

export function getActive(id: string): ActiveRun | undefined {
  return active.get(id);
}

function emit(run: ActiveRun, payload: unknown): void {
  for (const listener of run.listeners) {
    listener(payload);
  }
}

function appendEvent(
  sqlite: SqliteDatabase,
  runId: string,
  type: string,
  status: string,
  detail: unknown,
  extra?: { screenshotPath?: string; durationMs?: number; stepId?: string; thumbnailDataUrl?: string },
): RunEvent {
  const seqRow = sqlite.prepare(`SELECT COUNT(*) AS n FROM run_events WHERE run_id = ?`).get(runId);
  const seq = Number(seqRow && typeof seqRow === "object" && "n" in seqRow ? seqRow.n : 0);
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO run_events (id, run_id, seq, type, step_id, selector, status, screenshot_path, duration_ms, detail_json)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      id,
      runId,
      seq,
      type,
      extra?.stepId ?? null,
      status,
      extra?.screenshotPath ?? null,
      extra?.durationMs ?? null,
      JSON.stringify(detail),
    );
  return {
    seq,
    type,
    stepId: extra?.stepId,
    status,
    durationMs: extra?.durationMs,
    screenshotPath: extra?.screenshotPath,
    thumbnailDataUrl: extra?.thumbnailDataUrl,
    detail,
  };
}

function readCheckpoint(sqlite: SqliteDatabase, runId: string): RunCheckpoint | null {
  const row = sqlite.prepare(`SELECT checkpoint_json FROM runs WHERE id = ?`).get(runId);
  if (!row || typeof row !== "object" || !("checkpoint_json" in row) || typeof row.checkpoint_json !== "string") {
    return null;
  }
  try {
    const parsed = RunCheckpointSchema.safeParse(JSON.parse(row.checkpoint_json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveCheckpoint(
  sqlite: SqliteDatabase,
  runId: string,
  checkpoint: RunCheckpoint,
): void {
  sqlite
    .prepare(`UPDATE runs SET checkpoint_json = ? WHERE id = ?`)
    .run(JSON.stringify(checkpoint), runId);
}

function preflightFromHistory(
  runId: string,
  url: string,
  title: string,
  history: WalkHistoryItem[],
  screenshotDataUrl: string,
  ready: boolean,
): Preflight {
  return {
    runId,
    url,
    title,
    screenshotDataUrl,
    ready,
    rows: history.map((item) => ({
      fingerprint: item.fingerprint,
      labelRaw: item.labelRaw,
      value: item.resolution.value,
      source: item.resolution.source,
      confidence: item.resolution.confidence,
      status: item.resolution.status,
      readBack: item.fill.readBack,
      verified: item.fill.ok,
    })),
  };
}

async function attachScreencast(run: ActiveRun, page: Page): Promise<void> {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 40, maxWidth: 800 });
    cdp.on("Page.screencastFrame", (frame: { data: string; sessionId: number }) => {
      emit(run, { type: "frame", data: frame.data });
      void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId });
    });
  } catch {
    emit(run, { type: "log", message: "screencast unavailable" });
  }
}

export async function startRun(options: {
  sqlite: SqliteDatabase;
  dataDir: string;
  jobId: string;
  url: string;
  embed?: EmbedFn;
  resumeRunId?: string;
  createAi?: (runId: string) => AiHandle | undefined;
  daySpendUsd?: () => number;
}): Promise<string> {
  const now = new Date().toISOString();
  const resumeId = options.resumeRunId;
  const checkpoint = resumeId ? readCheckpoint(options.sqlite, resumeId) : null;
  const runId = resumeId ?? randomUUID();

  if (resumeId) {
    if (active.has(resumeId)) {
      throw new Error("run is already active");
    }
    options.sqlite.prepare(`UPDATE runs SET status = 'running', error = NULL WHERE id = ?`).run(runId);
  } else {
    options.sqlite
      .prepare(
        `INSERT INTO runs (id, job_id, mode, status, started_at, token_cost_usd)
         VALUES (?, ?, 'preflight', 'running', ?, 0)`,
      )
      .run(runId, options.jobId, now);
  }

  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    storageState: checkpoint?.storageState as BrowserContextOptions["storageState"],
  });
  const page = await context.newPage();
  const run: ActiveRun = {
    id: runId,
    page,
    browser,
    paused: false,
    aborted: false,
    pauseAfterNext: false,
    preflight: null,
    listeners: new Set(),
    pendingRepairs: [],
  };
  active.set(runId, run);

  const shots = join(options.dataDir, "runs", runId);
  mkdirSync(shots, { recursive: true });

  void (async () => {
    await attachScreencast(run, page);
    const startUrl = checkpoint?.url ?? options.url;
    await page.goto(startUrl, { waitUntil: "domcontentloaded" });
    const profile: ProfileValues = loadProfile(options.sqlite);
    const html = await page.content();
    const recipe = matchLiveRecipe(options.sqlite, page.url(), html);
    if (recipe) {
      run.recipe = recipe;
      options.sqlite.prepare(`UPDATE runs SET recipe_version_id = ? WHERE id = ?`).run(recipe.id, runId);
    }
    const ai = options.createAi?.(runId);
    if (ai && options.daySpendUsd) {
      ai.budget.dayUsd = options.daySpendUsd();
    }
    const result = await walkUntilPreflight(page, {
      initialHistory: checkpoint?.history,
      isPaused: () => run.paused,
      isAborted: () => run.aborted,
      recipe,
      profile,
      heal: ai
        ? (info) => healField({ ...info, page, ai })
        : undefined,
      onHeal: (report) => {
        run.pendingRepairs.push(report);
      },
      tier2WaitMs: 1500,
      resolve: (inventory) =>
        resolveInventory(inventory, loadBank(options.sqlite), {
          embed: options.embed,
          profile,
          optionAliases: loadOptionAliases(options.sqlite),
        }),
      onEvent: async (type, detail) => {
        const shot = join(shots, `${Date.now()}.jpg`);
        let thumbnailDataUrl: string | undefined;
        try {
          const buf = await page.screenshot({ type: "jpeg", quality: 35 });
          writeFileSync(shot, buf);
          thumbnailDataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        } catch {
          // screenshot is optional per event
        }
        const durationMs =
          typeof detail === "object" && detail !== null && "durationMs" in detail && typeof detail.durationMs === "number"
            ? detail.durationMs
            : undefined;
        const event = appendEvent(options.sqlite, runId, type, "ok", detail, {
          screenshotPath: shot,
          durationMs,
          thumbnailDataUrl,
        });
        emit(run, { type: "event", event });
      },
      onStepComplete: async ({ step, url, history }) => {
        if (run.pauseAfterNext) {
          run.paused = true;
          run.pauseAfterNext = false;
          options.sqlite.prepare(`UPDATE runs SET status = 'paused' WHERE id = ?`).run(runId);
          emit(run, { type: "status", status: "paused" });
        }
        const storageState = await page.context().storageState();
        saveCheckpoint(options.sqlite, runId, {
          url,
          kind: "form",
          step,
          history,
          storageState,
        });
      },
    });
    const png = await page.screenshot({ type: "jpeg", quality: 50 });
    const screenshotDataUrl = `data:image/jpeg;base64,${png.toString("base64")}`;
    const preflight = preflightFromHistory(
      runId,
      result.url,
      result.title,
      result.history,
      screenshotDataUrl,
      result.kind === "review" && result.history.every((item) => item.fill.ok),
    );
    run.preflight = preflight;
    const storageState = await page.context().storageState();
    saveCheckpoint(options.sqlite, runId, {
      url: result.url,
      kind: result.kind,
      step: result.history.length,
      history: result.history,
      storageState,
    });
    const failed =
      result.kind === "timeout" ||
      result.blockedReason === "heal_exhausted" ||
      result.blockedReason === "unknown_widget";
    if (failed) {
      const html = await page.content();
      const distilled = inventoryToDistilled(result.inventory, result.title);
      writeIncomingFixture(join(options.dataDir, "incoming"), html, distilled, result.title);
      const repoIncoming = join(process.cwd(), "fixtures/pages/_incoming");
      if (existsSync(join(process.cwd(), "fixtures/pages"))) {
        writeIncomingFixture(repoIncoming, html, distilled, result.title);
      }
      const reason = result.blockedReason ?? "timeout";
      if (reason === "heal_exhausted" || reason === "unknown_widget") {
        enqueue(options.sqlite, "blocked", { runId, reason, url: result.url });
        enqueue(options.sqlite, "notify", {
          message: `Run paused to Blocked: ${reason}`,
          runId,
        });
        run.paused = true;
      } else {
        enqueue(options.sqlite, "retry", { runId, reason, url: result.url });
      }
    }
    const status =
      result.blockedReason === "heal_exhausted" || result.blockedReason === "unknown_widget"
        ? "blocked"
        : result.kind === "review"
          ? "blocked"
          : result.kind === "timeout"
            ? "failed"
            : result.kind;
    options.sqlite.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(status, runId);
    if (recipe && result.kind !== "review") {
      incrementStats(options.sqlite, recipe.id, false);
      quarantineIfNeeded(options.sqlite, recipe.id);
    }
    emit(run, { type: "preflight", preflight });
  })().catch((error: unknown) => {
    if (error instanceof BudgetExceededError) {
      run.paused = true;
      options.sqlite.prepare(`UPDATE runs SET status = 'paused', error = ? WHERE id = ?`).run(error.message, runId);
      emit(run, { type: "status", status: "paused", reason: error.kind });
      return;
    }
    const message = error instanceof Error ? error.message : "run failed";
    options.sqlite.prepare(`UPDATE runs SET status = 'failed', error = ? WHERE id = ?`).run(message, runId);
    emit(run, { type: "error", message });
  });

  return runId;
}

export async function approveRun(sqlite: SqliteDatabase, runId: string): Promise<void> {
  const run = active.get(runId);
  if (!run || !run.preflight?.ready) {
    throw new Error("run is not waiting for approval");
  }
  await clickSubmit(run.page, { userApproved: true });
  const kind = await pageKind(run.page);
  const recipeId = sqlite.prepare(`SELECT recipe_version_id FROM runs WHERE id = ?`).get(runId);
  const recipeVersionId =
    recipeId && typeof recipeId === "object" && "recipe_version_id" in recipeId && typeof recipeId.recipe_version_id === "string"
      ? recipeId.recipe_version_id
      : null;
  if (recipeVersionId) {
    incrementStats(sqlite, recipeVersionId, true);
    quarantineIfNeeded(sqlite, recipeVersionId);
    if (run.pendingRepairs.some((item) => item.winningTier && item.winningTier >= 1 && item.winningTier <= 3)) {
      proposeHealedVersion(sqlite, recipeVersionId, run.pendingRepairs);
    }
  }
  sqlite
    .prepare(`UPDATE runs SET status = 'succeeded', finished_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), runId);
  emit(run, { type: "status", status: "succeeded", kind });
  await run.browser.close();
  active.delete(runId);
}

export function abortRun(sqlite: SqliteDatabase, runId: string): void {
  const run = active.get(runId);
  sqlite.prepare(`UPDATE runs SET status = 'aborted', finished_at = ? WHERE id = ?`).run(new Date().toISOString(), runId);
  if (!run) {
    return;
  }
  run.aborted = true;
  emit(run, { type: "status", status: "aborted" });
  void run.browser.close();
  active.delete(runId);
}

export function setPaused(sqlite: SqliteDatabase, runId: string, paused: boolean): void {
  const run = active.get(runId);
  if (!run) {
    return;
  }
  run.paused = paused;
  sqlite.prepare(`UPDATE runs SET status = ? WHERE id = ?`).run(paused ? "paused" : "running", runId);
  emit(run, { type: "status", status: paused ? "paused" : "running" });
}

export function requestStep(runId: string): void {
  const run = active.get(runId);
  if (!run) {
    return;
  }
  run.pauseAfterNext = true;
  run.paused = false;
  emit(run, { type: "status", status: "running" });
}

export async function resumePersistedRun(options: {
  sqlite: SqliteDatabase;
  dataDir: string;
  runId: string;
  embed?: EmbedFn;
}): Promise<string> {
  const live = active.get(options.runId);
  if (live) {
    setPaused(options.sqlite, options.runId, false);
    return options.runId;
  }
  const row = options.sqlite
    .prepare(`SELECT id, job_id, status, checkpoint_json FROM runs WHERE id = ?`)
    .get(options.runId);
  const parsed = zRow.safeParse(row);
  if (!parsed.success) {
    throw new Error("run not found");
  }
  if (parsed.data.status === "succeeded" || parsed.data.status === "aborted") {
    throw new Error("run cannot be resumed");
  }
  let checkpoint: ReturnType<typeof RunCheckpointSchema.safeParse> | null = null;
  if (parsed.data.checkpoint_json) {
    try {
      checkpoint = RunCheckpointSchema.safeParse(JSON.parse(parsed.data.checkpoint_json));
    } catch {
      checkpoint = null;
    }
  }
  if (!checkpoint || !checkpoint.success) {
    throw new Error("run has no checkpoint");
  }
  return startRun({
    sqlite: options.sqlite,
    dataDir: options.dataDir,
    jobId: parsed.data.job_id,
    url: checkpoint.data.url,
    embed: options.embed,
    resumeRunId: options.runId,
  });
}

const zRow = {
  safeParse(row: unknown): { success: true; data: { id: string; job_id: string; status: string; checkpoint_json: string | null } } | { success: false } {
    if (!row || typeof row !== "object") {
      return { success: false };
    }
    const rec = row as Record<string, unknown>;
    if (typeof rec.id !== "string" || typeof rec.job_id !== "string" || typeof rec.status !== "string") {
      return { success: false };
    }
    return {
      success: true,
      data: {
        id: rec.id,
        job_id: rec.job_id,
        status: rec.status,
        checkpoint_json: typeof rec.checkpoint_json === "string" ? rec.checkpoint_json : null,
      },
    };
  },
};
