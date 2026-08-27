import { ATS_PLATFORMS, type Platform } from "./platform.ts";
import { parseUrl } from "./urls.ts";

export type AtsRef = {
  platform: Exclude<Platform, "unknown">;
  company: string | null;
  jobId: string;
};

function hostOf(raw: string): string | null {
  const url = parseUrl(raw);
  return url ? url.hostname.toLowerCase().replace(/^www\./, "") : null;
}

function pathOf(raw: string): string {
  const url = parseUrl(raw);
  return url ? url.pathname : "";
}

function queryOf(raw: string, key: string): string | null {
  const url = parseUrl(raw);
  if (!url) {
    return null;
  }
  const value = url.searchParams.get(key);
  return value && value.length > 0 ? value : null;
}

const PATTERNS: Array<{
  platform: Exclude<Platform, "unknown">;
  match: (raw: string, host: string, path: string) => AtsRef | null;
}> = [
  {
    platform: "greenhouse",
    match: (_raw, host, path) => {
      if (!host.endsWith("greenhouse.io") && host !== "greenhouse.io") {
        return null;
      }
      const m = path.match(/\/([^/]+)\/jobs\/(\d+)/i);
      if (!m?.[1] || !m[2]) {
        return null;
      }
      return { platform: "greenhouse", company: m[1].toLowerCase(), jobId: m[2] };
    },
  },
  {
    platform: "lever",
    match: (_raw, host, path) => {
      if (host !== "jobs.lever.co" && !host.endsWith(".lever.co")) {
        return null;
      }
      const m = path.match(/^\/([^/]+)\/([A-Za-z0-9-]+)/);
      if (!m?.[1] || !m[2] || m[2] === "jobs") {
        return null;
      }
      return { platform: "lever", company: m[1].toLowerCase(), jobId: m[2] };
    },
  },
  {
    platform: "ashby",
    match: (_raw, host, path) => {
      if (host !== "jobs.ashbyhq.com" && !host.endsWith(".ashbyhq.com")) {
        return null;
      }
      const m = path.match(/^\/([^/]+)\/([^/]+)/);
      if (!m?.[1] || !m[2]) {
        return null;
      }
      return { platform: "ashby", company: m[1].toLowerCase(), jobId: m[2] };
    },
  },
  {
    platform: "smartrecruiters",
    match: (_raw, host, path) => {
      if (!host.endsWith("smartrecruiters.com")) {
        return null;
      }
      const m = path.match(/^\/([^/]+)\/([^/]+)/);
      if (!m?.[1] || !m[2]) {
        return null;
      }
      return { platform: "smartrecruiters", company: m[1].toLowerCase(), jobId: m[2] };
    },
  },
  {
    platform: "workday",
    match: (_raw, host, path) => {
      if (!host.endsWith("myworkdayjobs.com") && !host.endsWith("workday.com")) {
        return null;
      }
      const m = path.match(/\/job\/.+?_([A-Za-z0-9-]+)\/?$/i) ?? path.match(/\/job\/([^/]+)\/?$/i);
      const jobId = m?.[1] ?? path.replace(/\/+/g, "/").replace(/\/$/, "");
      if (jobId.length === 0) {
        return null;
      }
      const company = host.split(".")[0] ?? null;
      return { platform: "workday", company, jobId };
    },
  },
  {
    platform: "icims",
    match: (_raw, host, path) => {
      if (!host.endsWith("icims.com")) {
        return null;
      }
      const m = path.match(/\/jobs\/(\d+)/i);
      if (!m?.[1]) {
        return null;
      }
      const companyHost = host.replace(/\.icims\.com$/, "");
      return { platform: "icims", company: companyHost, jobId: m[1] };
    },
  },
  {
    platform: "taleo",
    match: (raw, host, path) => {
      if (!host.endsWith("taleo.net")) {
        return null;
      }
      const job = queryOf(raw, "job") ?? path;
      const company = host.split(".")[0] ?? null;
      return { platform: "taleo", company, jobId: job };
    },
  },
  {
    platform: "jobvite",
    match: (_raw, host, path) => {
      if (!host.endsWith("jobvite.com")) {
        return null;
      }
      const full = path.match(/^\/([^/]+)\/job\/([^/]+)/i);
      if (full?.[1] && full[2]) {
        return { platform: "jobvite", company: full[1].toLowerCase(), jobId: full[2] };
      }
      const job = path.match(/\/job\/([^/]+)/i);
      if (job?.[1]) {
        return { platform: "jobvite", company: host.split(".")[0] ?? null, jobId: job[1] };
      }
      return null;
    },
  },
  {
    platform: "bamboohr",
    match: (_raw, host, path) => {
      if (!host.endsWith("bamboohr.com")) {
        return null;
      }
      const m = path.match(/\/careers\/(\d+)/i);
      if (!m?.[1]) {
        return null;
      }
      const company = host.replace(/\.bamboohr\.com$/, "");
      return { platform: "bamboohr", company, jobId: m[1] };
    },
  },
  {
    platform: "recruitee",
    match: (_raw, host, path) => {
      if (!host.endsWith("recruitee.com")) {
        return null;
      }
      const m = path.match(/\/o\/([^/]+)/i);
      if (!m?.[1]) {
        return null;
      }
      const company = host.replace(/\.recruitee\.com$/, "");
      return { platform: "recruitee", company, jobId: m[1] };
    },
  },
];

export function atsRefFromUrl(raw: string): AtsRef | null {
  const host = hostOf(raw);
  if (!host) {
    return null;
  }
  const path = pathOf(raw);
  for (const pattern of PATTERNS) {
    const ref = pattern.match(raw, host, path);
    if (ref) {
      return ref;
    }
  }
  return null;
}

export function platformFromUrl(raw: string): Platform | null {
  const ref = atsRefFromUrl(raw);
  if (ref) {
    return ref.platform;
  }
  const host = hostOf(raw);
  if (!host) {
    return null;
  }
  if (host.endsWith("greenhouse.io")) return "greenhouse";
  if (host.endsWith("lever.co")) return "lever";
  if (host.endsWith("myworkdayjobs.com") || host.endsWith("workdayjobs.com")) return "workday";
  if (host.endsWith("icims.com")) return "icims";
  if (host.endsWith("taleo.net")) return "taleo";
  if (host.endsWith("smartrecruiters.com")) return "smartrecruiters";
  if (host.endsWith("ashbyhq.com")) return "ashby";
  if (host.endsWith("jobvite.com")) return "jobvite";
  if (host.endsWith("bamboohr.com")) return "bamboohr";
  if (host.endsWith("recruitee.com")) return "recruitee";
  return null;
}

const HREF_RE = /https?:\/\/[^\s"'<>]+/gi;

export function atsRefsFromHtml(html: string): AtsRef[] {
  const found: AtsRef[] = [];
  const seen = new Set<string>();
  const matches = html.match(HREF_RE) ?? [];
  for (const raw of matches) {
    const ref = atsRefFromUrl(raw);
    if (!ref) {
      continue;
    }
    const key = `${ref.platform}:${ref.company ?? ""}:${ref.jobId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    found.push(ref);
  }
  return found;
}

export function isAtsPlatform(platform: Platform): platform is Exclude<Platform, "unknown"> {
  return (ATS_PLATFORMS as readonly string[]).includes(platform);
}
