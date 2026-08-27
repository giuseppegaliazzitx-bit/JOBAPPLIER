import type { FieldDescriptor } from "@autoapply/core";
import type { Page } from "playwright";
import { locate } from "./locate.ts";

function fileNameOf(pathOrValue: string): string {
  return pathOrValue.replace(/^.*[\\/]/, "").trim();
}

export async function readBack(page: Page, field: FieldDescriptor): Promise<string | null> {
  if (field.widget === "unknown") {
    try {
      const loc = await locate(page, field.selector);
      const selected = await loc.getAttribute("data-selected");
      if (selected && selected.trim().length > 0) {
        return selected.trim();
      }
    } catch {
      return null;
    }
  }
  if (field.widget === "typeahead") {
    const chip = page.locator("[data-chip]").filter({ hasText: /./ });
    if ((await chip.count()) > 0) {
      return (await chip.first().innerText()).trim();
    }
    return null;
  }
  if (field.widget === "combobox" || field.widget === "react-select") {
    const loc = await locate(page, field.selector);
    const text = ((await loc.innerText().catch(() => "")) || (await loc.inputValue().catch(() => ""))).trim();
    return text.length > 0 ? text : null;
  }
  if (field.type === "radio") {
    const checked = page.locator('input[type="radio"]:checked');
    if ((await checked.count()) === 0) {
      return null;
    }
    return checked.first().inputValue();
  }
  if (field.type === "file") {
    try {
      const loc = await locate(page, field.selector);
      const raw = await loc.inputValue();
      const name = fileNameOf(raw);
      return name.length > 0 ? name : null;
    } catch {
      return null;
    }
  }
  try {
    const loc = await locate(page, field.selector);
    return await loc.inputValue();
  } catch {
    return null;
  }
}

export async function nearbyError(page: Page, field: FieldDescriptor): Promise<string | null> {
  const named =
    field.selector.primary.strategy === "name"
      ? field.selector.primary
      : field.selector.fallbacks.find((item) => item.strategy === "name");
  if (named) {
    const err = page.locator(`[data-error-for="${named.value}"]`);
    if ((await err.count()) > 0) {
      const text = (await err.first().innerText()).trim();
      if (text.length > 0) {
        return text;
      }
    }
  }
  try {
    const loc = await locate(page, field.selector);
    const invalid = await loc.getAttribute("aria-invalid");
    if (invalid === "true") {
      return "invalid";
    }
    const local = loc.locator("xpath=ancestor::label[1] | ancestor::fieldset[1] | ancestor::*[@data-widget][1]").locator(".field-error");
    if ((await local.count()) > 0) {
      const text = (await local.first().innerText()).trim();
      if (text.length > 0) {
        return text;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function valuesMatch(expected: string, actual: string | null): boolean {
  if (actual === null) {
    return false;
  }
  const a = expected.trim().toLowerCase();
  const b = actual.trim().toLowerCase();
  if (a === b || b.includes(a) || a.includes(b)) {
    return true;
  }
  const baseA = fileNameOf(a);
  const baseB = fileNameOf(b);
  return baseA.length > 0 && baseA === baseB;
}
