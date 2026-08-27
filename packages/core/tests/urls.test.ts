import { describe, expect, it } from "vitest";
import { canonicalizeUrl, detectJobSource, extractJobUrls } from "../src/urls.ts";

describe("extractJobUrls", () => {
  it("splits newlines and commas and drops trailing punctuation", () => {
    const text = `
      https://boards.greenhouse.io/acme/jobs/1,
      https://jobs.lever.co/acme/abcd,
      https://linkedin.com/jobs/view/99.
    `;
    expect(extractJobUrls(text)).toEqual([
      "https://boards.greenhouse.io/acme/jobs/1",
      "https://jobs.lever.co/acme/abcd",
      "https://linkedin.com/jobs/view/99",
    ]);
  });

  it("de-duplicates identical paste strings", () => {
    const text = "https://jobs.ashbyhq.com/x/1 https://jobs.ashbyhq.com/x/1";
    expect(extractJobUrls(text)).toEqual(["https://jobs.ashbyhq.com/x/1"]);
  });
});

describe("canonicalizeUrl", () => {
  it("strips tracking params and www", () => {
    expect(
      canonicalizeUrl(
        "https://www.boards.greenhouse.io/Stripe/jobs/12345?gh_src=abc&utm_source=li",
      ),
    ).toBe("https://boards.greenhouse.io/Stripe/jobs/12345");
  });

  it("normalizes LinkedIn job view URLs", () => {
    expect(
      canonicalizeUrl("https://www.linkedin.com/jobs/view/123456/?refId=x&trackingId=y"),
    ).toBe("https://linkedin.com/jobs/view/123456");
  });

  it("normalizes Indeed jk URLs", () => {
    expect(canonicalizeUrl("https://www.indeed.com/viewjob?jk=abcd&from=share")).toBe(
      "https://indeed.com/viewjob?jk=abcd",
    );
  });

  it("rejects non-http schemes", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("mailto:x@y.com")).toBeNull();
  });
});

describe("detectJobSource", () => {
  it("classifies aggregator hosts", () => {
    expect(detectJobSource("https://linkedin.com/jobs/view/1")).toBe("linkedin");
    expect(detectJobSource("https://indeed.com/viewjob?jk=a")).toBe("indeed");
    expect(detectJobSource("https://boards.greenhouse.io/acme/jobs/1")).toBe("company");
  });
});
