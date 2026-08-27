import { describe, expect, it } from "vitest";
import { valuesMatch } from "../src/verify.ts";

describe("valuesMatch", () => {
  it("matches equal strings ignoring case", () => {
    expect(valuesMatch("Ada", "ada")).toBe(true);
  });

  it("matches a file path to the chosen filename", () => {
    expect(valuesMatch("/tmp/autoapply-resume-1/resume.pdf", "C:\\fakepath\\resume.pdf")).toBe(true);
  });

  it("rejects a missing read-back", () => {
    expect(valuesMatch("Ada", null)).toBe(false);
  });
});
