import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.ts";
import type { FetchPage } from "../src/fetch-page.ts";
import { tempSqlite } from "./helper.ts";

const greenhouseHtml = `
  <script type="application/ld+json">
    {
      "@type": "JobPosting",
      "title": "Staff Backend Engineer",
      "hiringOrganization": { "name": "Acme" },
      "jobLocation": { "address": { "addressLocality": "Remote" } },
      "datePosted": "2026-08-01",
      "description": "Build services."
    }
  </script>
  <form id="application_form"></form>
`;

const pages: Record<string, string> = {
  "https://boards.greenhouse.io/acme/jobs/555": greenhouseHtml,
  "https://linkedin.com/jobs/view/999": `
    <a href="https://boards.greenhouse.io/acme/jobs/555">Apply on company site</a>
    <h1>Staff Backend Engineer</h1>
  `,
  "https://jobs.lever.co/other/abcd": `
    <script src="https://jobs.lever.co/embed.js"></script>
    <script type="application/ld+json">
      { "@type": "JobPosting", "title": "Data Engineer", "hiringOrganization": { "name": "Other Co" } }
    </script>
  `,
};

const fetchPage: FetchPage = async (url) => {
  const body = pages[url] ?? "<html><title>Unknown</title></html>";
  return { requestedUrl: url, finalUrl: url, status: 200, body, contentType: "text/html" };
};

describe("intake API", () => {
  it("saves and reloads profile values", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config, fetchPage });
    try {
      const put = await app.inject({
        method: "PUT",
        url: "/api/profile",
        payload: {
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          authorizedToWork: "yes",
          needsSponsorship: "no",
          eeoFillMode: "decline",
        },
      });
      expect(put.statusCode).toBe(200);
      const get = await app.inject({ method: "GET", url: "/api/profile" });
      expect(get.json().values.firstName).toBe("Ada");
      expect(get.json().values.email).toBe("ada@example.com");
      expect(get.json().values.eeoFillMode).toBe("decline");
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("detects platforms, classifies apply kind, and dedups LinkedIn + Greenhouse", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config, fetchPage });
    try {
      const first = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: {
          text: [
            "https://boards.greenhouse.io/acme/jobs/555",
            "https://jobs.lever.co/other/abcd",
          ].join("\n"),
        },
      });
      expect(first.statusCode).toBe(200);
      const created = first.json();
      expect(created.results).toHaveLength(2);
      expect(created.results[0].status).toBe("created");
      expect(created.results[0].job.platform).toBe("greenhouse");
      expect(created.results[0].job.applyKind).toBe("external");
      expect(created.results[1].job.platform).toBe("lever");

      const second = await app.inject({
        method: "POST",
        url: "/api/jobs",
        payload: { text: "https://linkedin.com/jobs/view/999, https://boards.greenhouse.io/acme/jobs/555" },
      });
      expect(second.json().results[0].status).toBe("deduped");
      expect(second.json().results[1].status).toBe("deduped");
      expect(second.json().jobs).toHaveLength(2);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("rejects an invalid profile email instead of guessing", async () => {
    const { sqlite, config } = tempSqlite();
    const app = await buildApp({ sqlite, config, fetchPage });
    try {
      const put = await app.inject({
        method: "PUT",
        url: "/api/profile",
        payload: { email: "not-an-email" },
      });
      expect(put.statusCode).toBe(400);
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
