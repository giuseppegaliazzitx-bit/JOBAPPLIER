import { normalizeQuestion } from "./question-normalize.ts";

export const POLARITY_TAGS = [
  "work_auth",
  "sponsorship",
  "first_name",
  "last_name",
  "email",
  "phone",
  "resume",
  "cover_letter",
  "linkedin",
  "github",
  "salary",
  "start_date",
  "relocate",
  "travel",
  "veteran",
  "disability",
  "gender",
  "race",
  "age18",
  "company_prior",
  "currently_employed",
  "city",
  "country",
  "years_experience",
] as const;

export type PolarityTag = (typeof POLARITY_TAGS)[number];

const RULES: Array<{ tag: PolarityTag; re: RegExp }> = [
  { tag: "sponsorship", re: /\bsponsor/ },
  { tag: "work_auth", re: /\b(authorize|work author|eligib\w* to work|right to work|legally author)/ },
  { tag: "first_name", re: /\b(first name|given name|legal first)\b/ },
  { tag: "last_name", re: /\b(last name|family name|surname|legal last)\b/ },
  { tag: "email", re: /\bemail\b/ },
  { tag: "phone", re: /\b(phone|mobile|cell|telephone)\b/ },
  { tag: "cover_letter", re: /\bcover letter\b/ },
  { tag: "resume", re: /\b(resume|curriculum)\b/ },
  { tag: "linkedin", re: /\blinkedin\b/ },
  { tag: "github", re: /\bgithub\b/ },
  { tag: "salary", re: /\b(salary|compensation|pay expect|desired pay|expected pay)\b/ },
  { tag: "start_date", re: /\b(start date|available to start|notice period|when can you start)\b/ },
  { tag: "relocate", re: /\breloc/ },
  { tag: "travel", re: /\btravel\b/ },
  { tag: "veteran", re: /\bveteran\b/ },
  { tag: "disability", re: /\bdisab/ },
  { tag: "gender", re: /\b(gender|sex)\b/ },
  { tag: "race", re: /\b(race|ethnicity|ethnic)\b/ },
  { tag: "age18", re: /\b(18 year|over 18|at least 18|age of 18)\b/ },
  { tag: "company_prior", re: /\b(work(?:ed)? at \{company\}|previous(?:ly)? employ|former employee|work(?:ed)? (?:here|for us) before)\b/ },
  { tag: "currently_employed", re: /\b(current(?:ly)? employ|currently work)\b/ },
  { tag: "city", re: /\bcity\b/ },
  { tag: "country", re: /\bcountry\b/ },
  { tag: "years_experience", re: /\b(year of experience|year experience|how many year)\b/ },
];

const CONFLICTS: Array<[PolarityTag, PolarityTag]> = [
  ["work_auth", "sponsorship"],
  ["first_name", "last_name"],
  ["email", "phone"],
  ["resume", "cover_letter"],
  ["veteran", "disability"],
  ["gender", "race"],
  ["salary", "start_date"],
  ["relocate", "travel"],
  ["work_auth", "age18"],
  ["linkedin", "github"],
  ["company_prior", "currently_employed"],
  ["city", "country"],
  ["first_name", "email"],
  ["salary", "years_experience"],
];

export function polarityTags(label: string, company?: string): Set<PolarityTag> {
  const norm = normalizeQuestion(label, company);
  const tags = new Set<PolarityTag>();
  for (const rule of RULES) {
    if (rule.re.test(norm)) {
      tags.add(rule.tag);
    }
  }
  return tags;
}

export function polaritiesConflict(a: ReadonlySet<PolarityTag>, b: ReadonlySet<PolarityTag>): boolean {
  for (const [left, right] of CONFLICTS) {
    if ((a.has(left) && b.has(right)) || (a.has(right) && b.has(left))) {
      return true;
    }
  }
  return false;
}
