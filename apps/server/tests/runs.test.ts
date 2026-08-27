import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { tempSqlite } from "./helper.ts";

describe("run routes", () => {
  it("rejects a run without a url and refuses approve without a live preflight", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const missing = await app.inject({ method: "POST", url: "/api/runs", payload: {} });
      expect(missing.statusCode).toBe(400);

      const listed = await app.inject({ method: "GET", url: "/api/runs" });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual({ runs: [] });

      const approve = await app.inject({ method: "POST", url: "/api/runs/missing/approve" });
      expect(approve.statusCode).toBe(409);

      const resume = await app.inject({ method: "POST", url: "/api/runs/missing/resume" });
      expect(resume.statusCode).toBe(409);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
