import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  HIGH_CONFIDENCE_LABEL_SOURCES,
  FieldInventorySchema,
  isNthChildSelector,
  type FieldInventory,
} from "@autoapply/core";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractFieldInventory } from "../src/inventory.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, "../../../fixtures/pages");

const FIXTURES = [
  "greenhouse/application.html",
  "lever/application.html",
  "workday/step-1-personal.html",
  "workday/step-2-experience.html",
  "ashby/application.html",
  "icims/application.html",
] as const;

function expectedPath(htmlPath: string): string {
  return htmlPath.replace(/\.html$/, ".inventory.json");
}

function diffInventories(actual: FieldInventory, expected: FieldInventory): string[] {
  const lines: string[] = [];
  if (actual.title !== expected.title) {
    lines.push(`title: ${expected.title} -> ${actual.title}`);
  }
  if (actual.fields.length !== expected.fields.length) {
    lines.push(`field count: ${expected.fields.length} -> ${actual.fields.length}`);
  }
  const n = Math.max(actual.fields.length, expected.fields.length);
  for (let i = 0; i < n; i += 1) {
    const a = actual.fields[i];
    const e = expected.fields[i];
    if (!a) {
      lines.push(`missing actual field ${i}: ${e?.labelRaw}`);
      continue;
    }
    if (!e) {
      lines.push(`extra actual field ${i}: ${a.labelRaw} (${a.type}, ${a.labelSource})`);
      continue;
    }
    if (a.labelRaw !== e.labelRaw || a.type !== e.type || a.labelSource !== e.labelSource) {
      lines.push(
        `field ${i}: ${e.labelRaw}/${e.type}/${e.labelSource} -> ${a.labelRaw}/${a.type}/${a.labelSource}`,
      );
    }
    if (isNthChildSelector(a.selector.primary.value)) {
      lines.push(`field ${i} ${a.labelRaw}: nth-child primary ${a.selector.primary.value}`);
    }
  }
  return lines;
}

describe("golden field inventories", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("matches golden inventories, high-confidence labels, and no nth-child primaries", async () => {
    const corpus: FieldInventory[] = [];
    for (const relative of FIXTURES) {
      const htmlPath = join(fixturesRoot, relative);
      const html = readFileSync(htmlPath, "utf8");
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        const actual = await extractFieldInventory(page);
        corpus.push(actual);

        const goldPath = expectedPath(htmlPath);
        if (process.env.UPDATE_GOLDEN === "1" || !existsSync(goldPath)) {
          writeFileSync(goldPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
        }
        const expected = FieldInventorySchema.parse(JSON.parse(readFileSync(goldPath, "utf8")));
        const diffs = diffInventories(actual, expected);
        if (diffs.length > 0) {
          expect.fail(`${relative}\n${diffs.join("\n")}`);
        }
        expect(actual, relative).toEqual(expected);
        for (const field of actual.fields) {
          expect(isNthChildSelector(field.selector.primary.value), `${relative} ${field.labelRaw}`).toBe(
            false,
          );
        }
      } finally {
        await page.close();
      }
    }

    const fields = corpus.flatMap((inventory) => inventory.fields);
    expect(fields.length).toBeGreaterThan(20);
    const high = fields.filter((field) => HIGH_CONFIDENCE_LABEL_SOURCES.includes(field.labelSource));
    const nth = fields.filter((field) => isNthChildSelector(field.selector.primary.value));
    expect(nth, nth.map((field) => field.labelRaw).join(", ")).toHaveLength(0);
    expect(high.length / fields.length).toBeGreaterThanOrEqual(0.95);
  });
});
