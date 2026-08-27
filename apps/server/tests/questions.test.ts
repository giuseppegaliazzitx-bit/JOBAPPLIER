import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FieldInventorySchema } from "@autoapply/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import { tempSqlite } from "./helper.ts";

const here = dirname(fileURLToPath(import.meta.url));
const workday = FieldInventorySchema.parse(
  JSON.parse(
    readFileSync(
      join(here, "../../../fixtures/pages/workday/step-1-personal.inventory.json"),
      "utf8",
    ),
  ),
);

describe("questions and dry-run resolve", () => {
  it("imports a Workday inventory, resolves nothing without answers, then unblocks after one answer", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config });
    try {
      const imported = await app.inject({
        method: "POST",
        url: "/api/questions/import",
        payload: {
          inventory: workday,
          jobTitle: "Software Engineer",
          jobUrl: "https://example.myworkdayjobs.com/job/1",
        },
      });
      expect(imported.statusCode).toBe(200);
      const cards = imported.json().questions as Array<{ labelRaw: string; id: string; blocked: unknown[] }>;
      expect(cards.some((card) => card.labelRaw === "Legal First Name")).toBe(true);
      expect(cards.find((card) => card.labelRaw === "Legal First Name")?.blocked[0]).toMatchObject({
        title: "Software Engineer",
      });

      const dry = await app.inject({
        method: "POST",
        url: "/api/resolve",
        payload: { inventory: workday, persistQuestions: false },
      });
      expect(dry.statusCode).toBe(200);
      const resolutions = dry.json().resolutions as Array<{ status: string; value?: string }>;
      expect(resolutions.every((item) => item.status === "unanswered")).toBe(true);
      expect(resolutions.every((item) => item.value === undefined)).toBe(true);

      const first = cards.find((card) => card.labelRaw === "Legal First Name");
      expect(first).toBeTruthy();
      if (!first) {
        return;
      }
      const answered = await app.inject({
        method: "PUT",
        url: "/api/profile",
        payload: { firstName: "Ada" },
      });
      expect(answered.statusCode).toBe(200);

      const again = await app.inject({
        method: "POST",
        url: "/api/resolve",
        payload: { inventory: workday, persistQuestions: false },
      });
      const firstRes = (again.json().resolutions as Array<{ labelRaw: string; status: string; value?: string }>).find(
        (item) => item.labelRaw === "Legal First Name",
      );
      expect(firstRes?.status).toBe("resolved");
      expect(firstRes?.value).toBe("Ada");
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
