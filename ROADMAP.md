# Roadmap — Frappe Sheets Next → Production

**Owner:** Asif
**Last updated:** 2026-05-16
**Source review:** [CTO_REVIEW.md](./CTO_REVIEW.md)
**Goal:** Take Frappe Sheets Next from "polished prototype" to "defensible v1 in production" in ~3 months, then to "multi-user collaborative product" within a quarter after that.

This roadmap is built directly from the [scorecard](./CTO_REVIEW.md#scorecard) in the review. Each phase closes a specific failing or D-grade dimension. Phases are sequenced so earlier work makes later work cheaper.

---

## Table of contents

- [How to read this](#how-to-read-this)
- [Phase 0 — Safety net](#phase-0--safety-net-week-1)
- [Phase 1 — Correctness](#phase-1--correctness-week-2)
- [Phase 2 — Refactor and observability](#phase-2--refactor-and-observability-week-3)
- [Phase 3 — Scale](#phase-3--scale-weeks-46)
- [Phase 4 — Concurrency v1](#phase-4--concurrency-v1-week-7)
- [Phase 5 — Quality, a11y, mobile](#phase-5--quality-a11y-mobile-weeks-89)
- [Phase 6 — Types and platform hardening](#phase-6--types-and-platform-hardening-weeks-1011)
- [Phase 7 — Real-time collaboration](#phase-7--real-time-collaboration-months-46)
- [Definition of done — production-grade v1](#definition-of-done--production-grade-v1)
- [Risk register](#risk-register)

---

## How to read this

Each phase has:
- **Goal** — single sentence describing the win.
- **Why now** — what it unblocks or de-risks.
- **Tasks** — concrete units of work, sized in eng-days.
- **Acceptance criteria** — how we know it's done.
- **Exit grade** — which dimensions on the [scorecard](./CTO_REVIEW.md#scorecard) get upgraded.

Sizing convention: **XS** ≤ 0.5d · **S** = 1d · **M** = 2–3d · **L** = 4–5d · **XL** = 1–2 weeks.

Phases 0–6 are the path to production v1. Phase 7 is the post-v1 collaboration moat.

---

## Phase 0 — Safety net (week 1)

### Goal
Stop shipping blind. Get a test runner, lint, and CI green-on-main before touching engine code.

### Why now
Every fix below this line is risky without tests. This is the cheapest investment with the highest leverage — it makes every subsequent phase faster and safer.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 0.1 | Add Vitest + JSDOM to `frontend/package.json`; wire `npm test` | XS | Use `@vitest/coverage-v8`. |
| 0.2 | Vitest suite — `engine/formula.js` tokenizer | M | Cover every token class, edge cases (sheet names with spaces, scientific notation, error literals). Target ~60 cases. |
| 0.3 | Vitest suite — `engine/formula.js` evaluator | L | Every function in `FUNCTIONS`. Numeric, text, date, lookup, conditional, error propagation. Target ~150 cases. |
| 0.4 | Vitest suite — `engine/deps.js` | M | Cyclic graphs, range refs, cross-sheet, rebuild after insert/delete row/col. |
| 0.5 | Vitest suite — `engine/sheet.js` | M | Insert/delete row/col preserving formula refs, sheet switch, snapshot/restore round-trip. |
| 0.6 | Vitest suite — `engine/sortFilter.js`, `engine/clipboard.js`, `engine/history.js`, `engine/formats.js`, `engine/merge.js` | M | Smaller surfaces; cover the documented behaviors. |
| 0.7 | ESLint + Prettier config; `npm run lint` script | XS | Use `@vue/eslint-config-prettier` as base. |
| 0.8 | GitHub Actions workflow: install → lint → vitest → build | S | Block merges on failure. |
| 0.9 | Add coverage threshold gate (start at 70% for `engine/`) | XS | Will rise over time. |

### Acceptance criteria
- `npm test` runs ≥300 cases, exits 0.
- `npm run lint` exits 0 on `main`.
- CI badge in README; red PRs cannot merge.
- Engine coverage ≥ 70%.

### Exit grade
**Testing: F → C+** · **Code quality: B → B+**

---

## Phase 1 — Correctness (week 2)

### Goal
Fix the P1 bugs flagged in the review now that the test suite can prove the fixes don't regress anything.

### Why now
With Phase 0 in place, every fix below ships with a regression test. Without Phase 0, these fixes are riskier than the bugs.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 1.1 | **Bug:** Circular-reference key collision ([review §4](./CTO_REVIEW.md#4-circular-reference-detection-key-collides)). Key by `${sheet}::${cellId}`, pass caller through `_evalFormula`. | S | Add regression test: two cells, same formula text, different cells, neither should be `#CIRCULAR!`. |
| 1.2 | **Bug:** No formula recursion depth limit ([review §5](./CTO_REVIEW.md#5-no-formula-recursion-depth-limit)). Add `MAX_DEPTH = 64`, return `#REF!` on exceed. | XS | Regression test: pathological `INDIRECT` chain returns `#REF!`, doesn't blow stack. |
| 1.3 | **Perf bug:** No per-tick memoization ([review §6](./CTO_REVIEW.md#6-no-memoization-within-a-recalc-tick)). Add value cache keyed `${sheet}:${cellId}`, invalidated on `setCell`. | M | Microbenchmark before/after — `SUM(A1:A100)` with each cell `=B*2` should drop from O(N²) to O(N). |
| 1.4 | **Perf bug:** History full-state snapshots ([review §7](./CTO_REVIEW.md#7-history-snapshots-full-state-every-push)). Migrate to command pattern: `{op, sheet, id, before, after}`. | M | Same `undo/redo` API. Test: undo a `setCell` doesn't snapshot 10k cells. |
| 1.5 | **Security:** Save-size cap ([review §8](./CTO_REVIEW.md#8-no-size-cap-on-save-payload)). Reject >5MB in `save_sheet`. Add server-side `validate()` on the Sheet doctype. | XS | Test: 6MB payload → 400, 4MB → 200. |
| 1.6 | **Bug:** Sheet doctype permissions ([review §security](./CTO_REVIEW.md#security-and-permissions)). Audit `sheet.json` permissions; remove `email`, `export`, `print`, `report`, `share` from `All` unless intentional. | XS | Manual audit + checklist. |
| 1.7 | **Doc:** Clipboard formula-vs-value semantics ([review §9](./CTO_REVIEW.md#9-cross-sheet-paste-data-integrity)). Add tooltip or menu option for "Copy as formula". | XS | UX choice — minimal scope here. |

### Acceptance criteria
- All P1 bugs from the review have a closing test in Phase 0's suite.
- A `MAX_DEPTH` integration test exists.
- 6MB save payload is rejected at the API layer with a clear error.
- Permissions on `Sheet` doctype match a written security policy (in `SECURITY.md`).

### Exit grade
**Correctness: C+ → B+** · **Security: C → B−**

---

## Phase 2 — Refactor and observability (week 3)

### Goal
Eliminate the `SheetEditor/index.vue` god-component and turn on the lights with error reporting.

### Why now
Future feature work — especially cell-level persistence and collab — touches this file. Splitting it now means every later PR is half the size. Adding Sentry now means we'll have data on real production errors from day one.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 2.1 | Extract `useAutoSave.js` from `SheetEditor/index.vue` | S | Owns debounce, dirty tracking, `isDirty`, `justSaved`, `saveError`. |
| 2.2 | Extract `useClipboard.js` (cut/copy/paste + marching-ants) | S | Encapsulates `onDocCopy/Cut/Paste`, `grid.setMarchingAnts`, escape cancel. |
| 2.3 | Extract `useContextMenu.js` | S | Row/col insert/delete, freeze, unfreeze. |
| 2.4 | Extract `useFormulaBar.js` (autocomplete + keydown) | S | Includes `AC_FUNS` map. |
| 2.5 | Extract `useBorders.js` | XS | Dropdown options + apply logic. |
| 2.6 | Extract `useCSV.js` | S | Import + export. |
| 2.7 | Extract `useSelectionStats.js` | XS | Sum/avg/count for selection. |
| 2.8 | After extraction: `SheetEditor/index.vue` ≤ 300 lines, no inline logic | XS | Layout shell only. |
| 2.9 | Sentry SDK install + DSN config from Frappe site settings | S | Wrap `App.vue` with error boundary. Tag `release`. Capture `loadSheet` and `_persist` failures explicitly. |
| 2.10 | Toast / banner UI for save errors (replace 5s self-clearing) | XS | Use Frappe UI `Alert` component. User must dismiss. |
| 2.11 | Add `beforeunload` guard when `isDirty && id === 'new'` | XS | Standard "you have unsaved changes" prompt. |

### Acceptance criteria
- `SheetEditor/index.vue` ≤ 300 lines.
- Each new composable has its own Vitest test file.
- Sentry receives a test event from staging.
- Forgetting to save a new sheet shows a browser prompt before navigation.

### Exit grade
**Architecture: B+ → A−** · **Observability: F → C** · **Code quality: B+ → A−**

---

## Phase 3 — Scale (weeks 4–6)

### Goal
Break the single-blob persistence ceiling. The product should comfortably handle 100k populated cells.

### Why now
This is the biggest engineering investment and the hardest revert if done late. Do it before adding collaboration — collab built on the blob model would be a rewrite.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 3.1 | New doctype `Sheet Cell` (child of `Sheet`): `sheet_name`, `cell_id`, `raw_value` (Long Text), `format_json` (Long Text), `revision_id` | S | Index on `(parent, sheet_name, cell_id)`. |
| 3.2 | Migration: existing `Sheet.sheets_data` blob → child rows. Idempotent, reversible. | M | Patch in `frappe_sheets_next/patches/`. Test on a copy of staging first. |
| 3.3 | API: `get_sheet_cells(name, sheet_name=None, after_revision=None)` returning paginated cells | M | Streams large sheets. Supports incremental sync. |
| 3.4 | API: `patch_sheet_cells(name, changes: [{op: set\|delete, sheet_name, cell_id, raw_value, format_json}])` | M | Validates each change. Bumps `revision_id`. Atomic per request. |
| 3.5 | Client: dirty-set tracking — record `{cell_id, before, after}` for every mutation | M | Hook into `sheet.setCell` and `formats.set`. |
| 3.6 | Client: replace `usePersistence._persist` with delta-PATCH | M | Falls back to full snapshot for new docs only. |
| 3.7 | Client: `loadSheet` becomes paginated (load first N visible cells, hydrate remainder lazily) | M | Use `requestIdleCallback` for non-blocking hydration. |
| 3.8 | Cap removed: `TOTAL_ROWS` raised to 10k, `TOTAL_COLS` stays at 26 for v1 | XS | Now safe with windowed render + lazy hydration. |
| 3.9 | Playwright e2e: open 100k-cell sheet, edit, save, reload, verify | M | Generate fixture with seed script. |
| 3.10 | Benchmark suite — save latency, load latency, paste-1000 latency. Add to CI as informational. | S | Track regression over time. |

### Acceptance criteria
- 100k-cell sheet loads in <3s on a mid-tier laptop.
- Saving a 10-cell edit on a 100k-cell sheet ships <50KB to the server.
- Existing `Sheet` docs migrate without data loss.
- Playwright e2e green.

### Exit grade
**Scalability: D → A−** · **Performance: B− → A−**

---

## Phase 4 — Concurrency v1 (week 7)

### Goal
Minimum-viable multi-user safety — two users editing the same sheet no longer cause silent data loss.

### Why now
Phase 3 introduced `revision_id` per cell. Building optimistic concurrency on top of it is now cheap.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 4.1 | Add `revision_id` to `Sheet` doctype itself (workbook-level counter) | XS | Bumped by every successful `patch_sheet_cells`. |
| 4.2 | `patch_sheet_cells` returns 409 if client's `expected_revision_id` < server's | S | Client must refresh. |
| 4.3 | Client: on 409, fetch latest, replay un-pushed changes if cells don't overlap; otherwise prompt user | M | Conflict-resolution heuristic. |
| 4.4 | Banner UI: "Sheet was updated by another user — refreshing" | XS | Friendly, non-modal. |
| 4.5 | E2e: two browser contexts, both save → only one wins, the other gets clean refresh + warning | M | Playwright multi-context. |

### Acceptance criteria
- No silent overwrites in the concurrent-edit test.
- Conflict resolution falls back to "refresh and lose un-pushed changes" with explicit user consent.

### Exit grade
**Reliability: B → A−** (new dimension, implicit win)

---

## Phase 5 — Quality, a11y, mobile (weeks 8–9)

### Goal
Clear the accessibility and mobile blockers before any external launch.

### Why now
Enterprise procurement teams ask for WCAG conformance statements. Mobile usage is a non-negotiable for content tools in 2026.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 5.1 | Canvas ARIA: `role="grid"`, `aria-rowcount`, `aria-colcount`, live region announcing selection | M | Screen-reader test with VoiceOver + NVDA. |
| 5.2 | Keyboard-only path to color pickers — custom palette popover with arrow-key nav | M | Replaces native `<input type=color>`. |
| 5.3 | Touch event handlers: tap-to-select, long-press for context menu, two-finger scroll | M | New module `canvas/touch.js`. |
| 5.4 | Soft-keyboard handling: focus management on mobile WebKit | S | Test on iOS Safari + Android Chrome. |
| 5.5 | i18n: replace all hardcoded strings with `__()` calls; add translation keys | M | Cover toolbar, dialogs, error messages, find/replace, home page. |
| 5.6 | `beforeunload` guard for existing docs too (not just new) | XS | When `isDirty` is true. |
| 5.7 | Empty-state polish on `Home.vue` (illustration + CTA) | XS | Already partly done. |
| 5.8 | Loading states for `loadSheet` (skeleton, not blank canvas) | S | Use Frappe UI `Spinner`. |
| 5.9 | High-contrast theme variant (Espresso supports it via `data-theme="dark"`) | M | Validate every component. |

### Acceptance criteria
- WCAG 2.1 AA self-audit passes via axe-core in Playwright.
- Sheet is fully usable on iPhone Safari (open, edit, save).
- All UI strings flow through translation system.

### Exit grade
**Accessibility: D → B+**

---

## Phase 6 — Types and platform hardening (weeks 10–11)

### Goal
Lock the engine contracts so future work doesn't break them. Add the platform-level features (revision history, comments) that customers expect.

### Why now
Once the product is in real-customer hands, refactor velocity becomes precious. TypeScript pays back forever, but only after the architecture stabilizes (which it has by this point).

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 6.1 | Convert `engine/` modules to TypeScript | L | Strict mode. Generic over sheet name where helpful. |
| 6.2 | Convert `canvas/` modules to TypeScript | L | `createGrid` becomes typed; the 9-callback contract gets a named interface. |
| 6.3 | Convert `pages/SheetEditor/composables/*` to TypeScript | M | Easier post-Phase 2. |
| 6.4 | Frappe doctype `Sheet`: `track_changes: 1` for audit log | XS | Just a flag, free win. |
| 6.5 | Frappe-native comments on sheets (use `Comment` doctype) | M | UI in `SheetEditor` — right sidebar. |
| 6.6 | Revision history viewer — list past `revision_id` snapshots, click to preview | L | Server: store deltas as `Sheet Revision` child docs. Client: read-only canvas variant. |
| 6.7 | Named ranges + data validation (basic: list-of-values, number range) | L | DocType `Sheet Named Range`; UI in toolbar. |
| 6.8 | `SECURITY.md` and `CONTRIBUTING.md` | S | Standard OSS hygiene. |

### Acceptance criteria
- `tsc --noEmit` runs in CI.
- No `any` in `engine/` or `canvas/` boundaries.
- Audit log visible in Frappe Desk under the Sheet doctype.
- Users can revert to a past revision.

### Exit grade
**Code quality: A− → A** · **Data model gaps closed**

---

## Phase 7 — Real-time collaboration (months 4–6)

### Goal
Multiple users editing the same sheet simultaneously, with cursors visible and changes merging without conflict.

### Why now
This is the product moat. Skip if the customer profile is single-user / async-only. Do it if you're competing with Google Sheets.

### Tasks

| ID | Task | Size | Notes |
|---|---|---|---|
| 7.1 | Spike: evaluate Yjs vs. Automerge vs. custom OT against this data model | M | Cell-level granularity matters. Yjs has good Frappe ecosystem fit. |
| 7.2 | Frappe realtime channel `sheet:{name}` — pub-sub via Socket.IO | M | Use `frappe.publish_realtime`. |
| 7.3 | CRDT integration on the client; replace dirty-set with CRDT ops | XL | Replaces Phase 3's delta-PATCH for live edits. PATCH stays for offline. |
| 7.4 | Server-side conflict-free merge: deduplicate, persist `Sheet Cell` rows | XL | Cell-level operations as CRDT ops. |
| 7.5 | Presence: show other users' cursors and selections in different colors (still Espresso palette) | M | Each user gets a color from a fixed palette. |
| 7.6 | Awareness UI: avatar stack of current viewers in topbar | S | Frappe UI `Avatar` component already there. |
| 7.7 | Offline mode: queue ops when disconnected, replay on reconnect | L | Detect via Socket disconnect. |
| 7.8 | Soak test: 10 users, 1 sheet, random edits for 1 hour, verify final state | L | Failure mode for CRDT bugs. |

### Acceptance criteria
- Two users typing in adjacent cells see each other's edits in <500ms.
- 10-user soak test produces deterministic final state.
- Reconnect after 30s offline syncs cleanly.

### Exit grade
**Reliability: A− → A** · **The collaboration moat exists**

---

## Definition of done — production-grade v1

After Phases 0–6 the scorecard should look like:

| Dimension | Before | After v1 |
|---|---|---|
| Architecture | B+ | A− |
| Code quality | B | A |
| Correctness | C+ | A− |
| Performance | B− | A− |
| Security | C | B+ |
| Scalability | D | A− |
| Observability | F | B+ |
| Testing | F | B+ |
| Accessibility | D | B+ |
| **Overall** | **Not yet** | **Production v1** |

Phase 7 takes it to A across the board. Multi-user is the optional final lift.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration in Phase 3 corrupts existing data | Med | Critical | Test on staging copy. Reversible patch. Snapshot DB before. |
| Vitest coverage proves harder than estimated (formula engine has many edge cases) | Med | Medium | Coverage threshold starts at 70%, ratchets up over phases. |
| Frappe realtime is brittle under load | Med | High (Phase 7 only) | Spike first (7.1). Have a fallback to polling-PATCH from Phase 3. |
| Canvas a11y is harder than the audit suggests (Phase 5) | Med | Medium | Engage a screen-reader user in week 8 for direct feedback. |
| Refactor in Phase 2 introduces regressions | Low | High | Phase 0 tests catch this. Each composable PR is small. |
| TypeScript migration breaks build via dependency types | Low | Medium | Migrate engine first (zero external types), then UI. |

---

## What to do tomorrow

1. Create `frontend/vitest.config.js`.
2. Write the first test: `tokenize('=SUM(A1:A10) + B1 * 2')` returns the expected token sequence.
3. Watch it pass.
4. Set up the GitHub Action.
5. From there, the roadmap runs itself.

The single highest-leverage hour you can spend on this codebase tomorrow is **getting the first test green.** Everything else compounds.
