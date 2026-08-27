import { describe, expect, it } from "vitest";
import { deriveDedupKey } from "../src/dedup.ts";

describe("deriveDedupKey", () => {
  it("uses ATS id so tracking params do not fork a job", () => {
    const a = deriveDedupKey({ url: "https://boards.greenhouse.io/acme/jobs/123?gh_src=li" });
    const b = deriveDedupKey({ url: "https://boards.greenhouse.io/acme/jobs/123" });
    expect(a).toBe(b);
    expect(a).toBe("ats:greenhouse:acme:123");
  });

  it("collapses LinkedIn, Indeed, and company-site URLs that share an ATS id", () => {
    const greenhouse = deriveDedupKey({
      url: "https://boards.greenhouse.io/stripe/jobs/555",
    });
    const linkedin = deriveDedupKey({
      url: "https://linkedin.com/jobs/view/999",
      html: `<a href="https://boards.greenhouse.io/stripe/jobs/555">Apply on company site</a>`,
    });
    const indeed = deriveDedupKey({
      url: "https://indeed.com/viewjob?jk=abcd",
      html: `Apply at https://boards.greenhouse.io/stripe/jobs/555?utm_source=indeed`,
    });
    expect(linkedin).toBe(greenhouse);
    expect(indeed).toBe(greenhouse);
  });

  it("does not collapse two different ATS jobs", () => {
    const a = deriveDedupKey({ url: "https://jobs.lever.co/acme/aaaa" });
    const b = deriveDedupKey({ url: "https://jobs.lever.co/acme/bbbb" });
    expect(a).not.toBe(b);
  });

  it("falls back to company+title+location when no ATS id exists", () => {
    const a = deriveDedupKey({
      url: "https://linkedin.com/jobs/view/1",
      title: "Staff Engineer",
      company: "Acme Inc.",
      location: "Remote, US",
    });
    const b = deriveDedupKey({
      url: "https://indeed.com/viewjob?jk=other",
      title: "Staff Engineer",
      company: "Acme Incorporated",
      location: "Remote US",
    });
    expect(a).toBe(b);
    expect(a.startsWith("meta:")).toBe(true);
  });

  it("does not collapse different titles under the meta key", () => {
    const a = deriveDedupKey({
      url: "https://careers.example.com/a",
      title: "Backend Engineer",
      company: "Acme",
      location: "NYC",
    });
    const b = deriveDedupKey({
      url: "https://careers.example.com/b",
      title: "Data Engineer",
      company: "Acme",
      location: "NYC",
    });
    expect(a).not.toBe(b);
  });

  it("falls back to canonical URL when nothing else is known", () => {
    const key = deriveDedupKey({ url: "https://careers.example.com/jobs/1?utm_source=x" });
    expect(key).toBe("url:https://careers.example.com/jobs/1");
  });
});
