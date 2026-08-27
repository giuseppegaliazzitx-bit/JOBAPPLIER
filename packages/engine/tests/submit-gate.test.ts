import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "../src");

describe("submit gate", () => {
  it("is the only engine module that clicks submit", () => {
    const names = readdirSync(srcDir).filter((name) => name.endsWith(".ts"));
    const gate = readFileSync(join(srcDir, "submit-gate.ts"), "utf8");
    expect(gate).toMatch(/evaluateSubmitGate/);
    expect(gate).toMatch(/submit-application/);
    expect(gate).toMatch(/btn\.first\(\)\.click\(\)/);

    for (const name of names) {
      if (name === "submit-gate.ts" || name === "index.ts") {
        continue;
      }
      const src = readFileSync(join(srcDir, name), "utf8");
      expect(src, name).not.toMatch(/clickSubmit/);
      expect(src, name).not.toMatch(/from "\.\/submit-gate/);
      expect(src, name).not.toMatch(/getByRole\(\s*["']button["']\s*,\s*\{\s*name:\s*\/submit/i);
      expect(src, name).not.toMatch(/#submit-application[\s\S]{0,240}\.click\s*\(/);
    }
    const index = readFileSync(join(srcDir, "index.ts"), "utf8");
    expect(index).toMatch(/clickSubmit/);
    expect(index).not.toMatch(/\.click\s*\(/);

    const walk = readFileSync(join(srcDir, "walk.ts"), "utf8");
    expect(walk).not.toMatch(/submit-application/);
  });
});
