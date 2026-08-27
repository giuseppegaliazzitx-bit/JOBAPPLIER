import type { FieldDescriptor, FieldInventory } from "./field.ts";
import { fieldFingerprint, normalizeLabel } from "./fingerprint.ts";
import { resolveValueSource } from "./recipe-parameterize.ts";
import type { RecipeVersion, Step } from "./recipe.ts";
import type { Resolution } from "./resolution.ts";
import type { ProfileValues } from "./profile.ts";
import type { WidgetKind } from "./field.ts";

export function fieldKeys(field: FieldDescriptor): string[] {
  const keys = [field.labelRaw, field.labelNorm];
  for (const selector of [field.selector.primary, ...field.selector.fallbacks]) {
    keys.push(selector.value);
  }
  return keys;
}

export function applyInventoryOverrides(inventory: FieldInventory, recipe: RecipeVersion | undefined): FieldInventory {
  if (!recipe) {
    return inventory;
  }
  const fields = inventory.fields.map((field) => {
    let labelRaw = field.labelRaw;
    let widget: WidgetKind = field.widget;
    for (const key of fieldKeys(field)) {
      const hint = recipe.labelHints[key];
      if (hint) {
        labelRaw = hint;
      }
      const handler = recipe.widgetHandlers[key];
      if (handler) {
        widget = handler;
      }
    }
    const labelNorm = normalizeLabel(labelRaw);
    return {
      ...field,
      labelRaw,
      labelNorm,
      widget,
      fingerprint: fieldFingerprint(labelNorm, field.type, field.options),
    };
  });
  return { ...inventory, fields };
}

export function stepMatchesField(step: Step, field: FieldDescriptor): boolean {
  if (!step.selector) {
    return field.labelRaw === step.name || field.labelNorm === normalizeLabel(step.name);
  }
  const wanted = [step.selector.primary, ...step.selector.fallbacks];
  const have = [field.selector.primary, ...field.selector.fallbacks];
  for (const selector of wanted) {
    if (have.some((item) => item.strategy === selector.strategy && item.value === selector.value)) {
      return true;
    }
    if (selector.strategy === "label" && (field.labelRaw === selector.value || field.labelNorm === normalizeLabel(selector.value))) {
      return true;
    }
    if (selector.strategy === "name" && have.some((item) => item.strategy === "name" && item.value === selector.value)) {
      return true;
    }
  }
  return false;
}

export function applyResolveOverrides(
  inventory: FieldInventory,
  resolutions: Resolution[],
  recipe: RecipeVersion | undefined,
  profile: ProfileValues,
  documents: Record<string, string> = {},
): Resolution[] {
  if (!recipe) {
    return resolutions;
  }
  const byFp = new Map(resolutions.map((item) => [item.fingerprint, item]));
  for (const step of recipe.steps) {
    if (step.type !== "fill" && step.type !== "select" && step.type !== "upload") {
      continue;
    }
    if (!step.valueSource || step.valueSource === "answer_bank") {
      continue;
    }
    const value = resolveValueSource(step.valueSource, profile, documents);
    if (!value) {
      continue;
    }
    const field = inventory.fields.find((item) => stepMatchesField(step, item));
    if (!field) {
      continue;
    }
    byFp.set(field.fingerprint, {
      fingerprint: field.fingerprint,
      labelRaw: field.labelRaw,
      type: field.type,
      status: "resolved",
      value,
      source: `recipe:${step.valueSource}`,
      confidence: 1,
      tier: 0,
    });
  }
  return inventory.fields.map((field) => {
    const existing = byFp.get(field.fingerprint);
    if (existing) {
      return existing;
    }
    return {
      fingerprint: field.fingerprint,
      labelRaw: field.labelRaw,
      type: field.type,
      status: "unanswered" as const,
      confidence: 0,
      tier: 4 as const,
    };
  });
}
