import type { Page } from "playwright";

export type ChallengeKind = "captcha" | "2fa" | null;

export async function detectChallenge(page: Page): Promise<ChallengeKind> {
  if ((await page.locator('[data-page="captcha"]').count()) > 0) {
    return "captcha";
  }
  if ((await page.locator('[data-page="two-factor"], [data-page="2fa"]').count()) > 0) {
    return "2fa";
  }
  const title = ((await page.title()) || "").toLowerCase();
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").toLowerCase();
  if (
    title.includes("verify you are human") ||
    body.includes("i'm not a robot") ||
    (await page.locator('iframe[title="reCAPTCHA"], iframe[src*="recaptcha"], .g-recaptcha, .cf-turnstile').count()) > 0
  ) {
    return "captcha";
  }
  if (
    title.includes("two-factor") ||
    title.includes("verification code") ||
    body.includes("authenticator app") ||
    body.includes("enter the code we sent")
  ) {
    return "2fa";
  }
  return null;
}

/**
 * SessionKit captcha path on a Playwright page (mock ATS / fixtures).
 * Live employer Chrome uses enhanced_browser Session.solve_challenges:
 * Cloudflare click, reCAPTCHA checkbox/audio, then 2captcha fallback.
 * 2FA is never solved here.
 */
export async function sessionKitSolveCaptcha(page: Page): Promise<boolean> {
  const pass = page.locator("#captcha-pass, [data-sessionkit-solve]");
  if ((await pass.count()) === 0) {
    return false;
  }
  await pass.first().click();
  const btn = page.getByRole("button", { name: /continue|verify/i });
  if ((await btn.count()) > 0) {
    const previous = page.url();
    const waitNav = page.waitForURL((url) => url.toString() !== previous, { timeout: 8000 });
    await btn.first().click();
    await waitNav.catch(() => undefined);
  }
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  return (await detectChallenge(page)) !== "captcha";
}
