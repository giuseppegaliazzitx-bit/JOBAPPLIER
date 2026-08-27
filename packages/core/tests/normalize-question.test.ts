import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "../src/question-normalize.ts";
import { polaritiesConflict, polarityTags } from "../src/polarity.ts";
import { typesCompatible } from "../src/type-compat.ts";

describe("normalizeQuestion", () => {
  it("runs the full §5 pipeline", () => {
    expect(normalizeQuestion("Are you authorized to work in the US? *")).toBe(
      normalizeQuestion("Are you authorized to work in the United States? (required)"),
    );
    expect(normalizeQuestion("Please kindly enter your e-mail")).toContain("email");
    expect(normalizeQuestion("Have you worked at Acme before?", "Acme")).toContain("{company}");
    expect(normalizeQuestion("How many yrs of experience?")).toContain("year");
  });
});

describe("polarity", () => {
  it("treats work authorization and sponsorship as opposites", () => {
    const auth = polarityTags("Are you authorized to work in the US?");
    const sponsor = polarityTags("Will you now or in the future require sponsorship?");
    expect(auth.has("work_auth")).toBe(true);
    expect(sponsor.has("sponsorship")).toBe(true);
    expect(polaritiesConflict(auth, sponsor)).toBe(true);
  });
});

describe("typesCompatible", () => {
  it("never lets a text answer auto-fill a select", () => {
    expect(typesCompatible("text", "select")).toBe(false);
    expect(typesCompatible("textarea", "radio")).toBe(false);
    expect(typesCompatible("select", "radio")).toBe(true);
    expect(typesCompatible("email", "text")).toBe(true);
    expect(typesCompatible("file", "text")).toBe(false);
  });
});
