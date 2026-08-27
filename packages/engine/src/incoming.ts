import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderDistilledPage, type DistilledPage } from "@autoapply/core";

export function slugTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "page";
}

export function writeIncomingFixture(
  dir: string,
  html: string,
  distilled: DistilledPage,
  title: string,
): { htmlPath: string; distilledPath: string } {
  mkdirSync(dir, { recursive: true });
  const stamp = Date.now();
  const slug = slugTitle(title);
  const htmlPath = join(dir, `${stamp}-${slug}.html`);
  const distilledPath = join(dir, `${stamp}-${slug}.distilled.txt`);
  writeFileSync(htmlPath, html, "utf8");
  writeFileSync(distilledPath, renderDistilledPage(distilled), "utf8");
  return { htmlPath, distilledPath };
}
