import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RecipeBundleSchema, type RecipeBundle } from "@autoapply/core";

const here = dirname(fileURLToPath(import.meta.url));
export const BUNDLED_RECIPE_DIR = join(here, "../recipes");

export function loadBundledRecipes(): RecipeBundle[] {
  const names = readdirSync(BUNDLED_RECIPE_DIR).filter((name) => name.endsWith(".json"));
  return names.map((name) => {
    const raw = JSON.parse(readFileSync(join(BUNDLED_RECIPE_DIR, name), "utf8")) as unknown;
    return RecipeBundleSchema.parse(raw);
  });
}
