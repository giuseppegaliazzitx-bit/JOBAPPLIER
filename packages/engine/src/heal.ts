import {
  RepairPatchSchema,
  inventoryToDistilled,
  paginateDistilled,
  type FieldDescriptor,
  type FieldInventory,
  type FillResult,
  type RepairPatch,
} from "@autoapply/core";
import { repairStep, type AiHandle } from "@autoapply/ai";
import type { Page } from "playwright";
import { locate } from "./locate.ts";
import { cropFieldScreenshot } from "./screenshot.ts";
import { nearbyError, readBack, valuesMatch } from "./verify.ts";

export type HealContext = {
  page: Page;
  field: FieldDescriptor;
  inventory: FieldInventory;
  attempted: string;
  error: string;
  ai: AiHandle;
};

async function checks(page: Page, patch: RepairPatch, action: RepairPatch["action"]): Promise<void> {
  const loc = await locate(page, patch.selector);
  const visible = await loc.isVisible();
  const disabled = await loc.isDisabled().catch(() => false);
  if (!visible || disabled) {
    throw new Error("element is not visible and enabled");
  }
  if (action === "fill") {
    const ok = await loc.evaluate((el) => {
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || (el as HTMLElement).isContentEditable;
    });
    if (!ok) {
      throw new Error("fill target is not an input, textarea, or contenteditable");
    }
  }
}

async function executePatch(page: Page, patch: RepairPatch, value: string): Promise<void> {
  const loc = await locate(page, patch.selector);
  if (patch.action === "click") {
    await loc.click();
    return;
  }
  if (patch.action === "select") {
    await loc.selectOption({ label: value }).catch(async () => loc.selectOption({ value }));
    return;
  }
  if (patch.action === "upload") {
    await loc.setInputFiles(value);
    return;
  }
  await loc.fill(value);
  await loc.blur().catch(() => undefined);
}

async function applyValidated(
  page: Page,
  field: FieldDescriptor,
  patch: RepairPatch,
  attempted: string,
): Promise<FillResult> {
  RepairPatchSchema.parse(patch);
  await checks(page, patch, patch.action);
  await executePatch(page, patch, attempted);
  await new Promise((resolve) => setTimeout(resolve, 50));
  const actual = await readBack(page, field);
  const error = await nearbyError(page, field);
  const ok = valuesMatch(attempted, actual) && !error;
  if (!ok) {
    throw new Error(`read-back mismatch: expected ${attempted}, got ${actual ?? "null"}${error ? ` (${error})` : ""}`);
  }
  return {
    fingerprint: field.fingerprint,
    labelRaw: field.labelRaw,
    attempted,
    readBack: actual,
    ok: true,
    error: null,
    workingSelector: patch.selector,
  };
}

export async function healField(ctx: HealContext): Promise<FillResult | null> {
  const distilled = paginateDistilled(inventoryToDistilled(ctx.inventory))[0];
  if (!distilled) {
    return null;
  }
  const fieldId =
    distilled.fields.find((item) => item.label === ctx.field.labelRaw)?.id ??
    distilled.fields.find((item) => item.widget === "unknown")?.id ??
    "f?";
  if (ctx.field.widget === "unknown" || !ctx.field.labelRaw) {
    await cropFieldScreenshot(ctx.page, ctx.field).catch(() => undefined);
  }
  let lastError = ctx.error;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const patch = await repairStep(ctx.ai, distilled, {
      fieldId,
      error: lastError,
      attempted: ctx.attempted,
    });
    try {
      return await applyValidated(ctx.page, ctx.field, patch, ctx.attempted);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "patch invalid";
      if (attempt === 1) {
        return null;
      }
    }
  }
  return null;
}


