# @autoapply/engine

Playwright-shaped form walking will live here. The browser it drives is **SessionKit** (`enhanced_browser/`), not the Playwright Node package.

Phase 0 only records that choice. Inventory, fill, recipes, and healing come in later phases.

## Captcha policy

SessionKit handles captchas. `goto(..., solve=True)` already runs Cloudflare click-through, checkbox/audio reCAPTCHA, then 2captcha if `TWOCAPTCHA_API_KEY` is set. Autoapply uses that path.

## 2FA

2FA is never bypassed. Detection → pause the run → notify → a human takes control → resume.
