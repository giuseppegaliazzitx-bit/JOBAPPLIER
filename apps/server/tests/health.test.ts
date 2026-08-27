import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { tempSqlite } from "./helper.ts";

describe("server", () => {
  it("reports health and meta", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const health = await app.inject({ method: "GET", url: "/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toEqual({ ok: true });

      const meta = await app.inject({ method: "GET", url: "/api/meta" });
      expect(meta.statusCode).toBe(200);
      expect(meta.json()).toEqual({
        name: "autoapply",
        phase: 10,
        browser: "sessionkit",
      });
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
