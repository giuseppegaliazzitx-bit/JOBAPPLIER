import type { Selector, SelectorSpec } from "@autoapply/core";
import type { Locator, Page } from "playwright";

export function locatorFromSelector(page: Page, selector: Selector): Locator {
  if (selector.strategy === "label") {
    return page.getByLabel(selector.value, { exact: true });
  }
  if (selector.strategy === "role") {
    const split = selector.value.indexOf(":");
    const role = (split === -1 ? selector.value : selector.value.slice(0, split)) as Parameters<
      Page["getByRole"]
    >[0];
    const name = split === -1 ? undefined : selector.value.slice(split + 1);
    return name ? page.getByRole(role, { name, exact: true }) : page.getByRole(role);
  }
  if (selector.strategy === "testid") {
    if (selector.value.startsWith("qa:")) {
      return page.locator(`[data-qa="${cssEscape(selector.value.slice(3))}"]`);
    }
    if (selector.value.startsWith("automation:")) {
      return page.locator(`[data-automation-id="${cssEscape(selector.value.slice(11))}"]`);
    }
    return page.getByTestId(selector.value);
  }
  if (selector.strategy === "name") {
    return page.locator(`[name="${cssEscape(selector.value)}"]`);
  }
  if (selector.strategy === "placeholder") {
    return page.getByPlaceholder(selector.value, { exact: true });
  }
  if (selector.strategy === "text") {
    return page.getByText(selector.value, { exact: true });
  }
  return page.locator(selector.value);
}

export async function locate(page: Page, spec: SelectorSpec): Promise<Locator> {
  const chain = [spec.primary, ...spec.fallbacks];
  for (const selector of chain) {
    const loc = locatorFromSelector(page, selector);
    const count = await loc.count();
    if (count === 1) {
      return loc.first();
    }
    if (count > 1) {
      const visible = loc.locator("visible=true");
      if ((await visible.count()) === 1) {
        return visible.first();
      }
    }
  }
  throw new Error(`could not uniquely locate ${spec.primary.strategy}=${spec.primary.value}`);
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
