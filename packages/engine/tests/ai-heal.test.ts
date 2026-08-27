import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDistilledSafe, inventoryToDistilled, normalizeQuestion, type AiCallLog, type Resolution } from "@autoapply/core";
import { createAiHandle, type AiCaller } from "@autoapply/ai";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { healField } from "../src/heal.ts";
import { walkUntilPreflight } from "../src/walk.ts";

const PROFILE = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
};

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
    [normalizeQuestion("Preferred orbit")]: "LEO",
    [normalizeQuestion("Resume")]: resume,
  };
}

describe("AI heal on an unknown widget", () => {
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

  it("resolves the orbit picker, validates the patch, fills, and logs cost", async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-ai-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map = answers(resume);
    const logs: AiCallLog[] = [];
    const caller: AiCaller = async (request) => {
      expect(request.user).not.toContain("ada@example.com");
      expect(request.user).not.toMatch(/<form|<input/i);
      return {
        text: JSON.stringify({
          selector: { primary: { strategy: "css", value: "[data-orbit='LEO']" }, fallbacks: [] },
          action: "click",
          widget: "unknown",
        }),
        inTokens: 40,
        outTokens: 20,
      };
    };
    const ai = createAiHandle({ caller, onCall: (log) => logs.push(log) });

    const page = await browser.newPage();
    try {
      await page.goto(`${baseUrl}/apply`);
      const result = await walkUntilPreflight(page, {
        heal: (info) => healField({ ...info, page, ai }),
        resolve: async (inventory) => {
          const distilled = inventoryToDistilled(inventory);
          assertDistilledSafe(distilled, PROFILE);
          return inventory.fields.map((field) => {
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
          });
        },
      });
      expect(result.kind).toBe("review");
      const orbit = result.history.find((item) => item.labelRaw.toLowerCase().includes("orbit"));
      expect(orbit?.fill.ok).toBe(true);
      expect(orbit?.fill.readBack).toBe("LEO");
      expect(logs.some((item) => item.purpose === "repair_step" && item.cacheHit === false && item.costUsd > 0)).toBe(
        true,
      );
    } finally {
      await page.close();
    }
  });
});
