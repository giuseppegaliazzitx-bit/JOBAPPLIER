import { evaluateSubmitGate, type SubmitGate } from "@autoapply/core";
import type { Page } from "playwright";

export type { SubmitGate };

export async function clickSubmit(page: Page, gate: SubmitGate): Promise<void> {
  const verdict = evaluateSubmitGate(gate);
  if (!verdict.ok) {
    throw new Error(`submit gate refused: ${verdict.reason}`);
  }
  const btn = page.locator("#submit-application").or(page.getByRole("button", { name: /submit application/i }));
  if ((await btn.count()) === 0) {
    throw new Error("submit control not found");
  }
  const previous = page.url();
  const waitNav = page.waitForURL((url) => url.toString() !== previous, { timeout: 15_000 });
  await btn.first().click();
  await waitNav.catch(() => undefined);
  await page.waitForLoadState("domcontentloaded");
}
