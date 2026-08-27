import { PROFILE_FIELDS, type ProfileValues } from "./profile.ts";
import { canonicalizeValueSource } from "./recipe.ts";

export type ProfileLiteral = { key: string; value: string };

export function profileLiterals(profile: ProfileValues): ProfileLiteral[] {
  const out: ProfileLiteral[] = [];
  for (const field of PROFILE_FIELDS) {
    if (field.input === "json") {
      continue;
    }
    const raw = profile[field.key];
    if (typeof raw === "string" && raw.trim().length > 0) {
      out.push({ key: field.key, value: raw.trim() });
    }
  }
  for (const job of profile.workHistory ?? []) {
    if (job.company) out.push({ key: "workHistory.company", value: job.company });
    if (job.title) out.push({ key: "workHistory.title", value: job.title });
  }
  for (const edu of profile.education ?? []) {
    if (edu.school) out.push({ key: "education.school", value: edu.school });
    if (edu.degree) out.push({ key: "education.degree", value: edu.degree });
  }
  return out;
}

export type DocumentLiteral = { kind: string; fileName: string };

export type ParameterizeHit =
  | { kind: "profile"; valueSource: `profile.${string}` }
  | { kind: "document"; valueSource: `document.${string}` }
  | { kind: "unmatched"; value: string };

export function parameterizeValue(
  raw: string,
  profile: ProfileValues,
  documents: DocumentLiteral[] = [],
): ParameterizeHit {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { kind: "unmatched", value: trimmed };
  }
  const fileName = trimmed.replace(/^.*[\\/]/, "");
  for (const doc of documents) {
    if (fileName.toLowerCase() === doc.fileName.toLowerCase() || trimmed.toLowerCase() === doc.fileName.toLowerCase()) {
      return { kind: "document", valueSource: `document.${doc.kind}` };
    }
  }
  for (const item of profileLiterals(profile)) {
    if (item.value.toLowerCase() === trimmed.toLowerCase()) {
      return { kind: "profile", valueSource: `profile.${item.key}` };
    }
  }
  return { kind: "unmatched", value: trimmed };
}

export function profileValuesInText(text: string, profile: ProfileValues): string[] {
  const hits: string[] = [];
  for (const item of profileLiterals(profile)) {
    if (item.value.length < 3) {
      continue;
    }
    if (text.includes(item.value)) {
      hits.push(item.value);
    }
  }
  return hits;
}

export function resolveValueSource(
  source: string,
  profile: ProfileValues,
  documents: Record<string, string> = {},
): string | undefined {
  const canonical = canonicalizeValueSource(source);
  if (canonical === "answer_bank") {
    return undefined;
  }
  if (canonical.startsWith("literal:")) {
    return canonical.slice("literal:".length);
  }
  if (canonical.startsWith("profile.")) {
    const key = canonical.slice("profile.".length);
    const top = profile[key as keyof ProfileValues];
    if (typeof top === "string" && top.length > 0) {
      return top;
    }
    if (key === "workHistory.title") {
      return profile.workHistory?.[0]?.title;
    }
    if (key === "workHistory.company") {
      return profile.workHistory?.[0]?.company;
    }
    if (key === "education.school") {
      return profile.education?.[0]?.school;
    }
    return undefined;
  }
  if (canonical.startsWith("document.")) {
    const kind = canonical.slice("document.".length);
    return documents[kind];
  }
  return undefined;
}
