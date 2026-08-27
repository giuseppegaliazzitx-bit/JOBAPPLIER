import type { DomFingerprint, Recipe } from "./recipe.ts";

export function urlPatternMatches(pattern: string, url: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = new RegExp(`^${escaped}$`, "i");
  if (re.test(url)) {
    return true;
  }
  try {
    const parsed = new URL(url);
    const stripped = `${parsed.origin}${parsed.pathname}`;
    return re.test(stripped);
  } catch {
    return false;
  }
}

function htmlMatchesFingerprint(html: string, fingerprint: DomFingerprint): boolean {
  const lower = html.toLowerCase();
  const value = fingerprint.value.toLowerCase();
  if (fingerprint.kind === "css") {
    return lower.includes(value);
  }
  if (fingerprint.kind === "attr_prefix") {
    return lower.includes(`name="${value}`) || lower.includes(`name='${value}`) || lower.includes(value);
  }
  if (fingerprint.kind === "meta_generator") {
    return (
      new RegExp(`<meta[^>]+name=["']generator["'][^>]+content=["'][^"']*${escapeRe(value)}`, "i").test(html) ||
      new RegExp(`<meta[^>]+content=["'][^"']*${escapeRe(value)}[^"']*["'][^>]+name=["']generator["']`, "i").test(html)
    );
  }
  if (fingerprint.kind === "script_host") {
    return new RegExp(`<script[^>]+src=["'][^"']*${escapeRe(value)}`, "i").test(html);
  }
  if (fingerprint.kind === "form_action_host") {
    return new RegExp(`<form[^>]+action=["'][^"']*${escapeRe(value)}`, "i").test(html);
  }
  return false;
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function recipeMatchesUrl(recipe: Recipe, url: string): boolean {
  return recipe.match.urlPatterns.some((pattern) => urlPatternMatches(pattern, url));
}

export function recipeMatchesDom(recipe: Recipe, html: string): boolean {
  if (recipe.match.domFingerprints.length === 0) {
    return false;
  }
  return recipe.match.domFingerprints.some((fingerprint) => htmlMatchesFingerprint(html, fingerprint));
}

const SCOPE_RANK: Record<Recipe["scope"], number> = {
  url_pattern: 0,
  company: 1,
  platform: 2,
};

export function matchRecipe(url: string, html: string | undefined, recipes: Recipe[]): Recipe | undefined {
  const ranked = [...recipes].sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]);
  const byUrl = ranked.find((recipe) => recipeMatchesUrl(recipe, url));
  if (byUrl) {
    return byUrl;
  }
  if (html === undefined) {
    return undefined;
  }
  return ranked.find((recipe) => recipeMatchesDom(recipe, html));
}
