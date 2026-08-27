import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("AI is a fallback", () => {
  it("does not import the model layer from the generic walker", () => {
    const walk = readFileSync(join(here, "../src/walk.ts"), "utf8");
    expect(walk).not.toMatch(/@autoapply\/ai/);
    expect(walk).not.toMatch(/repairStep|classifyPage/);
  });
});
