import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FieldDescriptorSchema, fieldFingerprint, normalizeLabel } from "@autoapply/core";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillField } from "../src/fill.ts";
import { nearbyError, readBack } from "../src/verify.ts";

const here = dirname(fileURLToPath(import.meta.url));

function field(partial: {
  labelRaw: string;
  type: "text" | "custom";
  widget: "native" | "combobox" | "typeahead";
  css: string;
  name?: string;
}) {
  return FieldDescriptorSchema.parse({
    fingerprint: fieldFingerprint(normalizeLabel(partial.labelRaw), partial.type, undefined),
    labelRaw: partial.labelRaw,
    labelNorm: normalizeLabel(partial.labelRaw),
    labelSource: "aria_label",
    type: partial.type,
    widget: partial.widget,
    required: true,
    selector: {
      primary: { strategy: "css", value: partial.css },
      fallbacks: partial.name ? [{ strategy: "name", value: partial.name }] : [],
    },
    containerPath: "form",
    visible: true,
    disabled: false,
  });
}

describe("widget fill executors", () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("does not type into a combobox — click then select", () => {
    const src = readFileSync(join(here, "../src/fill.ts"), "utf8");
    const start = src.indexOf("async function fillCombobox");
    const end = src.indexOf("async function fillTypeahead");
    const body = src.slice(start, end);
    expect(body).not.toMatch(/pressSequentially|\.fill\(/);
    expect(body).toMatch(/option/);
  });

  it("selects a combobox option by click and reads it back", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html>
        <div data-widget="combobox">
          <button type="button" id="country" role="combobox" aria-label="Country">Select country</button>
          <ul role="listbox" hidden>
            <li role="option">Canada</li>
            <li role="option">United States</li>
          </ul>
        </div>
        <script>
          const btn = document.getElementById("country");
          const list = document.querySelector("[role=listbox]");
          btn.addEventListener("click", () => { list.hidden = false; });
          list.querySelectorAll("[role=option]").forEach((opt) => {
            opt.addEventListener("click", () => {
              btn.textContent = opt.textContent;
              list.hidden = true;
            });
          });
        </script>`);
      const descriptor = field({
        labelRaw: "Country",
        type: "custom",
        widget: "combobox",
        css: "#country",
      });
      const outcome = await fillField(page, descriptor, "United States");
      expect(outcome.readBack).toMatch(/United States/);
      expect(await readBack(page, descriptor)).toMatch(/United States/);
      expect(await nearbyError(page, descriptor)).toBeNull();
    } finally {
      await page.close();
    }
  });

  it("verifies a typeahead chip and rejects silently retained raw text", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html>
        <div data-widget="typeahead">
          <input id="school" role="combobox" aria-label="School" aria-autocomplete="list" />
          <div data-chip-list></div>
          <ul role="listbox" hidden></ul>
        </div>
        <script>
          const input = document.getElementById("school");
          const list = document.querySelector("[role=listbox]");
          const chips = document.querySelector("[data-chip-list]");
          input.addEventListener("input", () => {
            list.innerHTML = "";
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.textContent = "Stanford University";
            li.addEventListener("click", () => {
              chips.innerHTML = '<span data-chip class="chip">Stanford University</span>';
              input.value = "";
              list.hidden = true;
            });
            list.appendChild(li);
            list.hidden = false;
          });
        </script>`);
      const descriptor = field({
        labelRaw: "School",
        type: "custom",
        widget: "typeahead",
        css: "#school",
      });
      const outcome = await fillField(page, descriptor, "Stanford University");
      expect(outcome.chipVerified).toBe(true);
      expect(outcome.readBack).toBe("Stanford University");
      expect(await page.locator("#school").inputValue()).not.toBe("Stanford University");
    } finally {
      await page.close();
    }
  });

  it("throws when a typeahead keeps the typed value instead of a chip", async () => {
    const page = await browser.newPage();
    try {
      await page.setContent(`<!doctype html>
        <div data-widget="typeahead">
          <input id="school" role="combobox" aria-label="School" aria-autocomplete="list" />
          <div data-chip-list></div>
          <ul role="listbox" hidden></ul>
        </div>
        <script>
          const input = document.getElementById("school");
          const list = document.querySelector("[role=listbox]");
          const chips = document.querySelector("[data-chip-list]");
          input.addEventListener("input", () => {
            list.innerHTML = "";
            const li = document.createElement("li");
            li.setAttribute("role", "option");
            li.textContent = "Stanford University";
            li.addEventListener("click", () => {
              chips.innerHTML = '<span data-chip class="chip">Stanford University</span>';
              input.value = "Stanford University";
              list.hidden = true;
            });
            list.appendChild(li);
            list.hidden = false;
          });
        </script>`);
      const descriptor = field({
        labelRaw: "School",
        type: "custom",
        widget: "typeahead",
        css: "#school",
      });
      await expect(fillField(page, descriptor, "Stanford University")).rejects.toThrow(/retained raw text/);
    } finally {
      await page.close();
    }
  });
});
