import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeQuestion, submitGateFromHistory, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pageKind } from "../src/advance.ts";
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

describe("autopilot unattended submits", () => {
  let browser: Browser;
  let baseUrl: string;
  let closeAts: () => Promise<void>;
  let resume: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-autopilot-"));
    resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
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

  it("refuses submit when recipe or site autopilot is off", async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
        delay: async () => undefined,
        resolve: async (inventory) =>
          inventory.fields.map((field) => {
            const map = answers(resume);
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
      await expect(
        clickSubmit(
          page,
          submitGateFromHistory(result.history, "review", {
            recipeActive: true,
            recipeAutopilot: true,
            siteAutopilot: false,
          }),
        ),
      ).rejects.toThrow(/submit gate refused/);
    } finally {
      await context.close();
    }
  });

  it(
    "submits 10 consecutive unattended mock ATS applications with zero bad submits",
    async () => {
      for (let n = 0; n < 10; n += 1) {
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.goto(`${baseUrl}/apply`);
          const result = await walkUntilPreflight(page, {
            delay: async () => undefined,
            resolve: async (inventory) =>
              inventory.fields.map((field) => {
                const map = answers(resume);
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
          expect(result.kind, `run ${n + 1} kind`).toBe("review");
          expect(result.fills.every((fill) => fill.ok), `run ${n + 1} fills`).toBe(true);
          expect(result.history.every((item) => item.resolution.status === "resolved")).toBe(true);
          expect(result.history.every((item) => !item.fill.error)).toBe(true);
          const first = result.fills.find((fill) => fill.labelRaw.toLowerCase().includes("first name"));
          expect(first?.readBack).toBe("Ada");

          await clickSubmit(
            page,
            submitGateFromHistory(result.history, "review", {
              recipeActive: true,
              recipeAutopilot: true,
              siteAutopilot: true,
            }),
          );
          await page.waitForURL(/\/apply\/done/);
          expect(await pageKind(page)).toBe("confirmation");
          const thanks = await page.locator("h1").innerText();
          expect(thanks).toMatch(/received/i);
          expect(await page.locator("body").innerText()).toMatch(/Ada/);
        } finally {
          await context.close();
        }
      }
    },
    240_000,
  );
});
