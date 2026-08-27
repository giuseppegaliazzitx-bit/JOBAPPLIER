ALTER TABLE jobs ADD COLUMN description TEXT;
ALTER TABLE jobs ADD COLUMN apply_kind TEXT NOT NULL DEFAULT 'unknown';

CREATE TABLE IF NOT EXISTS queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  available_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS queue_status_available_idx ON queue(status, available_at);
