const COMPANY_SUFFIX =
  /\b(incorporated|inc|llc|l\.l\.c|corp|corporation|co|ltd|limited|plc|gmbh|ag|sa|pty)\b\.?/g;

export function collapseWs(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stripTags(html: string): string {
  return collapseWs(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'"),
  );
}

export function normalizeText(value: string): string {
  return collapseWs(value.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " "));
}

export function normalizeCompanyName(value: string): string {
  return collapseWs(normalizeText(value).replace(COMPANY_SUFFIX, " ")).trim();
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ");
}
