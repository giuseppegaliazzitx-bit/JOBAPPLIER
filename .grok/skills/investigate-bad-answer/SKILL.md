---
name: investigate-bad-answer
description: >
  Trace a wrong submitted answer by fingerprint. This is the most serious
  Autoapply bug class. Identify the match tier and score, why type-compat
  or the option mapper allowed it, add a should-not-match regression, fix
  the matcher without corpus regressions, and list other stored answers
  that could fire the same way. Use when a wrong answer was submitted, a
  fingerprint is named, or the user runs /investigate-bad-answer.
---

# Investigate a bad answer

Require the live field fingerprint (`sha256` hex). If the user still has `<FINGERPRINT>`, ask. Do not skip the corpus regression.

Wrong auto-fill is worse than leaving a field unanswered.

## 1. Trace the tier

Fingerprint is `sha256(labelNorm|type|optionsHash)` from `packages/core/src/fingerprint.ts`.

Look up the question and answers:

```sql
SELECT id, fingerprint, label_norm, label_raw, type, widget
FROM questions WHERE fingerprint = ?;

SELECT a.id, a.canonical_value, a.scope, a.source, a.confidence, a.question_id
FROM answers a
JOIN questions q ON q.id = a.question_id
WHERE q.fingerprint = ?;
```

Replay `matchField` (`packages/core/src/match.ts`) against the live field and the bank:

| Tier | Source | Fills? | Gate |
|---|---|---|---|
| 0 | exact fingerprint | yes | type + polarity |
| 1 | alias / same cluster | yes | type + polarity |
| 2 | embedding ≥ 0.92 | yes | type + polarity |
| 3 | embedding 0.78–0.92 | suggest only (`fill: false`) | type + polarity |
| 4 | none | no | — |

Report `tier`, `source`, `similarity`, `matchedLabel`, `canonicalValue`, `mappedValue`. If a run event `resolve` exists, use that payload.

## 2. Why it passed the gates

- **Type:** `typesCompatible` in `packages/core/src/type-compat.ts` — textish group and choice group are interchangeable; `file`/`custom` are not
- **Polarity:** `polaritiesConflict` — work-auth vs sponsorship, etc.
- **Options:** `mapOption` in `packages/core/src/option-map.ts` plus stored `option_mappings`

Name the gate that should have vetoed and did not.

## 3. Regression pair

Do **not** only edit `fixtures/matching.json`. `packages/core/tests/matching-corpus.test.ts` **rewrites** that file from `buildMatchingCorpus()`.

Add the pair to `EXTRA_SHOULD_NOT_MATCH` in `packages/core/src/matching-corpus.ts` (live label vs stored label, with types). Then run the corpus test so `fixtures/matching.json` regenerates.

## 4. Fix without corpus regressions

Preferred order (smallest change that makes `fill: false` on this pair):

1. polarity tags (`packages/core/src/polarity.ts`)
2. cluster split (`packages/core/src/aliases.ts`) so they are not the same cluster
3. type-compat tightening if the types truly must not mix
4. option mapper only if the labels *should* match but the option was wrong
5. raise embedding thresholds last — easy to nuke should-match precision

Must keep matching corpus: **≥0.95 precision on should-match** and **zero auto-fills on should-not-match**.

```bash
npx --yes pnpm@10 --filter @autoapply/core test
```

## 5. Blast radius

Scan other `answers` + `questions` that share cluster, high embedding, or the same option mapping. List fingerprint, label, stored value, and whether they would auto-fill the live field after the fix.
