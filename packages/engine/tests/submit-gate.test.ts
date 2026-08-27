import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("submit gate", () => {
  it("is the only module that clicks submit", () => {
    const walk = readFileSync(join(here, "../src/walk.ts"), "utf8");
    const fill = readFileSync(join(here, "../src/fill.ts"), "utf8");
    const gate = readFileSync(join(here, "../src/submit-gate.ts"), "utf8");
    expect(walk).not.toMatch(/clickSubmit/);
    expect(walk).not.toMatch(/submit-application/);
    expect(walk).not.toMatch(/from "\.\/submit-gate/);
    expect(fill).not.toMatch(/submit-application/);
    expect(gate).toMatch(/userApproved/);
    expect(gate).toMatch(/submit-application/);
  });
});
