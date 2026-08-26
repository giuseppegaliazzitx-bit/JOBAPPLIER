import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";

describe("server", () => {
  it("reports health and meta", async () => {
    const app = await buildApp();
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ ok: true });

      const meta = await app.inject({ method: "GET", url: "/api/meta" });
      expect(meta.statusCode).toBe(200);
      expect(meta.json()).toEqual({
        name: "autoapply",
        phase: 0,
        browser: "sessionkit",
      });
    } finally {
      await app.close();
    }
  });
});
