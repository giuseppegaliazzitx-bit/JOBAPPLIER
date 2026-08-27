const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "gclsrc",
  "mc_eid",
  "igshid",
  "_hsenc",
  "_hsmi",
  "ref",
  "source",
  "from",
  "gh_src",
  "lever-source",
  "ly_source",
  "si",
  "trackingid",
  "trk",
  "trkInfo",
  "eId",
  "xc",
  "alize",
]);

const URL_RE = /https?:\/\/[^\s,<>"')\]]+/gi;

export function extractJobUrls(input: string): string[] {
  const matches = input.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of matches) {
    const trimmed = match.replace(/[.,;:]+$/, "");
    if (seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function parseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function stripWww(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

function linkedInJobId(url: URL): string | null {
  const match = url.pathname.match(/\/jobs\/view\/(\d+)/i);
  return match?.[1] ?? null;
}

function indeedJobKey(url: URL): string | null {
  const jk = url.searchParams.get("jk");
  if (jk && jk.length > 0) {
    return jk;
  }
  const path = url.pathname.match(/\/viewjob\/?/i);
  if (path) {
    return url.searchParams.get("jk");
  }
  return null;
}

export function canonicalizeUrl(raw: string): string | null {
  const url = parseUrl(raw);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
    return null;
  }
  url.hash = "";
  url.hostname = stripWww(url.hostname);
  url.protocol = "https:";
  url.username = "";
  url.password = "";
  url.port = "";

  const keys = [...url.searchParams.keys()];
  for (const key of keys) {
    if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
      url.searchParams.delete(key);
    }
  }

  const host = url.hostname;
  const liId = linkedInJobId(url);
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    if (liId) {
      return `https://linkedin.com/jobs/view/${liId}`;
    }
  }

  const jk = indeedJobKey(url);
  if (host === "indeed.com" || host.endsWith(".indeed.com")) {
    if (jk) {
      return `https://indeed.com/viewjob?jk=${jk}`;
    }
  }

  let path = url.pathname.replace(/\/+$/, "");
  if (path.length === 0) {
    path = "";
  }
  url.pathname = path;

  const search = url.searchParams.toString();
  url.search = search.length > 0 ? `?${search}` : "";
  return url.toString();
}

export function detectJobSource(rawOrCanonical: string): "linkedin" | "indeed" | "glassdoor" | "company" | "other" {
  const url = parseUrl(rawOrCanonical);
  if (!url) {
    return "other";
  }
  const host = stripWww(url.hostname);
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return "linkedin";
  }
  if (host === "indeed.com" || host.endsWith(".indeed.com")) {
    return "indeed";
  }
  if (host === "glassdoor.com" || host.endsWith(".glassdoor.com")) {
    return "glassdoor";
  }
  return "company";
}
