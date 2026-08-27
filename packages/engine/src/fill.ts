import type { FieldDescriptor } from "@autoapply/core";
import type { Locator, Page } from "playwright";
import { locate } from "./locate.ts";

export type FillOutcome = {
  readBack: string | null;
  chipVerified?: boolean;
};

export async function fillField(page: Page, field: FieldDescriptor, value: string): Promise<FillOutcome> {
  if (field.type === "radio") {
    const match = field.options?.find((option) => option.value === value || option.label === value);
    const name = match?.label ?? value;
    const radio = page.getByRole("radio", { name });
    if ((await radio.count()) > 0) {
      await radio.first().click();
    } else {
      await page.getByRole("radio").filter({ hasText: value }).first().click();
    }
    return { readBack: match?.value ?? value };
  }
  if (field.type === "checkbox" || field.type === "checkbox_group") {
    const wanted = new Set(value.split(",").map((part) => part.trim()).filter(Boolean));
    if (field.options && field.options.length > 0) {
      for (const option of field.options) {
        const box = page.getByRole("checkbox", { name: option.label });
        if ((await box.count()) === 0) {
          continue;
        }
        const should = wanted.has(option.value) || wanted.has(option.label);
        if (should) {
          await box.first().check();
        } else {
          await box.first().uncheck();
        }
      }
    } else {
      const loc = await locate(page, field.selector);
      if (value === "yes" || value === "true" || value === "1") {
        await loc.check();
      } else {
        await loc.uncheck();
      }
    }
    return { readBack: value };
  }
  const loc = await locate(page, field.selector);
  if (field.widget === "combobox" || field.widget === "react-select") {
    return fillCombobox(page, loc, value);
  }
  if (field.widget === "typeahead") {
    return fillTypeahead(page, loc, value);
  }
  if (field.widget === "rich-text") {
    await loc.click();
    await page.keyboard.type(value);
    return { readBack: ((await loc.innerText()) || (await loc.textContent()) || "").trim() };
  }
  if (field.type === "file") {
    await loc.setInputFiles(value);
    const name = value.replace(/^.*[\\/]/, "");
    return { readBack: name };
  }
  if (field.type === "select" || field.type === "multiselect") {
    const byValue = field.options?.find((option) => option.value === value);
    await loc.selectOption(byValue ? { value } : { label: value });
    return { readBack: await loc.inputValue() };
  }
  await loc.click();
  await loc.fill(value);
  await loc.blur();
  return { readBack: await loc.inputValue() };
}

async function optionLocator(page: Page, value: string): Promise<Locator> {
  const byRole = page.getByRole("option", { name: value });
  if ((await byRole.count()) > 0) {
    return byRole.first();
  }
  return page.locator('[role="option"]').filter({ hasText: value }).first();
}

async function fillCombobox(page: Page, loc: Locator, value: string): Promise<FillOutcome> {
  await loc.click();
  const option = await optionLocator(page, value);
  await option.waitFor({ state: "visible", timeout: 3000 });
  await option.click();
  const shown = ((await loc.innerText().catch(() => "")) || (await loc.inputValue().catch(() => ""))).trim();
  return { readBack: shown.length > 0 ? shown : value };
}

async function fillTypeahead(page: Page, loc: Locator, value: string): Promise<FillOutcome> {
  await loc.click();
  const prefix = value.slice(0, Math.min(4, value.length));
  await loc.fill("");
  await loc.pressSequentially(prefix, { delay: 20 });
  const option = await optionLocator(page, value);
  await option.waitFor({ state: "visible", timeout: 3000 });
  await option.click();
  const chip = page.locator("[data-chip]").filter({ hasText: value });
  await chip.first().waitFor({ state: "visible", timeout: 3000 });
  const leftover = (await loc.inputValue().catch(() => "")).trim();
  if (leftover.toLowerCase() === value.trim().toLowerCase()) {
    throw new Error(`typeahead retained raw text without a chip for ${value}`);
  }
  return { readBack: (await chip.first().innerText()).trim(), chipVerified: true };
}
