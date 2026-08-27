import { randomUUID } from "node:crypto";
import {
  RecipeBundleSchema,
  RecipeMatchSchema,
  RecipeSchema,
  RecipeVersionSchema,
  StepSchema,
  evaluateLifecycle,
  matchRecipe,
  type LifecycleOutcome,
  type Recipe,
  type RecipeBundle,
  type RecipeVersion,
  type RecipeVersionStatus,
  type Step,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { loadBundledRecipes } from "@autoapply/engine";
import { z } from "zod";

const RecipeRow = z.object({
  id: z.string(),
  scope: z.string(),
  platform: z.string(),
  match_json: z.string(),
});

const VersionRow = z.object({
  id: z.string(),
  recipe_id: z.string(),
  version: z.number(),
  status: z.string(),
  steps_json: z.string(),
  hints_json: z.string(),
  created_by: z.string(),
  runs: z.number(),
  successes: z.number(),
  failures: z.number(),
  last_success_at: z.string().nullable(),
});

export type RecipeVersionRecord = RecipeVersion & { id: string };

function parseVersion(row: z.infer<typeof VersionRow>): RecipeVersionRecord {
  const hints = z
    .object({
      labelHints: z.record(z.string(), z.string()).default({}),
      widgetHandlers: RecipeVersionSchema.shape.widgetHandlers.default({}),
      fixturePath: z.string().optional(),
    })
    .parse(JSON.parse(row.hints_json));
  const parsed = RecipeVersionSchema.parse({
    recipeId: row.recipe_id,
    version: row.version,
    status: row.status,
    steps: z.array(StepSchema).parse(JSON.parse(row.steps_json)),
    labelHints: hints.labelHints,
    widgetHandlers: hints.widgetHandlers,
    createdBy: row.created_by,
    stats: {
      runs: row.runs,
      successes: row.successes,
      failures: row.failures,
      lastSuccessAt: row.last_success_at ?? undefined,
    },
    fixturePath: hints.fixturePath,
  });
  return { ...parsed, id: row.id };
}

function hintsJson(version: RecipeVersion): string {
  return JSON.stringify({
    labelHints: version.labelHints,
    widgetHandlers: version.widgetHandlers,
    fixturePath: version.fixturePath,
  });
}

export function seedBundledRecipes(sqlite: SqliteDatabase): void {
  const existing = sqlite.prepare(`SELECT id FROM recipes`).all();
  if (existing.length > 0) {
    return;
  }
  for (const bundle of loadBundledRecipes()) {
    saveBundle(sqlite, bundle, { status: "proposed" });
  }
}

export function saveBundle(
  sqlite: SqliteDatabase,
  bundle: RecipeBundle,
  options?: { status?: RecipeVersion["status"] },
): RecipeVersionRecord {
  RecipeBundleSchema.parse(bundle);
  const recipe = bundle.recipe;
  sqlite
    .prepare(
      `INSERT INTO recipes (id, scope, platform, match_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET scope = excluded.scope, platform = excluded.platform, match_json = excluded.match_json`,
    )
    .run(recipe.id, recipe.scope, recipe.platform, JSON.stringify(recipe.match));
  const maxRow = sqlite.prepare(`SELECT MAX(version) AS n FROM recipe_versions WHERE recipe_id = ?`).get(recipe.id);
  const max = Number(maxRow && typeof maxRow === "object" && "n" in maxRow ? maxRow.n : 0);
  const versionNumber = max + 1;
  const id = randomUUID();
  const status = options?.status ?? bundle.version.status;
  sqlite
    .prepare(
      `INSERT INTO recipe_versions (id, recipe_id, version, status, steps_json, hints_json, created_by, runs, successes, failures)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
    )
    .run(
      id,
      recipe.id,
      versionNumber,
      status,
      JSON.stringify(bundle.version.steps),
      hintsJson({ ...bundle.version, status, version: versionNumber }),
      bundle.version.createdBy,
    );
  return parseVersion(
    VersionRow.parse(sqlite.prepare(`SELECT * FROM recipe_versions WHERE id = ?`).get(id)),
  );
}

export function listRecipes(sqlite: SqliteDatabase): Recipe[] {
  return sqlite
    .prepare(`SELECT id, scope, platform, match_json FROM recipes`)
    .all()
    .map((row) => {
      const parsed = RecipeRow.parse(row);
      return RecipeSchema.parse({
        id: parsed.id,
        scope: parsed.scope,
        platform: parsed.platform,
        match: RecipeMatchSchema.parse(JSON.parse(parsed.match_json)),
      });
    });
}

export function listVersions(sqlite: SqliteDatabase, recipeId: string): RecipeVersionRecord[] {
  return sqlite
    .prepare(`SELECT * FROM recipe_versions WHERE recipe_id = ? ORDER BY version`)
    .all(recipeId)
    .map((row) => parseVersion(VersionRow.parse(row)));
}

export function getVersion(sqlite: SqliteDatabase, versionId: string): RecipeVersionRecord | undefined {
  const row = sqlite.prepare(`SELECT * FROM recipe_versions WHERE id = ?`).get(versionId);
  if (!row) {
    return undefined;
  }
  return parseVersion(VersionRow.parse(row));
}

export function liveVersionFor(sqlite: SqliteDatabase, recipeId: string): RecipeVersionRecord | undefined {
  const versions = listVersions(sqlite, recipeId);
  return versions.find((item) => item.status === "active") ?? versions.find((item) => item.status === "shadow");
}

export function matchLiveRecipe(
  sqlite: SqliteDatabase,
  url: string,
  html: string,
): RecipeVersionRecord | undefined {
  const recipe = matchRecipe(url, html, listRecipes(sqlite));
  if (!recipe) {
    return undefined;
  }
  return liveVersionFor(sqlite, recipe.id);
}

export function outcomesFor(sqlite: SqliteDatabase, versionId: string): LifecycleOutcome[] {
  const rows = sqlite
    .prepare(`SELECT status FROM runs WHERE recipe_version_id = ? ORDER BY started_at`)
    .all(versionId);
  return rows.flatMap((row) => {
    const status = z.object({ status: z.string() }).parse(row).status;
    if (status === "succeeded") return ["success" as const];
    if (status === "failed") return ["failure" as const];
    return [];
  });
}

export function setVersionStatus(sqlite: SqliteDatabase, versionId: string, status: RecipeVersionStatus): void {
  sqlite.prepare(`UPDATE recipe_versions SET status = ? WHERE id = ?`).run(status, versionId);
}

export function updateVersionSteps(sqlite: SqliteDatabase, versionId: string, steps: Step[]): RecipeVersionRecord {
  sqlite.prepare(`UPDATE recipe_versions SET steps_json = ? WHERE id = ?`).run(JSON.stringify(steps), versionId);
  const version = getVersion(sqlite, versionId);
  if (!version) {
    throw new Error("version not found");
  }
  return version;
}

export function applyRecipeLifecycle(sqlite: SqliteDatabase, versionId: string, fixturePassed: boolean): LifecycleOutcome | string {
  const version = getVersion(sqlite, versionId);
  if (!version) {
    throw new Error("version not found");
  }
  const versions = listVersions(sqlite, version.recipeId);
  const hasPriorActive = versions.some((item) => item.id !== versionId && item.status === "active");
  const decision = evaluateLifecycle({
    status: version.status,
    fixturePassed,
    outcomes: outcomesFor(sqlite, versionId),
    hasPriorActive,
  });
  if (decision.action === "promote") {
    setVersionStatus(sqlite, versionId, decision.to);
    return decision.to;
  }
  if (decision.action === "degrade") {
    setVersionStatus(sqlite, versionId, "degraded");
    return "degraded";
  }
  if (decision.action === "rollback") {
    const prior = versions.filter((item) => item.id !== versionId && item.version < version.version).reverse().find((item) => item.status === "retired" || item.status === "active" || item.stats.successes > 0);
    setVersionStatus(sqlite, versionId, "retired");
    if (prior) {
      setVersionStatus(sqlite, prior.id, "active");
    }
    return "retired";
  }
  return "none";
}

export type StepFailureRate = {
  stepId: string;
  name: string;
  runs: number;
  failures: number;
};

export function stepFailureRates(sqlite: SqliteDatabase, versionId: string): StepFailureRate[] {
  const version = getVersion(sqlite, versionId);
  if (!version) {
    return [];
  }
  const rows = sqlite
    .prepare(
      `SELECT e.step_id AS step_id, e.status AS status
       FROM run_events e
       JOIN runs r ON r.id = e.run_id
       WHERE r.recipe_version_id = ? AND e.step_id IS NOT NULL`,
    )
    .all(versionId);
  const counts = new Map<string, { runs: number; failures: number }>();
  for (const row of rows) {
    const parsed = z.object({ step_id: z.string().nullable(), status: z.string() }).parse(row);
    if (!parsed.step_id) continue;
    const current = counts.get(parsed.step_id) ?? { runs: 0, failures: 0 };
    current.runs += 1;
    if (parsed.status === "fail" || parsed.status === "failed") {
      current.failures += 1;
    }
    counts.set(parsed.step_id, current);
  }
  return version.steps.map((step) => {
    const current = counts.get(step.id) ?? { runs: 0, failures: 0 };
    return { stepId: step.id, name: step.name, runs: current.runs, failures: current.failures };
  });
}

export function incrementStats(sqlite: SqliteDatabase, versionId: string, success: boolean): void {
  if (success) {
    sqlite
      .prepare(
        `UPDATE recipe_versions SET runs = runs + 1, successes = successes + 1, last_success_at = ? WHERE id = ?`,
      )
      .run(new Date().toISOString(), versionId);
  } else {
    sqlite.prepare(`UPDATE recipe_versions SET runs = runs + 1, failures = failures + 1 WHERE id = ?`).run(versionId);
  }
}
