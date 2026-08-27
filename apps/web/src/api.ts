import {
  IngestResultSchema,
  JobPublicSchema,
  PROFILE_FIELDS,
  ProfileValuesSchema,
  QuestionCardSchema,
  ResolutionSchema,
  type AnswerScope,
  type JobPublic,
  type ProfileValues,
  type QuestionCard,
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

export { PROFILE_FIELDS };
