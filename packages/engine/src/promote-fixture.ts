import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectPlatform } from "@autoapply/core";
import { chromium } from "playwright";
import { extractFieldInventory } from "./inventory.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const incomingDir = join(repoRoot, "fixtures/pages/_incoming");

function usage(): never {
  process.stderr.write("usage: pnpm fixture:promote <name>\n");
  process.exit(1);
}

const name = process.argv[2];
if (!name) {
  usage();
}

const files = existsSync(incomingDir)
  ? readdirSync(incomingDir).filter((file) => file.endsWith(".html") && file.includes(name))
  : [];
const htmlName = files[0] ?? `${name}.html`;
const src = join(incomingDir, htmlName);
if (!existsSync(src)) {
  process.stderr.write(`no incoming html for ${name} in ${incomingDir}\n`);
  process.exit(1);
}

const html = readFileSync(src, "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "domcontentloaded" });
const inventory = await extractFieldInventory(page);
await browser.close();
const platform = detectPlatform("https://example.invalid/", html);
const destDir = join(repoRoot, "fixtures/pages", platform);
mkdirSync(destDir, { recursive: true });
const destHtml = join(destDir, `${name}.html`);
const destJson = join(destDir, `${name}.inventory.json`);
renameSync(src, destHtml);
writeFileSync(destJson, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
process.stdout.write(`${destHtml}\n${destJson}\n`);
