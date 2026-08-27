# design.md — Autoapply

A local-first tool that takes job posting links, fills out the applications, asks you only the questions it genuinely cannot answer, and gets cheaper and more reliable every time you use it.

---

## 1. Principles

These drive every decision below. When a tradeoff comes up, resolve it against this list in order.

1. **Deterministic first, AI last.** The DOM already contains almost everything needed. Read it properly and most applications need zero model calls. AI is a repair mechanism, not the engine.
2. **Never fabricate.** If the tool is not confident about an answer, it stops and asks. A wrong answer on a job application is worse than a slow one.
3. **Every failure becomes a fixture.** When something breaks, the distilled page that broke it is saved as a regression test. The test suite grows from real breakage, not imagination.
4. **Every AI success becomes code.** When AI repairs a step, that repair is promoted into a recipe so the same token is never spent twice.
5. **Nothing submits without a gate.** Either every required field is confidently resolved and the recipe is trusted, or a human clicks approve.
6. **Single source of truth for schemas.** The recipe format, field inventory, and AI response shapes are defined once and validated at runtime everywhere.

---

## 2. Stack

**TypeScript end to end**, pnpm monorepo, Node 20+.

| Concern | Choice | Why |
|---|---|---|
| Browser automation | SessionKit (`enhanced_browser/`) on patchright Chrome | User-specified driver. Persistent-context Chrome, humanized input, geo/proxy/session identity. Vanilla Playwright is not used. |
| Schemas + validation | Zod | The same schema validates the DB row, the API payload, *and* the AI's JSON response |
| Database | SQLite (WAL) + Drizzle ORM | Single-user local tool. No server to run. Migration path to Postgres exists if it ever goes multi-user |
| Server | Fastify + REST + WebSocket | WS is needed for live screencast and run events |
| Frontend | React + Vite + Tailwind + TanStack Query | Fast, boring, no SSR needed for a localhost tool |
| Embeddings | `@xenova/transformers` running `bge-small-en-v1.5` locally | Question matching must not cost money or latency. Runs on CPU fine |
| LLM | Anthropic SDK | Fallback only |
| Queue | SQLite-backed in-process queue | Avoids a Redis dependency for a single-user tool |
| Tests | Vitest (unit/integration) + Playwright Test (e2e) | |

**Why one language:** the entire design revolves around shared JSON contracts between the automation engine, the API, and the UI. Sharing Zod schemas across all three eliminates a whole category of bug, and lets AI output be validated with the exact same schema the engine executes. That outweighs Python's ML advantage, since the only ML here is a small local embedding model.

**Browser driver:** the TypeScript engine owns inventory, recipes, fill, verify, and healing. It drives Chrome through SessionKit (`enhanced_browser/`, Python + patchright), not through the Playwright Node package. Captchas go through SessionKit (`solve_challenges`: checkbox/audio reCAPTCHA, Cloudflare click, 2captcha fallback). 2FA is still human-in-the-loop: detect, pause, notify, wait.

### Packages

```
apps/
  web/            React UI
  server/         Fastify API + WebSocket + job queue
packages/
  core/           Zod schemas, types, normalizer, matcher — zero I/O, heavily unit tested
  engine/         Playwright: inventory extraction, fill, verify, recipes, healing
  db/             Drizzle schema + migrations
  ai/             Distillation, prompts, model routing, cost accounting
fixtures/
  pages/          Saved HTML snapshots of real application pages
  mock-ats/       Local fake ATS server used for integration tests
```

---

## 3. Execution model

The core insight: **there are not two engines.** There is one generic form-walker, and recipes are a layer of overrides that make it faster and more correct on platforms we've seen before.

This matters because the alternative — a recipe engine plus a separate fallback engine — means every bug fix has to be made twice, and the fallback path is always the less-tested one.

### The pipeline

```
DISCOVER   → classify page, find the form / wizard step
INVENTORY  → extract every field with a resolved label, type, options, required flag
RESOLVE    → map each field to a value from profile / answer bank / recipe
FILL       → set values using the right interaction for the widget type
VERIFY     → read values back; check for inline validation errors
GATE       → all required resolved? no errors? trusted or approved?
ADVANCE    → next wizard step (loop) or submit
CONFIRM    → detect success page, screenshot as proof, record
```

Recipes inject overrides at DISCOVER (which page is this), INVENTORY (label hints, custom widget handlers), RESOLVE (site-specific literals), and ADVANCE (how to page forward, where submit lives).

With no recipe at all, the pipeline still works on any standard HTML form. That is the baseline promise.

---

## 4. Field inventory — the spine

Everything else keys off this. Get it right and the rest is bookkeeping.

```ts
type FieldDescriptor = {
  fingerprint: string;        // sha256(labelNorm | type | optionsHash)
  labelRaw: string;           // exactly as shown on the page — used for UI replay
  labelNorm: string;          // normalized for matching
  helpText?: string;
  type: 'text' | 'email' | 'tel' | 'url' | 'number' | 'date' | 'textarea'
      | 'select' | 'multiselect' | 'radio' | 'checkbox' | 'checkbox_group'
      | 'file' | 'custom';
  widget: 'native' | 'combobox' | 'typeahead' | 'react-select' | 'rich-text' | 'unknown';
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  selector: SelectorSpec;
  containerPath: string;      // stable ancestor path, disambiguates repeated labels
  visible: boolean;
  disabled: boolean;
  currentValue?: string;
  sectionHeading?: string;    // "Voluntary Self-Identification" etc.
};

type SelectorSpec = {
  primary: Selector;
  fallbacks: Selector[];      // ordered, tried on failure
};

type Selector = {
  strategy: 'label' | 'role' | 'testid' | 'name' | 'placeholder' | 'text' | 'css';
  value: string;
};
```

### Label resolution ladder

Run in order, stop at first non-empty result. This is deterministic and needs no AI.

1. `<label for="id">` text
2. Wrapping `<label>` text (minus the control's own text)
3. `aria-labelledby` → resolve referenced element text
4. `aria-label`
5. Nearest preceding sibling/text node inside the closest form-group ancestor (climb max 3 levels, bail if the candidate contains another form control)
6. `placeholder`
7. Humanized `name` or `id` (`first_name` → "first name") — **flag as low confidence**

Only if all seven fail does a field become an AI label-resolution candidate.

### Selector generation

Never emit `nth-child` chains as primary. Preference order:

1. `getByLabel(text)` — survives redesigns, breaks on copy changes
2. `getByRole(role, { name })` — survives most things
3. `[data-testid]`, `[data-qa]`, `[data-automation-id]` — Workday leans on these heavily and they are very stable
4. `[name="..."]`
5. Scoped CSS within a labeled container

Store all viable ones as fallbacks. Healing tier 1 is just walking this list.

### Custom widget handling

Native controls are the easy case. Real ATS pages are full of React comboboxes and typeaheads that ignore `selectOption`. Each widget type gets a hand-written handler:

- **combobox / react-select**: click trigger → wait for listbox → match option text → click. Never type-and-hope.
- **typeahead (location, school)**: type partial → wait for suggestions → pick best match → **verify the chip/token rendered**, because typeahead fields silently keep raw text that fails validation on submit.
- **rich-text**: focus and use keyboard insertion, not `.value =`.
- **file**: `setInputFiles` on the hidden input, or drag-drop simulation when the input is unreachable.
- **unknown**: this is an AI escalation, and the resulting handler is what gets promoted into the recipe.

---

## 5. Answer bank and question matching

### Normalization

```
lowercase
→ strip HTML entities, asterisks, "(required)", "(optional)"
→ replace company name occurrences with {company}
→ expand abbreviations (US → united states, yrs → years, w2 → w-2)
→ strip politeness filler (please, kindly, could you)
→ collapse whitespace, strip terminal punctuation
→ lemmatize
```

"Are you authorized to work in the US?" and "Do you have US work authorization?" normalize close enough that the embedding tier catches them even though exact hashing doesn't.

### Match tiers

| Tier | Method | Threshold | Action |
|---|---|---|---|
| 0 | Exact fingerprint hit | — | Fill, silent |
| 1 | Curated alias table | — | Fill, silent |
| 2 | Embedding cosine, same type, compatible options | ≥ 0.92 | Fill, logged as fuzzy |
| 3 | Embedding cosine | 0.78–0.92 | **Suggest, do not fill.** Goes to Questions page pre-filled with a proposed answer |
| 4 | Below 0.78 | — | Unanswered queue |

Tier 2 requires *type compatibility* as a hard gate. A stored text answer never auto-fills a select, and a stored select answer never auto-fills a select whose option list can't accept it.

### The option-mapping problem

This is the failure mode that most implementations miss. You stored "Yes" for work authorization. This page's select offers:

```
"Yes, I am authorized to work in the US for any employer"
"No, I require sponsorship now or in the future"
```

So answers store a **canonical value**, and a mapper resolves canonical → actual option:

1. Exact string match
2. Case/whitespace-insensitive match
3. Canonical value is a prefix or contained token of an option, and matches exactly one option
4. Embedding similarity over the option list, top-1 ≥ 0.85 **and** ≥ 0.15 clear of top-2
5. Otherwise → unanswered queue with the option list shown, and the user's pick is stored as an alias for that exact option set

Step 5 is what makes the system compound. Answer once per option-set shape, never again.

### Answer scope

```ts
type AnswerScope = 'global' | 'company' | 'job';
```

- `global` — work authorization, sponsorship, salary expectation, notice period, EEO responses, years of experience
- `company` — "Have you worked at Acme before?"
- `job` — "Why do you want this role?" — one-off, never reused, optionally AI-drafted

The Profile page owns most `global` answers implicitly. The answer bank owns the rest.

---

## 6. Recipes

A recipe is a versioned set of overrides for a platform or a specific company's instance.

```ts
type Recipe = {
  id: string;
  scope: 'platform' | 'company' | 'url_pattern';
  platform: Platform;                    // greenhouse | lever | workday | icims | ...
  match: {
    urlPatterns: string[];               // boards.greenhouse.io/*/jobs/*
    domFingerprints: DomFingerprint[];   // meta tags, script srcs, class prefixes
  };
};

type RecipeVersion = {
  recipeId: string;
  version: number;
  status: 'proposed' | 'shadow' | 'active' | 'degraded' | 'retired';
  steps: Step[];
  labelHints: Record<string, string>;    // selector → known label
  widgetHandlers: Record<string, WidgetKind>;
  createdBy: 'record' | 'ai_repair' | 'manual' | 'promotion';
  stats: { runs: number; successes: number; failures: number; lastSuccessAt?: string };
};

type Step = {
  id: string;
  name: string;
  type: 'navigate' | 'click' | 'fill' | 'select' | 'upload' | 'wait'
      | 'assert' | 'advance' | 'submit';
  selector?: SelectorSpec;
  valueSource?: `profile.${string}` | 'answer_bank' | `literal:${string}` | `document.${string}`;
  guard?: Assertion;                     // must hold before running
  optional: boolean;
  onFail: 'heal' | 'skip' | 'pause';
};
```

### Platform detection

1. URL pattern match (fast path, covers ~85%)
2. DOM fingerprint: `<meta name="generator">`, script `src` hosts, form `action` host, characteristic attribute prefixes (`data-automation-id` → Workday, `#application_form` + `job_application[...]` names → Greenhouse)
3. No match → `unknown`, generic walker runs, and if the run succeeds a recipe is *proposed* from what actually worked

### Version lifecycle

```
proposed ──[passes its fixture test]──> shadow
shadow   ──[3 consecutive successful real runs]──> active
active   ──[failure rate >30% over last 10 runs]──> degraded
degraded ──[auto-rollback to prior active version]──> retired
```

`degraded` disables autopilot for that platform immediately and surfaces on the Recipes page. A bad AI-generated patch cannot silently become the trusted path.

### Record mode

You apply manually once while the tool watches through CDP. It captures navigations, clicks, fills, selects, and uploads, then post-processes into steps.

**Values are parameterized, never literal.** When you type your email, the recorder matches it against profile values and stores `{{profile.email}}`. Anything that matches no known value is flagged in the review screen — you decide whether it's a profile gap, an answer-bank entry, or a genuine literal. No PII is ever baked into a recipe file.

---

## 7. Self-healing

Tiered escalation. Each tier is cheaper than the one after it, so the cheap tiers run first.

| Tier | Trigger | Action | Cost |
|---|---|---|---|
| 0 | Selector resolves to 0 elements | Try each fallback selector in order | free |
| 1 | All fallbacks fail | Re-derive selector from live field inventory by matching `labelNorm` | free |
| 2 | Label not found either | Re-run inventory after network idle + 1.5s (late-mounted React) | free |
| 3 | Still failing, or unknown widget | **AI repair**: distilled DOM + cropped screenshot → candidate patch | ~$0.001–0.01 |
| 4 | AI patch fails validation twice | Pause run, screenshot, push to Blocked queue, notify | human |

### AI patch validation

An AI-proposed patch is **never executed directly**. It must pass:

1. Zod schema validation on the response
2. Selector resolves to exactly **one** element in the live DOM
3. That element is visible and enabled
4. Element type matches the step type (a `fill` step must target an input/textarea/contenteditable)
5. After execution, the value reads back correctly

Fail any check → one retry with the failure reason fed back → then tier 4.

### Promotion

A tier 1–3 repair that leads to a successful **submit** writes a new `proposed` recipe version with the working selector as primary and the old one demoted to fallback. It runs against the captured fixture before reaching `shadow`.

This is the loop that makes the tool converge: real breakage → AI repair → validated → fixture test → promoted → free forever after.

---

## 8. AI usage

Every call is one of six enumerated purposes. Each has its own prompt, Zod output schema, and model tier. There is no general-purpose "ask the model" path.

| Purpose | Model tier | Input | Output |
|---|---|---|---|
| `classify_page` | small | distilled DOM head + title | `login \| form_step \| review \| confirmation \| error \| captcha \| expired` |
| `resolve_labels` | small | unlabeled fields + cropped screenshot | label per field id |
| `map_option` | small | canonical value + option list | option index or `null` |
| `repair_step` | medium | failed step + distilled DOM + screenshot | selector patch |
| `draft_answer` | large | question + profile context + job context | draft text, **requires approval** |
| `write_cover_letter` | large | job description + resume variant | letter, cached by job family |

### Distillation — what AI actually sees

**Raw HTML is never sent.** The distiller emits a compact line format:

```
PAGE title="Software Engineer — Application" step=2/4
[f1] text required label="First Name" name="first_name"
[f2] select required label="Work authorization" options="Yes, authorized|No, need sponsorship"
[f3] combobox label=? aria="Location" placeholder="Search locations"
[f4] file required label="Resume" accept=".pdf,.doc,.docx"
BUTTONS: "Back" | "Continue" | "Save draft"
ERRORS: none
```

Rules enforced in code, not convention:

- Hard cap of 60 fields and 8KB per call. Overflow paginates.
- **All current values stripped.** The model sees field shapes, never your data.
- PII regex scrub (email, phone, SSN, address) as a second pass, in case a value leaks through a label.
- Screenshots only when the distilled DOM is insufficient — unknown widget, `label=?`, or a visual-only label. Cropped to the field's bounding box with 40px padding, downscaled to max 800px wide.
- Every unknown field on a page batches into **one** call, never one call per field.

### Cost controls

- Per-run token ceiling and per-day spend ceiling. Exceeding either pauses rather than silently burning budget.
- Response cache keyed by `(purpose, normalized_input_hash)`. Identical distilled pages cost nothing the second time.
- `ai_calls` table records purpose, model, tokens, cost, cache hit, and the run it belonged to → feeds cost-per-application on the Metrics page.

---

## 9. The submit gate

Nothing submits unless all of these hold:

```
✓ every required field has status 'resolved' or 'user_approved'
✓ every filled value read back correctly from the DOM
✓ no inline validation errors present
✓ no unresolved typeahead raw-text (chip/token verified)
✓ page classified as a form step, not an error or expired page
✓ EITHER  recipe version is 'active' AND autopilot enabled for this site
   OR     user clicked approve in the preflight screen
```

Preflight shows a field-by-field table — label, value, source, confidence — plus a live screenshot. Autopilot is opt-in **per recipe version**, not global, so trusting Greenhouse never implies trusting Workday.

After submit: detect the confirmation page, capture a full-page screenshot as proof, store the path on the application record.

---

## 10. Data model

```
profile                (id, key, value, updated_at)              -- flat kv, easy to extend
documents              (id, kind, label, path, keywords[], is_default)
companies              (id, name, domains[], blacklisted, reason, notes)

jobs                   (id, url, canonical_url, dedup_key, source, company_id,
                        title, location, platform, salary_min, salary_max,
                        posted_at, fit_score, status, created_at)

runs                   (id, job_id, mode, status, recipe_version_id,
                        started_at, finished_at, token_cost_usd, wall_ms, error)
run_events             (id, run_id, seq, type, step_id, selector, status,
                        screenshot_path, duration_ms, detail_json)

fields_seen            (id, run_id, fingerprint, label_raw, label_norm, type,
                        options_json, required, section_heading)
questions              (id, fingerprint, label_norm, label_raw_examples_json,
                        type, options_hash, occurrences, first_seen, last_seen)
question_aliases       (id, question_id, alias_norm, source)
answers                (id, question_id, scope, company_id, job_id,
                        canonical_value, source, confidence, verified_at)
option_mappings        (id, question_id, options_hash, canonical_value, chosen_option)

recipes                (id, scope, platform, match_json)
recipe_versions        (id, recipe_id, version, status, steps_json, hints_json,
                        created_by, runs, successes, failures, last_success_at)

ai_calls               (id, run_id, purpose, model, in_tokens, out_tokens,
                        cost_usd, cache_hit, created_at)

credentials            (id, site, encrypted_blob, iv)
browser_sessions       (id, site, storage_state_encrypted, expires_at)

applications           (id, job_id, run_id, submitted_at, proof_screenshot,
                        status, status_updated_at, source_of_status)
application_events     (id, application_id, type, occurred_at, detail_json)
contacts, interviews, notes                                       -- phase 9+
```

Embeddings live in a `question_embeddings` table as `BLOB` (Float32Array). Cosine in-process is fine below ~50k questions; `sqlite-vec` is the upgrade path.

---

## 11. Web UI

Nav: **Dashboard · Jobs · Runs · Questions · Profile · Applications · Recipes · Metrics · Settings**

### Dashboard
What needs you right now. Blocked-run count, unanswered-question count, today's spend against budget, degraded recipes, recent activity feed. Everything is a link into the relevant page.

### Jobs
Where jobs come in.

- Big paste box that accepts **multiple URLs at once**, newline or comma separated
- On paste: canonicalize URL, dedup against existing jobs (same posting on LinkedIn / Indeed / company site collapses to one), detect platform, fetch title/company/description, compute fit score
- Table with platform badge, easy-apply vs external-apply classification, fit score, status, blacklist warning
- Bulk select → Queue run
- Filters: platform, fit score, status, salary floor, staffing agency flag, stale (60+ days), blacklisted company
- Later phase: saved searches that pull new postings automatically

### Runs (the live view)
Two panes.

**Left — live browser.** CDP `Page.startScreencast` streaming JPEG frames over WebSocket into a `<canvas>`. Works headless. Controls: pause, resume, step-through, take control (opens headed browser for CAPTCHA/2FA), abort.

**Right — step timeline.** Live-updating list of run events with status icons, durations, and a thumbnail per step. Clicking a step shows the field table for that page: label, resolved value, source, confidence. Failed steps show the healing tier that engaged and what it tried.

Run detail is the same view, replayed from stored events after the fact.

### Questions
The heart of the compounding loop. **Questions are re-rendered exactly as they appeared** — same label text, same input type, same option list, same required marker, same section heading. Answering here is visually identical to answering on the real site, which is what makes the answers trustworthy.

- Grouped by fingerprint: near-identical questions across different jobs collapse into one card, with a list of which applications are blocked on it. One answer unblocks all of them.
- Each card shows: the rendered control, the source job(s), how many times this question has been seen, and — for tier 3 matches — a pre-filled suggestion with the similarity score and the question it matched.
- Per-answer scope toggle: reuse everywhere / this company only / this job only.
- Optional **AI draft** button for free-text questions. Draft appears in the box for you to edit; nothing is saved until you approve.
- **Resume** button per blocked application, picks up from the saved step.
- Mobile-friendly layout — this is the page you'll clear from your phone.

### Profile
Structured intake of everything that answers a `global` question.

- Identity: name, email, phone, address, work authorization, sponsorship needs, veteran/disability/EEO preferences (with a global fill-vs-decline setting)
- Links: LinkedIn, GitHub, portfolio, website
- Work history, education, skills — structured, because some ATS forms want them field by field rather than parsed from a resume
- Documents: multiple resume variants tagged with keywords (backend / data / general), cover letter templates
- **Profile completeness score**: lists the most common questions across all jobs seen that your profile currently cannot answer, ranked by how often they appear. Fill the gaps before they block anything.
- Keyword gap check: paste a job description, see which terms are missing from the selected resume variant

### Applications (tracker)
One row per submitted application.

- Status pipeline: `applied → viewed → screening → interview → offer → rejected → ghosted`
- Auto-updated from Gmail parsing where possible, manually editable always
- Proof screenshot, run link, resume variant used, submission timestamp
- Follow-up reminders (7 days silent → nudge)
- Notes, contacts, interview dates per job
- Export to CSV

### Recipes
- Table of platforms with health: run count, success rate, last success, current version status
- Drill-in: version history, step list, per-step failure rate — so you can see *which step* is breaking, not just that something is
- Actions: promote proposed → shadow, roll back, edit steps, run against fixture, enter record mode
- Degraded recipes surface loudly

### Metrics
- Funnel: jobs added → applied → viewed → screening → interview → offer
- Response rate sliced by site, resume variant, job title, day and time of submission
- Time-to-first-response distribution
- **Cost per application**: tokens, AI calls, wall-clock time. Trending down is the whole point, so this is the headline chart
- AI fallback rate over time, by platform — the number that should approach zero

### Settings
Autopilot toggles per recipe version. Daily per-site caps and delay ranges. Model selection per AI purpose. Spend budgets. Per-site automation on/off. EEO global default. Notification channels. Encryption passphrase.

---

## 12. Testing

Test strategy is load-bearing here, because the thing being automated changes underneath you without warning.

### Fixture corpus — the most valuable asset in the repo
Saved HTML snapshots of real application pages, one directory per platform, assets stripped and inlined, served by a local static server. Golden tests assert `fixture → expected FieldInventory JSON`. When a platform redesigns, the diff is visible immediately.

### Mock ATS
A local Fastify app that imitates the shapes real ATS platforms take: multi-step wizards, conditional fields that appear based on prior answers, inline validation errors, custom comboboxes, file upload with type restrictions, session timeout, rate limiting. Integration tests run full applications against it end to end.

**Never run integration tests against real employer sites.**

### Test layers

| Layer | Tool | What it covers |
|---|---|---|
| Unit | Vitest | Normalizer, matcher thresholds, option mapper, selector generator, distiller, PII scrubber |
| Golden | Vitest + fixtures | Field inventory extraction per platform |
| Matching | Vitest | Labeled corpus of should-match / should-not-match question pairs. **Regressions here are severe** — a false match means a wrong answer submitted |
| Integration | Vitest + mock ATS | Full pipeline, healing tiers, gate logic |
| Recipe contract | Vitest | Every recipe version must pass its fixture before promotion to shadow |
| E2E | Playwright Test | Real UI against mock ATS: paste link → run → answer question → resume → submit |
| Safety | Vitest | No submit with unresolved required field. No raw HTML to AI. No PII in distilled payload. Rate limiter holds. Blacklist respected |

### Failure replay
When a real run fails, the distilled page and full DOM snapshot are written to `fixtures/pages/_incoming/`. A CLI command promotes an incoming fixture into the golden suite with expected output. The regression suite grows from actual breakage.

---

## 13. Safety and robustness

- **Rate limiting**: per-site daily caps, randomized delays between actions drawn from a human-plausible distribution, randomized ordering within a batch.
- **Captchas are solved by SessionKit** (audio reCAPTCHA, Cloudflare click, 2captcha fallback). **2FA is never bypassed.** Detection → pause → notify → human takes control → resume.
- **Per-site automation toggle**, default off for any site whose terms prohibit automation. The Settings page states plainly that this is your call to make.
- **Truthfulness**: the tool answers from your profile and your prior answers. It has no path to invent a credential, a date, or a qualification. AI drafting is limited to free-text prose and always requires approval.
- **Partial save**: run state persists per step, so an interrupted application resumes rather than restarting.
- **Retry queue** with logged, categorized failure reasons.
- **Credential vault**: AES-256-GCM, key derived from a passphrase via scrypt, held in memory only for the session. Session storage-state encrypted at rest.
- **Proof of submission**: full-page screenshot at the confirmation page, stored against the application.

---

## 14. Build phases

Each phase ships something usable and has hard exit criteria. No phase starts before the previous one's tests pass.

| Phase | Ships | Exit criteria |
|---|---|---|
| **0** Scaffold | Monorepo, DB, config, test harness, CI | `pnpm test` green on empty suite; migrations run |
| **1** Intake | Profile, documents, job paste + platform detection | Paste 10 real URLs → correct platform on ≥8, dedup works |
| **2** Inventory | Field extraction + label ladder, read-only | Golden tests pass on 5 platform fixtures; ≥95% of fields get a non-fallback label |
| **3** Answer bank | Normalizer, matcher, Questions UI, dry-run resolution | Matching corpus: ≥0.95 precision on should-match, **zero** false positives on should-not-match |
| **4** Fill | Real filling, verification, preflight, manual submit, live view | Full application on mock ATS filled correctly, user clicks submit |
| **5** Recipes | Record mode, recipe engine, Recipes page | Recorded recipe replays successfully on the same fixture |
| **6** AI fallback | Distillation, 6 call purposes, patch validation, cost tracking | Unknown widget on mock ATS resolved by AI, patch validated, cost logged |
| **7** Healing | Tiers 0–4, promotion, quarantine, rollback, resume | Deliberately broken selector self-heals and promotes a new version |
| **8** Autopilot | Gate, per-recipe autopilot, rate limits, proof screenshots | 10 consecutive unattended mock applications, zero bad submits |
| **9** Tracker | Gmail OAuth, inbox parsing, status pipeline, follow-ups | Test inbox → correct status transitions |
| **10** Scale | Metrics, saved searches, fit score, extension, notifications | Metrics reconcile against raw tables |

---

## 15. Open decisions

Flagged rather than guessed, to be resolved during the phase that needs them.

- **Take control UX.** Headless with screencast is the clean default, but handing the browser to a human for CAPTCHA needs either a headed window or a remote interactive browser. Simplest v1: pause, open the same session headed on the same machine, resume when the user clicks done.
- **Workday accounts.** Workday requires account creation per employer tenant. Needs a dedicated flow — create-or-login, store credentials in the vault, and handle email verification via inbox parsing. Probably its own mini-phase inside phase 5.
- **Embedding model size.** `bge-small` is the starting point. If matching precision on the labeled corpus falls short, step up to `bge-base` before reaching for an LLM.
- **Fit score formula.** Start with keyword overlap between job description and selected resume variant, plus title similarity and salary floor. Tune later against real response-rate data from the Metrics page.
