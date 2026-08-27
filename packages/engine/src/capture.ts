import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectPlatform, detectPlatformFromUrl } from "@autoapply/core";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");

function usage(): never {
  process.stderr.write("usage: pnpm capture <url>\n");
  process.exit(1);
}

const url = process.argv[2];
if (!url) {
  usage();
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
const html = await page.content();
const platform = detectPlatformFromUrl(url) ?? detectPlatform(url, html);
const dir = join(repoRoot, "fixtures/pages", platform);
mkdirSync(dir, { recursive: true });
const dest = join(dir, `captured-${Date.now()}.html`);
writeFileSync(dest, html, "utf8");
await browser.close();
process.stdout.write(`${dest}\n`);
