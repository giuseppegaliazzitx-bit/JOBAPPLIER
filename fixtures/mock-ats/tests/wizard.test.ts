import { describe, expect, it } from "vitest";
import { buildMockAts } from "../src/app.ts";

describe("mock ATS wizard", () => {
  it("starts a session and shows identity fields", async () => {
    const app = await buildMockAts();
    try {
      const start = await app.inject({ method: "GET", url: "/apply" });
      expect(start.statusCode).toBe(302);
      const cookie = start.cookies.find((item) => item.name === "mock_ats_sid");
      expect(cookie?.value).toBeTruthy();
      const step = await app.inject({
        method: "GET",
        url: "/apply/step/1",
        cookies: { mock_ats_sid: cookie?.value ?? "" },
      });
      expect(step.statusCode).toBe(200);
      expect(step.body).toContain("First Name");
      expect(step.body).toContain("Continue");
      expect(step.body).not.toContain("Submit application");
    } finally {
      await app.close();
    }
  });

  it("serves a session timeout page", async () => {
    const app = await buildMockAts();
    try {
      const res = await app.inject({ method: "GET", url: "/apply/timeout" });
      expect(res.body).toContain("session has expired");
      expect(res.body).toContain('data-page="timeout"');
    } finally {
      await app.close();
    }
  });

  it("shows inline validation when identity fields are missing", async () => {
    const app = await buildMockAts();
    try {
      const start = await app.inject({ method: "GET", url: "/apply" });
      const cookie = start.cookies.find((item) => item.name === "mock_ats_sid");
      const res = await app.inject({
        method: "POST",
        url: "/apply/step/1",
        cookies: { mock_ats_sid: cookie?.value ?? "" },
        payload: { first_name: "", last_name: "", email: "not-an-email" },
      });
      expect(res.body).toContain("This field is required");
      expect(res.body).toContain("Enter a valid email");
    } finally {
      await app.close();
    }
  });

  it("requires visa type when the applicant is not authorized", async () => {
    const app = await buildMockAts();
    try {
      const start = await app.inject({ method: "GET", url: "/apply" });
      const cookie = { mock_ats_sid: start.cookies.find((item) => item.name === "mock_ats_sid")?.value ?? "" };
      await app.inject({
        method: "POST",
        url: "/apply/step/1",
        cookies: cookie,
        payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
      });
      await app.inject({
        method: "POST",
        url: "/apply/step/2",
        cookies: cookie,
        payload: { job_title: "Engineer", school: "MIT" },
      });
      const res = await app.inject({
        method: "POST",
        url: "/apply/step/3",
        cookies: cookie,
        payload: { work_authorized: "no", country: "Canada" },
      });
      expect(res.body).toContain("Visa type");
      expect(res.body).toContain("This field is required");
    } finally {
      await app.close();
    }
  });

  it("rejects a non-PDF resume filename", async () => {
    const app = await buildMockAts();
    try {
      const start = await app.inject({ method: "GET", url: "/apply" });
      const cookie = { mock_ats_sid: start.cookies.find((item) => item.name === "mock_ats_sid")?.value ?? "" };
      await app.inject({
        method: "POST",
        url: "/apply/step/1",
        cookies: cookie,
        payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
      });
      const res = await app.inject({
        method: "POST",
        url: "/apply/step/2",
        cookies: cookie,
        payload: { job_title: "Engineer", school: "MIT", resume: "notes.docx" },
      });
      expect(res.body).toContain("only PDF resumes are accepted");
    } finally {
      await app.close();
    }
  });

  it("walks four steps to a review page that only submits on POST", async () => {
    const app = await buildMockAts();
    try {
      const start = await app.inject({ method: "GET", url: "/apply" });
      const cookie = { mock_ats_sid: start.cookies.find((item) => item.name === "mock_ats_sid")?.value ?? "" };
      await app.inject({
        method: "POST",
        url: "/apply/step/1",
        cookies: cookie,
        payload: { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" },
      });
      await app.inject({
        method: "POST",
        url: "/apply/step/2",
        cookies: cookie,
        payload: { job_title: "Engineer", school: "Stanford University", resume: "resume.pdf" },
      });
      await app.inject({
        method: "POST",
        url: "/apply/step/3",
        cookies: cookie,
        payload: { work_authorized: "yes", country: "United States" },
      });
      const review = await app.inject({ method: "GET", url: "/apply/step/4", cookies: cookie });
      expect(review.body).toContain("id=\"submit-application\"");
      expect(review.body).toContain("Submit application");
      expect(review.body).not.toContain(">Continue<");
      const done = await app.inject({ method: "POST", url: "/apply/step/4", cookies: cookie, payload: { submit: "1" } });
      expect(done.statusCode).toBe(302);
      expect(done.headers.location).toBe("/apply/done");
    } finally {
      await app.close();
    }
  });
});
