---
name: add-platform-recipe
description: >
  Add Autoapply support for a new ATS platform. Capture fixtures, extend
  URL/DOM detection, measure the generic walker, then write a recipe covering
  only what the walker got wrong. Use when the user says "add a platform
  recipe", "add support for Workday/Taleo/iCIMS", or runs /add-platform-recipe.
---

# Add a platform recipe

Require a concrete platform name (greenhouse, lever, workday, icims, taleo, smartrecruiters, ashby, jobvite, bamboohr, recruitee, or a new enum value). If the user still has `<PLATFORM>`, ask for the name and three posting URLs. Do not invent URLs.

Never test against live employer *application* forms in CI. Capture is a manual tool. Golden tests load saved HTML with Playwright `setContent`.

## 1. Capture three fixtures

```bash
npx --yes pnpm@10 capture <url>
```

Writes `fixtures/pages/<platform>/captured-<timestamp>.html`. Capture **three companies**. Rename to stable names (`acme-application.html`, …). Do not commit `_incoming/`.

If `PlatformSchema` does not include the ATS, add it to `packages/core/src/platform.ts` (`PlatformSchema` and `ATS_PLATFORMS`) and to Settings site toggles via that list.

## 2. Detection + test

Edit both layers:

- URL: `packages/core/src/ats.ts` `PATTERNS` and `packages/core/src/platform-detect.ts`
- DOM: `collectDomSignals` in `platform-detect.ts` (meta generator, script/form hosts, distinctive attrs)

Add a URL case to `packages/core/tests/platform-detect.test.ts` `URLS`. Add a DOM-only case (aggregator URL + platform HTML). Run:

```bash
npx --yes pnpm@10 --filter @autoapply/core test
```

## 3. Generic walker vs fixtures

Do **not** attach a recipe. Load each HTML with Playwright `setContent`, run `extractFieldInventory` (and `walkUntilPreflight` only against mock ATS, not live). Report:

- fields with `labelSource` fallback / empty label
- `widget === "unknown"`
- required fields the bank cannot resolve
- advance/submit controls the walker would miss

That list is the only recipe scope.

## 4. Recipe = walker deltas only

Hand-write `packages/engine/recipes/<platform>.json` as a `RecipeBundle`:

- `scope: "platform"`
- `match.urlPatterns` + `match.domFingerprints`
- `labelHints` / `widgetHandlers` / `steps` **only** for what failed in step 3
- `valueSource` is `profile.*`, `document.*`, or `answer_bank` — never a literal PII string
- `fixturePath` pointing at one golden HTML
- `autopilot: false`

`loadBundledRecipes()` already reads every JSON in that directory. Update `packages/engine/tests/recipe-contract.test.ts` expected platform list.

## 5. Goldens + contract

- Add the HTML paths to `FIXTURES` in `packages/engine/tests/golden.test.ts`
- Generate `*.inventory.json` beside each HTML (same shape as existing goldens)
- Contract: `runRecipeContract` must pass; recipe JSON must not contain profile literals (`profileValuesInText`)

```bash
npx --yes pnpm@10 --filter @autoapply/engine test
npx --yes pnpm@10 typecheck
```

## 6. Report before/after

Field resolution rate = resolved (or user_approved) required visible fields / all required visible fields.

| Fixture | Walker-only | Walker + recipe |
|---|---|---|
| company A | | |
| company B | | |
| company C | | |

Commit as `feat: add <platform> platform recipe`.
