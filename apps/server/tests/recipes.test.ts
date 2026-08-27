import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { tempSqlite } from "./helper.ts";

describe("recipe routes", () => {
  it("seeds greenhouse and lever and refuses an invalid bundle", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const listed = await app.inject({ method: "GET", url: "/api/recipes" });
      expect(listed.statusCode).toBe(200);
      const body = listed.json() as { recipes: Array<{ platform: string; versions: Array<{ status: string }> }> };
      expect(body.recipes.map((item) => item.platform).sort()).toEqual(["greenhouse", "lever"]);
      expect(body.recipes.every((item) => item.versions[0]?.status === "proposed")).toBe(true);

      const bad = await app.inject({ method: "POST", url: "/api/recipes", payload: { nope: true } });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
