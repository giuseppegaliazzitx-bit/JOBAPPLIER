import { blob, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profile = sqliteTable("profile", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  path: text("path").notNull(),
  keywordsJson: text("keywords_json").notNull().default("[]"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
});

export const companies = sqliteTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  domainsJson: text("domains_json").notNull().default("[]"),
  blacklisted: integer("blacklisted", { mode: "boolean" }).notNull().default(false),
  reason: text("reason"),
  notes: text("notes"),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    dedupKey: text("dedup_key").notNull(),
    source: text("source").notNull(),
    companyId: text("company_id").references(() => companies.id),
    title: text("title"),
    location: text("location"),
    platform: text("platform").notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    postedAt: text("posted_at"),
    fitScore: real("fit_score"),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    description: text("description"),
    applyKind: text("apply_kind").notNull().default("unknown"),
  },
  (table) => [uniqueIndex("jobs_dedup_key_idx").on(table.dedupKey)],
);

export const queue = sqliteTable("queue", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull(),
  availableAt: text("available_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  createdAt: text("created_at").notNull(),
});

export const recipes = sqliteTable("recipes", {
  id: text("id").primaryKey(),
  scope: text("scope").notNull(),
  platform: text("platform").notNull(),
  matchJson: text("match_json").notNull(),
});

export const recipeVersions = sqliteTable(
  "recipe_versions",
  {
    id: text("id").primaryKey(),
    recipeId: text("recipe_id")
      .notNull()
      .references(() => recipes.id),
    version: integer("version").notNull(),
    status: text("status").notNull(),
    stepsJson: text("steps_json").notNull(),
    hintsJson: text("hints_json").notNull(),
    createdBy: text("created_by").notNull(),
    runs: integer("runs").notNull().default(0),
    successes: integer("successes").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    lastSuccessAt: text("last_success_at"),
  },
  (table) => [uniqueIndex("recipe_versions_recipe_id_version_idx").on(table.recipeId, table.version)],
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  mode: text("mode").notNull(),
  status: text("status").notNull(),
  recipeVersionId: text("recipe_version_id").references(() => recipeVersions.id),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  tokenCostUsd: real("token_cost_usd").notNull().default(0),
  wallMs: integer("wall_ms"),
  error: text("error"),
  checkpointJson: text("checkpoint_json"),
});

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    stepId: text("step_id"),
    selector: text("selector"),
    status: text("status").notNull(),
    screenshotPath: text("screenshot_path"),
    durationMs: integer("duration_ms"),
    detailJson: text("detail_json"),
  },
  (table) => [uniqueIndex("run_events_run_id_seq_idx").on(table.runId, table.seq)],
);

export const fieldsSeen = sqliteTable("fields_seen", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  fingerprint: text("fingerprint").notNull(),
  labelRaw: text("label_raw").notNull(),
  labelNorm: text("label_norm").notNull(),
  type: text("type").notNull(),
  optionsJson: text("options_json"),
  required: integer("required", { mode: "boolean" }).notNull(),
  sectionHeading: text("section_heading"),
});

export const questions = sqliteTable("questions", {
  id: text("id").primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  labelNorm: text("label_norm").notNull(),
  labelRawExamplesJson: text("label_raw_examples_json").notNull().default("[]"),
  type: text("type").notNull(),
  optionsHash: text("options_hash"),
  occurrences: integer("occurrences").notNull().default(0),
  firstSeen: text("first_seen").notNull(),
  lastSeen: text("last_seen").notNull(),
  widget: text("widget").notNull().default("native"),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  optionsJson: text("options_json"),
  sectionHeading: text("section_heading"),
  labelRaw: text("label_raw").notNull().default(""),
  blockedJson: text("blocked_json").notNull().default("[]"),
});

export const questionAliases = sqliteTable("question_aliases", {
  id: text("id").primaryKey(),
  questionId: text("question_id")
    .notNull()
    .references(() => questions.id),
  aliasNorm: text("alias_norm").notNull(),
  source: text("source").notNull(),
});

export const questionEmbeddings = sqliteTable("question_embeddings", {
  id: text("id").primaryKey(),
  questionId: text("question_id")
    .notNull()
    .unique()
    .references(() => questions.id),
  embedding: blob("embedding").notNull(),
});

export const answers = sqliteTable("answers", {
  id: text("id").primaryKey(),
  questionId: text("question_id")
    .notNull()
    .references(() => questions.id),
  scope: text("scope").notNull(),
  companyId: text("company_id").references(() => companies.id),
  jobId: text("job_id").references(() => jobs.id),
  canonicalValue: text("canonical_value").notNull(),
  source: text("source").notNull(),
  confidence: real("confidence").notNull(),
  verifiedAt: text("verified_at"),
});

export const optionMappings = sqliteTable("option_mappings", {
  id: text("id").primaryKey(),
  questionId: text("question_id")
    .notNull()
    .references(() => questions.id),
  optionsHash: text("options_hash").notNull(),
  canonicalValue: text("canonical_value").notNull(),
  chosenOption: text("chosen_option").notNull(),
});

export const aiCalls = sqliteTable("ai_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id").references(() => runs.id),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  inTokens: integer("in_tokens").notNull(),
  outTokens: integer("out_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  cacheHit: integer("cache_hit", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  site: text("site").notNull().unique(),
  encryptedBlob: blob("encrypted_blob").notNull(),
  iv: blob("iv").notNull(),
});

export const browserSessions = sqliteTable("browser_sessions", {
  id: text("id").primaryKey(),
  site: text("site").notNull(),
  storageStateEncrypted: blob("storage_state_encrypted").notNull(),
  expiresAt: text("expires_at"),
});

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id),
  runId: text("run_id").references(() => runs.id),
  submittedAt: text("submitted_at"),
  proofScreenshot: text("proof_screenshot"),
  status: text("status").notNull(),
  statusUpdatedAt: text("status_updated_at").notNull(),
  sourceOfStatus: text("source_of_status").notNull(),
  resumeDocumentId: text("resume_document_id").references(() => documents.id),
  followUpAt: text("follow_up_at"),
  lastMailAt: text("last_mail_at"),
});

export const applicationEvents = sqliteTable("application_events", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id),
  type: text("type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  detailJson: text("detail_json"),
});

export const contacts = sqliteTable("contacts", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id),
  scheduledAt: text("scheduled_at").notNull(),
  kind: text("kind").notNull(),
  location: text("location"),
  notes: text("notes"),
});

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  applicationId: text("application_id")
    .notNull()
    .references(() => applications.id),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const mailMessages = sqliteTable("mail_messages", {
  id: text("id").primaryKey(),
  gmailId: text("gmail_id").unique(),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  fromAddress: text("from_address").notNull(),
  occurredAt: text("occurred_at").notNull(),
  applicationId: text("application_id").references(() => applications.id),
  verificationCode: text("verification_code"),
  excerpt: text("excerpt").notNull(),
  classifiedBy: text("classified_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const verificationCodes = sqliteTable("verification_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  mailId: text("mail_id").references(() => mailMessages.id),
  fromAddress: text("from_address"),
  extractedAt: text("extracted_at").notNull(),
  usedAt: text("used_at"),
});

export const schemaMigrations = sqliteTable("schema_migrations", {
  id: text("id").primaryKey(),
  appliedAt: text("applied_at").notNull(),
});
