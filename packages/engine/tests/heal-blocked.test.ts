import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inventoryToDistilled, normalizeQuestion, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { writeIncomingFixture } from "../src/incoming.ts";
import { walkUntilPreflight } from "../src/walk.ts";

describe("heal exhausted goes to blocked", () => {
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

  it("pauses to blocked instead of proceeding when healing cannot repair an unknown widget", async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-block-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map: Record<string, string> = {
      [normalizeQuestion("First Name")]: "Ada",
      [normalizeQuestion("Last Name")]: "Lovelace",
      [normalizeQuestion("Email")]: "ada@example.com",
      [normalizeQuestion("Job Title")]: "Engineer",
      [normalizeQuestion("School")]: "Stanford University",
      [normalizeQuestion("Are you authorized to work in the US?")]: "yes",
      [normalizeQuestion("Country")]: "United States",
      [normalizeQuestion("Preferred orbit")]: "LEO",
      [normalizeQuestion("Resume")]: resume,
    };
    const incoming = mkdtempSync(join(tmpdir(), "autoapply-incoming-"));
    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
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
      expect(result.kind).toBe("blocked");
      expect(result.blockedReason).toMatch(/heal_exhausted|unknown_widget/);
      expect(result.healReports.some((item) => item.paused && item.winningTier === 4)).toBe(true);
      expect(page.url()).not.toMatch(/\/apply\/done/);
      const html = await page.content();
      writeIncomingFixture(incoming, html, inventoryToDistilled(result.inventory), result.title);
      expect(readdirSync(incoming).some((name) => name.endsWith(".html"))).toBe(true);
      expect(readdirSync(incoming).some((name) => name.endsWith(".distilled.txt"))).toBe(true);
    } finally {
      await page.close();
    }
  });
});
