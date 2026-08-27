import type { RecipeVersion, Step } from "@autoapply/core";
import type { Page } from "playwright";
import { clickContinue, pageKind } from "./advance.ts";
import { locate } from "./locate.ts";

export async function discoverWithRecipe(
  page: Page,
  recipe: RecipeVersion | undefined,
): Promise<"form" | "review" | "confirmation" | "timeout" | "error"> {
  if (recipe) {
    for (const step of recipe.steps) {
      if (step.type !== "wait") {
        continue;
      }
      if (step.selector) {
        const loc = await locate(page, step.selector).catch(() => null);
        if (loc) {
          await loc.waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
        }
      } else if (step.guard?.value && /^\d+$/.test(step.guard.value)) {
        await new Promise((resolve) => setTimeout(resolve, Number(step.guard?.value)));
      }
    }
  }
  return pageKind(page);
}

export async function advanceWithRecipe(page: Page, recipe: RecipeVersion | undefined): Promise<void> {
  const step = recipe?.steps.find((item) => item.type === "advance");
  if (step?.selector) {
    const loc = await locate(page, step.selector);
    const previous = page.url();
    const waitNav = page.waitForURL((url) => url.toString() !== previous, { timeout: 10_000 });
    await loc.click();
    await waitNav.catch(() => undefined);
    await page.waitForLoadState("domcontentloaded");
    return;
  }
  await clickContinue(page);
}

export function recipeHasSubmitStep(recipe: RecipeVersion | undefined): boolean {
  return Boolean(recipe?.steps.some((step: Step) => step.type === "submit"));
}
