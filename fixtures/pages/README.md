Saved HTML snapshots of application pages, one directory per platform.

Golden tests assert `*.html → *.inventory.json`. Capture a live page with `pnpm capture <url>` (read-only: no fill, click, or submit).

Incoming failure snapshots belong in `_incoming/` (gitignored) until a CLI command promotes them.
