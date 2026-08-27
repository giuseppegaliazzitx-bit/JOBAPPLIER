Saved HTML snapshots of application pages, one directory per platform.

Golden tests assert `*.html → *.inventory.json`. Capture a live page with `pnpm capture <url>` (read-only: no fill, click, or submit).

Incoming failure snapshots belong in `_incoming/` (gitignored). Promote one into the golden suite with `pnpm fixture:promote <name>` — that writes `*.html` plus `*.inventory.json` under the detected platform directory.
