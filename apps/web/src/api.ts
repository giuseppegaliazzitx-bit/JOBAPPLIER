import {
  IngestResultSchema,
  JobPublicSchema,
  PROFILE_FIELDS,
  PreflightSchema,
  ProfileValuesSchema,
  QuestionCardSchema,
  ResolutionSchema,
  RunEventSchema,
  type AnswerScope,
  type JobPublic,
  type Preflight,
  type ProfileValues,
  type QuestionCard,
  type RunEvent,
} from "@autoapply/core";
import { z as zod } from "zod";

const ProfileResponse = zod.object({
  values: ProfileValuesSchema,
  fields: zod.array(zod.unknown()),
});

const JobsResponse = zod.object({
  jobs: zod.array(JobPublicSchema),
});

const IngestResponse = zod.object({
  results: zod.array(IngestResultSchema),
  jobs: zod.array(JobPublicSchema),
});

const DocumentPublic = zod.object({
  id: zod.string(),
  kind: zod.string(),
  label: zod.string(),
  keywords: zod.array(zod.string()),
  isDefault: zod.boolean(),
});

const DocumentsResponse = zod.object({
  documents: zod.array(DocumentPublic),
});

async function parseJson<T>(response: Response, schema: zod.ZodType<T>): Promise<T> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`);
  }
  return schema.parse(body);
}

const DashboardResponse = zod.object({
  blockedRuns: zod.number(),
  unansweredQuestions: zod.number(),
  todaySpend: zod.number(),
  degradedRecipes: zod.number(),
  blocked: zod.array(
    zod.object({
      id: zod.string(),
      createdAt: zod.string(),
      reason: zod.string().optional(),
      runId: zod.string().optional(),
    }),
  ),
  notifications: zod.array(
    zod.object({
      id: zod.string(),
      createdAt: zod.string(),
      message: zod.string(),
    }),
  ),
});

export async function fetchDashboard() {
  const response = await fetch("/api/dashboard");
  return parseJson(response, DashboardResponse);
}

export async function fetchProfile(): Promise<ProfileValues> {
  const response = await fetch("/api/profile");
  const body = await parseJson(response, ProfileResponse);
  return body.values;
}

export async function saveProfile(values: ProfileValues): Promise<ProfileValues> {
  const response = await fetch("/api/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const body = await parseJson(response, ProfileResponse);
  return body.values;
}

export async function fetchJobs(filters: {
  platform?: string;
  status?: string;
  applyKind?: string;
}): Promise<JobPublic[]> {
  const params = new URLSearchParams();
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.status) params.set("status", filters.status);
  if (filters.applyKind) params.set("applyKind", filters.applyKind);
  const qs = params.toString();
  const response = await fetch(qs.length > 0 ? `/api/jobs?${qs}` : "/api/jobs");
  const body = await parseJson(response, JobsResponse);
  return body.jobs;
}

export async function pasteJobs(text: string) {
  const response = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return parseJson(response, IngestResponse);
}

export async function fetchDocuments() {
  const response = await fetch("/api/documents");
  const body = await parseJson(response, DocumentsResponse);
  return body.documents;
}

export async function uploadDocument(form: FormData) {
  const response = await fetch("/api/documents", { method: "POST", body: form });
  return parseJson(response, DocumentsResponse);
}

export async function patchDocument(
  id: string,
  body: { label?: string; keywords?: string[]; isDefault?: boolean },
) {
  const response = await fetch(`/api/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, DocumentsResponse);
}

const QuestionsResponse = zod.object({
  questions: zod.array(QuestionCardSchema),
});

const CompletenessResponse = zod.object({
  gaps: zod.array(
    zod.object({
      labelRaw: zod.string(),
      type: zod.string(),
      occurrences: zod.number(),
    }),
  ),
  totalQuestions: zod.number(),
});

const ResolveResponse = zod.object({
  resolutions: zod.array(ResolutionSchema),
});

export async function fetchQuestions(): Promise<QuestionCard[]> {
  const response = await fetch("/api/questions");
  const body = await parseJson(response, QuestionsResponse);
  return body.questions;
}

export async function answerQuestion(
  id: string,
  body: { canonicalValue: string; scope: AnswerScope; chosenOption?: string },
) {
  const response = await fetch(`/api/questions/${id}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, QuestionsResponse);
}

export async function fetchCompleteness() {
  const response = await fetch("/api/profile/completeness");
  return parseJson(response, CompletenessResponse);
}

export async function resolveInventory(payload: unknown) {
  const response = await fetch("/api/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson(response, ResolveResponse);
}

const StartRunResponse = zod.object({ id: zod.string(), jobId: zod.string() });

const RunListRow = zod.object({
  id: zod.string(),
  job_id: zod.string(),
  status: zod.string(),
  started_at: zod.string(),
}).passthrough();

export async function startRun(url: string) {
  const response = await fetch("/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return parseJson(response, StartRunResponse);
}

export async function fetchRuns() {
  const response = await fetch("/api/runs");
  return parseJson(response, zod.object({ runs: zod.array(RunListRow) }));
}

export async function fetchRun(id: string) {
  const response = await fetch(`/api/runs/${id}`);
  return parseJson(
    response,
    zod.object({
      run: zod.object({
        id: zod.string(),
        status: zod.string(),
      }).passthrough(),
      events: zod.array(RunEventSchema),
      preflight: PreflightSchema.optional(),
    }),
  );
}

export async function postRunAction(id: string, action: "approve" | "abort" | "pause" | "resume" | "step") {
  const response = await fetch(`/api/runs/${id}/${action}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`run ${action} failed`);
  }
}

const RecipeListResponse = zod.object({
  recipes: zod.array(
    zod.object({
      id: zod.string(),
      scope: zod.string(),
      platform: zod.string(),
      health: zod.object({
        status: zod.string(),
        successRate: zod.number(),
        lastSuccessAt: zod.string().optional(),
      }),
      versions: zod.array(
        zod.object({
          id: zod.string(),
          version: zod.number(),
          status: zod.string(),
          createdBy: zod.string(),
          stats: zod.object({
            runs: zod.number(),
            successes: zod.number(),
            failures: zod.number(),
            lastSuccessAt: zod.string().optional(),
          }),
          autopilot: zod.boolean().optional(),
          steps: zod.array(zod.unknown()),
          stepFailureRates: zod
            .array(
              zod.object({
                stepId: zod.string(),
                name: zod.string(),
                runs: zod.number(),
                failures: zod.number(),
              }),
            )
            .optional(),
        }).passthrough(),
      ),
    }).passthrough(),
  ),
});

export async function fetchRecipes() {
  const response = await fetch("/api/recipes");
  return parseJson(response, RecipeListResponse);
}

export async function postRecipeAction(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = json && typeof json === "object" && "error" in json ? String(json.error) : `request failed ${response.status}`;
    throw new Error(err);
  }
  return json;
}

export async function patchRecipeSteps(recipeId: string, versionId: string, steps: unknown) {
  const response = await fetch(`/api/recipes/${recipeId}/versions/${versionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ steps }),
  });
  if (!response.ok) {
    throw new Error("save failed");
  }
}

export async function patchRecipeAutopilot(recipeId: string, versionId: string, autopilot: boolean) {
  const response = await fetch(`/api/recipes/${recipeId}/versions/${versionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ autopilot }),
  });
  if (!response.ok) {
    throw new Error("save failed");
  }
}

const SettingsResponse = zod.object({
  sites: zod.record(zod.string(), zod.boolean()),
  dailyCap: zod.number(),
  captchaPolicy: zod.string(),
  twoFaPolicy: zod.string(),
  gmailConnected: zod.boolean().optional(),
  gmailScope: zod.string().optional(),
  tos: zod.string(),
});

export async function fetchSettings() {
  const response = await fetch("/api/settings");
  return parseJson(response, SettingsResponse);
}

export async function saveSettings(body: { sites?: Record<string, boolean>; dailyCap?: number }) {
  const response = await fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson(response, SettingsResponse);
}

export async function postBatch(jobIds: string[]) {
  const response = await fetch("/api/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
  return parseJson(response, zod.object({ queued: zod.number(), jobIds: zod.array(zod.string()) }));
}

const NotePublic = zod.object({
  id: zod.string(),
  body: zod.string(),
  createdAt: zod.string(),
});

const ContactPublic = zod.object({
  id: zod.string(),
  name: zod.string(),
  email: zod.string().nullable().optional(),
  role: zod.string().nullable().optional(),
  notes: zod.string().nullable().optional(),
});

const InterviewPublic = zod.object({
  id: zod.string(),
  scheduledAt: zod.string(),
  kind: zod.string(),
  location: zod.string().nullable().optional(),
  notes: zod.string().nullable().optional(),
});

const ApplicationPublic = zod.object({
  id: zod.string(),
  jobId: zod.string(),
  runId: zod.string().nullable(),
  submittedAt: zod.string().nullable(),
  proofScreenshot: zod.string().nullable(),
  status: zod.string(),
  statusUpdatedAt: zod.string().optional(),
  sourceOfStatus: zod.string().optional(),
  resumeVariant: zod.string().nullable().optional(),
  followUpAt: zod.string().nullable().optional(),
  url: zod.string().nullable(),
  title: zod.string().nullable(),
  companyName: zod.string().nullable().optional(),
  notes: zod.array(NotePublic).optional(),
  contacts: zod.array(ContactPublic).optional(),
  interviews: zod.array(InterviewPublic).optional(),
});

const ApplicationsResponse = zod.object({
  applications: zod.array(ApplicationPublic),
});

export async function fetchApplications() {
  const response = await fetch("/api/applications");
  return parseJson(response, ApplicationsResponse);
}

export async function patchApplicationStatus(id: string, status: string) {
  const response = await fetch(`/api/applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  return parseJson(response, zod.object({ application: ApplicationPublic }));
}

export async function addApplicationNote(id: string, body: string) {
  const response = await fetch(`/api/applications/${id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) {
    throw new Error("note failed");
  }
}

export async function addApplicationContact(id: string, body: { name: string; email?: string; role?: string }) {
  const response = await fetch(`/api/applications/${id}/contacts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("contact failed");
  }
}

export async function addApplicationInterview(id: string, body: { scheduledAt: string; kind: string }) {
  const response = await fetch(`/api/applications/${id}/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("interview failed");
  }
}

export async function connectGmail() {
  const response = await fetch("/api/gmail/connect");
  return parseJson(response, zod.object({ url: zod.string() }));
}

export async function syncGmail() {
  const response = await fetch("/api/gmail/sync", { method: "POST" });
  return parseJson(response, zod.object({ ingested: zod.number() }).passthrough());
}

export async function sweepFollowUps() {
  const response = await fetch("/api/applications/sweep", { method: "POST" });
  return parseJson(response, zod.object({ nudged: zod.number() }));
}

export type { Preflight, RunEvent };

export { PROFILE_FIELDS };
