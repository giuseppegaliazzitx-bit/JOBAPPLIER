# Autoapply

Local-first job application automation. Architecture is in [`design.md`](./design.md).

Current phase: **4 — Fill and preflight**. Forms are filled and verified. Submit happens only after you click Approve.

## Requirements

- Node 20+
- [pnpm](https://pnpm.io/) 10 (`corepack enable` or `npx pnpm@10`)
- Google Chrome (needed from Phase 2 onward; SessionKit launches channel `chrome`)

## Setup

```bash
pnpm install
cp .env.example .env   # optional; defaults work without it
pnpm db:migrate
pnpm dev
```

UI: `http://127.0.0.1:5173`  
API: `http://127.0.0.1:8787`  
Mock ATS: `http://127.0.0.1:8790/apply` (`pnpm mock-ats`)

Database file: `$AUTOAPPLY_HOME/autoapply.db` (defaults to `~/.autoapply/autoapply.db`). Override with `AUTOAPPLY_HOME` or `AUTOAPPLY_DB`. See `.env.example`.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Run every package test suite (Vitest) |
| `pnpm test:e2e` | Playwright Test against the local UI |
| `pnpm capture <url>` | Save a page snapshot into `fixtures/pages/<platform>/` (read-only) |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm lint` | ESLint across packages |
| `pnpm db:migrate` | Apply SQLite migrations |
| `pnpm dev` | API on `http://127.0.0.1:8787` and UI on `http://127.0.0.1:5173` |
| `pnpm dev:server` | API only |
| `pnpm dev:web` | UI only |
| `pnpm mock-ats` | Fake 4-step ATS on `http://127.0.0.1:8790` |

## Layout

```
apps/web/            React + Vite + Tailwind UI
apps/server/         Fastify API, WebSocket echo, SQLite-backed queue
packages/core/       Zod schemas, types, URL/dedup/platform logic — zero I/O
packages/engine/     Inventory, fill, verify, wizard walk, submit gate
packages/db/         Drizzle schema + migrations
packages/ai/         DistilledPage boundary; model calls come later
fixtures/pages/      Saved HTML snapshots, one dir per platform
fixtures/mock-ats/   Local fake ATS for integration tests
enhanced_browser/    SessionKit: patchright Chrome, humanize, session identity
e2e/                 Playwright Test for the UI shell
```

`packages/core` has no Playwright, database, or network dependencies.

## Browser driver

Live employer applications use **SessionKit** in `enhanced_browser/` (patchright + real Chrome). Playwright is used for fixture inventory and the local mock ATS. There is no automated submit: `clickSubmit` requires `{ userApproved: true }`, which the Runs page sends only from Approve.

`@playwright/test` is only for Autoapply's own UI e2e tests.

Captchas are solved by SessionKit (checkbox/audio reCAPTCHA, Cloudflare, 2captcha fallback). 2FA is never bypassed: pause, notify, wait for a human.

## Tests

Never pointed at real employer application forms. Inventory golden tests load HTML snapshots with Playwright `setContent`. Capture (`pnpm capture <url>`) is a manual tool, not part of CI.

Golden inventories live next to each fixture as `*.inventory.json`. The matching corpus is `fixtures/matching.json` — a false positive there is a wrong answer on a real application.
