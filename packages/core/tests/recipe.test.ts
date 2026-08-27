import { describe, expect, it } from "vitest";
import {
  ACTIVE_FAIL_RATE,
  SHADOW_STREAK,
  applyInventoryOverrides,
  applyResolveOverrides,
  canonicalizeValueSource,
  evaluateLifecycle,
  matchRecipe,
  parameterizeValue,
  profileValuesInText,
  urlPatternMatches,
  type FieldInventory,
  type Recipe,
  type RecipeVersion,
  type Resolution,
} from "../src/index.ts";

const greenhouse: Recipe = {
  id: "greenhouse-platform",
  scope: "platform",
  platform: "greenhouse",
  match: {
    urlPatterns: ["*://boards.greenhouse.io/*/jobs/*"],
    domFingerprints: [
      { kind: "meta_generator", value: "Greenhouse" },
      { kind: "css", value: "id=\"application_form\"" },
    ],
  },
};

const lever: Recipe = {
  id: "lever-platform",
  scope: "platform",
  platform: "lever",
  match: {
    urlPatterns: ["*://jobs.lever.co/*/*"],
    domFingerprints: [{ kind: "script_host", value: "jobs.lever.co" }],
  },
};

function version(overrides: Partial<RecipeVersion> = {}): RecipeVersion {
  return {
    recipeId: "greenhouse-platform",
    version: 1,
    status: "proposed",
    steps: [
      {
        id: "s1",
        name: "First name",
        type: "fill",
        selector: { primary: { strategy: "name", value: "job_application[first_name]" }, fallbacks: [] },
        valueSource: "profile.firstName",
        optional: false,
        onFail: "heal",
      },
    ],
    labelHints: { "job_application[first_name]": "Legal First Name" },
    widgetHandlers: {},
    createdBy: "manual",
    stats: { runs: 0, successes: 0, failures: 0 },
    ...overrides,
  };
}

describe("recipe matching", () => {
  it("matches URL patterns before DOM fingerprints", () => {
    expect(urlPatternMatches("*://boards.greenhouse.io/*/jobs/*", "https://boards.greenhouse.io/acme/jobs/1")).toBe(true);
    const hit = matchRecipe("https://boards.greenhouse.io/acme/jobs/99", "<html></html>", [lever, greenhouse]);
    expect(hit?.id).toBe("greenhouse-platform");
  });

  it("falls back to DOM fingerprints when the URL is unknown", () => {
    const html = `<meta name="generator" content="Greenhouse"><form id="application_form"></form>`;
    const hit = matchRecipe("https://jobs.example.com/apply", html, [greenhouse, lever]);
    expect(hit?.platform).toBe("greenhouse");
  });
});

describe("parameterize", () => {
  it("stores profile.email rather than the typed literal", () => {
    const hit = parameterizeValue("ada@example.com", { email: "ada@example.com", firstName: "Ada" });
    expect(hit).toEqual({ kind: "profile", valueSource: "profile.email" });
    expect(canonicalizeValueSource("{{profile.email}}")).toBe("profile.email");
  });

  it("flags values that do not match the profile", () => {
    const hit = parameterizeValue("Engineer", { email: "ada@example.com" });
    expect(hit).toEqual({ kind: "unmatched", value: "Engineer" });
  });
});

describe("lifecycle", () => {
  it("promotes proposed to shadow only after the fixture passes", () => {
    expect(evaluateLifecycle({ status: "proposed", fixturePassed: false, outcomes: [], hasPriorActive: false })).toEqual({
      action: "none",
    });
    expect(evaluateLifecycle({ status: "proposed", fixturePassed: true, outcomes: [], hasPriorActive: false })).toEqual({
      action: "promote",
      to: "shadow",
    });
  });

  it("promotes shadow after three consecutive successes", () => {
    expect(SHADOW_STREAK).toBe(3);
    expect(
      evaluateLifecycle({
        status: "shadow",
        fixturePassed: true,
        outcomes: ["success", "success", "success"],
        hasPriorActive: false,
      }),
    ).toEqual({ action: "promote", to: "active" });
  });

  it("degrades active when failure rate exceeds 30% over 10 runs", () => {
    const outcomes = [
      "success",
      "success",
      "success",
      "success",
      "success",
      "success",
      "failure",
      "failure",
      "failure",
      "failure",
    ] as const;
    expect(ACTIVE_FAIL_RATE).toBe(0.3);
    expect(
      evaluateLifecycle({
        status: "active",
        fixturePassed: true,
        outcomes: [...outcomes],
        hasPriorActive: true,
      }),
    ).toEqual({ action: "degrade" });
    expect(
      evaluateLifecycle({
        status: "degraded",
        fixturePassed: true,
        outcomes: [...outcomes],
        hasPriorActive: true,
      }),
    ).toEqual({ action: "rollback" });
  });
});

describe("recipe overlays", () => {
  it("rewrites inventory labels and resolve values without replacing the walker", () => {
    const inventory: FieldInventory = {
      title: "gh",
      fields: [
        {
          fingerprint: "old",
          labelRaw: "First Name",
          labelNorm: "first name",
          labelSource: "label_for",
          type: "text",
          widget: "native",
          required: true,
          selector: {
            primary: { strategy: "name", value: "job_application[first_name]" },
            fallbacks: [],
          },
          containerPath: "form",
          visible: true,
          disabled: false,
        },
      ],
    };
    const hinted = applyInventoryOverrides(inventory, version());
    expect(hinted.fields[0]?.labelRaw).toBe("Legal First Name");
    const generic: Resolution[] = [
      {
        fingerprint: hinted.fields[0]?.fingerprint ?? "",
        labelRaw: "Legal First Name",
        type: "text",
        status: "unanswered",
        confidence: 0,
        tier: 4,
      },
    ];
    const resolved = applyResolveOverrides(hinted, generic, version(), { firstName: "Ada" });
    expect(resolved[0]?.value).toBe("Ada");
    expect(resolved[0]?.source).toBe("recipe:profile.firstName");
  });
});

describe("PII scan helper", () => {
  it("detects a profile value leaking into recipe JSON", () => {
    const json = JSON.stringify({ steps: [{ valueSource: "ada@example.com" }] });
    expect(profileValuesInText(json, { email: "ada@example.com" })).toEqual(["ada@example.com"]);
    expect(profileValuesInText(JSON.stringify({ valueSource: "profile.email" }), { email: "ada@example.com" })).toEqual([]);
  });
});
