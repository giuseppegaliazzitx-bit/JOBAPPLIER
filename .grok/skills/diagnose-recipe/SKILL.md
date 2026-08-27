---
name: diagnose-recipe
description: >
  Diagnose a degraded Autoapply recipe without changing code. Pull recent
  runs, diff live inventory vs the recipe fixture, classify the break, and
  propose a minimal fix plus the test that would have caught it. Then stop
  and wait. Use when a recipe is degraded, a platform is quarantined, the
  user names a recipe id, or runs /diagnose-recipe.
---

# Diagnose a failing recipe

Require a recipe id (example: `greenhouse-platform`). If the user still has `<ID>`, ask. **Do not edit source, recipes, or the database until the user says to proceed.**

## 1. Last 10 runs

SQLite is `$AUTOAPPLY_DB` or `$AUTOAPPLY_HOME/autoapply.db` (default `~/.autoapply/autoapply.db`).

```sql
SELECT rv.id, rv.recipe_id, rv.version, rv.status, rv.runs, rv.successes, rv.failures
FROM recipe_versions rv
WHERE rv.recipe_id = ? OR rv.id = ?
ORDER BY rv.version DESC;

SELECT r.id, r.status, r.started_at, r.error, r.job_id
FROM runs r
WHERE r.recipe_version_id = ?
ORDER BY r.started_at DESC
LIMIT 10;

SELECT e.run_id, e.seq, e.type, e.step_id, e.status, e.detail_json, e.duration_ms
FROM run_events e
WHERE e.run_id IN (/* those 10 */)
  AND e.status IN ('fail', 'failed')
ORDER BY e.run_id, e.seq;
```

Also use `stepFailureRates` in `apps/server/src/recipes.ts` if the API is up (`GET /api/recipes`). Report the failing **step id/name** and the **error string** (selector miss, validation, timeout, unknown widget, unanswered, captcha, two_factor, heal_exhausted).

## 2. Inventory diff

Recipe `fixturePath` is on the version (`hints_json.fixturePath`, e.g. `fixtures/pages/greenhouse/application.html`).

- Fixture inventory: `*.inventory.json` next to that HTML, or re-run `extractFieldInventory` via `setContent`
- Live inventory: latest run's `fixtures/pages/_incoming/*.html` + distilled txt, or a **manual** `pnpm capture <url>` (not CI)

Diff fingerprints, `labelRaw`/`labelNorm`, `type`, `widget`, `required`, selector primary. List added/removed required fields.

## 3. Classify the break (pick one)

| Class | Evidence |
|---|---|
| selector break | fingerprint and label same; locate fails; `nth-child` or brittle css |
| label copy change | same control, `labelRaw` changed, fingerprint changed |
| new required field | extra `required: true` not in fixture |
| widget swap | `widget`/`type` changed (native → combobox, etc.) |
| flow change | step count/URL/advance control changed; timeout/expired/new interstitial |

## 4. Propose, then wait

Minimal fix only:

- selector break → promote working selector (heal tiers 1–3 already do this; maybe a recipe fallback)
- label copy → `labelHints` overlay, not a new matcher
- new required field → answer-bank/profile gap, not a fake value
- widget swap → `widgetHandlers` + fill executor
- flow change → wait/advance steps, never a second submit path (`clickSubmit` remains the only submit)

Name the test: golden inventory assertion, contract `runRecipeContract`, or a should-not-match pair if the failure was a wrong fill.

**Stop. Do not implement until the user says go.**
