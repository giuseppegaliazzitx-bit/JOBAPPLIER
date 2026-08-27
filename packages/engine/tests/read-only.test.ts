import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "../src");

function sourceFiles(): string[] {
  return readdirSync(srcDir)
    .filter((name) => name.endsWith(".ts") && name !== "capture.ts")
    .map((name) => readFileSync(join(srcDir, name), "utf8"));
}

describe("inventory extractor is read-only", () => {
  it("does not click, fill, type, or submit", () => {
    const blob = sourceFiles().join("\n");
    expect(blob).not.toMatch(/\.click\s*\(/);
    expect(blob).not.toMatch(/\.fill\s*\(/);
    expect(blob).not.toMatch(/\.type\s*\(/);
    expect(blob).not.toMatch(/\.selectOption\s*\(/);
    expect(blob).not.toMatch(/\.setInputFiles\s*\(/);
    expect(blob).not.toMatch(/\.press\s*\(/);
    expect(blob).not.toMatch(/page\.goto\s*\(/);
  });
});
