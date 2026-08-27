ALTER TABLE jobs ADD COLUMN staffing_agency INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  query_json TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 1440,
  last_run_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cover_letters (
  id TEXT PRIMARY KEY,
  job_family TEXT NOT NULL UNIQUE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outbound_notifications (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  last_error TEXT
);
