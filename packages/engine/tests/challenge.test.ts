import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeQuestion, type Resolution } from "@autoapply/core";
import { buildMockAts } from "@autoapply/mock-ats";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CAPTCHA_POLICY, TWO_FA_POLICY } from "../src/driver.ts";
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

function resolveFrom(map: Record<string, string>) {
  return async (inventory: { fields: Array<{ fingerprint: string; labelRaw: string; labelNorm: string; type: Resolution["type"] }> }) =>
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
    });
}

describe("SessionKit captcha solve and 2FA pause", () => {
  let browser: Browser;
  let resume: string;

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "autoapply-challenge-"));
    resume = join(dir, "resume.pdf");
    writeFileSync(resume, "%PDF-1.4\n1 0 obj<<>>endobj\n");
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("keeps SessionKit solve for captcha and pause for 2FA", () => {
    expect(CAPTCHA_POLICY).toBe("sessionkit_solve");
    expect(TWO_FA_POLICY).toBe("detect_pause_notify");
  });

  it("solves a mock captcha the way SessionKit would and continues the walk", async () => {
    const ats = await buildMockAts({ challenge: "captcha" });
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}/apply`);
      expect(await page.locator("[data-page=captcha]").count()).toBe(1);
      const result = await walkUntilPreflight(page, { resolve: resolveFrom(answers(resume)) });
      expect(result.kind).toBe("review");
      expect(result.blockedReason).toBeUndefined();
      expect(page.url()).toContain("/apply/step/4");
    } finally {
      await page.close();
      await ats.close();
    }
  });

  it("pauses when SessionKit cannot solve the captcha", async () => {
    const ats = await buildMockAts({ challenge: "captcha-hard" });
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}/apply`);
      const result = await walkUntilPreflight(page, { resolve: resolveFrom(answers(resume)) });
      expect(result.kind).toBe("blocked");
      expect(result.blockedReason).toBe("captcha");
      expect(page.url()).toContain("/apply/captcha");
    } finally {
      await page.close();
      await ats.close();
    }
  });

  it("never solves 2FA — detect, pause, wait for a human", async () => {
    const ats = await buildMockAts({ challenge: "2fa" });
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}/apply`);
      const result = await walkUntilPreflight(page, { resolve: resolveFrom(answers(resume)) });
      expect(result.kind).toBe("blocked");
      expect(result.blockedReason).toBe("two_factor");
      expect(await page.locator("[data-page=two-factor]").count()).toBe(1);
    } finally {
      await page.close();
      await ats.close();
    }
  });

  it("fills an emailed verification code and continues the walk", async () => {
    const ats = await buildMockAts({ challenge: "email-otp" });
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}/apply`);
      expect(await page.locator('[data-page="email-otp"]').count()).toBe(1);
      const result = await walkUntilPreflight(page, {
        resolve: resolveFrom(answers(resume)),
        waitForEmailCode: async () => "482193",
      });
      expect(result.kind).toBe("review");
      expect(result.blockedReason).toBeUndefined();
    } finally {
      await page.close();
      await ats.close();
    }
  });

  it("pauses when no emailed code arrives", async () => {
    const ats = await buildMockAts({ challenge: "email-otp" });
    await ats.listen({ host: "127.0.0.1", port: 0 });
    const address = ats.server.address();
    if (!address || typeof address === "string") {
      throw new Error("mock ATS did not bind");
    }
    const page = await browser.newPage();
    try {
      await page.goto(`http://127.0.0.1:${address.port}/apply`);
      const result = await walkUntilPreflight(page, { resolve: resolveFrom(answers(resume)) });
      expect(result.kind).toBe("blocked");
      expect(result.blockedReason).toBe("email_otp");
    } finally {
      await page.close();
      await ats.close();
    }
  });
});
