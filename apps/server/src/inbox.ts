import { randomUUID } from "node:crypto";
import {
  ApplicationStatusSchema,
  applyMailTransition,
  classifyMail,
  extractInterviewAt,
  mailPlainText,
  type MailClassification,
  type MailKind,
  type MailMessage,
} from "@autoapply/core";
import type { SqliteDatabase } from "@autoapply/db";
import { z } from "zod";
import { addContact, addInterview, getApplication, setApplicationStatus } from "./applications.ts";

export type IngestedMail = {
  id: string;
  kind: MailKind | null;
  classifiedBy: "rules" | "model" | "none";
  applicationId: string | null;
  status: string | null;
  verificationCode?: string;
  skippedReason?: string;
};

export type ClassifyMailFn = (message: MailMessage) => Promise<MailKind | null> | MailKind | null;

const AppMatchRow = z.object({
  id: z.string(),
  status: z.string(),
  source_of_status: z.string(),
  title: z.string().nullable(),
  company_name: z.string().nullable(),
  url: z.string().nullable(),
  domains_json: z.string().nullable(),
});

function fromDomain(from: string): string {
  const match = from.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return match?.[1] ?? "";
}

export function matchApplicationId(sqlite: SqliteDatabase, message: MailMessage): string | undefined {
  const hay = `${message.subject} ${mailPlainText(message)} ${message.from}`.toLowerCase();
  const domain = fromDomain(message.from);
  const rows = sqlite
    .prepare(
      `SELECT a.id AS id, a.status AS status, a.source_of_status AS source_of_status,
              j.title AS title, c.name AS company_name, j.url AS url, c.domains_json AS domains_json
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN companies c ON c.id = j.company_id
       ORDER BY a.submitted_at DESC`,
    )
    .all()
    .map((row) => AppMatchRow.parse(row));
  const scored = rows.flatMap((row) => {
    let score = 0;
    if (row.company_name && hay.includes(row.company_name.toLowerCase())) {
      score += 3;
    }
    if (row.title && hay.includes(row.title.toLowerCase())) {
      score += 2;
    }
    let domains: string[] = [];
    if (row.domains_json) {
      try {
        domains = z.array(z.string()).parse(JSON.parse(row.domains_json));
      } catch {
        domains = [];
      }
    }
    if (domain && (domains.some((item) => item.toLowerCase() === domain) || domain.includes((row.company_name ?? "").toLowerCase().replace(/\s+/g, "")))) {
      score += 1;
    }
    return score > 0 ? [{ id: row.id, score }] : [];
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

export async function ingestMailMessage(
  sqlite: SqliteDatabase,
  message: MailMessage,
  classifyAmbiguous?: ClassifyMailFn,
): Promise<IngestedMail> {
  const existing = sqlite.prepare(`SELECT id FROM mail_messages WHERE gmail_id = ?`).get(message.id);
  if (existing) {
    return {
      id: z.object({ id: z.string() }).parse(existing).id,
      kind: null,
      classifiedBy: "none",
      applicationId: null,
      status: null,
      skippedReason: "duplicate",
    };
  }
  let classified: MailClassification = classifyMail(message);
  let classifiedBy: "rules" | "model" | "none" = classified.confidence === "rule" ? "rules" : "none";
  if (!classified.kind && classifyAmbiguous) {
    const kind = await classifyAmbiguous(message);
    if (kind) {
      classified = { kind, confidence: "model" };
      classifiedBy = "model";
    }
  }
  const applicationId = matchApplicationId(sqlite, message) ?? null;
  const mailId = randomUUID();
  const excerpt = mailPlainText(message).slice(0, 500);
  sqlite
    .prepare(
      `INSERT INTO mail_messages (id, gmail_id, kind, subject, from_address, occurred_at, application_id, verification_code, excerpt, classified_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      mailId,
      message.id,
      classified.kind ?? "unclassified",
      message.subject,
      message.from,
      message.occurredAt,
      applicationId,
      classified.verificationCode ?? null,
      excerpt,
      classifiedBy,
      new Date().toISOString(),
    );
  if (classified.verificationCode) {
    sqlite
      .prepare(
        `INSERT INTO verification_codes (id, code, mail_id, from_address, extracted_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), classified.verificationCode, mailId, message.from, new Date().toISOString());
  }
  if (applicationId) {
    sqlite.prepare(`UPDATE applications SET last_mail_at = ? WHERE id = ?`).run(message.occurredAt, applicationId);
  }
  let status: string | null = null;
  let skippedReason: string | undefined;
  if (classified.kind && applicationId) {
    const app = getApplication(sqlite, applicationId);
    if (app) {
      const current = ApplicationStatusSchema.parse(app.status);
      const transition = applyMailTransition({
        current,
        sourceOfStatus: app.sourceOfStatus,
        kind: classified.kind,
      });
      if (!transition.changed) {
        skippedReason = transition.reason;
        status = app.status;
      } else {
        const updated = setApplicationStatus(sqlite, applicationId, transition.next, "mail");
        status = updated?.status ?? transition.next;
      }
      if (classified.kind === "interview_invite") {
        const when = extractInterviewAt(mailPlainText(message));
        if (when) {
          addInterview(sqlite, applicationId, { scheduledAt: when, kind: "onsite", notes: message.subject });
        }
        const name = message.from.replace(/<[^>]+>/, "").replace(/@.*$/, "").trim();
        if (name && !/noreply|no-reply|donotreply/i.test(name)) {
          addContact(sqlite, applicationId, { name, email: message.from, role: "recruiter" });
        }
      }
    }
  }
  return {
    id: mailId,
    kind: classified.kind,
    classifiedBy,
    applicationId,
    status,
    verificationCode: classified.verificationCode,
    skippedReason,
  };
}

export async function ingestMailbox(
  sqlite: SqliteDatabase,
  messages: MailMessage[],
  classifyAmbiguous?: ClassifyMailFn,
): Promise<IngestedMail[]> {
  const out: IngestedMail[] = [];
  for (const message of messages) {
    out.push(await ingestMailMessage(sqlite, message, classifyAmbiguous));
  }
  return out;
}

export function takeUnusedVerificationCode(sqlite: SqliteDatabase): string | null {
  const row = sqlite
    .prepare(`SELECT id, code FROM verification_codes WHERE used_at IS NULL ORDER BY extracted_at DESC LIMIT 1`)
    .get();
  const parsed = z.object({ id: z.string(), code: z.string() }).safeParse(row);
  if (!parsed.success) {
    return null;
  }
  sqlite.prepare(`UPDATE verification_codes SET used_at = ? WHERE id = ?`).run(new Date().toISOString(), parsed.data.id);
  return parsed.data.code;
}
