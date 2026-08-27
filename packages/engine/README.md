# @autoapply/engine

Playwright-shaped form walking lives here. The live browser is **SessionKit** (`enhanced_browser/`), not the Playwright Node package. Playwright inspects fixtures and drives the local mock ATS.

The only submit is `clickSubmit` after `evaluateSubmitGate`. Walk, fill, and recipes never click Submit.

## Captcha policy

`CAPTCHA_POLICY = sessionkit_solve`. SessionKit `solve_challenges` runs Cloudflare click-through, checkbox/audio reCAPTCHA, then 2captcha if `TWOCAPTCHA_API_KEY` is set. On Playwright (mock ATS) the adapter is `sessionKitSolveCaptcha`. If that returns false, the walk blocks with `captcha` and the run pauses.

## 2FA

`TWO_FA_POLICY = detect_pause_notify`. 2FA is never solved. Detection → pause → notify → a human takes control → resume.

Email OTP (`EMAIL_OTP_POLICY = inbox_code`) is filled from a parsed inbox verification code. Authenticator 2FA is still never filled.
