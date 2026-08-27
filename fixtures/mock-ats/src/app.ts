import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { z } from "zod";
import { COUNTRIES, SCHOOLS, errorSpan, escapeHtml, layout } from "./html.ts";

export type SessionData = {
  id: string;
  step: number;
  expired: boolean;
  fields: Record<string, string>;
};

const sessions = new Map<string, SessionData>();
const COOKIE = "mock_ats_sid";

function sessionOf(id: string | undefined): SessionData | undefined {
  if (!id) {
    return undefined;
  }
  return sessions.get(id);
}

function createSession(): SessionData {
  const session: SessionData = { id: randomUUID(), step: 1, expired: false, fields: {} };
  sessions.set(session.id, session);
  return session;
}

export async function buildMockAts() {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  await app.register(formbody);
  await app.register(multipart, { attachFieldsToBody: true });

  app.get("/health", async () => ({ ok: true as const, name: "mock-ats" as const }));

  app.get("/apply", async (request, reply) => {
    const existing = sessionOf(request.cookies[COOKIE]);
    const session = existing && !existing.expired ? existing : createSession();
    return reply
      .setCookie(COOKIE, session.id, { path: "/", httpOnly: false })
      .redirect(`/apply/step/${session.step}`);
  });

  app.get("/apply/timeout", async (_request, reply) => {
    const session = createSession();
    session.expired = true;
    return reply
      .setCookie(COOKIE, session.id, { path: "/" })
      .type("text/html")
      .send(timeoutPage());
  });

  app.get("/apply/step/:n", async (request, reply) => {
    const session = sessionOf(request.cookies[COOKIE]);
    if (!session || session.expired) {
      return reply.type("text/html").send(timeoutPage());
    }
    const n = Number(z.object({ n: z.string() }).parse(request.params).n);
    if (n !== session.step) {
      return reply.redirect(`/apply/step/${session.step}`);
    }
    return reply.type("text/html").send(stepPage(session, {}));
  });

  app.post("/apply/step/:n", async (request, reply) => {
    const session = sessionOf(request.cookies[COOKIE]);
    if (!session || session.expired) {
      return reply.type("text/html").send(timeoutPage());
    }
    const n = Number(z.object({ n: z.string() }).parse(request.params).n);
    const body = asFields(request.body);
    const errors = validate(n, body, request.headers["content-type"] ?? "");
    Object.assign(session.fields, body);
    if (Object.keys(errors).length > 0) {
      return reply.type("text/html").send(stepPage(session, errors));
    }
    if (n === 4) {
      session.step = 5;
      return reply.redirect("/apply/done");
    }
    session.step = n + 1;
    return reply.redirect(`/apply/step/${session.step}`);
  });

  app.post("/apply/step/2/upload", async (request, reply) => {
    const session = sessionOf(request.cookies[COOKIE]);
    if (!session || session.expired) {
      return reply.code(403).send({ error: "expired" });
    }
    const file = await request.file();
    if (!file) {
      return reply.code(400).send({ error: "file required" });
    }
    const name = file.filename.toLowerCase();
    if (!name.endsWith(".pdf")) {
      return reply.code(400).send({ error: "only PDF resumes are accepted" });
    }
    session.fields.resume = file.filename;
    return { ok: true, filename: file.filename };
  });

  app.get("/apply/done", async (request, reply) => {
    const session = sessionOf(request.cookies[COOKIE]);
    if (!session || session.step !== 5) {
      return reply.redirect("/apply");
    }
    return reply.type("text/html").send(
      layout(
        "Application received",
        `<h1>Application received</h1><p>Thank you, ${escapeHtml(session.fields.first_name ?? "")}.</p>`,
      ),
    );
  });

  return app;
}

function asFields(body: unknown): Record<string, string> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(body);
  if (!parsed.success) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    const part = z.object({ value: z.string().optional(), filename: z.string().optional() }).safeParse(value);
    if (part.success && part.data.value) {
      out[key] = part.data.value;
    } else if (part.success && part.data.filename) {
      out[key] = part.data.filename;
    }
  }
  return out;
}

function validate(step: number, body: Record<string, string>, contentType: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 1) {
    if (!body.first_name) errors.first_name = "This field is required";
    if (!body.last_name) errors.last_name = "This field is required";
    if (!body.email) errors.email = "This field is required";
    else if (!body.email.includes("@")) errors.email = "Enter a valid email";
  }
  if (step === 2) {
    if (!body.job_title) errors.job_title = "This field is required";
    if (!body.school) errors.school = "Pick a school from the list";
    if (body.resume && !body.resume.toLowerCase().endsWith(".pdf")) {
      errors.resume = "only PDF resumes are accepted";
    }
    void contentType;
  }
  if (step === 3) {
    if (!body.work_authorized) errors.work_authorized = "This field is required";
    if (!body.country) errors.country = "This field is required";
    if (body.work_authorized === "no" && !body.visa_type) {
      errors.visa_type = "This field is required";
    }
  }
  return errors;
}

function timeoutPage(): string {
  return layout(
    "Session expired",
    `<h1>Your session has expired</h1><p>Please start the application again.</p><p data-page="timeout"></p>`,
  );
}

function stepPage(session: SessionData, errors: Record<string, string>): string {
  const f = session.fields;
  if (session.step === 1) {
    return layout(
      "Application — Step 1 of 4",
      `<p>Step 1 of 4</p>
      <h1>Identity</h1>
      <form method="post" action="/apply/step/1">
        <label for="first_name">First Name *<input name="first_name" id="first_name" required data-validate value="${escapeHtml(f.first_name ?? "")}" />${errorSpan("first_name", errors)}</label>
        <label for="last_name">Last Name *<input name="last_name" id="last_name" required data-validate value="${escapeHtml(f.last_name ?? "")}" />${errorSpan("last_name", errors)}</label>
        <label for="email">Email *<input type="email" name="email" id="email" required data-validate value="${escapeHtml(f.email ?? "")}" />${errorSpan("email", errors)}</label>
        <label for="phone">Phone<input type="tel" name="phone" id="phone" value="${escapeHtml(f.phone ?? "")}" /></label>
        <button type="submit" name="continue" value="1">Continue</button>
      </form>`,
    );
  }
  if (session.step === 2) {
    return layout(
      "Application — Step 2 of 4",
      `<p>Step 2 of 4</p>
      <h1>Experience</h1>
      <form method="post" action="/apply/step/2" enctype="multipart/form-data">
        <label for="resume">Resume<input type="file" name="resume" id="resume" accept=".pdf,application/pdf" /></label>
        ${errorSpan("resume", errors)}
        <label for="job_title">Job Title *<input name="job_title" id="job_title" required data-validate value="${escapeHtml(f.job_title ?? "")}" />${errorSpan("job_title", errors)}</label>
        <div data-widget="typeahead">
          <label for="school-input">School</label>
          <input id="school-input" role="combobox" aria-label="School" aria-autocomplete="list" aria-required="true" data-validate />
          <div data-chip-list>${f.school ? `<span data-chip class="chip">${escapeHtml(f.school)}</span>` : ""}</div>
          <ul role="listbox" hidden></ul>
          <input type="hidden" name="school" id="school" value="${escapeHtml(f.school ?? "")}" />
          ${errorSpan("school", errors)}
        </div>
        <button type="submit" name="continue" value="1">Continue</button>
      </form>`,
    );
  }
  if (session.step === 3) {
    const visaHidden = f.work_authorized === "no" ? "" : "hidden";
    return layout(
      "Application — Step 3 of 4",
      `<p>Step 3 of 4</p>
      <h1>Work authorization</h1>
      <form method="post" action="/apply/step/3">
        <fieldset>
          <legend>Are you authorized to work in the US?</legend>
          <label><input type="radio" name="work_authorized" value="yes" required ${f.work_authorized === "yes" ? "checked" : ""} /> Yes</label>
          <label><input type="radio" name="work_authorized" value="no" ${f.work_authorized === "no" ? "checked" : ""} /> No</label>
          ${errorSpan("work_authorized", errors)}
        </fieldset>
        <div data-widget="combobox">
          <p>Country</p>
          <button type="button" role="combobox" aria-label="Country" aria-required="true" aria-expanded="false">${escapeHtml(f.country ?? "Select country")}</button>
          <ul role="listbox" hidden>
            ${COUNTRIES.map((c) => `<li role="option" data-value="${escapeHtml(c)}">${escapeHtml(c)}</li>`).join("")}
          </ul>
          <input type="hidden" name="country" value="${escapeHtml(f.country ?? "")}" />
          ${errorSpan("country", errors)}
        </div>
        <div id="visa-wrap" class="${visaHidden}">
          <label>Visa type
            <select name="visa_type" id="visa_type">
              <option value="">Select</option>
              <option value="H-1B">H-1B</option>
              <option value="OPT">OPT</option>
            </select>
          </label>
          ${errorSpan("visa_type", errors)}
        </div>
        <button type="submit" name="continue" value="1">Continue</button>
      </form>`,
    );
  }
  return layout(
    "Application — Step 4 of 4",
    `<p>Step 4 of 4</p>
    <h1>Review</h1>
    <dl>
      <dt>Name</dt><dd>${escapeHtml(`${f.first_name ?? ""} ${f.last_name ?? ""}`)}</dd>
      <dt>Email</dt><dd>${escapeHtml(f.email ?? "")}</dd>
      <dt>School</dt><dd>${escapeHtml(f.school ?? "")}</dd>
      <dt>Country</dt><dd>${escapeHtml(f.country ?? "")}</dd>
    </dl>
    <form method="post" action="/apply/step/4">
      <button type="submit" id="submit-application" name="submit" value="1">Submit application</button>
    </form>`,
  );
}

export { sessions, SCHOOLS };
