import { atsRefFromUrl, atsRefsFromHtml, type AtsRef } from "./ats.ts";
import { canonicalizeUrl } from "./urls.ts";
import { normalizeCompanyName, normalizeText } from "./normalize.ts";

export type DedupInput = {
  url: string;
  html?: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
};

export function atsKey(ref: AtsRef): string {
  const company = ref.company ?? "_";
  return `ats:${ref.platform}:${company}:${ref.jobId}`.toLowerCase();
}

export function metaKey(title: string, company: string, location: string): string {
  return `meta:${normalizeCompanyName(company)}|${normalizeText(title)}|${normalizeText(location)}`;
}

export function deriveDedupKey(input: DedupInput): string {
  const canonical = canonicalizeUrl(input.url) ?? input.url.trim();
  const fromUrl = atsRefFromUrl(canonical) ?? atsRefFromUrl(input.url);
  if (fromUrl) {
    return atsKey(fromUrl);
  }
  if (input.html) {
    const refs = atsRefsFromHtml(input.html);
    if (refs.length === 1 && refs[0]) {
      return atsKey(refs[0]);
    }
  }
  const title = input.title?.trim() ?? "";
  const company = input.company?.trim() ?? "";
  if (title.length > 0 && company.length > 0) {
    return metaKey(title, company, input.location ?? "");
  }
  return `url:${canonical}`;
}
