import { describe, expect, it } from "vitest";
import { detectPlatform, detectPlatformFromUrl } from "../src/platform-detect.ts";

const URLS: Array<[string, string]> = [
  ["https://boards.greenhouse.io/stripe/jobs/12345", "greenhouse"],
  ["https://job-boards.greenhouse.io/acme/jobs/987", "greenhouse"],
  ["https://jobs.lever.co/netflix/abcd-efgh", "lever"],
  ["https://stripe.wd1.myworkdayjobs.com/en-US/External/job/Dublin/Engineer_R123", "workday"],
  ["https://careers-acme.icims.com/jobs/4321/software-engineer/job", "icims"],
  ["https://acme.taleo.net/careersection/2/jobdetail.ftl?job=12345", "taleo"],
  ["https://jobs.smartrecruiters.com/McDonalds/123-job", "smartrecruiters"],
  ["https://jobs.ashbyhq.com/openai/123e4567-e89b", "ashby"],
  ["https://jobs.jobvite.com/acme/job/abcde", "jobvite"],
  ["https://acme.bamboohr.com/careers/45", "bamboohr"],
  ["https://acme.recruitee.com/o/software-engineer", "recruitee"],
];

describe("detectPlatformFromUrl", () => {
  it("maps known ATS hosts and paths", () => {
    for (const [url, platform] of URLS) {
      expect(detectPlatformFromUrl(url), url).toBe(platform);
    }
  });

  it("does not treat LinkedIn or Indeed as an ATS", () => {
    expect(detectPlatformFromUrl("https://linkedin.com/jobs/view/123")).toBeNull();
    expect(detectPlatformFromUrl("https://indeed.com/viewjob?jk=abcd")).toBeNull();
  });
});

describe("detectPlatform", () => {
  it("prefers URL over DOM", () => {
    const html = `<div data-automation-id="jobPostingPage"></div>`;
    expect(detectPlatform("https://boards.greenhouse.io/acme/jobs/1", html)).toBe("greenhouse");
  });

  it("uses DOM fingerprints when the URL is an aggregator", () => {
    const greenhouse = `
      <form id="application_form">
        <input name="job_application[first_name]" />
      </form>
      <script src="https://boards.greenhouse.io/embed/job_board/js?for=acme"></script>
    `;
    expect(detectPlatform("https://linkedin.com/jobs/view/9", greenhouse)).toBe("greenhouse");

    const workday = `<html><div data-automation-id="jobPostingHeader"></div>
      <script src="https://static.workdaycdn.com/app.js"></script></html>`;
    expect(detectPlatform("https://example.com/careers/1", workday)).toBe("workday");
  });

  it("returns unknown instead of guessing", () => {
    expect(detectPlatform("https://linkedin.com/jobs/view/9", "<html><p>Apply today</p></html>")).toBe(
      "unknown",
    );
    expect(detectPlatform("https://careers.example.com/jobs/1")).toBe("unknown");
    expect(detectPlatform("https://example.com/we-use-workday-internally")).toBe("unknown");
  });

  it("does not guess when two ATS fingerprints are tied", () => {
    const html = `
      <script src="https://boards.greenhouse.io/embed.js"></script>
      <script src="https://jobs.lever.co/embed.js"></script>
    `;
    expect(detectPlatform("https://careers.example.com/x", html)).toBe("unknown");
  });
});
