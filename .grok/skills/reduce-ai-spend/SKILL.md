---
name: reduce-ai-spend
description: >
  Diagnose Autoapply AI cost per application versus a target. Break down
  ai_calls by purpose, platform, and cache hit rate; estimate how much of
  the top purpose is deterministic; show cache misses; rank savings ideas.
  Do not implement. Use when cost per application is too high, the user
  gives a spend target, or runs /reduce-ai-spend.
---

# Reduce AI spend

Require current cost `<X>` and target `<Y>` (USD per application). If missing, read Metrics (`GET /api/metrics` → `costPerApplication.usd`) and ask for the target. **Do not change code, prompts, or cache keys until the user says to implement.**

SQLite: `$AUTOAPPLY_DB` or `$AUTOAPPLY_HOME/autoapply.db` (default `~/.autoapply/autoapply.db`).

Never send raw HTML to a model while investigating. Distilled inputs only.

## 1. Break down `ai_calls`

```sql
SELECT purpose, COUNT(*) AS n, SUM(cost_usd) AS usd,
       AVG(cache_hit) AS cache_hit_rate,
       SUM(in_tokens)+SUM(out_tokens) AS tokens
FROM ai_calls
GROUP BY purpose
ORDER BY usd DESC;

SELECT j.platform, c.purpose, COUNT(*) AS n, SUM(c.cost_usd) AS usd, AVG(c.cache_hit) AS cache_hit_rate
FROM ai_calls c
LEFT JOIN runs r ON r.id = c.run_id
LEFT JOIN jobs j ON j.id = r.job_id
GROUP BY j.platform, c.purpose
ORDER BY usd DESC;

SELECT COUNT(*) AS applications FROM applications;
```

Cost per application must match Metrics: `SUM(ai_calls.cost_usd) / COUNT(applications)` (empty apps → 0). Purposes: `classify_page`, `resolve_labels`, `map_option`, `repair_step`, `draft_answer`, `write_cover_letter`, `classify_mail`. Fallback spend is typically `repair_step` + `resolve_labels` + `map_option` + `classify_page`.

## 2. Deterministic fraction of the top purpose

| Purpose | Deterministic alternative |
|---|---|
| classify_page | `pageKind` / `detectChallenge` already in the engine |
| resolve_labels | label ladder + recipe `labelHints` |
| map_option | exact / stored `option_mappings` |
| repair_step | heal tiers 0–3 (no AI until 4) |
| draft_answer | answer bank; AI drafts still need approval |
| write_cover_letter | `cover_letters` cache by `job_family` |
| classify_mail | `classifyMail` rules in `packages/core/src/mail.ts` |

Estimate % of that purpose's rows that had a cache hit, a recipe overlay, or a rule that should have won. Do not guess a precise percent without counting rows.

## 3. Five cache misses

Cache key is `hashDistilledInput(purpose, distilled, extra)` in `packages/core/src/distill.ts`. The table does not store the hash; reconstruct from run events / `_incoming/*.distilled.txt`.

Show 5 frequent miss shapes and why (new widget, pagination slice, PII scrub changing the text, extraUser blob, recipe not parameterized).

## 4. Ranked proposals (do not implement)

Rank by **savings per unit of effort**. Typical order:

1. Recipe `labelHints` / `widgetHandlers` for the noisiest platform (kills `resolve_labels`/`repair_step`)
2. Persist option mappings (kills repeat `map_option`)
3. Mail rules before `classify_mail`
4. Cover-letter family cache already exists — check it is used
5. Threshold / model-tier changes last (quality risk)

For each: expected USD/app saved, risk to fill correctness, and the test that would lock it.

**Stop. Do not implement.**
