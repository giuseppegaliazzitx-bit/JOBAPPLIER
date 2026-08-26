import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AnswerScopeSchema,
  FieldDescriptorSchema,
  PlatformSchema,
  RecipeVersionSchema,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("package boundary", () => {
  it("depends only on zod", () => {
    const pkg = z
      .object({
        dependencies: z.record(z.string(), z.string()),
      })
      .parse(JSON.parse(readFileSync(join(here, "../package.json"), "utf8")));
    expect(Object.keys(pkg.dependencies)).toEqual(["zod"]);
  });
});

describe("FieldDescriptorSchema", () => {
  it("round-trips a native text field", () => {
    const field = {
      fingerprint: "abc123",
      labelRaw: "First Name",
      labelNorm: "first name",
      type: "text" as const,
      widget: "native" as const,
      required: true,
      selector: {
        primary: { strategy: "label" as const, value: "First Name" },
        fallbacks: [{ strategy: "name" as const, value: "first_name" }],
      },
      containerPath: "form.application",
      visible: true,
      disabled: false,
    };
    expect(FieldDescriptorSchema.parse(field)).toEqual(field);
  });

  it("rejects an unknown field type", () => {
    expect(() =>
      FieldDescriptorSchema.parse({
        fingerprint: "x",
        labelRaw: "x",
        labelNorm: "x",
        type: "mystery",
        widget: "native",
        required: false,
        selector: { primary: { strategy: "css", value: "input" }, fallbacks: [] },
        containerPath: "/",
        visible: true,
        disabled: false,
      }),
    ).toThrow();
  });
});

describe("PlatformSchema", () => {
  it("accepts known ATS names and unknown", () => {
    expect(PlatformSchema.parse("greenhouse")).toBe("greenhouse");
    expect(PlatformSchema.parse("unknown")).toBe("unknown");
  });
});

describe("AnswerScopeSchema", () => {
  it("accepts global, company, and job", () => {
    expect(AnswerScopeSchema.parse("global")).toBe("global");
    expect(AnswerScopeSchema.parse("company")).toBe("company");
    expect(AnswerScopeSchema.parse("job")).toBe("job");
  });
});

describe("RecipeVersionSchema", () => {
  it("round-trips a proposed version with a fill step", () => {
    const version = {
      recipeId: "greenhouse",
      version: 1,
      status: "proposed" as const,
      steps: [
        {
          id: "s1",
          name: "Fill first name",
          type: "fill" as const,
          selector: {
            primary: { strategy: "label" as const, value: "First Name" },
            fallbacks: [],
          },
          valueSource: "profile.firstName" as const,
          optional: false,
          onFail: "heal" as const,
        },
      ],
      labelHints: {},
      widgetHandlers: {},
      createdBy: "manual" as const,
      stats: { runs: 0, successes: 0, failures: 0 },
    };
    expect(RecipeVersionSchema.parse(version)).toEqual(version);
  });
});
