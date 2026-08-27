import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyRepairsToRecipe,
  normalizeQuestion,
  type RecipeVersion,
  type Resolution,
} from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clickSubmit } from "../src/submit-gate.ts";
import { walkUntilPreflight } from "../src/walk.ts";

function answers(resume: string): Record<string, string> {
  return {
    [normalizeQuestion("First Name")]: "Ada",
    [normalizeQuestion("Last Name")]: "Lovelace",
    [normalizeQuestion("Email")]: "ada@example.com",
    [normalizeQuestion("Phone")]: "555-0100",
    [normalizeQuestion("Job Title")]: "Engineer",
    [normalizeQuestion("School")]: "Stanford University",
    [normalizeQuestion("Are you authorized to work in the US?")]: "yes",
    [normalizeQuestion("Country")]: "United States",
    [normalizeQuestion("Resume")]: resume,
  };
}

const brokenRecipe: RecipeVersion = {
  recipeId: "mock-ats-heal",
  version: 1,
  status: "active",
  createdBy: "manual",
  labelHints: {},
  widgetHandlers: {},
  stats: { runs: 0, successes: 0, failures: 0 },
  steps: [
    {
      id: "fn",
      name: "First name",
      type: "fill",
      selector: {
        primary: { strategy: "css", value: "#first_name_BROKEN" },
        fallbacks: [{ strategy: "css", value: "#also_broken" }],
      },
      valueSource: "profile.firstName",
      optional: false,
      onFail: "heal",
    },
  ],
};

describe("heal promotion", () => {
  let browser: Browser;
  let baseUrl: string;
  let closeAts: () => Promise<void>;

  beforeAll(async () => {
    const ats = await buildMockAts();
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeAts = () => ats.close();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
    await closeAts();
  });

  it("heals a broken recipe selector, completes, and proposes a version with the old selector as fallback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-heal-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map = answers(resume);
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
        recipe: brokenRecipe,
        profile: { firstName: "Ada", lastName: "Lovelace", email: "ada@example.com" },
        tier2WaitMs: 0,
        resolve: async (inventory) =>
          inventory.fields.map((field) => {
            const value = map[field.labelNorm] ?? map[normalizeQuestion(field.labelRaw)];
            const resolved: Resolution = {
              fingerprint: field.fingerprint,
              labelRaw: field.labelRaw,
              type: field.type,
              status: value ? "resolved" : "unanswered",
              value,
              source: "test",
              confidence: value ? 1 : 0,
              tier: value ? 0 : 4,
            };
            return resolved;
          }),
      });
      expect(result.kind).toBe("review");
      const healed = result.healReports.find((item) => item.labelRaw.toLowerCase().includes("first name"));
      expect(healed?.winningTier).toBe(1);
      expect(healed?.attempts.some((item) => item.tier === 1 && item.ok)).toBe(true);
      expect(healed?.workingSelector?.primary.value).not.toBe("#first_name_BROKEN");

      await clickSubmit(page, { userApproved: true });
      await page.waitForURL(/\/apply\/done/);

      const proposed = applyRepairsToRecipe(brokenRecipe, result.healReports);
      expect(proposed.status).toBe("proposed");
      expect(proposed.steps[0]?.selector?.primary.value).not.toBe("#first_name_BROKEN");
      expect(proposed.steps[0]?.selector?.fallbacks.some((item) => item.value === "#first_name_BROKEN")).toBe(true);
    } finally {
      await page.close();
    }
  });
});
