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
});
