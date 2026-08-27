import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { profileValuesInText, type ProfileValues } from "@autoapply/core";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadBundledRecipes } from "../src/bundled-recipes.ts";
import { runRecipeContract } from "../src/contract.ts";

const SAMPLE_PROFILE: ProfileValues = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  country: "United States",
  linkedin: "https://linkedin.com/in/ada",
};

const here = dirname(fileURLToPath(import.meta.url));

describe("bundled recipe contracts", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("ships greenhouse and lever recipes that pass their fixtures", async () => {
    const bundles = loadBundledRecipes();
    expect(bundles.map((item) => item.recipe.platform).sort()).toEqual(["greenhouse", "lever"]);
    const page = await browser.newPage();
    try {
      for (const bundle of bundles) {
        const result = await runRecipeContract(page, bundle);
        expect(result.errors, `${bundle.recipe.id}: ${result.errors.join("; ")}`).toEqual([]);
        expect(result.ok).toBe(true);
      }
    } finally {
      await page.close();
    }
  });

  it("never writes a profile value into a recipe file", () => {
    const dir = join(here, "../recipes");
    const blob = readdirSync(dir)
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFileSync(join(dir, name), "utf8"))
      .join("\n");
    expect(profileValuesInText(blob, SAMPLE_PROFILE)).toEqual([]);
  });
});
