"""Human-like pointer, click, typing and scroll behaviour for Playwright /
patchright. Pure stdlib, no third-party dependency, no license entanglement.

Written from the motor-control literature rather than adapted from an existing
automation library:

  * Fitts (1954) -- movement time scales with log2(D/W + 1), so duration is
    derived from distance AND target size rather than distance alone.
  * Flash & Hogan (1985), minimum-jerk -- the velocity profile of a reaching
    movement is the quintic 10t^3 - 15t^4 + 6t^5. This is the actual smooth
    bell-shaped profile human limbs produce. Smoothstep (3t^2 - 2t^3) is the
    graphics-shader easing curve and is visibly more angular at the endpoints.
  * Meyer et al. (1988), optimized submovements -- aimed movements are a fast
    ballistic primary submovement that deliberately undershoots or overshoots,
    followed by one or more slower corrective submovements. Overshoot is not a
    decoration bolted onto the end; it is how aiming works.
  * Physiological tremor -- 8-12 Hz, amplitude largest mid-flight and
    suppressed as the hand stabilises on target.

Two implementation details that matter as much as the curve:

  * Dispatch rate. A real mouse reports at a fixed polling rate (125 Hz USB
    default, 1000 Hz for gaming mice). Emitting a fixed step COUNT means a long
    sweep and a short nudge produce the same number of events, which is
    backwards. Points are emitted on a polling clock instead, so event count
    falls out of duration the way it does on real hardware.
  * Sub-pixel coordinates are rounded, because a mouse cannot report a
    fractional pixel.

Everything is tunable through HumanProfile; two presets are provided.
"""

from __future__ import annotations

import asyncio
import math
import random
import time
import weakref
from dataclasses import dataclass, replace
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

__all__ = [
    "HumanProfile", "PRESETS", "get_profile",
    "Cursor", "cursor_for",
    "human_move", "human_click", "human_type", "human_idle",
    "human_scroll", "min_jerk", "fitts_duration", "bezier_path",
    "flight_time", "neighbours_of", "aim_point",
]

Range = Tuple[float, float]


# --------------------------------------------------------------------------- #
# Profile
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class HumanProfile:
    # --- dispatch ---------------------------------------------------------- #
    poll_hz: float = 125.0            # USB mouse default report rate
    poll_jitter: float = 0.18         # +/- fraction of the polling interval
    max_events: int = 220             # hard ceiling per movement

    # --- Fitts's law: T = a + b * log2(D/W + 1), seconds -------------------- #
    fitts_a: Range = (0.075, 0.135)
    fitts_b: Range = (0.100, 0.170)
    min_duration: float = 0.055
    max_duration: float = 1.60

    # --- path shape -------------------------------------------------------- #
    bow_frac: Range = (0.03, 0.13)    # arc height as fraction of distance
    bow_asymmetry: Range = (0.55, 1.4)
    straight_below_px: float = 12.0   # below this, no arc worth generating

    # --- tremor ------------------------------------------------------------ #
    tremor_px: Range = (0.35, 1.15)   # peak amplitude, mid-flight
    tremor_hz: Range = (8.0, 12.0)    # physiological tremor band

    # --- submovements ------------------------------------------------------ #
    primary_frac: Range = (0.86, 0.99)   # how much of D the ballistic phase covers
    overshoot_chance: float = 0.34
    overshoot_frac: Range = (0.015, 0.055)
    correction_pause: Range = (0.035, 0.110)
    correction_scale: float = 0.42       # corrective phase speed vs primary

    # --- aiming / clicking ------------------------------------------------- #
    aim_sigma: float = 0.16           # gaussian spread within target box
    aim_edge_margin: float = 2.0      # px kept clear of the border
    dwell_button: Range = (0.090, 0.260)
    dwell_input: Range = (0.110, 0.300)
    hold_button: Range = (0.055, 0.145)
    hold_input: Range = (0.050, 0.120)

    # --- typing: base rhythm ----------------------------------------------- #
    keypress: Range = (0.045, 0.155)     # base inter-key flight time
    key_hold: Range = (0.028, 0.075)     # dwell: key down to key up
    word_pause: Range = (0.035, 0.150)
    hesitation_chance: float = 0.030
    hesitation: Range = (0.180, 0.620)
    first_key_delay: Range = (0.16, 0.62)  # orienting before the first keystroke
    fatigue_per_100: float = 0.035         # gradual slowdown over long text

    # --- typing: bigram effects -------------------------------------------- #
    # Flight time between two keys is dominated by which fingers and hands
    # they use. These multipliers are the standard keystroke-dynamics result:
    # alternating hands is fastest, a repeated key is faster still because the
    # finger is already there, and the same finger on a DIFFERENT key is by far
    # the slowest because that finger has to physically travel.
    alt_hand_factor: float = 0.86
    same_hand_factor: float = 1.14
    same_finger_factor: float = 1.80
    same_key_factor: float = 0.70
    row_jump_penalty: float = 0.020      # seconds per row of vertical travel
    shift_penalty: Range = (0.025, 0.070)  # capitals and shifted symbols

    # --- typing: bursts ----------------------------------------------------- #
    burst_chance: float = 0.16           # fast run over a familiar sequence
    burst_scale: Range = (0.45, 0.70)

    # --- typing: errors and corrections ------------------------------------- #
    # Typing without a single typo across a long string is itself anomalous.
    typo_rate: float = 0.010             # per character
    typo_weights: Tuple[float, float, float, float] = (
        0.55,  # substitution: hit a physically adjacent key
        0.20,  # transposition: swap this character and the next
        0.15,  # doubling: press the same key twice
        0.10,  # omission: skip the character
    )
    typo_detect_lag: Tuple[int, int] = (0, 3)   # chars typed before noticing
    notice_pause: Range = (0.14, 0.55)          # the "wait, that's wrong" beat
    backspace_gap: Range = (0.050, 0.115)       # rapid, rhythmic deletion
    resume_pause: Range = (0.06, 0.24)          # before retyping

    # --- idle drift -------------------------------------------------------- #
    idle_drift_px: float = 2.2
    idle_pause: Range = (0.28, 1.10)

    # --- scrolling --------------------------------------------------------- #
    scroll_tick_px: Range = (95.0, 135.0)
    scroll_tick_pause: Range = (0.035, 0.115)
    scroll_settle: Range = (0.12, 0.40)


PRESETS: Dict[str, HumanProfile] = {
    "default": HumanProfile(),
    # Slower, more deliberate, corrects more often. Closest analogue to the
    # "careful" behaviour the original launcher asked for.
    "careful": HumanProfile(
        fitts_a=(0.115, 0.200),
        fitts_b=(0.155, 0.255),
        max_duration=2.30,
        overshoot_chance=0.22,
        primary_frac=(0.90, 0.99),
        dwell_button=(0.150, 0.420),
        dwell_input=(0.180, 0.480),
        hold_button=(0.075, 0.190),
        keypress=(0.070, 0.210),
        word_pause=(0.060, 0.230),
        hesitation_chance=0.055,
        scroll_tick_pause=(0.070, 0.180),
    ),
    # For throughput-sensitive runs where you accept a weaker disguise.
    "brisk": HumanProfile(
        fitts_a=(0.050, 0.090),
        fitts_b=(0.065, 0.115),
        max_duration=0.90,
        overshoot_chance=0.40,
        dwell_button=(0.045, 0.130),
        hold_button=(0.040, 0.095),
        keypress=(0.030, 0.095),
        hesitation_chance=0.015,
    ),
}


def get_profile(name: str = "default", **overrides: Any) -> HumanProfile:
    if name not in PRESETS:
        raise ValueError(
            f"unknown humanize preset {name!r}; have: {', '.join(sorted(PRESETS))}")
    p = PRESETS[name]
    return replace(p, **overrides) if overrides else p


# --------------------------------------------------------------------------- #
# Primitives
# --------------------------------------------------------------------------- #
def _r(rng: Range) -> float:
    return random.uniform(rng[0], rng[1])


def min_jerk(t: float) -> float:
    """Flash & Hogan minimum-jerk position profile on t in [0, 1].

    Zero velocity AND zero acceleration at both endpoints, which smoothstep
    does not give you -- smoothstep's acceleration is discontinuous at the
    ends, producing a small but measurable jolt at movement start and stop.
    """
    if t <= 0.0:
        return 0.0
    if t >= 1.0:
        return 1.0
    t3 = t * t * t
    return t3 * (10.0 - 15.0 * t + 6.0 * t * t)


def fitts_duration(distance: float, target_w: float, p: HumanProfile) -> float:
    """Movement time from distance and target width, per Fitts's law."""
    w = max(target_w, 8.0)
    idx = math.log2(distance / w + 1.0)
    t = _r(p.fitts_a) + _r(p.fitts_b) * idx
    return max(p.min_duration, min(p.max_duration, t))


def bezier_path(x0: float, y0: float, x1: float, y1: float,
                p: HumanProfile) -> Callable[[float], Tuple[float, float]]:
    """Cubic Bezier from (x0,y0) to (x1,y1), bowed perpendicular to the chord.

    Returns a function of eased parameter t. Control points sit at roughly 1/3
    and 2/3 along the chord with independent perpendicular offsets, so the arc
    is asymmetric -- a perfectly symmetric arc is its own regularity.
    """
    dx, dy = x1 - x0, y1 - y0
    dist = math.hypot(dx, dy)
    if dist < p.straight_below_px:
        def straight(t: float) -> Tuple[float, float]:
            return x0 + dx * t, y0 + dy * t
        return straight

    nx, ny = -dy / dist, dx / dist
    bow = dist * _r(p.bow_frac) * random.choice((-1.0, 1.0))
    b2 = bow * _r(p.bow_asymmetry)
    c1 = (x0 + dx * 0.33 + nx * bow, y0 + dy * 0.33 + ny * bow)
    c2 = (x0 + dx * 0.66 + nx * b2, y0 + dy * 0.66 + ny * b2)

    def at(t: float) -> Tuple[float, float]:
        u = 1.0 - t
        uu, tt = u * u, t * t
        a0, a1, a2, a3 = uu * u, 3 * uu * t, 3 * u * tt, tt * t
        return (a0 * x0 + a1 * c1[0] + a2 * c2[0] + a3 * x1,
                a0 * y0 + a1 * c1[1] + a2 * c2[1] + a3 * y1)

    return at


# --------------------------------------------------------------------------- #
# Keyboard geometry
#
# Flight time between two keystrokes is not a constant plus noise: it is
# dominated by the physical relationship between the two keys. Modelling that
# needs a layout, a finger assignment, and the row stagger.
#
# Fingers are numbered 0-3 left pinky..left index, 6-9 right index..right
# pinky, matching standard touch-typing assignment. Hand falls out of the
# number. Column values include the QWERTY row stagger so that adjacency
# (used to generate realistic substitution typos) is geometrically correct.
# --------------------------------------------------------------------------- #
_ROWS: Sequence[Tuple[str, float, Sequence[int]]] = (
    ("1234567890-=",  0.0,  (0, 1, 2, 3, 3, 6, 6, 7, 8, 9, 9, 9)),
    ("qwertyuiop[]\\", 0.5, (0, 1, 2, 3, 3, 6, 6, 7, 8, 9, 9, 9, 9)),
    ("asdfghjkl;'",   0.75, (0, 1, 2, 3, 3, 6, 6, 7, 8, 9, 9)),
    ("zxcvbnm,./",    1.25, (0, 1, 2, 3, 3, 6, 6, 7, 8, 9)),
)

# Unshifted -> shifted, positionally aligned with _ROWS.
_SHIFTED = {
    "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^",
    "7": "&", "8": "*", "9": "(", "0": ")", "-": "_", "=": "+",
    "[": "{", "]": "}", "\\": "|", ";": ":", "'": '"',
    ",": "<", ".": ">", "/": "?", "`": "~",
}


class _Key:
    __slots__ = ("char", "row", "col", "finger", "hand", "shift")

    def __init__(self, char: str, row: int, col: float, finger: int, shift: bool):
        self.char = char
        self.row = row
        self.col = col
        self.finger = finger
        self.hand = "L" if finger <= 3 else "R"
        self.shift = shift


def _build_layout() -> Dict[str, _Key]:
    keys: Dict[str, _Key] = {}
    for r, (chars, stagger, fingers) in enumerate(_ROWS):
        for c, ch in enumerate(chars):
            col = c + stagger
            f = fingers[c] if c < len(fingers) else fingers[-1]
            keys[ch] = _Key(ch, r, col, f, False)
            up = ch.upper()
            if up != ch:
                keys[up] = _Key(up, r, col, f, True)
            sh = _SHIFTED.get(ch)
            if sh:
                keys[sh] = _Key(sh, r, col, f, True)
    keys[" "] = _Key(" ", 4, 5.0, 5, False)   # thumb
    return keys


_LAYOUT: Dict[str, _Key] = _build_layout()


def _neighbours(ch: str, max_dist: float = 1.35) -> List[str]:
    """Physically adjacent keys, for generating substitution typos. A typo is
    a near-miss with the finger, not a random character."""
    k = _LAYOUT.get(ch)
    if k is None or ch == " ":
        return []
    out = []
    for other, ok in _LAYOUT.items():
        if other == ch or ok.shift != k.shift or other == " ":
            continue
        if math.hypot(ok.col - k.col, (ok.row - k.row) * 1.15) <= max_dist:
            out.append(other)
    return out


_NEIGHBOURS: Dict[str, List[str]] = {}


def neighbours_of(ch: str) -> List[str]:
    if ch not in _NEIGHBOURS:
        _NEIGHBOURS[ch] = _neighbours(ch)
    return _NEIGHBOURS[ch]


def flight_time(prev: Optional[str], ch: str, p: HumanProfile) -> float:
    """Inter-key interval for the bigram (prev -> ch)."""
    base = _r(p.keypress)
    a = _LAYOUT.get(prev) if prev else None
    b = _LAYOUT.get(ch)
    if a is None or b is None:
        return base

    if a.char == b.char:
        # Doubled letters are fast: the finger is already on the key.
        base *= p.same_key_factor
    elif a.finger == b.finger:
        # Same finger, different key: it has to travel. The slowest bigram.
        base *= p.same_finger_factor
    elif a.hand == b.hand:
        base *= p.same_hand_factor
    else:
        base *= p.alt_hand_factor

    base += abs(a.row - b.row) * p.row_jump_penalty
    if b.shift and not a.shift:
        base += _r(p.shift_penalty)
    return base


# --------------------------------------------------------------------------- #
# Cursor state
# --------------------------------------------------------------------------- #
class Cursor:
    """Playwright starts every page's mouse at (0, 0). Without tracking, every
    session's first movement originates from the exact top-left pixel, which is
    a stronger signal than any curve is a disguise."""

    __slots__ = ("x", "y")

    def __init__(self, x: Optional[float] = None, y: Optional[float] = None):
        self.x = random.uniform(120.0, 760.0) if x is None else x
        self.y = random.uniform(110.0, 520.0) if y is None else y


_CURSORS: "weakref.WeakKeyDictionary[Any, Cursor]" = weakref.WeakKeyDictionary()


def cursor_for(page: Any) -> Cursor:
    c = _CURSORS.get(page)
    if c is None:
        c = Cursor()
        _CURSORS[page] = c
    return c


# --------------------------------------------------------------------------- #
# Movement
# --------------------------------------------------------------------------- #
async def _traverse(mouse: Any, x0: float, y0: float, x1: float, y1: float,
                    duration: float, p: HumanProfile,
                    tremor: bool = True) -> None:
    """Emit one submovement on a polling clock with a minimum-jerk profile."""
    dist = math.hypot(x1 - x0, y1 - y0)
    if dist < 0.5:
        return

    interval = 1.0 / p.poll_hz
    n = max(2, min(p.max_events, int(round(duration / interval))))
    curve = bezier_path(x0, y0, x1, y1, p)

    amp = _r(p.tremor_px) if tremor else 0.0
    freq = _r(p.tremor_hz)
    phase_x = random.uniform(0, math.tau)
    phase_y = random.uniform(0, math.tau)

    for i in range(1, n + 1):
        frac = i / n
        px, py = curve(min_jerk(frac))

        if amp:
            # Envelope peaks mid-flight and vanishes on target: the hand is
            # least stable while travelling and stabilises as it arrives.
            env = math.sin(math.pi * frac) * amp
            tphase = frac * duration * freq * math.tau
            px += math.sin(tphase + phase_x) * env
            py += math.cos(tphase * 0.83 + phase_y) * env
            px += random.gauss(0.0, 0.18) * env
            py += random.gauss(0.0, 0.18) * env

        await mouse.move(round(px), round(py))

        if i < n:
            await asyncio.sleep(max(0.0, interval * (1.0 + random.uniform(
                -p.poll_jitter, p.poll_jitter))))


async def human_move(page: Any, x: float, y: float,
                     p: HumanProfile, target_w: float = 24.0) -> None:
    """Move the pointer to (x, y) as a ballistic primary submovement plus
    corrective submovements, per Meyer's optimized-submovement model."""
    cur = cursor_for(page)
    x0, y0 = cur.x, cur.y
    dist = math.hypot(x - x0, y - y0)
    if dist < 1.0:
        return

    total = fitts_duration(dist, target_w, p)

    # Primary: fast, ballistic, deliberately imprecise.
    frac = _r(p.primary_frac)
    if random.random() < p.overshoot_chance:
        frac = 1.0 + _r(p.overshoot_frac)
    ang = math.atan2(y - y0, x - x0) + random.uniform(-0.10, 0.10)
    mx = x0 + math.cos(ang) * dist * frac
    my = y0 + math.sin(ang) * dist * frac

    await _traverse(page.mouse, x0, y0, mx, my, total * (1.0 - p.correction_scale), p)
    cur.x, cur.y = mx, my

    # Corrective submovements: slower, visually guided, converging.
    guard = 0
    while math.hypot(x - cur.x, y - cur.y) > 1.0 and guard < 3:
        guard += 1
        await asyncio.sleep(_r(p.correction_pause))
        rem = math.hypot(x - cur.x, y - cur.y)
        # Last correction lands exactly; earlier ones close most of the gap.
        if guard >= 3 or rem < 6.0 or random.random() < 0.65:
            tx, ty = x, y
        else:
            k = random.uniform(0.72, 0.94)
            tx = cur.x + (x - cur.x) * k
            ty = cur.y + (y - cur.y) * k
        dur = max(0.045, fitts_duration(rem, target_w, p) * p.correction_scale)
        await _traverse(page.mouse, cur.x, cur.y, tx, ty, dur, p, tremor=rem > 10)
        cur.x, cur.y = tx, ty

    cur.x, cur.y = x, y


def aim_point(box: Dict[str, float], p: HumanProfile) -> Tuple[float, float]:
    """Pick a landing point inside a box. Real clicks cluster near the middle
    but essentially never hit the exact geometric centre."""
    x = box["x"] + box["width"] * random.gauss(0.5, p.aim_sigma)
    y = box["y"] + box["height"] * random.gauss(0.5, p.aim_sigma)
    m = p.aim_edge_margin
    x = min(max(x, box["x"] + m), box["x"] + box["width"] - m)
    y = min(max(y, box["y"] + m), box["y"] + box["height"] - m)
    return x, y


async def human_click(page: Any, locator: Any, p: HumanProfile,
                      is_input: bool = False, timeout: float = 10000) -> None:
    """Approach, dwell, press, release.

    Deliberately not locator.click(): that performs its own actionability check
    and warps the pointer to the element's geometric centre first, discarding
    the approach path and landing every click on the identical relative pixel.
    The waits below cover what locator.click() would otherwise have done.
    """
    box = None
    try:
        await locator.scroll_into_view_if_needed(timeout=timeout)
        await locator.wait_for(state="visible", timeout=timeout)
        # Recompute after scrolling: bounding_box is viewport-relative.
        box = await locator.bounding_box()
    except Exception:
        box = None

    if not box or box.get("width", 0) <= 0 or box.get("height", 0) <= 0:
        # Nothing to aim at. Delegate rather than click blind at stale coords.
        await locator.click(delay=random.randint(45, 130))
        return

    tx, ty = aim_point(box, p)
    await human_move(page, tx, ty, p, target_w=min(box["width"], box["height"]))
    await asyncio.sleep(_r(p.dwell_input if is_input else p.dwell_button))
    await page.mouse.down()
    await asyncio.sleep(_r(p.hold_input if is_input else p.hold_button))
    await page.mouse.up()


class _Typist:
    """Tracks the state a real typist has that a loop over characters does not:
    the previously struck key, accumulated fatigue, and whether we are mid-burst.
    """

    __slots__ = ("page", "p", "prev", "count", "burst_left", "burst")

    def __init__(self, page: Any, p: HumanProfile):
        self.page = page
        self.p = p
        self.prev: Optional[str] = None
        self.count = 0
        self.burst_left = 0
        self.burst = 1.0

    def _fatigue(self) -> float:
        return 1.0 + self.p.fatigue_per_100 * (self.count / 100.0)

    def _burst_scale(self) -> float:
        if self.burst_left == 0:
            if random.random() < self.p.burst_chance:
                self.burst = _r(self.p.burst_scale)
                self.burst_left = random.randint(3, 7)
            else:
                self.burst = 1.0
                self.burst_left = random.randint(4, 12)
        self.burst_left -= 1
        return self.burst

    async def key(self, ch: str, pause: bool = True) -> None:
        """Strike one key: dwell for the hold time, then wait out the flight
        time to the next one."""
        gap = flight_time(self.prev, ch, self.p) * self._burst_scale() * self._fatigue()
        await self.page.keyboard.press(ch, delay=_r(self.p.key_hold) * 1000.0)
        self.prev = ch
        self.count += 1
        if not pause:
            return
        if ch == " ":
            gap += _r(self.p.word_pause)
        elif random.random() < self.p.hesitation_chance:
            gap += _r(self.p.hesitation)
        await asyncio.sleep(gap)

    async def backspace(self, n: int) -> None:
        """Deletion is fast and rhythmic, not typed at conversational speed."""
        for _ in range(n):
            await self.page.keyboard.press("Backspace",
                                           delay=_r(self.p.key_hold) * 1000.0)
            await asyncio.sleep(_r(self.p.backspace_gap))
        self.prev = None


def _pick_typo(kinds: Sequence[str], weights: Sequence[float]) -> str:
    return random.choices(list(kinds), weights=list(weights), k=1)[0]


async def human_type(page: Any, locator: Any, text: str, p: HumanProfile,
                     click_first: bool = True, typos: bool = True) -> None:
    """Type `text`, ending with exactly `text` in the field.

    Beyond per-key timing this models the two things that make real typing
    recognisable:

    Bigram-dependent flight time. The interval between keystrokes is driven by
    the physical relationship between the two keys -- alternating hands is
    fast, the same finger on a different key is slow, a repeated key is fastest
    -- so the inter-key intervals form a distribution shaped by the text, not a
    flat band of noise.

    Errors and corrections. Typing a long string with zero typos is itself
    anomalous. Mistakes are physically plausible (an adjacent key, a
    transposition, a doubled or dropped character), they are noticed a beat
    later rather than instantly, and they are fixed with a burst of backspaces
    followed by a retype. The net text is always correct.
    """
    if click_first:
        await human_click(page, locator, p, is_input=True)

    t = _Typist(page, p)
    await asyncio.sleep(_r(p.first_key_delay))

    kinds = ("sub", "transpose", "double", "omit")
    i = 0
    n = len(text)

    while i < n:
        ch = text[i]

        make_typo = (
            typos
            and random.random() < p.typo_rate
            and ch != " "
            and ch in _LAYOUT
        )
        if not make_typo:
            await t.key(ch)
            i += 1
            continue

        kind = _pick_typo(kinds, p.typo_weights)
        if kind == "transpose" and i + 1 >= n:
            kind = "sub"
        if kind == "sub" and not neighbours_of(ch):
            kind = "double"

        # Commit the mistake. `consumed` is how many intended characters this
        # accounts for; `wrong_len` is how many keys actually landed.
        if kind == "sub":
            await t.key(random.choice(neighbours_of(ch)))
            consumed, wrong_len = 1, 1
        elif kind == "double":
            await t.key(ch)
            await t.key(ch)
            consumed, wrong_len = 1, 2
        elif kind == "transpose":
            await t.key(text[i + 1])
            await t.key(ch)
            consumed, wrong_len = 2, 2
        else:  # omit
            consumed, wrong_len = 1, 0

        # Keep typing for a beat before noticing. Catching every error on the
        # very next keystroke is its own tell.
        lag = random.randint(*p.typo_detect_lag)
        lag = min(lag, n - (i + consumed))
        for j in range(lag):
            await t.key(text[i + consumed + j])
        wrong_len += lag

        if wrong_len == 0:
            # Dropped a character and noticed immediately; nothing to delete.
            await asyncio.sleep(_r(p.notice_pause))
            await t.key(ch)
            i += 1
            continue

        await asyncio.sleep(_r(p.notice_pause))
        await t.backspace(wrong_len)
        await asyncio.sleep(_r(p.resume_pause))

        end = i + consumed + lag
        for j in range(i, end):
            await t.key(text[j])
        i = end



async def human_idle(page: Any, seconds: float, p: HumanProfile) -> None:
    """Small drift while waiting. A cursor frozen to the pixel across a
    multi-second wait is its own signal."""
    cur = cursor_for(page)
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        await asyncio.sleep(min(_r(p.idle_pause), max(0.0, end - time.monotonic())))
        if time.monotonic() >= end:
            break
        cur.x += random.gauss(0.0, p.idle_drift_px)
        cur.y += random.gauss(0.0, p.idle_drift_px)
        await page.mouse.move(round(cur.x), round(cur.y))


async def human_scroll(page: Any, delta_y: float, p: HumanProfile) -> None:
    """Wheel scrolling in discrete notches with pauses, not one giant delta.

    A wheel event carrying 2000px in a single tick has no physical analogue.
    """
    remaining = abs(delta_y)
    sign = 1.0 if delta_y >= 0 else -1.0
    while remaining > 1.0:
        tick = min(remaining, _r(p.scroll_tick_px))
        await page.mouse.wheel(0, round(tick * sign))
        remaining -= tick
        if remaining > 1.0:
            await asyncio.sleep(_r(p.scroll_tick_pause))
    await asyncio.sleep(_r(p.scroll_settle))
