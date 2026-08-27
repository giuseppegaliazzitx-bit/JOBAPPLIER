ALTER TABLE applications ADD COLUMN resume_document_id TEXT;
ALTER TABLE applications ADD COLUMN follow_up_at TEXT;
ALTER TABLE applications ADD COLUMN last_mail_at TEXT;

CREATE TABLE IF NOT EXISTS mail_messages (
  id TEXT PRIMARY KEY,
  gmail_id TEXT UNIQUE,
  kind TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_address TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  application_id TEXT REFERENCES applications(id),
  verification_code TEXT,
  excerpt TEXT NOT NULL,
  classified_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  mail_id TEXT REFERENCES mail_messages(id),
  from_address TEXT,
  extracted_at TEXT NOT NULL,
  used_at TEXT
);
