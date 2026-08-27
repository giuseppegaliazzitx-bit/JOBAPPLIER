import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { normalizeQuestion, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { walkUntilPreflight } from "../src/walk.ts";

const here = dirname(fileURLToPath(import.meta.url));

function answers(): Record<string, string> {
  return {
    [normalizeQuestion("First Name")]: "Ada",
    [normalizeQuestion("Last Name")]: "Lovelace",
    [normalizeQuestion("Email")]: "ada@example.com",
    [normalizeQuestion("Phone")]: "555-0100",
    [normalizeQuestion("Job Title")]: "Engineer",
    [normalizeQuestion("School")]: "Stanford University",
    [normalizeQuestion("Are you authorized to work in the US?")]: "yes",
    [normalizeQuestion("Country")]: "United States",
  };
}

describe("generic walker without recipes", () => {
  let browser: Browser;
  let baseUrl: string;
  let closeAts: () => Promise<void>;

  beforeAll(async () => {
    const ats = await buildMockAts();
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind a port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    closeAts = () => ats.close();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
    await closeAts();
  });

  it("still completes the mock ATS when every recipe is deleted", async () => {
    const walkSrc = readFileSync(join(here, "../src/walk.ts"), "utf8");
    expect(walkSrc).toMatch(/extractFieldInventory/);
    expect(walkSrc).toMatch(/fillField/);
    expect(walkSrc).not.toMatch(/loadBundledRecipes/);

    const dir = mkdtempSync(join(tmpdir(), "autoapply-generic-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map = { ...answers(), [normalizeQuestion("Resume")]: resume };

    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
        recipe: undefined,
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
      expect(result.fills.every((fill) => fill.ok)).toBe(true);
    } finally {
      await page.close();
    }
  });
});
