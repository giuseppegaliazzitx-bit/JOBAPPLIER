import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeQuestion, profileValuesInText, type ProfileValues, type RecipeVersion, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { attachRecorder, postProcessRecording } from "../src/record.ts";
import { walkUntilPreflight } from "../src/walk.ts";

const PROFILE: ProfileValues = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "555-0100",
  country: "United States",
  authorizedToWork: "yes",
};

describe("record and replay mock ATS", () => {
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

  it("records a manual application, stores zero PII, and replays via the generic walker", async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-record-"));
    const resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    const map: Record<string, string> = {
      [normalizeQuestion("First Name")]: PROFILE.firstName ?? "",
      [normalizeQuestion("Last Name")]: PROFILE.lastName ?? "",
      [normalizeQuestion("Email")]: PROFILE.email ?? "",
      [normalizeQuestion("Phone")]: PROFILE.phone ?? "",
      [normalizeQuestion("Job Title")]: "Engineer",
      [normalizeQuestion("School")]: "Stanford University",
      [normalizeQuestion("Are you authorized to work in the US?")]: "yes",
      [normalizeQuestion("Country")]: PROFILE.country ?? "",
      [normalizeQuestion("Resume")]: resume,
    };

    const recordPage = await browser.newPage();
    const recorder = await attachRecorder(recordPage);
    try {
      await recordPage.goto(`${baseUrl}/apply`);
      await recordPage.getByLabel("First Name *").fill(PROFILE.firstName ?? "");
      await recordPage.getByLabel("Last Name *").fill(PROFILE.lastName ?? "");
      await recordPage.getByLabel("Email *").fill(PROFILE.email ?? "");
      await recordPage.getByLabel("Phone").fill(PROFILE.phone ?? "");
      await recordPage.getByRole("button", { name: "Continue" }).click();
      await recordPage.getByLabel("Resume").setInputFiles(resume);
      await recordPage.getByLabel("Job Title *").fill("Engineer");
      await recordPage.getByLabel("School").fill("Stan");
      await recordPage.getByRole("option", { name: "Stanford University" }).click();
      await recordPage.getByRole("button", { name: "Continue" }).click();
      await recordPage.getByRole("radio", { name: "Yes" }).click();
      await recordPage.getByRole("combobox", { name: "Country" }).click();
      await recordPage.getByRole("option", { name: "United States" }).click();
      await recordPage.getByRole("button", { name: "Continue" }).click();
      await recordPage.waitForURL(/\/apply\/step\/4/);
    } finally {
      const events = await recorder.stop();
      await recordPage.close();
      const processed = postProcessRecording(events, PROFILE, [{ kind: "resume", fileName: "resume.pdf" }]);
      const json = JSON.stringify(processed.steps);
      expect(profileValuesInText(json, PROFILE)).toEqual([]);
      expect(json).not.toMatch(/ada@example.com/i);
      expect(processed.steps.some((step) => step.type === "advance" || step.type === "fill")).toBe(true);

      const version: RecipeVersion = {
        recipeId: "mock-ats-record",
        version: 1,
        status: "proposed",
        steps: processed.steps.filter((step) => step.type !== "submit"),
        labelHints: {},
        widgetHandlers: {},
        createdBy: "record",
        stats: { runs: 0, successes: 0, failures: 0 },
      };

      const replay = await browser.newPage();
      try {
        await replay.goto(`${baseUrl}/apply`);
        const result = await walkUntilPreflight(replay, {
          recipe: version,
          profile: PROFILE,
          documents: { resume },
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
        await replay.close();
      }
    }
  });
});
