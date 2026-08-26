# @autoapply/engine

Playwright-shaped form walking will live here. The browser it drives is **SessionKit** (`enhanced_browser/`), not the Playwright Node package.

Phase 0 only records that choice. Inventory, fill, recipes, and healing come in later phases.

## Captcha policy

SessionKit ships audio reCAPTCHA, Cloudflare click-through, and 2captcha helpers. Autoapply does **not** call them.

Detection → pause the run → notify → a human takes control → resume. That is architectural (`design.md` §13).
