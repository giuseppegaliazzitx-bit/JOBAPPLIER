import { normalizeText } from "./normalize.ts";

export const STALE_DAYS = 60;

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "our",
  "you",
  "your",
  "are",
  "this",
  "that",
  "from",
  "will",
  "have",
  "has",
  "not",
  "but",
  "all",
  "any",
  "can",
  "job",
  "role",
  "team",
  "work",
  "who",
  "we",
  "in",
  "on",
  "of",
  "to",
  "a",
  "an",
  "or",
  "as",
  "be",
  "is",
  "at",
  "by",
]);

export type ResumeDoc = {
  id: string;
  label: string;
  keywords: string[];
};

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 4 && !STOP.has(part));
}

export function uniqueTokens(text: string): string[] {
  return [...new Set(tokenize(text))];
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size === 0 && right.size === 0) {
    return 0;
  }
  let inter = 0;
  for (const item of left) {
    if (right.has(item)) {
      inter += 1;
    }
  }
  const union = left.size + right.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function keywordOverlap(description: string, resumeKeywords: string[]): number {
  const resume = new Set(resumeKeywords.flatMap((item) => tokenize(item)));
  return jaccard(uniqueTokens(description), resume);
}

export function titleSimilarity(title: string, resumeKeywords: string[]): number {
  return jaccard(uniqueTokens(title), resumeKeywords.flatMap((item) => tokenize(item)));
}

export function salaryFloorFit(salaryMin: number | null | undefined, floor: number | undefined): number {
  if (floor === undefined || floor <= 0 || salaryMin === null || salaryMin === undefined) {
    return 1;
  }
  return salaryMin >= floor ? 1 : 0;
}

export function computeFitScore(input: {
  description: string;
  title: string;
  resumeKeywords: string[];
  salaryMin?: number | null;
  salaryFloor?: number;
}): number {
  const keywords = keywordOverlap(input.description, input.resumeKeywords);
  const title = titleSimilarity(input.title, input.resumeKeywords);
  const salary = salaryFloorFit(input.salaryMin, input.salaryFloor);
  return Math.round((0.5 * keywords + 0.3 * title + 0.2 * salary) * 1000) / 1000;
}

export function keywordGap(description: string, resumeKeywords: string[]): { missing: string[]; overlap: string[] } {
  const resume = new Set(resumeKeywords.flatMap((item) => tokenize(item)));
  const desc = uniqueTokens(description);
  const overlap = desc.filter((token) => resume.has(token));
  const missing = desc.filter((token) => !resume.has(token));
  return { missing, overlap };
}

export function selectResumeVariant(
  description: string,
  title: string,
  resumes: ResumeDoc[],
): ResumeDoc | undefined {
  if (resumes.length === 0) {
    return undefined;
  }
  let best = resumes[0];
  let bestScore = -1;
  for (const resume of resumes) {
    const score = computeFitScore({ description, title, resumeKeywords: resume.keywords });
    if (score > bestScore) {
      best = resume;
      bestScore = score;
    }
  }
  return best;
}

export function jobFamily(title: string): string {
  const t = normalizeText(title);
  if (/\b(data|analyst|machine learning|mlops)\b/.test(t)) {
    return "data";
  }
  if (/\b(backend|back end|platform|server)\b/.test(t)) {
    return "backend";
  }
  if (/\b(frontend|front end|react|ui)\b/.test(t)) {
    return "frontend";
  }
  if (/\b(sre|reliability|devops|infrastructure)\b/.test(t)) {
    return "infra";
  }
  if (/\b(engineer|developer|software)\b/.test(t)) {
    return "engineering";
  }
  return "general";
}

export function isStaffingAgency(company: string, description = ""): boolean {
  const hay = `${company} ${description}`;
  return /\b(staffing|recruiting firm|recruitment|rpo|talent solutions|contracting agency)\b/i.test(hay);
}

export function isStale(postedAt: string | null, createdAt: string, now = new Date(), days = STALE_DAYS): boolean {
  const stamp = postedAt ?? createdAt;
  const then = new Date(stamp).getTime();
  if (Number.isNaN(then)) {
    return false;
  }
  return now.getTime() - then >= days * 24 * 60 * 60 * 1000;
}

export function locationMismatch(
  jobLocation: string | null | undefined,
  profile: { city?: string; state?: string; country?: string },
): boolean {
  if (!jobLocation) {
    return false;
  }
  const loc = normalizeText(jobLocation);
  if (loc.includes("remote")) {
    return false;
  }
  const needles = [profile.city, profile.state, profile.country].filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
  if (needles.length === 0) {
    return false;
  }
  return !needles.some((item) => loc.includes(normalizeText(item)));
}

export function coverLetterTemplate(input: { title: string; company: string }): string {
  return `I am writing to apply for ${input.title} at ${input.company}.`;
}
