import {
  RecipeBundleSchema,
  StepSchema,
  type EmbedFn,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { runRecipeContract } from "@autoapply/engine";
import type { FastifyInstance } from "fastify";
import { chromium } from "playwright";
import { z } from "zod";
import { startRecordSession, stopRecordSession } from "../record-session.ts";
import {
  applyRecipeLifecycle,
  getVersion,
  listRecipes,
  listVersions,
  liveVersionFor,
  saveBundle,
  seedBundledRecipes,
  setVersionStatus,
  stepFailureRates,
  updateVersionSteps,
} from "../recipes.ts";
import { loadProfile } from "./questions.ts";

export function registerRecipeRoutes(app: FastifyInstance, sqlite: SqliteDatabase, _embed?: EmbedFn): void {
  seedBundledRecipes(sqlite);

  app.get("/api/recipes", async () => {
    const recipes = listRecipes(sqlite).map((recipe) => {
      const versions = listVersions(sqlite, recipe.id).map((version) => ({
        ...version,
        stepFailureRates: stepFailureRates(sqlite, version.id),
      }));
      const live = liveVersionFor(sqlite, recipe.id);
      const runs = live?.stats.runs ?? 0;
      const rate = runs === 0 ? 0 : (live?.stats.successes ?? 0) / runs;
      return {
        ...recipe,
        health: {
          status: live?.status ?? "proposed",
          successRate: rate,
          lastSuccessAt: live?.stats.lastSuccessAt,
        },
        versions,
      };
    });
    return { recipes };
  });

  app.post("/api/recipes", async (request, reply) => {
    const parsed = RecipeBundleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid recipe bundle" });
    }
    const version = saveBundle(sqlite, parsed.data, { status: "proposed" });
    return { id: parsed.data.recipe.id, versionId: version.id, version: version.version };
  });

  app.patch("/api/recipes/:recipeId/versions/:versionId", async (request, reply) => {
    const params = z.object({ recipeId: z.string(), versionId: z.string() }).parse(request.params);
    const body = z.object({ steps: z.array(StepSchema) }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "steps required" });
    }
    const version = getVersion(sqlite, params.versionId);
    if (!version || version.recipeId !== params.recipeId) {
      return reply.code(404).send({ error: "not found" });
    }
    return { version: updateVersionSteps(sqlite, params.versionId, body.data.steps) };
  });

  app.post("/api/recipes/:recipeId/versions/:versionId/fixture", async (request, reply) => {
    const params = z.object({ recipeId: z.string(), versionId: z.string() }).parse(request.params);
    const version = getVersion(sqlite, params.versionId);
    const recipe = listRecipes(sqlite).find((item) => item.id === params.recipeId);
    if (!version || !recipe || !version.fixturePath) {
      return reply.code(409).send({ error: "fixture missing" });
    }
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      const result = await runRecipeContract(page, { recipe, version });
      return result;
    } finally {
      await page.close();
      await browser.close();
    }
  });

  app.post("/api/recipes/:recipeId/versions/:versionId/promote", async (request, reply) => {
    const params = z.object({ recipeId: z.string(), versionId: z.string() }).parse(request.params);
    const version = getVersion(sqlite, params.versionId);
    const recipe = listRecipes(sqlite).find((item) => item.id === params.recipeId);
    if (!version || !recipe) {
      return reply.code(404).send({ error: "not found" });
    }
    let fixturePassed = false;
    if (version.status === "proposed") {
      if (!version.fixturePath) {
        return reply.code(409).send({ error: "every version must pass its fixture before shadow" });
      }
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      try {
        const result = await runRecipeContract(page, { recipe, version });
        fixturePassed = result.ok;
        if (!result.ok) {
          return reply.code(409).send({ error: "fixture failed", errors: result.errors });
        }
      } finally {
        await page.close();
        await browser.close();
      }
    }
    const decision = applyRecipeLifecycle(sqlite, params.versionId, fixturePassed || version.status !== "proposed");
    if (decision === "none") {
      return reply.code(409).send({ error: "promotion thresholds not met" });
    }
    return { status: getVersion(sqlite, params.versionId)?.status, decision };
  });

  app.post("/api/recipes/:recipeId/versions/:versionId/rollback", async (request, reply) => {
    const params = z.object({ recipeId: z.string(), versionId: z.string() }).parse(request.params);
    const version = getVersion(sqlite, params.versionId);
    if (!version) {
      return reply.code(404).send({ error: "not found" });
    }
    const versions = listVersions(sqlite, params.recipeId);
    const prior = [...versions].reverse().find((item) => item.id !== version.id && item.version < version.version);
    setVersionStatus(sqlite, params.versionId, "retired");
    if (prior) {
      setVersionStatus(sqlite, prior.id, "active");
    }
    return { ok: true, activeId: prior?.id };
  });

  app.post("/api/recipes/record", async (request, reply) => {
    const body = z.object({ url: z.string().url() }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "url is required" });
    }
    const id = await startRecordSession(body.data.url, loadProfile(sqlite));
    return { id };
  });

  app.post("/api/recipes/record/:id/stop", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    try {
      const processed = await stopRecordSession(params.id);
      return processed;
    } catch (error) {
      const message = error instanceof Error ? error.message : "stop failed";
      return reply.code(409).send({ error: message });
    }
  });
}
