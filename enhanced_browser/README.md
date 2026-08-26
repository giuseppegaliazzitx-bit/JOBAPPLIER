# SessionKit

Three files you drop into another project so an LLM (or you) can drive a real
browser and HTTP session against a website:

| file | what it is |
| --- | --- |
| `browser.py` | patchright launch, geoip, cookies, recaptcha audio, 2captcha, Cloudflare click, curl_cffi HTTP, proxy pool, basic interaction |
| `humanize.py` | Fitts / min-jerk pointer, typing with typos, scroll. Pure stdlib. |
| `proxies.txt` | one proxy per line |

That is the whole kit. Copy those three files (and this README) next to the
script you are writing. Do not rewrite `humanize.py`. Do not set `user_agent`
on the patchright context.

```python
from browser import Session

async with await Session.launch(proxy=None) as s:   # or load from proxies.txt
    await s.goto("https://example.com")
    await s.click("button.accept")
    await s.type("input[name=q]", "hood county")
    html = await s.content()
    api = await s.fetch("https://example.com/api/search")
```

---

## Install

```bash
pip uninstall -y playwright          # patchright replaces it
pip install patchright curl_cffi requests pydub SpeechRecognition
patchright install chrome            # real Google Chrome, not bundled chromium
# --channel chrome is the default. Needs Chrome installed on the machine.
# On a server prefer headful under a virtual display:
#     xvfb-run -a python your_script.py
```

Optional:

```bash
pip install 2captcha-python          # not required; browser.py talks to the HTTP API itself
```

Environment:

| var | purpose |
| --- | --- |
| `TWOCAPTCHA_API_KEY` | enables 2captcha fallback (also accepts `APIKEY_2CAPTCHA`) |
| `GEOIP_CACHE` | path for the on-disk geoip cache (default `.geoip_cache.json`) |

Audio reCAPTCHA needs `ffmpeg` on PATH (`pydub` decodes the mp3).

Self-test, no browser, no network:

```bash
python browser.py --selftest
```

---

## How a session is supposed to work

One `Session` is one identity: **one proxy, one geo cover, one cookie jar, one
browser profile**. Do not share a `Session` across workers. Do not share the
cookie jar. The original crawler this was extracted from scrambled result pages
that way (one `JSESSIONID` = one server-side cursor).

```
                    ┌─────────────────────────────────────────┐
  proxies.txt  ──►  │  Session                                │
                    │    proxy + geoip (tz/locale/latlon)     │
                    │                                         │
   first contact    │    patchright Chrome  ──cookies──►      │
   JS, captchas, CF │         humanize click/type             │
                    │                                         │
   afterwards       │    curl_cffi impersonate="chrome"       │
                    │         same UA, same jar, same proxy   │
                    └─────────────────────────────────────────┘
```

**Browser first, HTTP after.** `Session.goto()` is for pages. `Session.fetch()`
is for subsequent requests. If `fetch()` gets a Cloudflare HTML challenge it
escalates back to the browser, solves, re-syncs cookies, and retries once.

patchright rules (from the [patchright README](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)
— follow them, they are load-bearing):

1. `launch_persistent_context`, never `launch()` + `new_context()`.
2. Do **not** pass `user_agent=`.
3. Do **not** set extra HTTP headers on the context.
4. Do **not** call `add_init_script`.
5. Prefer `channel="chrome"` (real Chrome) over bundled chromium.
6. Isolated `user_data_dir` per session. Two Chromiums on one profile directory
   is the classic "worked once, then opens about:blank and exits".

`browser.py` already follows all six. If you extend it, do not undo them.

---

## Captcha policy

Fixed, in this order. Do not invert it.

1. **Visible reCAPTCHA** (the checkbox iframe, `iframe[title="reCAPTCHA"]`)
   → built-in `RecaptchaSolver`: human-click the checkbox, if a challenge
   appears switch to **audio**, download the mp3 *through the proxy*,
   `SpeechRecognition.recognize_google`, type the answer.
   This is the default for "normal" captchas.
2. **Cloudflare interstitial / Turnstile**
   → wait (patchright often auto-passes), then click the widget checkbox.
   Typical click is the left-centre of the `challenges.cloudflare.com` iframe.
3. **Anything the above cannot do** — image reCAPTCHA, invisible v2, v3,
   Turnstile that did not click-through → **2captcha**, if `TWOCAPTCHA_API_KEY`
   is set. Token is injected into the page (`g-recaptcha-response` /
   `cf-turnstile-response` + grecaptcha callback).
4. Google's `div.rc-doscaptcha-body` ("your computer or network may be sending
   automated queries") → `ProxyFlaggedError`. Retire that proxy. Do not retry
   audio on it; the audio challenge is disabled.

`await s.solve_challenges()` runs (2) then (1) then (3). `goto(..., solve=True)`
already calls it.

---

## Proxies

`proxies.txt`, one per line. `#` comments and blanks ignored.

```
http://user:pass@host:port
http://host:port:user:pass
host:port:user:pass
host:port
socks5://user:pass@host:port
```

Residential providers often append session/country tags to the **password**
(`pass_country-US_session-ABC123`). Those are part of the password — leave
them intact. Chromium does not support SOCKS5 **with** auth; HTTP/HTTPS
proxies with auth are fine.

```python
from browser import ProxyPool, Session, ProxyFlaggedError

pool = ProxyPool(path="proxies.txt")          # taken in order, never round-robin
proxy = pool.next()
try:
    async with await Session.launch(proxy=proxy) as s:
        await s.goto("https://example.com")
except ProxyFlaggedError:
    pool.flag(proxy)
    # start a new Session on pool.next()
```

A retired proxy is not put back until the list is exhausted, then the pool
wraps. GeoIP is resolved *through* the proxy (ip-api) and cached per proxy
in `.geoip_cache.json` so two runs on the same exit do not report different
timezones. `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` is
passed so STUN does not leak the real IP; verify on
[browserleaks.com](https://browserleaks.com/webrtc), do not trust the flag.

---

## API (the bits you actually call)

### Session

```python
s = await Session.launch(
    proxy="http://user:pass@host:port",  # or None for direct
    headless=False,
    channel="chrome",
    use_geoip=True,
    geoip_strict=False,                  # True -> GeoIPError on lookup fail
    user_data_dir=None,                  # None = fresh temp profile
    twocaptcha_key=None,                 # else TWOCAPTCHA_API_KEY
    timeout=30,
    cookie_file="cookies.json",          # load on start, save on close
)

await s.goto(url, wait_until="domcontentloaded", settle=1.5, solve=True)
await s.click("css or locator")          # humanize approach + dwell + press
await s.type("css or locator", "text")   # click-in, bigram timing, rare typos
await s.scroll(800)
await s.idle(2.0)
await s.wait("css", state="visible")
await s.exists("css")
await s.text("css")
await s.content()
await s.screenshot("out.png", full_page=False)

await s.solve_challenges()               # CF then recaptcha then 2captcha
await s.solve_cloudflare()
await s.solve_recaptcha()
token = await s.solve_recaptcha_v3(sitekey, action="verify")

r = await s.fetch(url, method="GET", escalate=True, **kwargs)
r = s.get(url)                           # sync, no CF escalate
r = s.post(url, data=..., json=...)

await s.pull_cookies()                   # browser -> HTTP jar
await s.push_cookies()                   # HTTP jar -> browser
s.save_cookies("cookies.json")
await s.load_cookies("cookies.json")

await s.close()                          # also an async context manager
```

`s.page` is the patchright `Page`. `s.http` is a `curl_cffi.requests.Session`
(`impersonate="chrome"`) or a `requests.Session` if curl_cffi is missing.
`s.geo` is `{timezone_id, locale, geolocation, _ip, _country}`.

Selectors: any Playwright locator string, or a locator object. See
[Page](https://playwright.dev/python/docs/api/class-page) and
[Locator](https://playwright.dev/python/docs/api/class-locator).

### humanize.py

```python
from humanize import (
    get_profile, PRESETS,
    human_click, human_type, human_move, human_idle, human_scroll,
)

# presets: "default", "careful", "brisk"
from browser import set_human_preset
set_human_preset("careful")
```

Do not call `locator.click()`. It warps the pointer to the geometric centre
and discards the approach path. `human_click` aims inside the box, dwells,
presses, releases.

### ProxyPool / geo / launch guts

```python
from browser import (
    load_proxies, parse_proxy_line, split_proxy, ProxyPool,
    geo_resolve, geo_chromium_args,
    launch_async, PatchrightBrowser,
    RecaptchaSolver, TwoCaptcha,
    ProxyFlaggedError, BrowserLaunchError, GeoIPError,
    CaptchaError, CloudflareChallenge,
)
```

You normally never call `launch_async` yourself; `Session.launch` does.

---

## LLM playbook

When you (an AI) are handed this kit and asked to work a website:

1. **Read this README and the module docstring of `browser.py`.** Then read
   the site with `Session.goto` before writing a pile of HTTP calls. Look at
   the form you actually landed on.
2. **Copy the three files as-is.** Do not inline humanize into browser.py. Do
   not add `user_agent=` to the context. Do not switch patchright back to
   playwright.
3. **One Session per identity.** Rotate by constructing a new Session on
   `pool.next()`, not by calling `context.new_page()` on a flagged proxy.
4. **Decide browser vs HTTP per step:**
   - anything with JS, a cookie wall, a captcha, a Cloudflare interstitial,
     or a form you have not seen yet → `s.goto` / `s.click` / `s.type`
   - JSON/XHR/document endpoints after cookies exist → `s.fetch` / `s.get`
   - `s.fetch` already escalates CF HTML back to the browser
5. **Captchas:** call `goto` (it solves) or `solve_challenges()`. Do not
   reach for 2captcha on a normal checkbox recaptcha — the audio solver is
   the path for that. Set `TWOCAPTCHA_API_KEY` when you see image recaptcha,
   invisible v2/v3, or a Turnstile that did not click-through.
6. **If `ProxyFlaggedError`:** `pool.flag(proxy)` and start a new Session.
   If `BrowserLaunchError`: that is local (profile lock, missing Chrome,
   orphaned process), not a block. Kill leftover chrome/node and retry.
7. **Persist cookies** with `cookie_file=` when the job is resumable. The
   jar never expires cookies on its own (`PersistentCookieJar`).
8. **Match geo to the proxy.** Leave `use_geoip=True`. The HTTP half of the
   session gets the same `Accept-Language` as the browser half.
9. **When stuck on a selector**, use Playwright docs, not guessed CSS. The
   running Chrome is a real Chrome; DevTools-style locators work.
10. **Do not** add stealth plugins, `navigator.webdriver` patches, random
    UA lists, or `page.evaluate` fingerprint spoofs. That is the opposite of
    what patchright is for.

Minimal script skeleton:

```python
import asyncio, logging
from browser import Session, ProxyPool, ProxyFlaggedError, BrowserLaunchError

logging.basicConfig(level=logging.INFO)

async def main():
    pool = ProxyPool(path="proxies.txt")
    proxy = pool.next()
    async with await Session.launch(proxy=proxy, cookie_file="cookies.json") as s:
        await s.goto("https://example.com")
        # ... work the page ...
        r = await s.fetch("https://example.com/api")
        print(r.status_code, r.text[:200])

if __name__ == "__main__":
    asyncio.run(main())
```

---

## Documentation (go here, don't invent)

| tool | docs |
| --- | --- |
| patchright | https://github.com/Kaliiiiiiiiii-Vinyzu/patchright |
| Playwright Python (the API patchright implements) | https://playwright.dev/python/docs/api/class-page |
| Playwright locators | https://playwright.dev/python/docs/locators |
| curl_cffi | https://github.com/lexiforest/curl_cffi |
| curl_cffi docs | https://curl-cffi.readthedocs.io/ |
| curl_cffi impersonate list | https://curl-cffi.readthedocs.io/en/latest/impersonate.html |
| 2captcha API | https://2captcha.com/api-docs |
| 2captcha reCAPTCHA v2 | https://2captcha.com/api-docs/recaptcha-v2 |
| 2captcha reCAPTCHA v3 | https://2captcha.com/api-docs/recaptcha-v3 |
| 2captcha Turnstile | https://2captcha.com/api-docs/cloudflare-turnstile |
| 2captcha Python helper (optional) | https://github.com/2captcha/2captcha-python |
| ip-api (geoip) | http://ip-api.com/docs |
| Cloudflare Turnstile | https://developers.cloudflare.com/turnstile/ |
| SpeechRecognition | https://pypi.org/project/SpeechRecognition/ |
| pydub | https://github.com/jiaaro/pydub |

`humanize.py` is original to this kit (Fitts 1954, Flash & Hogan 1985, Meyer
1988). There is no upstream doc; the file's docstring is the spec.

---

## What was extracted

Logic taken from a Tyler portal crawler (`hoodcounty.py`) and generalised so
it is not about any one site:

- patchright persistent-context launcher
- geoip through the proxy, cached, applied to both Chrome and HTTP
- recaptcha audio solver
- proxy line parser + in-order pool with retire-on-flag
- cookie handoff (browser earns, HTTP spends)
- humanize wrappers

Added so the stub is usable as tooling:

- 2captcha (v2 / v3 / Turnstile / image)
- Cloudflare click-then-2captcha
- curl_cffi HTTP with CF escalate-to-browser
- `Session` as the single object an LLM has to learn
