# Autoapply

Local-first job application automation. Architecture is in [`design.md`](./design.md).

Current phase: **0 — Scaffold**. Monorepo, database, test harness, CI, and a UI shell.

## Requirements

- Node 20+
- [pnpm](https://pnpm.io/) 10 (`corepack enable` or `npx pnpm@10`)
- Google Chrome (needed from Phase 2 onward; SessionKit launches channel `chrome`)

## Setup

```bash
pnpm install
pnpm db:migrate
```

Database file: `$AUTOAPPLY_HOME/autoapply.db` (defaults to `~/.autoapply/autoapply.db`). Override with `AUTOAPPLY_HOME` or `AUTOAPPLY_DB`.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Run every package test suite |
| `pnpm typecheck` | `tsc --noEmit` across packages |
| `pnpm lint` | ESLint across packages |
| `pnpm db:migrate` | Apply SQLite migrations |
| `pnpm dev` | API on `http://127.0.0.1:8787` and UI on `http://127.0.0.1:5173` |
| `pnpm dev:server` | API only |
| `pnpm dev:web` | UI only |

## Layout

```
apps/web/            React + Vite + Tailwind UI
apps/server/         Fastify API
packages/core/       Zod schemas, types — zero I/O
packages/engine/     Will drive SessionKit (inventory, fill, recipes, healing)
packages/db/         Drizzle schema + migrations
packages/ai/         DistilledPage boundary; model calls come later
fixtures/pages/      Saved HTML snapshots, one dir per platform
fixtures/mock-ats/   Local fake ATS for integration tests
enhanced_browser/    SessionKit: patchright Chrome, humanize, session identity
```

`packages/core` has no Playwright, database, or network dependencies.

## Browser driver

Automation uses **SessionKit** in `enhanced_browser/` (patchright + real Chrome), not vanilla Playwright.

CAPTCHA and 2FA are never solved by this project. SessionKit's audio reCAPTCHA / 2captcha helpers exist in that kit and are **not wired**. Detection pauses the run and waits for a human. See `design.md` §13 and the operating contract.

Python extras for later phases (do not need them for Phase 0):

```bash
pip install -r enhanced_browser/requirements.txt
patchright install chrome
```

## Tests

Never pointed at real employer sites. Unit tests are local. Integration tests will use `fixtures/mock-ats` and snapshots in `fixtures/pages`.
