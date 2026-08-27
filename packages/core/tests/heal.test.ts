import { describe, expect, it } from "vitest";
import { applyRepairsToRecipe, promoteSelector, type HealReport, type RecipeVersion } from "../src/index.ts";

describe("selector promotion", () => {
  it("makes the working selector primary and keeps the broken one as a fallback", () => {
    const original = {
      primary: { strategy: "css" as const, value: "#first_name_BROKEN" },
      fallbacks: [{ strategy: "css" as const, value: "#also_broken" }],
    };
    const next = promoteSelector(original, { strategy: "name", value: "first_name" });
    expect(next.primary).toEqual({ strategy: "name", value: "first_name" });
    expect(next.fallbacks.some((item) => item.value === "#first_name_BROKEN")).toBe(true);
  });

  it("writes a proposed recipe version from tier 1–3 reports", () => {
    const version: RecipeVersion = {
      recipeId: "mock",
      version: 1,
      status: "active",
      createdBy: "manual",
      labelHints: {},
      widgetHandlers: {},
      stats: { runs: 1, successes: 1, failures: 0 },
      steps: [
        {
          id: "fn",
          name: "First name",
          type: "fill",
          selector: {
            primary: { strategy: "css", value: "#first_name_BROKEN" },
            fallbacks: [],
          },
          valueSource: "profile.firstName",
          optional: false,
          onFail: "heal",
        },
      ],
    };
    const report: HealReport = {
      fingerprint: "x",
      labelRaw: "First Name *",
      attempts: [{ tier: 1, tried: "labelNorm=first name", ok: true }],
      paused: false,
      winningTier: 1,
      originalSelector: version.steps[0]?.selector ?? { primary: { strategy: "css", value: "#x" }, fallbacks: [] },
      workingSelector: { primary: { strategy: "name", value: "first_name" }, fallbacks: [] },
    };
    const next = applyRepairsToRecipe(version, [report]);
    expect(next.status).toBe("proposed");
    expect(next.createdBy).toBe("ai_repair");
    expect(next.steps[0]?.selector?.primary.value).toBe("first_name");
    expect(next.steps[0]?.selector?.fallbacks[0]?.value).toBe("#first_name_BROKEN");
  });
});
