import { QUESTION_CLUSTERS, defaultTypeForCluster } from "./aliases.ts";
import type { FieldType } from "./field.ts";

export type CorpusItem = {
  label: string;
  type: FieldType;
};

export type CorpusPair = {
  a: CorpusItem;
  b: CorpusItem;
};

function item(label: string, cluster: string): CorpusItem {
  return { label, type: defaultTypeForCluster(cluster) };
}

function combinations(cluster: string, limit: number): CorpusPair[] {
  const labels = QUESTION_CLUSTERS[cluster] ?? [];
  const pairs: CorpusPair[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      const a = labels[i];
      const b = labels[j];
      if (!a || !b) {
        continue;
      }
      pairs.push({ a: item(a, cluster), b: item(b, cluster) });
      if (pairs.length >= limit) {
        return pairs;
      }
    }
  }
  return pairs;
}

function cross(left: string, right: string, limit: number): CorpusPair[] {
  const aLabels = QUESTION_CLUSTERS[left] ?? [];
  const bLabels = QUESTION_CLUSTERS[right] ?? [];
  const pairs: CorpusPair[] = [];
  for (const a of aLabels) {
    for (const b of bLabels) {
      pairs.push({ a: item(a, left), b: item(b, right) });
      if (pairs.length >= limit) {
        return pairs;
      }
    }
  }
  return pairs;
}

/** Hand-added should-not-match regressions. Survives generated-pair reshuffles. */
export const EXTRA_SHOULD_NOT_MATCH: CorpusPair[] = [];

export function buildMatchingCorpus(): { shouldMatch: CorpusPair[]; shouldNotMatch: CorpusPair[] } {
  const shouldMatch = [
    ...combinations("work_auth", 28),
    ...combinations("sponsorship", 15),
    ...combinations("first_name", 15),
    ...combinations("last_name", 15),
    ...combinations("email", 15),
    ...combinations("phone", 15),
    ...combinations("resume", 15),
    ...combinations("linkedin", 10),
    ...combinations("salary", 10),
    ...combinations("start_date", 10),
    ...combinations("city", 6),
    ...combinations("veteran", 6),
    ...combinations("disability", 6),
    ...combinations("gender", 3),
  ].slice(0, 150);

  const shouldNotMatch = [
    ...cross("work_auth", "sponsorship", 36),
    ...cross("first_name", "last_name", 25),
    ...cross("email", "phone", 16),
    ...cross("resume", "cover_letter", 16),
    ...cross("veteran", "disability", 9),
    ...cross("gender", "race", 9),
    ...cross("salary", "start_date", 9),
    ...cross("relocate", "travel", 9),
    ...cross("work_auth", "age18", 12),
    ...cross("linkedin", "github", 9),
    ...cross("company_prior", "currently_employed", 9),
    ...cross("first_name", "email", 9),
    ...EXTRA_SHOULD_NOT_MATCH,
  ].slice(0, 150 + EXTRA_SHOULD_NOT_MATCH.length);

  return { shouldMatch, shouldNotMatch };
}
