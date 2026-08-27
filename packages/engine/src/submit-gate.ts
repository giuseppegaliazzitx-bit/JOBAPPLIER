import type { Page } from "playwright";

export type SubmitApproval = {
  userApproved: true;
};

export async function clickSubmit(page: Page, approval: SubmitApproval): Promise<void> {
  if (approval.userApproved !== true) {
    throw new Error("submit gate refused: user has not approved");
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
