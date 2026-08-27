# @autoapply/engine

Playwright-shaped form walking will live here. The browser it drives is **SessionKit** (`enhanced_browser/`), not the Playwright Node package.

Read-only field inventory lives here (`extractFieldInventory`). Filling, recipes, and healing come later. Playwright is used to inspect local fixtures and to capture snapshots. Live applications are still driven by SessionKit.

## Captcha policy

SessionKit handles captchas. `goto(..., solve=True)` already runs Cloudflare click-through, checkbox/audio reCAPTCHA, then 2captcha if `TWOCAPTCHA_API_KEY` is set. Autoapply uses that path.

## 2FA

2FA is never bypassed. Detection → pause the run → notify → a human takes control → resume.
