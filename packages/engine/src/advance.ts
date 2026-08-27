import type { Page } from "playwright";

export async function pageKind(page: Page): Promise<"form" | "review" | "confirmation" | "timeout" | "error"> {
  const timeout = page.locator("[data-page=timeout]");
  if ((await timeout.count()) > 0) {
    return "timeout";
  }
  const title = (await page.title()).toLowerCase();
  const heading = ((await page.locator("h1").first().innerText().catch(() => "")) || "").toLowerCase();
  if (title.includes("expired") || heading.includes("expired")) {
    return "timeout";
  }
  if (title.includes("received") || heading.includes("received") || heading.includes("thank you")) {
    return "confirmation";
  }
  const submit = page.locator("#submit-application, button[name=submit], button:has-text('Submit application')");
  if ((await submit.count()) > 0) {
    return "review";
  }
  return "form";
}

export async function clickContinue(page: Page): Promise<void> {
  const btn = page.getByRole("button", { name: "Continue" });
  if ((await btn.count()) === 0) {
    throw new Error("no Continue button on this step");
  }
  const previous = page.url();
  const waitNav = page.waitForURL((url) => url.toString() !== previous, { timeout: 10_000 });
  await btn.first().click();
  await waitNav.catch(() => undefined);
  await page.waitForLoadState("domcontentloaded");
}
