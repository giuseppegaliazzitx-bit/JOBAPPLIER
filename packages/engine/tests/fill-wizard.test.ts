import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeQuestion, submitGateFromHistory, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clickSubmit } from "../src/submit-gate.ts";
import { walkUntilPreflight } from "../src/walk.ts";

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

describe("fill mock ATS wizard", () => {
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

  it("fills every step, stops at preflight, and submits only after approve", async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-resume-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map = { ...answers(), [normalizeQuestion("Resume")]: resume };

    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
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
      expect(page.url()).toContain("/apply/step/4");
      expect(await page.locator("#submit-application").count()).toBe(1);
      expect(await page.locator("h1").innerText()).toMatch(/review/i);
      expect(result.fills.every((fill) => fill.ok)).toBe(true);
      const labels = result.history.map((item) => item.labelRaw).join(" | ");
      expect(labels).toMatch(/First Name/i);
      expect(labels).toMatch(/School/i);
      expect(labels).toMatch(/Country/i);
      const school = result.fills.find((fill) => fill.labelRaw.toLowerCase().includes("school"));
      expect(school?.chipVerified).toBe(true);
      expect(school?.readBack).toMatch(/Stanford/);
      const country = result.fills.find((fill) => fill.labelRaw.toLowerCase().includes("country"));
      expect(country?.readBack).toMatch(/United States/);

      await clickSubmit(page, submitGateFromHistory(result.history, "review", { userApproved: true }));
      await page.waitForURL(/\/apply\/done/);
      expect(await page.locator("h1").innerText()).toMatch(/received/i);
    } finally {
      await page.close();
    }
  });
});
