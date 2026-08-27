import {
  MAX_WIZARD_STEPS,
  applyInventoryOverrides,
  applyResolveOverrides,
  applyStepSelectors,
  type FailureReason,
  type FieldDescriptor,
  type FieldInventory,
  type FillResult,
  type HealReport,
  type ProfileValues,
  type RecipeVersion,
  type Resolution,
  type WalkHistoryItem,
} from "@autoapply/core";
import type { Page } from "playwright";
import { sessionKitSolveCaptcha } from "./challenge.ts";
import { fillField, type FillOutcome } from "./fill.ts";
import { escalateHeal } from "./heal-tiers.ts";
import { extractFieldInventory } from "./inventory.ts";
import { advanceWithRecipe, discoverWithRecipe } from "./recipe-runtime.ts";
import { nearbyError, readBack, valuesMatch } from "./verify.ts";

export type WalkHooks = {
  resolve: (inventory: FieldInventory) => Promise<Resolution[]>;
  onEvent?: (type: string, detail: unknown) => Promise<void> | void;
  isPaused?: () => boolean;
  isAborted?: () => boolean;
  onStepComplete?: (info: { step: number; url: string; history: WalkHistoryItem[] }) => Promise<void> | void;
  initialHistory?: WalkHistoryItem[];
  recipe?: RecipeVersion;
  profile?: ProfileValues;
  documents?: Record<string, string>;
  heal?: (info: {
    field: FieldDescriptor;
    inventory: FieldInventory;
    attempted: string;
    error: string;
  }) => Promise<FillResult | null>;
  onHeal?: (report: HealReport) => Promise<void> | void;
  tier2WaitMs?: number;
  delay?: () => Promise<void>;
  solveCaptcha?: (page: Page) => Promise<boolean>;
};

export type { WalkHistoryItem };

export type WalkResult = {
  kind: "review" | "blocked" | "confirmation" | "timeout";
  inventory: FieldInventory;
  resolutions: Resolution[];
  fills: FillResult[];
  history: WalkHistoryItem[];
  url: string;
  title: string;
  healReports: HealReport[];
  blockedReason?: FailureReason;
};

async function waitIfPaused(hooks: WalkHooks): Promise<void> {
  while (hooks.isPaused?.()) {
    if (hooks.isAborted?.()) {
      throw new Error("aborted");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function upsertHistory(history: WalkHistoryItem[], item: WalkHistoryItem): void {
  const index = history.findIndex((row) => row.fingerprint === item.fingerprint);
  if (index >= 0) {
    history[index] = item;
  } else {
    history.push(item);
  }
}

async function fillResolved(
  page: Page,
  inventory: FieldInventory,
  resolutions: Resolution[],
  history: WalkHistoryItem[],
  hooks: WalkHooks,
  healReports: HealReport[],
): Promise<FillResult[]> {
  const fills: FillResult[] = [];
  for (const field of inventory.fields) {
    if (!field.visible || field.disabled) {
      continue;
    }
    const already = history.find((item) => item.fingerprint === field.fingerprint && item.fill.ok);
    if (already) {
      fills.push(already.fill);
      continue;
    }
    const resolution = resolutions.find((item) => item.fingerprint === field.fingerprint);
    if (!resolution || resolution.status !== "resolved" || !resolution.value) {
      continue;
    }
    const started = Date.now();
    let outcome: FillOutcome;
    try {
      outcome = await fillField(page, field, resolution.value);
    } catch (error) {
      const message = error instanceof Error ? error.message : "fill failed";
      const recovered = await recoverFill(page, field, inventory, resolution.value, message, hooks, healReports);
      fills.push(recovered);
      upsertHistory(history, {
        labelRaw: field.labelRaw,
        fingerprint: field.fingerprint,
        resolution,
        fill: recovered,
      });
      await hooks.onEvent?.("fill", { ...recovered, durationMs: Date.now() - started });
      await hooks.delay?.();
      if (healReports[healReports.length - 1]?.paused) {
        return fills;
      }
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const actual = (await readBack(page, field)) ?? outcome.readBack;
    const error = await nearbyError(page, field);
    const ok = valuesMatch(resolution.value, actual) && !error;
    let result: FillResult = {
      fingerprint: field.fingerprint,
      labelRaw: field.labelRaw,
      attempted: resolution.value,
      readBack: actual,
      ok,
      error,
      chipVerified: outcome.chipVerified,
    };
    if (!result.ok) {
      result = await recoverFill(
        page,
        field,
        inventory,
        resolution.value,
        error ?? "read-back failed",
        hooks,
        healReports,
      );
    }
    fills.push(result);
    upsertHistory(history, {
      labelRaw: field.labelRaw,
      fingerprint: field.fingerprint,
      resolution,
      fill: result,
    });
    await hooks.onEvent?.("fill", { ...result, durationMs: Date.now() - started });
    await hooks.delay?.();
    if (healReports[healReports.length - 1]?.paused) {
      return fills;
    }
  }
  return fills;
}

async function recoverFill(
  page: Page,
  field: FieldDescriptor,
  inventory: FieldInventory,
  attempted: string,
  error: string,
  hooks: WalkHooks,
  healReports: HealReport[],
): Promise<FillResult> {
  const { report, fill } = await escalateHeal({
    page,
    field,
    inventory,
    attempted,
    error,
    heal: hooks.heal,
    tier2WaitMs: hooks.tier2WaitMs,
  });
  healReports.push(report);
  await hooks.onHeal?.(report);
  await hooks.onEvent?.("heal", report);
  if (fill) {
    return { ...fill, healTier: report.winningTier };
  }
  return {
    fingerprint: field.fingerprint,
    labelRaw: field.labelRaw,
    attempted,
    readBack: null,
    ok: false,
    error: "heal_exhausted",
    healTier: 4,
  };
}

function stepRows(inventory: FieldInventory, history: WalkHistoryItem[]) {
  return inventory.fields
    .filter((field) => field.visible)
    .map((field) => {
      const item = history.find((row) => row.fingerprint === field.fingerprint);
      return {
        fingerprint: field.fingerprint,
        labelRaw: field.labelRaw,
        value: item?.resolution.value,
        source: item?.resolution.source,
        confidence: item?.resolution.confidence ?? 0,
        readBack: item?.fill.readBack ?? null,
        verified: item?.fill.ok ?? false,
      };
    });
}

function emptyWalk(kind: WalkResult["kind"], history: WalkHistoryItem[], page: Page, extra?: Partial<WalkResult>): Promise<WalkResult> {
  return Promise.all([page.title()]).then(([title]) => ({
    kind,
    inventory: { title, fields: [] },
    resolutions: [],
    fills: history.map((item) => item.fill),
    history,
    url: page.url(),
    title,
    healReports: extra?.healReports ?? [],
    blockedReason: extra?.blockedReason,
  }));
}

export async function walkUntilPreflight(page: Page, hooks: WalkHooks): Promise<WalkResult> {
  const history: WalkHistoryItem[] = [...(hooks.initialHistory ?? [])];
  const healReports: HealReport[] = [];
  let last: WalkResult | undefined;
  for (let step = 0; step < MAX_WIZARD_STEPS; step += 1) {
    if (hooks.isAborted?.()) {
      throw new Error("aborted");
    }
    await waitIfPaused(hooks);
    let kind = await discoverWithRecipe(page, hooks.recipe);
    if (kind === "captcha") {
      await hooks.onEvent?.("challenge", { kind: "captcha", policy: "sessionkit_solve" });
      const solver = hooks.solveCaptcha ?? sessionKitSolveCaptcha;
      const solved = await solver(page);
      if (!solved) {
        return emptyWalk("blocked", history, page, { healReports, blockedReason: "captcha" });
      }
      kind = await discoverWithRecipe(page, hooks.recipe);
    }
    if (kind === "2fa") {
      await hooks.onEvent?.("challenge", { kind: "2fa", policy: "detect_pause_notify" });
      return emptyWalk("blocked", history, page, { healReports, blockedReason: "two_factor" });
    }
    await hooks.onEvent?.("discover", { kind, url: page.url(), step, recipeId: hooks.recipe?.recipeId });
    if (kind === "timeout" || kind === "confirmation") {
      return emptyWalk(kind, history, page, { healReports });
    }
    let inventory = applyStepSelectors(
      applyInventoryOverrides(await extractFieldInventory(page), hooks.recipe),
      hooks.recipe,
    );
    await hooks.onEvent?.("inventory", { count: inventory.fields.length, title: inventory.title });
    let resolutions = await hooks.resolve(inventory);
    if (hooks.profile) {
      resolutions = applyResolveOverrides(inventory, resolutions, hooks.recipe, hooks.profile, hooks.documents);
    }
    await hooks.onEvent?.("resolve", { resolutions });
    let fills = await fillResolved(page, inventory, resolutions, history, hooks, healReports);
    if (healReports.some((item) => item.paused)) {
      return {
        kind: "blocked",
        inventory,
        resolutions,
        fills: history.map((item) => item.fill),
        history,
        url: page.url(),
        title: await page.title(),
        healReports,
        blockedReason: healReports.some((item) =>
          item.attempts.some((attempt) => attempt.tried.includes("unknown widget")),
        )
          ? "unknown_widget"
          : "heal_exhausted",
      };
    }
    for (let extra = 0; extra < 2; extra += 1) {
      const nextInventory = applyStepSelectors(
        applyInventoryOverrides(await extractFieldInventory(page), hooks.recipe),
        hooks.recipe,
      );
      let nextResolutions = await hooks.resolve(nextInventory);
      if (hooks.profile) {
        nextResolutions = applyResolveOverrides(
          nextInventory,
          nextResolutions,
          hooks.recipe,
          hooks.profile,
          hooks.documents,
        );
      }
      const before = history.filter((item) => item.fill.ok).length;
      const extraFills = await fillResolved(page, nextInventory, nextResolutions, history, hooks, healReports);
      inventory = nextInventory;
      resolutions = nextResolutions;
      fills = extraFills;
      if (healReports.some((item) => item.paused)) {
        return {
          kind: "blocked",
          inventory,
          resolutions,
          fills: history.map((item) => item.fill),
          history,
          url: page.url(),
          title: await page.title(),
          healReports,
          blockedReason: "heal_exhausted",
        };
      }
      const after = history.filter((item) => item.fill.ok).length;
      if (after === before) {
        break;
      }
    }
    last = {
      kind: kind === "review" ? "review" : "blocked",
      inventory,
      resolutions,
      fills: history.map((item) => item.fill),
      history,
      url: page.url(),
      title: await page.title(),
      healReports,
    };
    await hooks.onEvent?.("step", {
      url: page.url(),
      title: last.title,
      rows: stepRows(inventory, history),
    });
    await hooks.onStepComplete?.({ step, url: page.url(), history });
    if (kind === "review") {
      return { ...last, kind: "review" };
    }
    const unansweredRequired = inventory.fields.filter((field) => {
      if (!field.required || !field.visible) {
        return false;
      }
      const resolution = resolutions.find((item) => item.fingerprint === field.fingerprint);
      return resolution?.status !== "resolved";
    });
    if (unansweredRequired.length > 0) {
      return { ...last, kind: "blocked", blockedReason: "unanswered" };
    }
    const failed = fills.filter((item) => !item.ok);
    if (failed.length > 0) {
      return { ...last, kind: "blocked", blockedReason: "validation" };
    }
    await advanceWithRecipe(page, hooks.recipe);
    await hooks.onEvent?.("advance", { url: page.url() });
  }
  throw new Error(`wizard loop guard: exceeded ${MAX_WIZARD_STEPS} steps`);
}
