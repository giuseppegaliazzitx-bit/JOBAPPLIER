CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  path TEXT NOT NULL,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domains_json TEXT NOT NULL DEFAULT '[]',
  blacklisted INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  source TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id),
  title TEXT,
  location TEXT,
  platform TEXT NOT NULL,
  salary_min INTEGER,
  salary_max INTEGER,
  posted_at TEXT,
  fit_score REAL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_dedup_key_idx ON jobs(dedup_key);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  platform TEXT NOT NULL,
  match_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_versions (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES recipes(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  hints_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  last_success_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS recipe_versions_recipe_id_version_idx
  ON recipe_versions(recipe_id, version);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  recipe_version_id TEXT REFERENCES recipe_versions(id),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  token_cost_usd REAL NOT NULL DEFAULT 0,
  wall_ms INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  step_id TEXT,
  selector TEXT,
  status TEXT NOT NULL,
  screenshot_path TEXT,
  duration_ms INTEGER,
  detail_json TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS run_events_run_id_seq_idx ON run_events(run_id, seq);

CREATE TABLE IF NOT EXISTS fields_seen (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  fingerprint TEXT NOT NULL,
  label_raw TEXT NOT NULL,
  label_norm TEXT NOT NULL,
  type TEXT NOT NULL,
  options_json TEXT,
  required INTEGER NOT NULL,
  section_heading TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  label_norm TEXT NOT NULL,
  label_raw_examples_json TEXT NOT NULL DEFAULT '[]',
  type TEXT NOT NULL,
  options_hash TEXT,
  occurrences INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_aliases (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  alias_norm TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_embeddings (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(id),
  embedding BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  scope TEXT NOT NULL,
  company_id TEXT REFERENCES companies(id),
  job_id TEXT REFERENCES jobs(id),
  canonical_value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS option_mappings (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  options_hash TEXT NOT NULL,
  canonical_value TEXT NOT NULL,
  chosen_option TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES runs(id),
  purpose TEXT NOT NULL,
  model TEXT NOT NULL,
  in_tokens INTEGER NOT NULL,
  out_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL UNIQUE,
  encrypted_blob BLOB NOT NULL,
  iv BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS browser_sessions (
  id TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  storage_state_encrypted BLOB NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  run_id TEXT REFERENCES runs(id),
  submitted_at TEXT,
  proof_screenshot TEXT,
  status TEXT NOT NULL,
  status_updated_at TEXT NOT NULL,
  source_of_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail_json TEXT
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  scheduled_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  location TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
