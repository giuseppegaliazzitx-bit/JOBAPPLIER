import { z } from "zod";
import { decodeEntities, stripTags } from "./normalize.ts";

export type JobMetadata = {
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  postedAt: string | null;
};

const LooseRecord = z.record(z.string(), z.unknown());

function asRecord(value: unknown): Record<string, unknown> | null {
  const parsed = LooseRecord.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function stringField(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = decodeEntities(stripTags(value)).trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number") {
    return String(value);
  }
  const rec = asRecord(value);
  if (rec && typeof rec.name === "string") {
    return stringField(rec.name);
  }
  if (rec && typeof rec.address === "object") {
    return stringField(rec.address);
  }
  if (rec && rec.addressLocality) {
    const city = stringField(rec.addressLocality);
    const region = stringField(rec.addressRegion);
    return [city, region].filter((part) => part !== null).join(", ") || null;
  }
  return null;
}

function typesOf(node: Record<string, unknown>): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") {
    return [raw.toLowerCase()];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).toLowerCase());
  }
  return [];
}

function collectJobPostings(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectJobPostings(child, out);
    }
    return;
  }
  const rec = asRecord(node);
  if (!rec) {
    return;
  }
  if (typesOf(rec).some((type) => type.includes("jobposting"))) {
    out.push(rec);
  }
  if (rec["@graph"] !== undefined) {
    collectJobPostings(rec["@graph"], out);
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null = re.exec(html);
  while (match) {
    const body = match[1];
    if (body) {
      try {
        blocks.push(JSON.parse(body) as unknown);
      } catch {
        // Malformed JSON-LD is ignored; HTML fallbacks still run.
      }
    }
    match = re.exec(html);
  }
  return blocks;
}

function og(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const match = html.match(re);
  if (match?.[1]) {
    return decodeEntities(match[1]).trim();
  }
  const reverse = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const match2 = html.match(reverse);
  return match2?.[1] ? decodeEntities(match2[1]).trim() : null;
}

function firstHeading(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1]) {
    const text = stripTags(h1[1]);
    return text.length > 0 ? text : null;
  }
  return null;
}

function titleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) {
    return null;
  }
  const text = stripTags(match[1]);
  return text.length > 0 ? text : null;
}

function fromJobPosting(posting: Record<string, unknown>): JobMetadata {
  const org = posting.hiringOrganization;
  const loc = posting.jobLocation;
  return {
    title: stringField(posting.title),
    company: stringField(org),
    location: stringField(loc) ?? stringField(posting.jobLocationType),
    description: stringField(posting.description),
    postedAt: stringField(posting.datePosted),
  };
}

function firstNonNull(values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.length > 0) {
      return value;
    }
  }
  return null;
}

export function extractJobMetadata(html: string): JobMetadata {
  const postings: Record<string, unknown>[] = [];
  for (const block of extractJsonLdBlocks(html)) {
    collectJobPostings(block, postings);
  }
  const fromLd = postings[0] ? fromJobPosting(postings[0]) : null;

  return {
    title: firstNonNull([fromLd?.title, og(html, "og:title"), firstHeading(html), titleTag(html)]),
    company: firstNonNull([fromLd?.company, og(html, "og:site_name")]),
    location: firstNonNull([fromLd?.location]),
    description: firstNonNull([fromLd?.description, og(html, "og:description")]),
    postedAt: firstNonNull([fromLd?.postedAt]),
  };
}
