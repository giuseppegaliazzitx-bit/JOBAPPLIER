#!/usr/bin/env python3
"""SessionKit — drop-in browser + HTTP stub.

Put these three files next to your script and import from here:

    browser.py      this file
    humanize.py     Fitts / min-jerk pointer, typing, scroll
    proxies.txt     one proxy per line (see README)

    from browser import Session

    async with await Session.launch() as s:
        await s.goto("https://example.com")
        await s.click("button#go")
        await s.type("input[name=q]", "query")
        r = await s.fetch("https://example.com/api")   # curl_cffi, same cookies

Read README.md before writing a scraper. It is the operating manual for the
LLM that consumes this kit, including when to use the browser vs HTTP and
which captcha path to take.

Tools this wraps (read their docs when you get stuck):

    patchright   https://github.com/Kaliiiiiiiiii-Vinyzu/patchright
                 Playwright API: https://playwright.dev/python/docs/api/class-page
                 MUST use launch_persistent_context. Do NOT set user_agent,
                 extra HTTP headers, or add_init_script — those reintroduce
                 the JS-visible patches patchright exists to remove.
    curl_cffi    https://github.com/lexiforest/curl_cffi
                 docs: https://curl-cffi.readthedocs.io/
                 impersonate="chrome" for TLS/JA3/HTTP2. Fallback: requests.
    2captcha     https://2captcha.com/api-docs
                 Turnstile: https://2captcha.com/api-docs/cloudflare-turnstile
                 reCAPTCHA v2: https://2captcha.com/api-docs/recaptcha-v2
    ip-api       http://ip-api.com/docs          (geoip through the proxy)
    humanize.py  sibling; motor-control pointer, not a third-party humanizer

Captcha policy (fixed):
    1. Visible reCAPTCHA checkbox / audio  -> RecaptchaSolver (this file)
    2. Cloudflare interstitial / Turnstile -> click in the browser first
    3. Image reCAPTCHA, invisible v2/v3, Turnstile that did not click-through
       -> 2captcha if TWOCAPTCHA_API_KEY is set
    4. After the browser has earned cookies, subsequent HTTP uses curl_cffi
       on the same proxy / UA / cookie jar. If HTTP hits a CF challenge page,
       escalate back to the browser, re-sync cookies, retry.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Union
from urllib.parse import unquote, urlparse

import requests
from requests.cookies import RequestsCookieJar

from humanize import (
    get_profile as get_human_profile,
    human_click as _human_click,
    human_idle as _human_idle,
    human_move as _human_move,
    human_scroll as _human_scroll,
    human_type as _human_type,
)

LOG = logging.getLogger("sessionkit")

try:
    from patchright.async_api import BrowserContext, Page, async_playwright
except ImportError:  # pragma: no cover
    BrowserContext = Page = Any  # type: ignore
    async_playwright = None  # type: ignore

try:
    from curl_cffi import requests as cf_requests
    HAS_CFFI = True
except ImportError:
    cf_requests = None  # type: ignore
    HAS_CFFI = False


# --------------------------------------------------------------------------- #
# Exceptions
# --------------------------------------------------------------------------- #
class ProxyFlaggedError(Exception):
    """Proxy is blocked by Google's reCAPTCHA DOS page (rc-doscaptcha-body)."""


class BrowserLaunchError(Exception):
    """Browser process died or never became usable. Local/environment problem,
    not a remote block — check orphaned chromium, profile locks, channel."""


class GeoIPError(Exception):
    """Could not profile a proxy's exit location while geoip_strict=True."""


class CaptchaError(Exception):
    """A captcha was present and could not be solved."""


class CloudflareChallenge(Exception):
    """HTTP response is a Cloudflare challenge page; use the browser."""


# --------------------------------------------------------------------------- #
# Humanize wrappers — preset is process-wide, rebound via set_human_preset()
# --------------------------------------------------------------------------- #
HUMAN = get_human_profile("careful")

LocatorLike = Any


def set_human_preset(name: str = "careful", **overrides: Any) -> None:
    """'default' | 'careful' | 'brisk'. See humanize.PRESETS."""
    global HUMAN
    HUMAN = get_human_profile(name, **overrides)


async def human_click(page: Page, locator: LocatorLike, is_input: bool = False) -> None:
    await _human_click(page, locator, HUMAN, is_input=is_input)


async def human_type(page: Page, locator: LocatorLike, text: str) -> None:
    await _human_type(page, locator, text, HUMAN)


async def human_move(page: Page, x: float, y: float) -> None:
    await _human_move(page, x, y, HUMAN)


async def human_idle(page: Page, seconds: float) -> None:
    await _human_idle(page, seconds, HUMAN)


async def human_scroll(page: Page, delta_y: float) -> None:
    await _human_scroll(page, delta_y, HUMAN)


async def real_user_agent(page: Page) -> str:
    """UA Chrome actually sends — pair this with cookies handed to HTTP."""
    return await page.evaluate("() => navigator.userAgent")


def _as_locator(page: Page, target: Union[str, LocatorLike]) -> LocatorLike:
    if isinstance(target, str):
        return page.locator(target)
    return target


# Fallback only. Overwritten from navigator.userAgent after launch.
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


# --------------------------------------------------------------------------- #
# GEOIP  (replaces cloakbrowser geoip=True)
# --------------------------------------------------------------------------- #
# Context options are fixed at launch — there is no context.setTimezone()
# afterwards — so the lookup has to finish before launch_persistent_context.

_GEO_CACHE: Dict[str, Dict[str, Any]] = {}
_GEO_LOCK = threading.Lock()
_GEO_CACHE_PATH = os.environ.get("GEOIP_CACHE", ".geoip_cache.json")

_COUNTRY_LOCALE = {
    "US": "en-US", "CA": "en-CA", "GB": "en-GB", "IE": "en-IE",
    "AU": "en-AU", "NZ": "en-NZ", "DE": "de-DE", "AT": "de-AT",
    "CH": "de-CH", "FR": "fr-FR", "BE": "fr-BE", "ES": "es-ES",
    "MX": "es-MX", "AR": "es-AR", "IT": "it-IT", "NL": "nl-NL",
    "PT": "pt-PT", "BR": "pt-BR", "PL": "pl-PL", "SE": "sv-SE",
    "NO": "nb-NO", "DK": "da-DK", "FI": "fi-FI", "CZ": "cs-CZ",
    "RO": "ro-RO", "JP": "ja-JP", "KR": "ko-KR", "IN": "en-IN",
    "SG": "en-SG", "ZA": "en-ZA", "TR": "tr-TR", "RU": "ru-RU",
    "UA": "uk-UA", "IL": "he-IL", "AE": "ar-AE",
}

_GEO_DEFAULT: Dict[str, Any] = {
    "timezone_id": "America/Chicago",
    "locale": "en-US",
    "geolocation": None,
    "_ip": None,
    "_country": None,
}


def _geo_load_cache() -> None:
    if not os.path.exists(_GEO_CACHE_PATH):
        return
    try:
        with open(_GEO_CACHE_PATH, "r", encoding="utf-8") as fh:
            _GEO_CACHE.update(json.load(fh))
    except (OSError, json.JSONDecodeError) as e:
        LOG.debug("geoip cache unreadable (%s); starting empty", e)


def _geo_save_cache() -> None:
    try:
        tmp = _GEO_CACHE_PATH + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(_GEO_CACHE, fh)
        os.replace(tmp, _GEO_CACHE_PATH)
    except OSError as e:
        LOG.debug("could not persist geoip cache: %s", e)


_geo_load_cache()


def _geo_lookup_sync(proxy: Optional[str], timeout: int = 15) -> Dict[str, Any]:
    """Query ip-api *through the proxy* so the observed IP is the exit IP.

    Fresh session on purpose: do not hand the target site's cookies to a
    third party just because that session already has the proxy configured.
    """
    s = requests.Session()
    if proxy:
        s.proxies = {"http": proxy, "https": proxy}
    s.headers.update({"Accept": "application/json"})
    r = s.get(
        "http://ip-api.com/json/"
        "?fields=status,message,countryCode,timezone,lat,lon,query",
        timeout=timeout,
    )
    r.raise_for_status()
    data = r.json()
    if data.get("status") != "success":
        raise RuntimeError(f"geoip lookup failed: {data.get('message')!r}")
    return data


def _geo_to_kwargs(data: Dict[str, Any]) -> Dict[str, Any]:
    country = (data.get("countryCode") or "").upper()
    out: Dict[str, Any] = {
        "timezone_id": data.get("timezone") or _GEO_DEFAULT["timezone_id"],
        "locale": _COUNTRY_LOCALE.get(country, _GEO_DEFAULT["locale"]),
        "geolocation": None,
        "_ip": data.get("query"),
        "_country": country or None,
    }
    lat, lon = data.get("lat"), data.get("lon")
    if lat is not None and lon is not None:
        # City-level. Claiming 5-metre accuracy off an IP lookup is itself
        # implausible, so keep it coarse.
        out["geolocation"] = {
            "latitude": float(lat),
            "longitude": float(lon),
            "accuracy": 5000,
        }
    if country and country not in _COUNTRY_LOCALE:
        LOG.warning("no locale mapping for country %s; using %s",
                    country, _GEO_DEFAULT["locale"])
    return out


async def geo_resolve(proxy: Optional[str], timeout: int = 15,
                      strict: bool = False) -> Dict[str, Any]:
    """Context kwargs for this proxy, cached per proxy and persisted to disk.

    The cache is not an optimisation. Two sessions on the same proxy reporting
    different timezones is worse than no spoofing at all.
    """
    key = proxy or "__direct__"
    with _GEO_LOCK:
        if key in _GEO_CACHE:
            return dict(_GEO_CACHE[key])

    try:
        data = await asyncio.to_thread(_geo_lookup_sync, proxy, timeout)
        kwargs = _geo_to_kwargs(data)
        LOG.info("proxy exit %s -> %s / %s", kwargs.get("_ip"),
                 kwargs["timezone_id"], kwargs["locale"])
    except Exception as e:
        if strict:
            raise GeoIPError(f"{proxy or 'direct'}: {e}") from e
        LOG.warning("geoip lookup failed for %s (%s); using defaults",
                    proxy or "direct", e)
        kwargs = dict(_GEO_DEFAULT)

    with _GEO_LOCK:
        _GEO_CACHE[key] = kwargs
        _geo_save_cache()
    return dict(kwargs)


def geo_chromium_args(geo: Dict[str, Any]) -> List[str]:
    """Flags reinforcing the context options.

    The WebRTC one is the important one. An HTTP proxy does not carry UDP, so
    STUN candidate gathering leaves over your real interface and hands out the
    true IP no matter how correct the timezone is. Verify on browserleaks
    rather than trusting the flag.
    """
    args = ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"]
    if geo.get("locale"):
        args.append(f"--lang={geo['locale']}")
    return args


# --------------------------------------------------------------------------- #
# Proxies
# --------------------------------------------------------------------------- #
_MD_LINK = re.compile(r"^\[[^\]]*\]\(([^)]+)\)(.*)$")


def parse_proxy_line(line: str) -> Optional[str]:
    """Normalise one proxies.txt line to 'scheme://user:pass@host:port'.

    Accepted:
        http://user:pass@host:port
        http://host:port:user:pass
        host:port:user:pass
        host:port
        socks5://user:pass@host:port
        [label](http://host:port:user:pass)     markdown link leftover
    Blank lines and '# ...' comments are ignored.
    """
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    m = _MD_LINK.match(line)
    if m:
        line = m.group(1) + (m.group(2) or "")
    scheme = "http"
    if "://" in line:
        scheme, line = line.split("://", 1)
    parts = line.split(":")
    if len(parts) == 4:
        host, port, user, pw = parts
        return f"{scheme}://{user}:{pw}@{host}:{port}"
    if len(parts) == 2:
        return f"{scheme}://{parts[0]}:{parts[1]}"
    if "@" in line:
        return f"{scheme}://{line}"
    LOG.warning("Skipping unparseable proxy line: %r", line)
    return None


def load_proxies(path: str = "proxies.txt") -> List[str]:
    with open(path, "r", encoding="utf-8") as fh:
        out = [p for p in (parse_proxy_line(l) for l in fh) if p]
    if not out:
        raise FileNotFoundError(f"No usable proxies parsed from {path}")
    LOG.info("Loaded %d proxies from %s", len(out), path)
    return out


def split_proxy(proxy_url: str) -> Dict[str, str]:
    """'http://user:pw@host:port' -> Playwright proxy dict.

    Chromium will not reliably honour credentials embedded in the server URL,
    and it does not support SOCKS5 *with* auth at all. Split them out.
    """
    u = urlparse(proxy_url)
    if not u.hostname:
        raise ValueError(f"unparseable proxy url: {proxy_url!r}")
    server = f"{u.scheme or 'http'}://{u.hostname}"
    if u.port:
        server += f":{u.port}"
    out: Dict[str, str] = {"server": server}
    if u.username:
        out["username"] = unquote(u.username)
    if u.password:
        out["password"] = unquote(u.password)
    return out


class ProxyPool:
    """Taken in order, never round-robin. A retired proxy is not put back
    until the list is exhausted, then we wrap from the top.

    flag() a proxy that raised ProxyFlaggedError — it is spent for this run.
    """

    def __init__(self, proxies: Optional[Sequence[Optional[str]]] = None,
                 path: Optional[str] = None):
        if proxies is None:
            proxies = load_proxies(path or "proxies.txt") if (
                path or os.path.exists("proxies.txt")
            ) else [None]
        self._all: List[Optional[str]] = list(proxies) if proxies else [None]
        self._available: List[Optional[str]] = list(self._all)
        self.retired = 0

    def next(self) -> Optional[str]:
        if not self._available:
            LOG.warning("All %d proxies retired; wrapping the list", len(self._all))
            self._available = list(self._all)
        return self._available.pop(0)

    def flag(self, proxy: Optional[str]) -> None:
        self.retired += 1
        self._available = [p for p in self._available if p != proxy]
        LOG.warning("Retired proxy %s (%d left)", proxy or "direct",
                    len(self._available))

    def __len__(self) -> int:
        return len(self._all)


# --------------------------------------------------------------------------- #
# Cookies. Browser earns them; HTTP spends them. One jar, never shared
# across Session instances (sharing a JSESSIONID shares server-side state).
# --------------------------------------------------------------------------- #
class PersistentCookieJar(RequestsCookieJar):
    def set_cookie(self, cookie, *args, **kwargs):
        cookie.expires = None
        cookie.discard = False
        super().set_cookie(cookie, *args, **kwargs)

    def clear_expired_cookies(self):
        pass


def cookies_playwright_shape(jar) -> List[Dict[str, Any]]:
    """requests/curl_cffi jar -> page.context.add_cookies() payload."""
    out = []
    for c in jar:
        domain = getattr(c, "domain", None) or ""
        out.append({
            "name": c.name,
            "value": c.value,
            "domain": domain,
            "path": getattr(c, "path", None) or "/",
            "secure": bool(getattr(c, "secure", False)),
            "httpOnly": bool(getattr(c, "rest", {}).get("HttpOnly", False))
            if hasattr(c, "rest") else False,
        })
    return out


def adopt_into_jar(jar, browser_cookies: List[Dict[str, Any]]) -> int:
    """Copy Playwright cookies into a requests-like jar. Returns count kept."""
    kept = 0
    for c in browser_cookies:
        domain, name = (c.get("domain") or "").strip(), c.get("name")
        if not name:
            continue
        kwargs: Dict[str, Any] = {
            "path": c.get("path") or "/",
        }
        if domain:
            kwargs["domain"] = domain
        try:
            jar.set(name, c.get("value", ""), **kwargs)
        except Exception:
            jar.set(name, c.get("value", ""))
        kept += 1
    return kept


# --------------------------------------------------------------------------- #
# PATCHRIGHT LAUNCHER  (replaces cloakbrowser.launch_async)
# --------------------------------------------------------------------------- #
_TEMP_PROFILES: List[str] = []


class PatchrightBrowser:
    """Owns the Playwright driver process. Forgetting to stop that driver is
    a real cause of 'run #1 works, run #2 finds the profile locked'."""

    def __init__(self, pw, context: BrowserContext, user_data_dir: str,
                 owns_dir: bool):
        self._pw = pw
        self.context = context
        self.user_data_dir = user_data_dir
        self._owns_dir = owns_dir

    async def new_page(self) -> Page:
        if self.context.pages:
            return self.context.pages[0]
        return await self.context.new_page()

    async def close(self) -> None:
        try:
            await self.context.close()
        except Exception as e:
            LOG.debug("context.close() failed: %s", e)
        try:
            await self._pw.stop()
        except Exception as e:
            LOG.debug("playwright.stop() failed: %s", e)
        if self._owns_dir:
            shutil.rmtree(self.user_data_dir, ignore_errors=True)


async def launch_async(
    *,
    headless: bool = False,
    proxy: Optional[str] = None,
    user_data_dir: Optional[str] = None,
    channel: str = "chrome",
    timezone_id: Optional[str] = None,
    locale: Optional[str] = None,
    geolocation: Optional[Dict[str, float]] = None,
    args: Optional[List[str]] = None,
) -> PatchrightBrowser:
    """launch_persistent_context, not launch() + new_context().

    patchright is explicit about this: a freshly created BrowserContext is
    itself a detection signal, so the persistent profile is the supported path.
    Equally: do not pass user_agent=, do not set extra HTTP headers on the
    context, do not call add_init_script.
    """
    if async_playwright is None:
        raise BrowserLaunchError(
            "patchright is not installed. pip install patchright && "
            "patchright install chrome  "
            "(https://github.com/Kaliiiiiiiiii-Vinyzu/patchright)"
        )
    owns_dir = user_data_dir is None
    if owns_dir:
        user_data_dir = tempfile.mkdtemp(prefix="sessionkit-profile-")
        _TEMP_PROFILES.append(user_data_dir)

    ctx_kwargs: Dict[str, Any] = {
        "user_data_dir": user_data_dir,
        "channel": channel,
        "headless": headless,
        "no_viewport": True,
    }
    if proxy:
        ctx_kwargs["proxy"] = split_proxy(proxy)
    if timezone_id:
        ctx_kwargs["timezone_id"] = timezone_id
    if locale:
        ctx_kwargs["locale"] = locale
    if geolocation:
        ctx_kwargs["geolocation"] = geolocation
        ctx_kwargs["permissions"] = ["geolocation"]
    if args:
        ctx_kwargs["args"] = args

    pw = await async_playwright().start()
    try:
        context = await pw.chromium.launch_persistent_context(**ctx_kwargs)
    except Exception:
        try:
            await pw.stop()
        finally:
            if owns_dir:
                shutil.rmtree(user_data_dir, ignore_errors=True)
        raise
    return PatchrightBrowser(pw, context, user_data_dir, owns_dir)


# --------------------------------------------------------------------------- #
# HTTP client — curl_cffi (Chrome TLS) with requests fallback
# --------------------------------------------------------------------------- #
def _new_http_session(impersonate: str = "chrome"):
    if HAS_CFFI:
        return cf_requests.Session(impersonate=impersonate)
    LOG.warning("curl_cffi not installed; HTTP will use requests "
                "(Python TLS fingerprint). pip install curl_cffi  "
                "https://github.com/lexiforest/curl_cffi")
    s = requests.Session()
    s.cookies = PersistentCookieJar()
    return s


def _looks_like_cf_html(text: str, status: int = 0) -> bool:
    if not text:
        return False
    head = text[:4000].lower()
    if status in (403, 503) and (
        "just a moment" in head
        or "cf-browser-verification" in head
        or "challenge-platform" in head
        or "cdn-cgi/challenge-platform" in head
        or "_cf_chl" in head
    ):
        return True
    if "<title>just a moment" in head:
        return True
    return False


# --------------------------------------------------------------------------- #
# Recaptcha Solver — audio challenge (the built-in path)
# --------------------------------------------------------------------------- #
class RecaptchaSolver:
    """Checkbox + audio challenge. Uses the page for clicks and a proxy-
    configured HTTP session to fetch the mp3 (Google serves it to the exit IP).

    Requires: pydub, SpeechRecognition, and ffmpeg on PATH.
    """

    def __init__(self, page: Page, session: Any) -> None:
        self.page = page
        self.session = session

    def _process_audio_challenge_sync(self, audio_url: str) -> str:
        import pydub
        import speech_recognition

        tmpdir = tempfile.gettempdir()
        mp3_path = wav_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False,
                                             dir=tmpdir) as tmp_mp3:
                mp3_path = tmp_mp3.name
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False,
                                             dir=tmpdir) as tmp_wav:
                wav_path = tmp_wav.name

            r = self.session.get(audio_url, stream=True, timeout=15)
            r.raise_for_status()
            with open(mp3_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    f.write(chunk)

            sound = pydub.AudioSegment.from_mp3(mp3_path)
            sound.export(wav_path, format="wav")

            recognizer = speech_recognition.Recognizer()
            with speech_recognition.AudioFile(wav_path) as source:
                audio_data = recognizer.record(source)
            return recognizer.recognize_google(audio_data)
        finally:
            for path in (mp3_path, wav_path):
                if path and os.path.exists(path):
                    try:
                        os.remove(path)
                    except OSError:
                        pass

    async def present(self) -> bool:
        return await self.page.locator('iframe[title="reCAPTCHA"]').count() > 0

    async def solve(self) -> None:
        if not await self.present():
            LOG.debug("No reCAPTCHA frame present.")
            return

        checkbox_frame = self.page.frame_locator('iframe[title="reCAPTCHA"]')
        await human_click(self.page, checkbox_frame.locator(".rc-anchor-content"))
        await asyncio.sleep(2)

        # Passed on the checkbox click (no challenge iframe).
        if await self.page.locator('iframe[title*="recaptcha challenge"]').count() == 0:
            LOG.info("reCAPTCHA accepted the checkbox click.")
            return

        challenge_frame = self.page.frame_locator(
            'iframe[title*="recaptcha challenge"]'
        )
        audio_btn = challenge_frame.locator(".rc-button-audio")
        if await audio_btn.count() == 0:
            raise CaptchaError(
                "reCAPTCHA image challenge with no audio button — "
                "use TwoCaptcha (TWOCAPTCHA_API_KEY) for this one"
            )
        await audio_btn.click()

        try:
            await self.page.locator("div.rc-doscaptcha-body").wait_for(
                state="visible", timeout=3000)
            raise ProxyFlaggedError(
                "reCAPTCHA block detected. Audio challenge impossible."
            )
        except ProxyFlaggedError:
            raise
        except Exception:
            pass

        audio_locator = challenge_frame.locator("#audio-source")
        await audio_locator.wait_for(state="attached")
        audio_url = await audio_locator.get_attribute("src")
        if not audio_url:
            raise CaptchaError("Could not find reCAPTCHA audio URL")

        LOG.debug("Downloading and processing audio...")
        text = await asyncio.to_thread(self._process_audio_challenge_sync, audio_url)
        LOG.debug("Recognized audio text: %s", text)

        response_input = challenge_frame.locator("#audio-response")
        await response_input.fill(text)
        await response_input.press("Enter")
        await asyncio.sleep(1)


# --------------------------------------------------------------------------- #
# 2captcha — image / invisible reCAPTCHA, Turnstile that did not click-through
# --------------------------------------------------------------------------- #
class TwoCaptcha:
    """Thin client for https://2captcha.com/api-docs (in.php / res.php).

    Do not send these API calls through the residential proxy — 2captcha's
    workers solve from their own IPs. Key from TWOCAPTCHA_API_KEY or arg.
    """

    IN_URL = "https://2captcha.com/in.php"
    RES_URL = "https://2captcha.com/res.php"

    def __init__(self, api_key: Optional[str] = None, timeout: int = 120):
        self.api_key = api_key or os.environ.get("TWOCAPTCHA_API_KEY") \
            or os.environ.get("APIKEY_2CAPTCHA")
        self.timeout = timeout
        self._http = requests.Session()

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _submit(self, **fields) -> str:
        if not self.api_key:
            raise CaptchaError("TWOCAPTCHA_API_KEY is not set")
        fields.update(key=self.api_key, json=1)
        r = self._http.post(self.IN_URL, data=fields, timeout=30)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != 1:
            raise CaptchaError(f"2captcha in.php: {data}")
        return str(data["request"])

    def _poll(self, task_id: str) -> str:
        deadline = time.time() + self.timeout
        time.sleep(5)
        while time.time() < deadline:
            r = self._http.get(
                self.RES_URL,
                params={"key": self.api_key, "action": "get",
                        "id": task_id, "json": 1},
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            if data.get("status") == 1:
                return str(data["request"])
            if data.get("request") not in ("CAPCHA_NOT_READY", "CAPTCHA_NOT_READY"):
                raise CaptchaError(f"2captcha res.php: {data}")
            time.sleep(5)
        raise CaptchaError(f"2captcha timed out after {self.timeout}s")

    def recaptcha_v2(self, sitekey: str, pageurl: str,
                     invisible: bool = False) -> str:
        fields = {
            "method": "userrecaptcha",
            "googlekey": sitekey,
            "pageurl": pageurl,
        }
        if invisible:
            fields["invisible"] = 1
        return self._poll(self._submit(**fields))

    def recaptcha_v3(self, sitekey: str, pageurl: str,
                     action: str = "verify", min_score: float = 0.7) -> str:
        return self._poll(self._submit(
            method="userrecaptcha",
            googlekey=sitekey,
            pageurl=pageurl,
            version="v3",
            action=action,
            min_score=min_score,
        ))

    def turnstile(self, sitekey: str, pageurl: str,
                  action: Optional[str] = None,
                  data: Optional[str] = None,
                  pagedata: Optional[str] = None) -> str:
        fields: Dict[str, Any] = {
            "method": "turnstile",
            "sitekey": sitekey,
            "pageurl": pageurl,
        }
        if action:
            fields["action"] = action
        if data:
            fields["data"] = data
        if pagedata:
            fields["pagedata"] = pagedata
        return self._poll(self._submit(**fields))

    def image(self, b64: str) -> str:
        return self._poll(self._submit(method="base64", body=b64))


_INJECT_RECAPTCHA_V2 = """
(token) => {
  const areas = [
    ...document.querySelectorAll(
      '#g-recaptcha-response, textarea[name="g-recaptcha-response"], textarea[id^="g-recaptcha-response"]'
    ),
  ];
  for (const el of areas) {
    el.style.display = 'block';
    el.value = token;
    el.innerHTML = token;
  }
  if (typeof ___grecaptcha_cfg !== 'undefined') {
    const walk = (obj, depth) => {
      if (!obj || depth > 5) return;
      if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) {
          if (k === 'callback' && typeof obj[k] === 'function') {
            try { obj[k](token); } catch (e) {}
          } else if (typeof obj[k] === 'object') {
            walk(obj[k], depth + 1);
          }
        }
      }
    };
    for (const cid of Object.keys(___grecaptcha_cfg.clients || {})) {
      walk(___grecaptcha_cfg.clients[cid], 0);
    }
  }
}
"""

_INJECT_TURNSTILE = """
(token) => {
  for (const el of document.querySelectorAll(
      '[name="cf-turnstile-response"], input[name="cf-turnstile-response"], [name="g-recaptcha-response"]')) {
    el.value = token;
  }
  if (typeof turnstile !== 'undefined' && turnstile.getResponse) {
    try { /* widget already has a callback path */ } catch (e) {}
  }
  const ev = new Event('input', { bubbles: true });
  for (const el of document.querySelectorAll('[name="cf-turnstile-response"]')) {
    el.dispatchEvent(ev);
  }
}
"""


async def _sitekey_from_page(page: Page) -> Optional[str]:
    return await page.evaluate(
        """() => {
          const el = document.querySelector(
            '[data-sitekey], .g-recaptcha, .cf-turnstile, [data-turnstile-sitekey]'
          );
          if (el) {
            return el.getAttribute('data-sitekey')
                || el.getAttribute('data-turnstile-sitekey');
          }
          const iframe = document.querySelector(
            'iframe[src*="recaptcha"], iframe[src*="turnstile"], iframe[src*="challenges.cloudflare.com"]'
          );
          if (iframe && iframe.src) {
            try {
              const u = new URL(iframe.src);
              return u.searchParams.get('k') || u.searchParams.get('sitekey');
            } catch (e) { return null; }
          }
          return null;
        }"""
    )


# --------------------------------------------------------------------------- #
# Cloudflare — click first, 2captcha Turnstile if the click does not pass
# --------------------------------------------------------------------------- #
_CF_IFRAME = (
    "iframe[src*='challenges.cloudflare.com'], "
    "iframe[src*='turnstile']"
)


async def cloudflare_present(page: Page) -> bool:
    try:
        title = (await page.title() or "").lower()
    except Exception:
        title = ""
    if "just a moment" in title:
        return True
    if await page.locator(_CF_IFRAME).count() > 0:
        return True
    if await page.locator("#challenge-running, #cf-challenge-running, "
                           ".cf-turnstile, #challenge-stage").count() > 0:
        return True
    return False


async def click_cloudflare(page: Page, timeout: float = 25.0) -> bool:
    """Try to pass a CF interstitial by waiting, then clicking the widget.

    patchright + real Chrome often auto-passes; the click is the backup.
    Returns True if the challenge is gone.
    """
    deadline = time.monotonic() + timeout

    # Give CF's JS a beat to auto-solve before we touch the widget.
    for _ in range(6):
        if not await cloudflare_present(page):
            return True
        await asyncio.sleep(0.8)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=1500)
        except Exception:
            pass

    iframe = page.locator(_CF_IFRAME).first
    if await iframe.count() > 0:
        box = await iframe.bounding_box()
        if box and box.get("width", 0) > 0:
            # Checkbox sits in the left-centre of the Turnstile widget.
            x = box["x"] + min(28.0, box["width"] * 0.12)
            y = box["y"] + box["height"] * 0.5
            await human_move(page, x, y)
            await page.mouse.click(x, y)
        else:
            try:
                frame = page.frame_locator(_CF_IFRAME).first
                await human_click(page, frame.locator("body"))
            except Exception as e:
                LOG.debug("CF iframe click failed: %s", e)

    while time.monotonic() < deadline:
        if not await cloudflare_present(page):
            return True
        await asyncio.sleep(0.6)
    return not await cloudflare_present(page)


# --------------------------------------------------------------------------- #
# Session — one identity: proxy + geo + browser + cookies + HTTP
# --------------------------------------------------------------------------- #
class Session:
    """One browser-authenticated identity.

    The browser is used for first contact, JS pages, and captchas. After
    cookies are earned, Session.fetch() / Session.http drive curl_cffi on
    the same proxy, UA, locale and jar. A CF HTML response escalates back
    to the browser automatically.
    """

    def __init__(
        self,
        *,
        proxy: Optional[str] = None,
        headless: bool = False,
        channel: str = "chrome",
        use_geoip: bool = True,
        geoip_strict: bool = False,
        user_data_dir: Optional[str] = None,
        twocaptcha_key: Optional[str] = None,
        timeout: int = 30,
        impersonate: str = "chrome",
        cookie_file: Optional[str] = None,
    ) -> None:
        self.proxy = proxy
        self.headless = headless
        self.channel = channel
        self.use_geoip = use_geoip
        self.geoip_strict = geoip_strict
        self.user_data_dir = user_data_dir
        self.timeout = timeout
        self.impersonate = impersonate
        self.cookie_file = cookie_file
        self.geo: Dict[str, Any] = dict(_GEO_DEFAULT)

        self.http = _new_http_session(impersonate)
        self.http.headers.update({
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })
        if proxy:
            self.http.proxies = {"http": proxy, "https": proxy}

        self.twocaptcha = TwoCaptcha(twocaptcha_key)
        self.browser: Optional[PatchrightBrowser] = None
        self.page: Optional[Page] = None
        self.lock = asyncio.Lock()

    # -- construction ------------------------------------------------------- #
    @classmethod
    async def launch(cls, **kwargs) -> "Session":
        s = cls(**kwargs)
        await s.start()
        return s

    async def start(self) -> "Session":
        if self.use_geoip:
            self.geo = await geo_resolve(self.proxy, timeout=self.timeout,
                                         strict=self.geoip_strict)
            if self.geo.get("locale"):
                self.http.headers["Accept-Language"] = (
                    f"{self.geo['locale']},en;q=0.9"
                )

        kwargs: Dict[str, Any] = {
            "headless": self.headless,
            "channel": self.channel,
            "user_data_dir": self.user_data_dir,
        }
        if self.proxy:
            kwargs["proxy"] = self.proxy
            kwargs["args"] = geo_chromium_args(self.geo)
        if self.use_geoip:
            kwargs["timezone_id"] = self.geo.get("timezone_id")
            kwargs["locale"] = self.geo.get("locale")
            if self.geo.get("geolocation"):
                kwargs["geolocation"] = self.geo["geolocation"]

        last: Optional[Exception] = None
        for attempt in range(3):
            try:
                self.browser = await asyncio.wait_for(
                    launch_async(**kwargs), timeout=90)
                self.page = await asyncio.wait_for(
                    self.browser.new_page(), timeout=45)
                await asyncio.wait_for(self.page.goto("about:blank"), timeout=20)
                break
            except Exception as e:
                last = e
                LOG.warning("Browser launch attempt %d/3 failed: %s",
                            attempt + 1, e)
                await self._force_close()
                await asyncio.sleep(2 * (attempt + 1))
        else:
            raise BrowserLaunchError(
                f"browser never became usable after 3 attempts: {last}. "
                "Kill orphaned chrome/node processes, confirm "
                "`patchright install chrome` ran, and the --channel binary exists."
            )

        try:
            self.http.headers["User-Agent"] = await real_user_agent(self.page)
        except Exception as e:
            LOG.warning("Could not read navigator.userAgent (%s)", e)

        if self.cookie_file and os.path.exists(self.cookie_file):
            await self.load_cookies(self.cookie_file)
        return self

    async def _force_close(self) -> None:
        if self.browser is None:
            return
        try:
            await asyncio.wait_for(self.browser.close(), timeout=20)
        except Exception as e:
            LOG.debug("browser.close() failed: %s", e)
        self.browser = None
        self.page = None

    async def close(self) -> None:
        if self.cookie_file:
            try:
                self.save_cookies(self.cookie_file)
            except Exception as e:
                LOG.debug("save_cookies failed: %s", e)
        await self._force_close()

    async def __aenter__(self) -> "Session":
        if self.page is None:
            await self.start()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    def _need_page(self) -> Page:
        if self.page is None:
            raise BrowserLaunchError("Session has no page; await Session.launch()")
        return self.page

    # -- cookies ------------------------------------------------------------ #
    async def pull_cookies(self) -> int:
        """Browser -> HTTP jar."""
        page = self._need_page()
        cookies = await page.context.cookies()
        return adopt_into_jar(self.http.cookies, cookies)

    async def push_cookies(self) -> None:
        """HTTP jar -> browser."""
        page = self._need_page()
        payload = [c for c in cookies_playwright_shape(self.http.cookies)
                   if c.get("name")]
        if payload:
            try:
                await page.context.add_cookies(payload)
            except Exception as e:
                LOG.debug("add_cookies failed (%s); retrying per-cookie", e)
                for c in payload:
                    try:
                        await page.context.add_cookies([c])
                    except Exception:
                        pass

    def save_cookies(self, path: str) -> None:
        payload = cookies_playwright_shape(self.http.cookies)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        os.replace(tmp, path)

    async def load_cookies(self, path: str) -> int:
        with open(path, "r", encoding="utf-8") as fh:
            cookies = json.load(fh)
        n = adopt_into_jar(self.http.cookies, cookies)
        if self.page is not None:
            await self.push_cookies()
        return n

    # -- navigation / interaction ------------------------------------------- #
    async def goto(self, url: str, wait_until: str = "domcontentloaded",
                   settle: float = 1.5, solve: bool = True) -> Page:
        page = self._need_page()
        await page.goto(url, wait_until=wait_until, timeout=self.timeout * 1000)
        if settle:
            await asyncio.sleep(settle)
        if solve:
            await self.solve_challenges()
        await self.pull_cookies()
        return page

    async def click(self, target: Union[str, LocatorLike],
                    is_input: bool = False) -> None:
        await human_click(self._need_page(),
                          _as_locator(self._need_page(), target),
                          is_input=is_input)

    async def type(self, target: Union[str, LocatorLike], text: str) -> None:
        await human_type(self._need_page(),
                         _as_locator(self._need_page(), target), text)

    async def fill(self, target: Union[str, LocatorLike], text: str) -> None:
        """Alias for type() — LLM-friendly."""
        await self.type(target, text)

    async def scroll(self, delta_y: float) -> None:
        await human_scroll(self._need_page(), delta_y)

    async def idle(self, seconds: float) -> None:
        await human_idle(self._need_page(), seconds)

    async def wait(self, target: str, state: str = "visible",
                   timeout: float = 10000) -> LocatorLike:
        loc = self._need_page().locator(target)
        await loc.wait_for(state=state, timeout=timeout)
        return loc

    async def exists(self, target: str) -> bool:
        return await self._need_page().locator(target).count() > 0

    async def text(self, target: str) -> str:
        return (await self._need_page().locator(target).inner_text()) or ""

    async def content(self) -> str:
        return await self._need_page().content()

    async def screenshot(self, path: str, full_page: bool = False) -> None:
        await self._need_page().screenshot(path=path, full_page=full_page)

    # -- captchas ----------------------------------------------------------- #
    async def solve_challenges(self) -> None:
        """CF click, then visible reCAPTCHA audio, then 2captcha fallbacks."""
        await self.solve_cloudflare()
        await self.solve_recaptcha()

    async def solve_cloudflare(self) -> None:
        page = self._need_page()
        if not await cloudflare_present(page):
            return
        LOG.info("Cloudflare challenge detected; clicking widget")
        ok = await click_cloudflare(page)
        if ok:
            await self.pull_cookies()
            return
        if not self.twocaptcha.enabled:
            raise CaptchaError(
                "Cloudflare challenge still present and no TWOCAPTCHA_API_KEY"
            )
        sitekey = await _sitekey_from_page(page)
        if not sitekey:
            raise CaptchaError("Cloudflare still present; could not find sitekey")
        LOG.info("Click did not pass; sending Turnstile to 2captcha")
        token = await asyncio.to_thread(
            self.twocaptcha.turnstile, sitekey, page.url)
        await page.evaluate(_INJECT_TURNSTILE, token)
        await asyncio.sleep(1.5)
        await self.pull_cookies()

    async def solve_recaptcha(self) -> None:
        page = self._need_page()
        solver = RecaptchaSolver(page, self.http)
        if not await solver.present():
            return
        try:
            await solver.solve()
            await self.pull_cookies()
            return
        except ProxyFlaggedError:
            raise
        except CaptchaError as e:
            LOG.warning("audio reCAPTCHA failed (%s); trying 2captcha", e)
        except Exception as e:
            LOG.warning("audio reCAPTCHA raised %s; trying 2captcha", e)

        if not self.twocaptcha.enabled:
            raise CaptchaError(
                "reCAPTCHA could not be solved via audio and no TWOCAPTCHA_API_KEY"
            )
        sitekey = await _sitekey_from_page(page)
        if not sitekey:
            raise CaptchaError("reCAPTCHA present but no sitekey found")
        token = await asyncio.to_thread(
            self.twocaptcha.recaptcha_v2, sitekey, page.url)
        await page.evaluate(_INJECT_RECAPTCHA_V2, token)
        await asyncio.sleep(1.0)
        await self.pull_cookies()

    async def solve_recaptcha_v3(self, sitekey: str, action: str = "verify") -> str:
        if not self.twocaptcha.enabled:
            raise CaptchaError("TWOCAPTCHA_API_KEY required for reCAPTCHA v3")
        page = self._need_page()
        token = await asyncio.to_thread(
            self.twocaptcha.recaptcha_v3, sitekey, page.url, action)
        return token

    # -- HTTP --------------------------------------------------------------- #
    async def fetch(self, url: str, method: str = "GET",
                    escalate: bool = True, **kwargs) -> Any:
        """curl_cffi request using this session's proxy/UA/cookies.

        If the response is a CF challenge and escalate=True, open it in the
        browser, solve, re-sync cookies, and retry once.
        """
        await self.pull_cookies()
        kwargs.setdefault("timeout", self.timeout)
        r = await asyncio.to_thread(self.http.request, method.upper(), url, **kwargs)
        body = r.text if hasattr(r, "text") else ""
        if escalate and _looks_like_cf_html(body, getattr(r, "status_code", 0)):
            LOG.info("HTTP hit Cloudflare on %s; escalating to browser", url)
            await self.goto(url)
            r = await asyncio.to_thread(
                self.http.request, method.upper(), url, **kwargs)
            body = r.text if hasattr(r, "text") else ""
            if _looks_like_cf_html(body, getattr(r, "status_code", 0)):
                raise CloudflareChallenge(f"still challenged after browser pass: {url}")
        return r

    def get(self, url: str, **kwargs) -> Any:
        """Sync HTTP GET. Prefer fetch() when a CF escalate might be needed."""
        kwargs.setdefault("timeout", self.timeout)
        return self.http.get(url, **kwargs)

    def post(self, url: str, **kwargs) -> Any:
        kwargs.setdefault("timeout", self.timeout)
        return self.http.post(url, **kwargs)


# Friendly alias used in the README.
launch = Session.launch


# --------------------------------------------------------------------------- #
# self-test — no browser, no network
# --------------------------------------------------------------------------- #
def _selftest() -> int:
    logging.basicConfig(level=logging.WARNING)
    assert parse_proxy_line("# comment") is None
    assert parse_proxy_line("") is None
    assert parse_proxy_line("http://h:1000:u:p") == "http://u:p@h:1000"
    assert parse_proxy_line("h:1000:u:p") == "http://u:p@h:1000"
    assert parse_proxy_line("http://u:p@h:1000") == "http://u:p@h:1000"
    assert parse_proxy_line("10.0.0.1:8080") == "http://10.0.0.1:8080"
    assert parse_proxy_line("socks5://u:p@h:1080") == "socks5://u:p@h:1080"
    sp = split_proxy("http://user:p%40ss@host.example:1000")
    assert sp["server"] == "http://host.example:1000"
    assert sp["username"] == "user"
    assert sp["password"] == "p@ss"

    pool = ProxyPool(["http://a", "http://b"])
    assert pool.next() == "http://a"
    pool.flag("http://b")
    assert pool.next() == "http://a"  # wrapped after b retired and a taken

    geo = _geo_to_kwargs({
        "countryCode": "US", "timezone": "America/Chicago",
        "lat": 32.7, "lon": -97.1, "query": "1.2.3.4",
    })
    assert geo["locale"] == "en-US"
    assert geo["geolocation"]["accuracy"] == 5000
    assert "--lang=en-US" in geo_chromium_args(geo)

    jar = PersistentCookieJar()
    n = adopt_into_jar(jar, [
        {"name": "JSESSIONID", "value": "AAA", "domain": "example.com", "path": "/"},
        {"name": "ok", "value": "1", "domain": ".example.com", "path": "/"},
        {"name": "nodomain", "value": "x"},
    ])
    assert n == 3
    shaped = cookies_playwright_shape(jar)
    names = {c["name"] for c in shaped}
    assert "JSESSIONID" in names and "ok" in names

    assert _looks_like_cf_html("<html><title>Just a moment...</title>", 403)
    assert not _looks_like_cf_html("<html><title>Records</title>", 200)

    set_human_preset("brisk")
    set_human_preset("careful")
    print("sessionkit selftest ok")
    return 0


if __name__ == "__main__":
    import sys
    if "--selftest" in sys.argv:
        raise SystemExit(_selftest())
    print(__doc__)
    print("usage: python browser.py --selftest")
