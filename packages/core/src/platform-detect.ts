import { atsRefFromUrl, atsRefsFromHtml, platformFromUrl } from "./ats.ts";
import { type Platform } from "./platform.ts";
import { parseUrl } from "./urls.ts";

function collectHosts(html: string, tagAttrRe: RegExp): string[] {
  const hosts: string[] = [];
  tagAttrRe.lastIndex = 0;
  let match: RegExpExecArray | null = tagAttrRe.exec(html);
  while (match) {
    const raw = match[1];
    if (raw) {
      const url = parseUrl(raw.startsWith("//") ? `https:${raw}` : raw);
      if (url) {
        hosts.push(url.hostname.toLowerCase().replace(/^www\./, ""));
      }
    }
    match = tagAttrRe.exec(html);
  }
  return hosts;
}

function metaGenerator(html: string): string {
  const named = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (named?.[1]) {
    return named[1].toLowerCase();
  }
  const reverse = html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']generator["']/i);
  return reverse?.[1]?.toLowerCase() ?? "";
}

type Signal = { platform: Exclude<Platform, "unknown">; weight: number };

function collectDomSignals(html: string): Signal[] {
  const signals: Signal[] = [];
  const lower = html.toLowerCase();
  const scriptHosts = collectHosts(html, /<script[^>]+src=["']([^"']+)["']/gi);
  const formHosts = collectHosts(html, /<form[^>]+action=["']([^"']+)["']/gi);
  const iframeHosts = collectHosts(html, /<iframe[^>]+src=["']([^"']+)["']/gi);
  const allHosts = [...scriptHosts, ...formHosts, ...iframeHosts];
  const generator = metaGenerator(html);

  const bump = (platform: Exclude<Platform, "unknown">, weight: number) => {
    signals.push({ platform, weight });
  };

  if (generator.includes("greenhouse")) bump("greenhouse", 5);
  if (lower.includes("id=\"application_form\"") || lower.includes("id='application_form'")) {
    bump("greenhouse", 5);
  }
  if (lower.includes("name=\"job_application[") || lower.includes("name='job_application[")) {
    bump("greenhouse", 5);
  }
  if (allHosts.some((host) => host.endsWith("greenhouse.io"))) bump("greenhouse", 4);

  if (allHosts.some((host) => host.endsWith("lever.co"))) bump("lever", 5);
  if (lower.includes("posting-headline") && lower.includes("lever")) bump("lever", 2);

  if (lower.includes("data-automation-id=")) bump("workday", 5);
  if (allHosts.some((host) => host.endsWith("myworkdayjobs.com") || host.includes("workdaycdn"))) {
    bump("workday", 5);
  }

  if (allHosts.some((host) => host.endsWith("icims.com"))) bump("icims", 5);

  if (allHosts.some((host) => host.endsWith("taleo.net"))) bump("taleo", 5);
  if (generator.includes("taleo")) bump("taleo", 4);

  if (allHosts.some((host) => host.endsWith("smartrecruiters.com"))) bump("smartrecruiters", 5);

  if (allHosts.some((host) => host.endsWith("ashbyhq.com"))) bump("ashby", 5);

  if (allHosts.some((host) => host.endsWith("jobvite.com"))) bump("jobvite", 5);
  if (lower.includes("jv-careersite") || lower.includes("jobvite")) {
    if (allHosts.some((host) => host.endsWith("jobvite.com"))) {
      bump("jobvite", 1);
    }
  }

  if (allHosts.some((host) => host.endsWith("bamboohr.com"))) bump("bamboohr", 5);

  if (allHosts.some((host) => host.endsWith("recruitee.com"))) bump("recruitee", 5);

  return signals;
}

function winnerFromSignals(signals: Signal[]): Exclude<Platform, "unknown"> | null {
  if (signals.length === 0) {
    return null;
  }
  const scores = new Map<Exclude<Platform, "unknown">, number>();
  for (const signal of signals) {
    scores.set(signal.platform, (scores.get(signal.platform) ?? 0) + signal.weight);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) {
    return null;
  }
  const strong = ranked.filter(([, score]) => score >= 4);
  if (strong.length > 1) {
    return null;
  }
  if (top[1] < 4) {
    return null;
  }
  return top[0];
}

export function detectPlatformFromUrl(url: string): Platform | null {
  return platformFromUrl(url);
}

export function detectPlatformFromDom(html: string): Platform | null {
  const refs = atsRefsFromHtml(html);
  const uniquePlatforms = new Set(refs.map((ref) => ref.platform));
  if (uniquePlatforms.size === 1) {
    const only = refs[0];
    return only ? only.platform : null;
  }
  if (uniquePlatforms.size > 1) {
    return null;
  }
  return winnerFromSignals(collectDomSignals(html));
}

export function detectPlatform(url: string, html?: string): Platform {
  const fromUrl = detectPlatformFromUrl(url);
  if (fromUrl) {
    return fromUrl;
  }
  if (html !== undefined) {
    const fromDom = detectPlatformFromDom(html);
    if (fromDom) {
      return fromDom;
    }
    const ref = atsRefFromUrl(url) ?? atsRefsFromHtml(html)[0];
    if (ref) {
      return ref.platform;
    }
  }
  return "unknown";
}
