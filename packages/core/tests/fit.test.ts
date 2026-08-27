import { describe, expect, it } from "vitest";
import {
  computeFitScore,
  isStaffingAgency,
  isStale,
  jobFamily,
  keywordGap,
  locationMismatch,
  selectResumeVariant,
  titleSimilarity,
} from "../src/index.ts";

describe("fit score", () => {
  it("prefers a resume whose keywords overlap the posting", () => {
    const backend = { id: "b", label: "backend.pdf", keywords: ["python", "postgres", "backend"] };
    const frontend = { id: "f", label: "frontend.pdf", keywords: ["react", "css", "frontend"] };
    const picked = selectResumeVariant("We need python postgres backend services", "Backend Engineer", [
      frontend,
      backend,
    ]);
    expect(picked?.id).toBe("b");
    expect(
      computeFitScore({
        description: "python postgres backend",
        title: "Backend Engineer",
        resumeKeywords: backend.keywords,
      }),
    ).toBeGreaterThan(
      computeFitScore({
        description: "python postgres backend",
        title: "Backend Engineer",
        resumeKeywords: frontend.keywords,
      }),
    );
  });

  it("flags staffing agencies, stale postings, location mismatch, and keyword gaps", () => {
    expect(isStaffingAgency("Acme Staffing", "")).toBe(true);
    expect(isStaffingAgency("Acme", "We build products.")).toBe(false);
    expect(isStale("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", new Date("2026-08-27T00:00:00.000Z"))).toBe(
      true,
    );
    expect(locationMismatch("New York, NY", { city: "Austin", country: "United States" })).toBe(true);
    expect(locationMismatch("Remote", { city: "Austin" })).toBe(false);
    const gap = keywordGap("python kafka kubernetes", ["python"]);
    expect(gap.overlap).toContain("python");
    expect(gap.missing).toEqual(expect.arrayContaining(["kafka", "kubernetes"]));
    expect(jobFamily("Staff Backend Engineer")).toBe("backend");
    expect(titleSimilarity("Backend Engineer", ["backend"])).toBeGreaterThan(0);
  });
});
