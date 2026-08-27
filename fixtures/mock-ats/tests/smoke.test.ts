import { describe, expect, it } from "vitest";
import { buildMockAts } from "../src/app.ts";

describe("mock ATS", () => {
  it("serves health", async () => {
    const app = await buildMockAts();
    try {
      const res = await app.inject({ method: "GET", url: "/health" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true, name: "mock-ats" });
    } finally {
      await app.close();
    }
  });

  it("serves a SessionKit-solvable captcha and a 2FA pause page", async () => {
    const captcha = await buildMockAts({ challenge: "captcha" });
    const twoFa = await buildMockAts({ challenge: "2fa" });
    try {
      const gate = await captcha.inject({ method: "GET", url: "/apply" });
      expect(gate.statusCode).toBe(302);
      expect(gate.headers.location).toBe("/apply/captcha");
      const page = await captcha.inject({ method: "GET", url: "/apply/captcha" });
      expect(page.body).toMatch(/captcha-pass/);
      expect(page.body).toMatch(/data-sessionkit-solve/);

      const hard = await buildMockAts({ challenge: "captcha-hard" });
      try {
        const hardPage = await hard.inject({ method: "GET", url: "/apply/captcha" });
        expect(hardPage.body).not.toMatch(/captcha-pass/);
        expect(hardPage.body).toMatch(/Unsolvable/);
      } finally {
        await hard.close();
      }

      const tfa = await twoFa.inject({ method: "GET", url: "/apply" });
      expect(tfa.headers.location).toBe("/apply/2fa");
      const tfaPage = await twoFa.inject({ method: "GET", url: "/apply/2fa" });
      expect(tfaPage.body).toMatch(/authenticator app/);
    } finally {
      await captcha.close();
      await twoFa.close();
    }
  });
});
