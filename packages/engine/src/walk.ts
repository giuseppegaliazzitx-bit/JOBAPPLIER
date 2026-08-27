import {
  MAX_WIZARD_STEPS,
  applyInventoryOverrides,
  applyResolveOverrides,
  type FieldDescriptor,
  type FieldInventory,
  type FillResult,
  type ProfileValues,
  type RecipeVersion,
  type Resolution,
  type WalkHistoryItem,
} from "@autoapply/core";
import type { Page } from "playwright";
import { fillField, type FillOutcome } from "./fill.ts";
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
      let result: FillResult = {
        fingerprint: field.fingerprint,
        labelRaw: field.labelRaw,
        attempted: resolution.value,
        readBack: null,
        ok: false,
        error: message,
      };
      if (hooks.heal) {
        const healed = await hooks.heal({
          field,
          inventory,
          attempted: resolution.value,
          error: message,
        });
        if (healed) {
          result = healed;
        }
      }
      fills.push(result);
      upsertHistory(history, {
        labelRaw: field.labelRaw,
        fingerprint: field.fingerprint,
        resolution,
        fill: result,
      });
      await hooks.onEvent?.("fill", { ...result, durationMs: Date.now() - started });
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
    if (!result.ok && hooks.heal) {
      const healed = await hooks.heal({
        field,
        inventory,
        attempted: resolution.value,
        error: error ?? "read-back failed",
      });
      if (healed) {
        result = healed;
      }
    }
    fills.push(result);
    upsertHistory(history, {
      labelRaw: field.labelRaw,
      fingerprint: field.fingerprint,
      resolution,
      fill: result,
    });
    await hooks.onEvent?.("fill", { ...result, durationMs: Date.now() - started });
  }
  return fills;
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

export async function walkUntilPreflight(page: Page, hooks: WalkHooks): Promise<WalkResult> {
  const history: WalkHistoryItem[] = [...(hooks.initialHistory ?? [])];
  let last: WalkResult | undefined;
  for (let step = 0; step < MAX_WIZARD_STEPS; step += 1) {
    if (hooks.isAborted?.()) {
      throw new Error("aborted");
    }
    await waitIfPaused(hooks);
    const kind = await discoverWithRecipe(page, hooks.recipe);
    await hooks.onEvent?.("discover", { kind, url: page.url(), step, recipeId: hooks.recipe?.recipeId });
    if (kind === "timeout" || kind === "confirmation") {
      return {
        kind,
        inventory: { title: await page.title(), fields: [] },
        resolutions: [],
        fills: history.map((item) => item.fill),
        history,
        url: page.url(),
        title: await page.title(),
      };
    }
    let inventory = applyInventoryOverrides(await extractFieldInventory(page), hooks.recipe);
    await hooks.onEvent?.("inventory", { count: inventory.fields.length, title: inventory.title });
    let resolutions = await hooks.resolve(inventory);
    if (hooks.profile) {
      resolutions = applyResolveOverrides(inventory, resolutions, hooks.recipe, hooks.profile, hooks.documents);
    }
    await hooks.onEvent?.("resolve", { resolutions });
    let fills = await fillResolved(page, inventory, resolutions, history, hooks);
    for (let extra = 0; extra < 2; extra += 1) {
      const nextInventory = applyInventoryOverrides(await extractFieldInventory(page), hooks.recipe);
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
      const extraFills = await fillResolved(page, nextInventory, nextResolutions, history, hooks);
      inventory = nextInventory;
      resolutions = nextResolutions;
      fills = extraFills;
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
      return { ...last, kind: "blocked" };
    }
    const failed = fills.filter((item) => !item.ok);
    if (failed.length > 0) {
      return { ...last, kind: "blocked" };
    }
    await advanceWithRecipe(page, hooks.recipe);
    await hooks.onEvent?.("advance", { url: page.url() });
  }
  throw new Error(`wizard loop guard: exceeded ${MAX_WIZARD_STEPS} steps`);
}
