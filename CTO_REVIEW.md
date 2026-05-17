# CTO Review — Frappe Sheets Next

**Date:** 2026-05-16
**Reviewer:** CTO-level engineering audit
**Scope:** Frontend (`frontend/src`), backend (`frappe_sheets_next/`), persistence model, ops posture
**Verdict:** **Not production-grade today.** Strong foundation, ~3–4 weeks of focused work to reach "ship to friendly users" for a single-user, sub-50k-cell workload. Meaningfully longer for multi-user collaboration or large-sheet performance.

---

## Table of contents

1. [Executive summary](#executive-summary)
2. [What's good](#whats-good)
3. [Blockers — must fix before production](#blockers--must-fix-before-production)
4. [P1 correctness bugs](#p1-correctness-bugs)
5. [P2 issues](#p2-issues)
6. [Code quality and maintainability](#code-quality-and-maintainability)
7. [Recommended roadmap](#recommended-roadmap)
8. [Scorecard](#scorecard)

---

## Executive summary

Frappe Sheets Next has the bones of a credible spreadsheet product. The canvas/engine/Vue split is disciplined, the rendering pipeline is correctly windowed, the formula engine covers ~100 functions, and the UI is polished against the Espresso design language. A first-time reader can navigate the codebase and reason about it.

That said, this is a product, not a prototype, and several gaps disqualify it from a production label in 2026:

- **Zero automated tests** against a 611-line formula engine and a 200-line dependency-graph engine.
- **Persistence is a single JSON blob** in a `Long Text` column, re-serialized on every autosave. Hard ceiling around tens of thousands of populated cells.
- **No concurrency story.** Two users on the same sheet causes silent data loss on save.
- **Latent correctness bugs** in circular-reference detection, formula recursion, and history snapshots that will manifest in real workloads.
- **No observability, no CI, no error boundaries.** When something breaks in production you will have nothing to debug with.

The good news: none of these require a rewrite. The architecture supports targeted fixes, and the highest-leverage work (tests, P1 bugs, cell-level persistence) is well-scoped.

---

## What's good

| Area | Notes |
|---|---|
| **Layer separation** | `canvas/` (geometry + renderer + grid), `engine/` (sheet + formula + deps + history + clipboard + formats + merge + sortFilter), and the Vue layer are independently reason-aboutable. The `getGrid` getter pattern and `_repopulateGrid` discipline are correct and documented. |
| **Windowed canvas rendering** | `renderer.js` only iterates `firstVisCol..lastVisCol` × `firstVisRow..lastVisRow`. `TOTAL_ROWS = 1000` doesn't materialize. Render cost is bounded by viewport, not sheet size. |
| **Espresso fidelity** | Tokens, fonts, components, motion — feels like a Frappe app. Memory captures the design rules. |
| **Formula engine breadth** | `engine/formula.js` (611 lines) hand-implements tokenizer, parser, and ~100 functions with zero dependencies. Cross-sheet refs work. Decent foundation. |
| **Reverse-dependency graph** | `engine/deps.js` enables O(affected) recalc instead of O(N) rebuild on every keystroke. |
| **Selection model** | `cell` / `row` / `col` / `all` modes with consistent fill/border/header treatment. Recently added marching-ants, select-all corner, double-click auto-fit — all clean small features. |
| **Undo/redo contract** | `history.js` is portable; `snapshot()`/`restore()` is the right shape, even if the current implementation is expensive. |
| **Clipboard semantics** | Internal vs. system clipboard split is correct; cut properly clears source on paste via the `_mode` flag. |

---

## Blockers — must fix before production

### 1. Zero automated tests

```
$ find . -name "test_*.py" -o -name "*_test.py" -o -name "*.test.*" -o -name "*.spec.*"
(no results)
```

A 611-line formula engine without a single regression test will bleed bugs forever. The dependency engine and history layer are equally untested.

**Minimum bar to clear:**
- Vitest suite over `formula.js` (tokenizer, evaluator, every function, error paths)
- Suite over `deps.js` (cyclic graphs, range refs, cross-sheet, rebuild after row insert/delete)
- Suite over `sheet.js` (insert/delete row/col preserving formulas, sheet switch, snapshot/restore)
- Suite over `sortFilter.js` (sort stability, multi-column filter, hide computation)
- Suite over `clipboard.js` (cut clears source, paste at edge, system fallback)
- Playwright e2e covering: open sheet → edit → format → paste → undo → save → reload → verify

**Estimated effort:** 1 week for ~80% coverage. Pays back from day one.

### 2. Persistence model doesn't scale

`sheets/doctype/sheet/sheet.json` stores the whole workbook as one `Long Text` field `sheets_data`. `usePersistence.js:_persist` serializes `sheet.snapshot() + formats.snapshot()` and POSTs the entire blob on every autosave (debounced 2s).

Implications:
- 50k populated cells ≈ several MB per save. Each save round-trips the whole document.
- No partial reads, no streaming, no delta protocol.
- Frappe's `modified` watchdog will flag false conflicts.
- The 2s debounce that's fine for 100-cell sheets will saturate the network on 10k-cell sheets.

**Fix shape:**
- New child doctype `Sheet Cell` with `parent`, `sheet_name`, `cell_id`, `raw_value`, `format_json`.
- A `frappe.db.bulk_update` PATCH endpoint that accepts `{added, modified, deleted}` deltas.
- Client maintains a dirty-set and ships only the diff.
- Bulk load via `frappe.db.sql` with appropriate indexes.

**Estimated effort:** 1–2 weeks. Unlocks scale, revision history, and the multi-user story.

### 3. No concurrency or collaboration story

Two users with the same sheet open → last save wins, the other's edits vanish silently. There is no:
- Document-level optimistic lock (no `etag` / `version_id`).
- Real-time channel.
- Operational transform or CRDT layer.
- Conflict notification UI.

**Minimum viable fix (1 week):** Increment a `revision_id` integer on every save. Server returns 409 on stale writes. Client refuses to save and prompts the user to refresh.

**Production fix (1–2 months):** Real-time channel over Frappe's `frappe.realtime` (Socket.IO) + OT or CRDT for cell-level merging.

---

## P1 correctness bugs

### 4. Circular-reference detection key collides

`engine/sheet.js`:

```js
const key = `${sheet}::${formula}`
if (circular.has(key)) return '#CIRCULAR!'
```

Two different cells with the same formula text (e.g. `A1 = =B1+1` and `A2 = =B1+1`) hash to the same key. First entrant blocks the second — A2 returns `#CIRCULAR!` even when there's no cycle.

**Fix:** Key by `${sheet}::${cellId}`, not by formula text. Pass the calling `cellId` into `_evalFormula`.

### 5. No formula recursion depth limit

The `circular` set is the only termination guard. A graph the tokenizer misses — most plausibly via `INDIRECT(...)` whose target is computed at runtime — bypasses the guard entirely. Pathological inputs can blow the JS stack and freeze the tab.

**Fix:** Add `MAX_DEPTH = 64` and pass depth through `_evalFormula`. Return `#REF!` when exceeded.

### 6. No memoization within a recalc tick

`SUM(A1:A100)` where each `A_i = =B_i*2` triggers 100 independent formula evaluations per read. With deeper chains this becomes exponential.

**Fix:** Per-tick value cache keyed `${sheet}:${cellId}`, populated as cells evaluate, invalidated whenever `setCell` runs.

### 7. History snapshots full state every push

`sheet.js:snapshot()` does `JSON.parse(JSON.stringify(sheets))`. With 50 history entries × N cells each, memory grows quadratically and triggers GC pauses on large sheets.

**Fix:** Command-pattern history. Record `{op: 'setCell', sheet, id, before, after}` instead of full state. Same `undo/redo` API surface. O(1) per push.

### 8. No size cap on save payload

`api.py:save_sheet(title, sheets_data: str, name)` accepts arbitrary text. A hostile or buggy client can POST 100MB. MariaDB `LONGTEXT` will accept it; you'll hit OOM somewhere else.

**Fix:** Reject `len(sheets_data) > 5 * 1024 * 1024` at the API layer. Add a server-side `validate()` on the Sheet doctype as defence in depth.

### 9. Cross-sheet paste data integrity

`clipboard._writeSystem` writes display values to the system clipboard but `_data` stores raw values. Copy from Frappe Sheets, paste into Excel → you get the value, not the formula. Functional, but surprising. Document explicitly or expose a "copy formula" option.

---

## P2 issues

### Performance

- **`_repopulateGrid`** iterates `Object.keys(sheet.getRawData())` and pushes each cell to the canvas after every undo / redo / paste / sort / sheet switch. Fine at 1k cells, choppy at 50k. Batch into `requestIdleCallback` or virtual-row chunks.
- **`sortFilter._getRows()`** rebuilds a dense N×M array from a sparse map every sort/filter invocation. Should index by row once and reuse.
- **`onCellChanged` fires per-cell during paste/sort/import.** No batch suppression. With 1000-cell paste, the canvas re-renders 1000 times. Add a `silent` flag to `setCell` and flush once at the end of a transaction.

### Security and permissions

- `sheet.json` grants `email`, `export`, `print`, `report`, `share` to the `All` role. Probably not intentional — review and tighten.
- `sheets/doctype/sheet/sheet.py` is literally `class Sheet(Document): pass`. No `validate()`, no length checks, no JSON schema validation. The API is the only gate, which is fragile.
- `delete_sheet` uses `ignore_permissions=False`, which is correct. But there is no audit log of who deleted what.

### Reliability and observability

- No error boundaries. `loadSheet` failure is `console.error`'d; user sees a blank sheet with no feedback.
- No telemetry (Sentry, posthog, anything). When users say "it broke" you have nothing to debug with.
- `saveError` clears itself after 5 seconds with no record. If a save fails silently mid-session, you'll never know.
- No `beforeunload` guard for unsaved changes on new documents.

### Frontend correctness and DX

- Zero TypeScript, zero JSDoc on engine functions. The 9-callback contract between `createGrid` and the Vue layer is undocumented and easy to break in refactors.
- No CI pipeline. No ESLint config, no Prettier, no type-check step. Every PR depends on reviewer vigilance.
- Magic numbers: default column width `100` hardcoded in `getColWidth`, `13px InterVar` font string scattered across renderer / overlay / measurement, padding constants `4`/`6`/`8` repeated.

### UX and accessibility

- **Canvas has no ARIA semantics.** Screen readers see a blank `<canvas>`. The product will not pass an enterprise accessibility audit.
- No touch / mobile path. No pinch-zoom, no soft-keyboard handling, no long-press context menu. Not usable on phones or tablets.
- All strings hardcoded English. Use Frappe's `__()` and a Vue i18n helper.
- No keyboard path to color pickers (native `<input type=color>` only).

### Data model gaps

- No revision history (`track_changes: 0` in `sheet.json`).
- No comments, mentions, attachments.
- No named ranges, protected ranges, or data-validation rules.
- Flat sheet listing — no folders, no sharing UI beyond Frappe's built-in.

---

## Code quality and maintainability

### `frontend/src/pages/SheetEditor/index.vue` is 1184 lines

It owns: toolbar state, formula bar, autocomplete, autosave timer, context menu, filter panel, freeze controls, merge, borders, CSV import/export, find/replace, persistence, selection stats, undo/redo, copy/cut/paste, marching-ants. It is the canonical example of a god-component and a refactor risk.

**Suggested split:**

```
pages/SheetEditor/
  index.vue              (~250 lines — layout, mount, top-level state)
  composables/
    useAutoSave.js       (debounce, dirty tracking, error display)
    useClipboard.js      (cut/copy/paste/marching-ants)
    useContextMenu.js
    useFormulaBar.js     (autocomplete + input handlers)
    useBorders.js
    useCSV.js
    useFindReplace.js    (already partially extracted)
    useFreeze.js
    useSelectionStats.js
```

Each becomes individually testable. The main file becomes a layout shell.

### Other shape concerns

- `canvas/index.js` is 771 lines. Acceptable for what it does, but the resize/scroll/clamp machinery (`_applyCanvasSize`, `_clampScroll`, viewport tracking) deserves its own module.
- `engine/formula.js` is 611 lines as one giant `FUNCTIONS` object. Consider splitting into `mathFunctions.js`, `textFunctions.js`, `dateFunctions.js`, `lookupFunctions.js`, etc. Easier to test, navigate, and PR.
- The 9-callback `createGrid` constructor (`onSelect`, `onCommit`, `onInput`, `onCancel`, `onFill`, `onBatchCommit`, `getFormat`, `getMergeInfo`, `isSlave`, `getMasterId`) is hard to mock. Consider a single event emitter or a smaller, typed adapter object.

---

## Recommended roadmap

Order matters. Each step pays back the next.

| # | Item | Effort | Why now |
|---|---|---|---|
| 1 | **Vitest suite over the engine** (`formula`, `deps`, `sheet`, `sortFilter`, `clipboard`) | ~1 week | Prerequisite for safely fixing anything below. |
| 2 | **Fix P1 correctness bugs** (#4–#7) | ~3 days | Cheap with tests in place; expensive without. |
| 3 | **Batch the engine** (silent `setCell`, single flush per transaction) | ~2 days | Unblocks fast paste, sort, filter, CSV import. |
| 4 | **Save-size cap + server-side `validate()`** | ~half day | Defence in depth, trivial to add. |
| 5 | **Split `SheetEditor/index.vue` into composables** | ~2 days | Compounding return — every future feature lands faster. |
| 6 | **Sentry + minimal CI** (lint + vitest + build) | ~1 day | Stop shipping blind. |
| 7 | **Cell-level persistence** (child doctype + delta API + Playwright e2e) | ~2 weeks | Unlocks scale, revision history, concurrency hooks. |
| 8 | **Revision-counter concurrency check** (409 on stale write) | ~1 week | Minimum viable multi-user safety. |
| 9 | **TypeScript migration**, starting with engine modules | ~1 week (engine), then incremental | Eliminates the implicit-contract refactor minefield. |
| 10 | **Real-time collab over `frappe.realtime`** | 1–2 months | The eventual product moat. Optional for v1. |

After steps 1–6, you have a defensible single-user product. Steps 7–8 unlock the realistic enterprise use case. Steps 9–10 are the long bets.

---

## Scorecard

| Dimension | Grade | One-line justification |
|---|---|---|
| Architecture | **B+** | Clean separation; `SheetEditor/index.vue` is the one monolith. |
| Code quality | **B** | Readable and consistent; lacks types, tests, lint config. |
| Correctness | **C+** | Several latent bugs in formula engine and history. |
| Performance | **B−** | Excellent ≤10k cells; degrades beyond. |
| Security | **C** | Missing input caps, broad DocType permissions, empty controller. |
| Scalability | **D** | Single-blob persistence is the hard ceiling. |
| Observability | **F** | None. No metrics, no error reporting, no audit log. |
| Testing | **F** | Zero automated tests. |
| Accessibility | **D** | Canvas not screen-reader navigable; no touch path. |
| **Overall production readiness** | **Not yet** | ~3–4 weeks of focused work to "ship to friendly users". |

---

## Closing note

The foundation here is good. The author clearly understands canvas rendering, dependency graphs, and the Frappe ecosystem. None of the issues above require throwing code away. With tests in place and the prioritized roadmap, this product can move from "polished prototype" to "defensible v1" in a quarter.

The single most important thing to do tomorrow is **start writing tests for the formula engine.** Everything else compounds from there.
