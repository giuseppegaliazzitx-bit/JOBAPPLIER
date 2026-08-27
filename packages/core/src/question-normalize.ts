import { collapseWs, decodeEntities } from "./normalize.ts";

const FILLER = [
  /\bplease\b/g,
  /\bkinds?ly\b/g,
  /\bcould you\b/g,
  /\bwould you\b/g,
  /\bcan you\b/g,
  /\bwe ask that you\b/g,
  /\bif any\b/g,
  /\bif applicable\b/g,
];

const LEMMA: Record<string, string> = {
  authorized: "authorize",
  authorization: "authorize",
  authorisation: "authorize",
  authorize: "authorize",
  requiring: "require",
  required: "require",
  requires: "require",
  require: "require",
  sponsorship: "sponsor",
  sponsoring: "sponsor",
  sponsored: "sponsor",
  sponsor: "sponsor",
  years: "year",
  yrs: "year",
  year: "year",
  employees: "employee",
  employer: "employ",
  employed: "employ",
  employment: "employ",
  currently: "current",
  previously: "previous",
  identities: "identity",
  identification: "identity",
  disabilities: "disability",
  disability: "disability",
  veterans: "veteran",
  veteran: "veteran",
  countries: "country",
  country: "country",
  cities: "city",
  numbers: "number",
  profiles: "profile",
  letters: "letter",
};

function lemmaWord(word: string): string {
  const mapped = LEMMA[word];
  if (mapped) {
    return mapped;
  }
  if (word.endsWith("ies") && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (word.endsWith("ing") && word.length > 5) {
    return word.slice(0, -3);
  }
  if (word.endsWith("ed") && word.length > 4) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) {
    return word.slice(0, -1);
  }
  return word;
}

function expandAbbreviations(text: string): string {
  return text
    .replace(/\bunited states of america\b/g, "united states")
    .replace(/\bu\.s\.a\.?\b/g, "united states")
    .replace(/\bu\.s\.?\b/g, "united states")
    .replace(/\bin the usa\b/g, "in the united states")
    .replace(/\bin the us\b/g, "in the united states")
    .replace(/\bus work\b/g, "united states work")
    .replace(/\bus citizen\b/g, "united states citizen")
    .replace(/\busa\b/g, "united states")
    .replace(/\byrs\b/g, "year")
    .replace(/\bw-2s?\b/g, "w2")
    .replace(/\bw2s\b/g, "w2")
    .replace(/\be-mail\b/g, "email")
    .replace(/\bcurriculum vitae\b/g, "resume")
    .replace(/\bcv\b/g, "resume");
}

function stripFiller(text: string): string {
  let out = text;
  for (const re of FILLER) {
    out = out.replace(re, " ");
  }
  return out;
}

function replaceCompany(text: string, company: string | undefined): string {
  if (!company || company.trim().length === 0) {
    return text;
  }
  const escaped = company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), "{company}");
}

export function normalizeQuestion(raw: string, company?: string): string {
  let text = decodeEntities(raw).toLowerCase();
  text = text.replace(/<[^>]+>/g, " ");
  text = replaceCompany(text, company);
  text = text.replace(/\*/g, " ");
  text = text.replace(/\(required\)/g, " ");
  text = text.replace(/\(optional\)/g, " ");
  text = expandAbbreviations(text);
  text = stripFiller(text);
  text = text.replace(/[?:!.]+/g, " ");
  text = text.replace(/[^\p{L}\p{N}\s{}]+/gu, " ");
  text = collapseWs(text);
  const words = text.split(" ").filter((word) => word.length > 0).map((word) => lemmaWord(word));
  return collapseWs(words.join(" "));
}
