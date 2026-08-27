import { randomUUID } from "node:crypto";
import {
  ApplicationStatusSchema,
  hostFromUrl,
  isSilentSince,
  type ApplicationStatus,
} from "@autoapply/core";
import { enqueue, type SqliteDatabase } from "@autoapply/db";
import { z } from "zod";

const NoteRow = z.object({
  id: z.string(),
  body: z.string(),
  created_at: z.string(),
});

const ContactRow = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string().nullable(),
  notes: z.string().nullable(),
});

const InterviewRow = z.object({
  id: z.string(),
  scheduled_at: z.string(),
  kind: z.string(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
});

const ApplicationRow = z.object({
  id: z.string(),
  job_id: z.string(),
  run_id: z.string().nullable(),
  submitted_at: z.string().nullable(),
  proof_screenshot: z.string().nullable(),
  status: z.string(),
  status_updated_at: z.string(),
  source_of_status: z.string(),
  resume_document_id: z.string().nullable(),
  follow_up_at: z.string().nullable(),
  last_mail_at: z.string().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  company_name: z.string().nullable(),
  resume_label: z.string().nullable(),
});

export type ApplicationRecord = {
  id: string;
  jobId: string;
  runId: string | null;
  submittedAt: string | null;
  proofScreenshot: string | null;
  status: string;
  statusUpdatedAt: string;
  sourceOfStatus: string;
  resumeDocumentId: string | null;
  resumeVariant: string | null;
  followUpAt: string | null;
  lastMailAt: string | null;
  url: string | null;
  title: string | null;
  companyName: string | null;
  notes: Array<{ id: string; body: string; createdAt: string }>;
  contacts: Array<{ id: string; name: string; email: string | null; role: string | null; notes: string | null }>;
  interviews: Array<{
    id: string;
    scheduledAt: string;
    kind: string;
    location: string | null;
    notes: string | null;
  }>;
};

function defaultResume(sqlite: SqliteDatabase): { id: string; label: string } | undefined {
  const row = sqlite
    .prepare(
      `SELECT id, label FROM documents WHERE kind = 'resume' ORDER BY is_default DESC, label LIMIT 1`,
    )
    .get();
  const parsed = z.object({ id: z.string(), label: z.string() }).safeParse(row);
  return parsed.success ? parsed.data : undefined;
}

function children(sqlite: SqliteDatabase, applicationId: string) {
  const notes = sqlite
    .prepare(`SELECT id, body, created_at FROM notes WHERE application_id = ? ORDER BY created_at`)
    .all(applicationId)
    .map((row) => {
      const parsed = NoteRow.parse(row);
      return { id: parsed.id, body: parsed.body, createdAt: parsed.created_at };
    });
  const contacts = sqlite
    .prepare(`SELECT id, name, email, role, notes FROM contacts WHERE application_id = ? ORDER BY created_at`)
    .all(applicationId)
    .map((row) => {
      const parsed = ContactRow.parse(row);
      return {
        id: parsed.id,
        name: parsed.name,
        email: parsed.email,
        role: parsed.role,
        notes: parsed.notes,
      };
    });
  const interviews = sqlite
    .prepare(`SELECT id, scheduled_at, kind, location, notes FROM interviews WHERE application_id = ? ORDER BY scheduled_at`)
    .all(applicationId)
    .map((row) => {
      const parsed = InterviewRow.parse(row);
      return {
        id: parsed.id,
        scheduledAt: parsed.scheduled_at,
        kind: parsed.kind,
        location: parsed.location,
        notes: parsed.notes,
      };
    });
  return { notes, contacts, interviews };
}

function mapRow(sqlite: SqliteDatabase, row: unknown): ApplicationRecord {
  const parsed = ApplicationRow.parse(row);
  const extra = children(sqlite, parsed.id);
  return {
    id: parsed.id,
    jobId: parsed.job_id,
    runId: parsed.run_id,
    submittedAt: parsed.submitted_at,
    proofScreenshot: parsed.proof_screenshot,
    status: parsed.status,
    statusUpdatedAt: parsed.status_updated_at,
    sourceOfStatus: parsed.source_of_status,
    resumeDocumentId: parsed.resume_document_id,
    resumeVariant: parsed.resume_label,
    followUpAt: parsed.follow_up_at,
    lastMailAt: parsed.last_mail_at,
    url: parsed.url,
    title: parsed.title,
    companyName: parsed.company_name,
    ...extra,
  };
}

const APPLICATION_SELECT = `
  SELECT a.id AS id, a.job_id AS job_id, a.run_id AS run_id, a.submitted_at AS submitted_at,
         a.proof_screenshot AS proof_screenshot, a.status AS status, a.status_updated_at AS status_updated_at,
         a.source_of_status AS source_of_status, a.resume_document_id AS resume_document_id,
         a.follow_up_at AS follow_up_at, a.last_mail_at AS last_mail_at,
         j.url AS url, j.title AS title, c.name AS company_name, d.label AS resume_label
  FROM applications a
  LEFT JOIN jobs j ON j.id = a.job_id
  LEFT JOIN companies c ON c.id = j.company_id
  LEFT JOIN documents d ON d.id = a.resume_document_id
`;

export function recordApplication(
  sqlite: SqliteDatabase,
  input: { jobId: string; runId: string; proofPath: string },
): ApplicationRecord {
  const now = new Date().toISOString();
  const id = randomUUID();
  const resume = defaultResume(sqlite);
  sqlite
    .prepare(
      `INSERT INTO applications (id, job_id, run_id, submitted_at, proof_screenshot, status, status_updated_at, source_of_status, resume_document_id)
       VALUES (?, ?, ?, ?, ?, 'applied', ?, 'submit', ?)`,
    )
    .run(id, input.jobId, input.runId, now, input.proofPath, now, resume?.id ?? null);
  sqlite.prepare(`UPDATE jobs SET status = 'applied' WHERE id = ?`).run(input.jobId);
  sqlite
    .prepare(`INSERT INTO application_events (id, application_id, type, occurred_at, detail_json) VALUES (?, ?, 'submitted', ?, ?)`)
    .run(randomUUID(), id, now, JSON.stringify({ source: "submit" }));
  const created = getApplication(sqlite, id);
  if (!created) {
    throw new Error("application insert failed");
  }
  return created;
}

export function listApplications(sqlite: SqliteDatabase): ApplicationRecord[] {
  return sqlite
    .prepare(`${APPLICATION_SELECT} ORDER BY a.submitted_at DESC`)
    .all()
    .map((row) => mapRow(sqlite, row));
}

export function getApplication(sqlite: SqliteDatabase, id: string): ApplicationRecord | undefined {
  const row = sqlite.prepare(`${APPLICATION_SELECT} WHERE a.id = ?`).get(id);
  if (!row) {
    return undefined;
  }
  return mapRow(sqlite, row);
}

export function setApplicationStatus(
  sqlite: SqliteDatabase,
  id: string,
  status: ApplicationStatus,
  source: "manual" | "mail" | "system",
  now = new Date(),
): ApplicationRecord | undefined {
  const existing = getApplication(sqlite, id);
  if (!existing) {
    return undefined;
  }
  const stamp = now.toISOString();
  sqlite
    .prepare(`UPDATE applications SET status = ?, status_updated_at = ?, source_of_status = ? WHERE id = ?`)
    .run(status, stamp, source, id);
  sqlite
    .prepare(`INSERT INTO application_events (id, application_id, type, occurred_at, detail_json) VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), id, `status:${status}`, stamp, JSON.stringify({ source, from: existing.status }));
  return getApplication(sqlite, id);
}

export function addNote(sqlite: SqliteDatabase, applicationId: string, body: string) {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO notes (id, application_id, body, created_at) VALUES (?, ?, ?, ?)`).run(id, applicationId, body, now);
  return { id, body, createdAt: now };
}

export function addContact(
  sqlite: SqliteDatabase,
  applicationId: string,
  input: { name: string; email?: string; role?: string; notes?: string },
) {
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO contacts (id, application_id, name, email, role, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, applicationId, input.name, input.email ?? null, input.role ?? null, input.notes ?? null, now);
  return { id, ...input };
}

export function addInterview(
  sqlite: SqliteDatabase,
  applicationId: string,
  input: { scheduledAt: string; kind: string; location?: string; notes?: string },
) {
  const id = randomUUID();
  sqlite
    .prepare(
      `INSERT INTO interviews (id, application_id, scheduled_at, kind, location, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, applicationId, input.scheduledAt, input.kind, input.location ?? null, input.notes ?? null);
  return { id, ...input };
}

export function applicationsCsv(sqlite: SqliteDatabase): string {
  const header = [
    "id",
    "title",
    "company",
    "status",
    "sourceOfStatus",
    "submittedAt",
    "resumeVariant",
    "url",
    "proof",
  ];
  const lines = [header.join(",")];
  for (const row of listApplications(sqlite)) {
    const cells = [
      row.id,
      row.title ?? "",
      row.companyName ?? "",
      row.status,
      row.sourceOfStatus,
      row.submittedAt ?? "",
      row.resumeVariant ?? "",
      row.url ?? "",
      row.proofScreenshot ? "yes" : "",
    ].map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell));
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function sweepFollowUps(sqlite: SqliteDatabase, now = new Date()): number {
  let nudged = 0;
  for (const app of listApplications(sqlite)) {
    if (app.status === "rejected" || app.status === "offer" || app.status === "ghosted" || app.status === "interview") {
      continue;
    }
    const last = app.lastMailAt ?? app.statusUpdatedAt ?? app.submittedAt;
    if (!last || !isSilentSince(last, now)) {
      continue;
    }
    if (!app.followUpAt) {
      const stamp = now.toISOString();
      sqlite.prepare(`UPDATE applications SET follow_up_at = ? WHERE id = ?`).run(stamp, app.id);
      sqlite
        .prepare(`INSERT INTO application_events (id, application_id, type, occurred_at, detail_json) VALUES (?, ?, 'nudge', ?, ?)`)
        .run(randomUUID(), app.id, stamp, JSON.stringify({ silentDays: 7 }));
      enqueue(sqlite, "notify", { message: `Follow up: no reply for 7 days (${app.title ?? app.jobId})` });
      nudged += 1;
      continue;
    }
    if (isSilentSince(app.followUpAt, now)) {
      setApplicationStatus(sqlite, app.id, "ghosted", "system", now);
      nudged += 1;
    }
  }
  return nudged;
}

export function countTodaySubmits(sqlite: SqliteDatabase, host: string, now = new Date()): number {
  const start = `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  const rows = sqlite
    .prepare(
      `SELECT j.url AS url FROM applications a
       JOIN jobs j ON j.id = a.job_id
       WHERE a.submitted_at IS NOT NULL AND a.submitted_at >= ?`,
    )
    .all(start);
  return rows.filter((row) => {
    const parsed = z.object({ url: z.string() }).safeParse(row);
    return parsed.success && hostFromUrl(parsed.data.url) === host;
  }).length;
}

export function parseStatus(value: string): ApplicationStatus {
  return ApplicationStatusSchema.parse(value);
}
