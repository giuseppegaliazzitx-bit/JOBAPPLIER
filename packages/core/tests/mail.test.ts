import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GMAIL_READONLY_SCOPE,
  applyMailTransition,
  classifyMail,
  extractInterviewAt,
  extractVerificationCode,
  gmailAuthUrl,
  isSilentSince,
  type MailKind,
  type MailMessage,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const inboxDir = join(here, "../../../fixtures/inbox");

const Fixture = z.object({
  id: z.string(),
  from: z.string(),
  subject: z.string(),
  text: z.string(),
  occurredAt: z.string(),
  expectedKind: z.string(),
});

function loadInbox(): Array<z.infer<typeof Fixture>> {
  return readdirSync(inboxDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => Fixture.parse(JSON.parse(readFileSync(join(inboxDir, name), "utf8"))));
}

describe("inbox classification", () => {
  it("classifies one seeded message of each type by rules", () => {
    const fixtures = loadInbox();
    const kinds = fixtures.map((item) => item.expectedKind).sort();
    expect(kinds).toEqual(
      [
        "application_confirmation",
        "interview_invite",
        "offer",
        "rejection",
        "screening_request",
        "verification_code",
        "viewed_notification",
      ].sort(),
    );
    for (const fixture of fixtures) {
      const message: MailMessage = {
        id: fixture.id,
        from: fixture.from,
        subject: fixture.subject,
        text: fixture.text,
        occurredAt: fixture.occurredAt,
      };
      const result = classifyMail(message);
      expect(result.kind, fixture.id).toBe(fixture.expectedKind);
      expect(result.confidence).toBe("rule");
    }
  });

  it("extracts a Workday-style verification code", () => {
    expect(extractVerificationCode("Your verification code is 482193. It expires in 10 minutes.")).toBe(
      "482193",
    );
  });

  it("extracts an interview timestamp", () => {
    expect(extractInterviewAt("Your interview is scheduled for 2026-09-15 14:00 UTC.")).toBe(
      "2026-09-15T14:00:00.000Z",
    );
  });
});

describe("status pipeline", () => {
  it("advances viewed from applied and never lets rejection overwrite a manual status", () => {
    expect(
      applyMailTransition({ current: "applied", sourceOfStatus: "submit", kind: "viewed_notification" }),
    ).toEqual({ next: "viewed", changed: true, reason: "mail" });
    const locked = applyMailTransition({
      current: "interview",
      sourceOfStatus: "manual",
      kind: "rejection",
    });
    expect(locked.changed).toBe(false);
    expect(locked.next).toBe("interview");
    expect(locked.reason).toBe("manual_override");
    expect(
      applyMailTransition({ current: "viewed", sourceOfStatus: "mail", kind: "rejection" }).next,
    ).toBe("rejected");
  });

  it("does not downgrade interview to viewed", () => {
    expect(
      applyMailTransition({ current: "interview", sourceOfStatus: "mail", kind: "viewed_notification" }),
    ).toEqual({ next: "interview", changed: false, reason: "no_downgrade" });
  });
});

describe("gmail oauth", () => {
  it("requests read-only Gmail scope", () => {
    const url = gmailAuthUrl({
      clientId: "client",
      redirectUri: "http://127.0.0.1:8787/api/gmail/callback",
      state: "abc",
    });
    expect(url).toContain("gmail.readonly");
    expect(url).toContain(encodeURIComponent(GMAIL_READONLY_SCOPE));
    expect(url).not.toMatch(/gmail\.modify|gmail\.compose|gmail\.send/);
  });
});

describe("follow-up silence", () => {
  it("flags seven days without a status change", () => {
    const now = new Date("2026-08-27T00:00:00.000Z");
    expect(isSilentSince("2026-08-19T00:00:00.000Z", now)).toBe(true);
    expect(isSilentSince("2026-08-26T00:00:00.000Z", now)).toBe(false);
  });
});

describe("mail kinds", () => {
  it("keeps verification codes off the status pipeline", () => {
    const result = applyMailTransition({
      current: "applied",
      sourceOfStatus: "submit",
      kind: "verification_code" as MailKind,
    });
    expect(result.changed).toBe(false);
    expect(result.next).toBe("applied");
  });
});
