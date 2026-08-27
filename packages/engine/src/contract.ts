import type { RecipeBundle } from "@autoapply/core";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";
import { locatorFromSelector } from "./locate.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

export function fixtureHtmlFor(bundle: RecipeBundle): string {
  const relative = bundle.version.fixturePath;
  if (!relative) {
    throw new Error(`recipe ${bundle.recipe.id} has no fixturePath`);
  }
  return readFileSync(join(repoRoot, relative), "utf8");
}

export async function runRecipeContract(page: Page, bundle: RecipeBundle): Promise<{ ok: boolean; errors: string[] }> {
  const errors: string[] = [];
  const html = fixtureHtmlFor(bundle);
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  for (const step of bundle.version.steps) {
    if (!step.selector) {
      continue;
    }
    if (step.type === "navigate" || step.type === "wait" || step.type === "submit") {
      continue;
    }
    let found = 0;
    for (const selector of [step.selector.primary, ...step.selector.fallbacks]) {
      found += await locatorFromSelector(page, selector).count();
      if (found > 0) {
        break;
      }
    }
    if (found === 0) {
      errors.push(`${step.id}: no elements for ${step.selector.primary.strategy}=${step.selector.primary.value}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
