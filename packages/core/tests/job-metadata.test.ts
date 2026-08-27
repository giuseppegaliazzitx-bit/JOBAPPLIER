import { describe, expect, it } from "vitest";
import { classifyApplyKind } from "../src/apply-kind.ts";
import { extractJobMetadata } from "../src/job-metadata.ts";

describe("extractJobMetadata", () => {
  it("reads JSON-LD JobPosting", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          "title": "Backend Engineer",
          "description": "<p>Build APIs.</p>",
          "datePosted": "2026-08-01",
          "hiringOrganization": { "@type": "Organization", "name": "Acme" },
          "jobLocation": {
            "@type": "Place",
            "address": { "@type": "PostalAddress", "addressLocality": "Austin", "addressRegion": "TX" }
          }
        }
      </script>
    `;
    expect(extractJobMetadata(html)).toEqual({
      title: "Backend Engineer",
      company: "Acme",
      location: "Austin, TX",
      description: "Build APIs.",
      postedAt: "2026-08-01",
    });
  });

  it("falls back to Open Graph tags", () => {
    const html = `
      <meta property="og:title" content="Data Engineer" />
      <meta property="og:site_name" content="Acme Careers" />
      <meta property="og:description" content="SQL and warehouses" />
    `;
    const meta = extractJobMetadata(html);
    expect(meta.title).toBe("Data Engineer");
    expect(meta.company).toBe("Acme Careers");
    expect(meta.description).toBe("SQL and warehouses");
  });
});

describe("classifyApplyKind", () => {
  it("marks ATS URLs as external", () => {
    expect(classifyApplyKind("https://jobs.lever.co/acme/1")).toBe("external");
  });

  it("marks LinkedIn Easy Apply only when the signal is present", () => {
    expect(
      classifyApplyKind("https://linkedin.com/jobs/view/1", "<button>Easy Apply</button>"),
    ).toBe("easy_apply");
    expect(classifyApplyKind("https://linkedin.com/jobs/view/1", "<p>Apply on company website</p>")).toBe(
      "unknown",
    );
  });
});
