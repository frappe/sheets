# Frappe Spreadsheet

A spreadsheet app for Frappe — Google-Sheets-style grid built with Vue 3 and
HTML Canvas. Designed to fit the Espresso design system used across the rest
of the Frappe product family.

## Features

**Formulas & data**
- ~100 functions (`SUM`, `VLOOKUP`, `IF`, `COUNTIF`, …)
- Cross-sheet references
- Smart fill (pattern detection on drag-fill)
- Data validation (lists, numeric ranges, text length)
- Named ranges
- Sort, filter, find & replace

**Formatting**
- Bold, italic, underline, strikethrough
- Font family / size, text & fill color, vertical alignment
- Number formats (currency, percentage, custom)
- Conditional formatting
- Frozen rows & columns
- Merged cells, cell borders

**Charts & analysis**
- Inline charts (bar, line, pie, scatter, area)
- Pivot tables

**Sheets & workbook**
- Multi-sheet workbooks with tab drag-to-reorder
- Hyperlinks, cell comments / notes
- Split-text helper
- Zoom in / out, hide / unhide rows and columns
- CSV / XLSX import, CSV / XLSX / PDF export

**Collaboration**
- Real-time multi-user editing (Yjs-backed)
- Live presence avatars and remote cursors
- Version history with cell-level provenance

**Productivity**
- Undo / redo, copy / cut / paste, paste-special (values / formats / formulas)
- `Cmd+K` command palette, keyboard-shortcut help (`?`)
- Formula reference picker — click or arrow-keys to insert refs while typing
  formulas (range pick with `Shift + arrow`)

## Install

Requires Frappe Framework 15 or 16.

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/frappe/sheets --branch main
bench --site $YOUR_SITE install-app spreadsheet
```

After install, open the app from the Frappe desk app-switcher, or visit
`https://<your-site>/spreadsheet` directly.

## Frappe Cloud

Add this repo URL as a custom app on your Frappe Cloud bench. The frontend
assets are pre-built and committed to `spreadsheet/public/` so no Node build
runs on Cloud — see [BUILD.md](./BUILD.md) for the release workflow.

## Contributing

This app uses `pre-commit` for formatting and linting. Please
[install pre-commit](https://pre-commit.com/#installation) and enable it for
this repository:

```bash
cd apps/spreadsheet
pre-commit install
```

Pre-commit runs ruff, eslint, prettier, and pyupgrade.

End-to-end tests run on every push via Playwright against a real Frappe
backend in CI. To run them locally:

```bash
cd frontend
npm run test:e2e:install   # one-time chromium download
npm run test:e2e           # requires a bench up at http://localhost:8000
```

## Current limitations

- **JSON-blob persistence.** Each sheet is stored as a single gzip-compressed
  JSON document with a 30 MB uncompressed cap. Save latency scales with
  workbook size — fine for the tens of thousands of populated cells most
  workbooks use; large workbooks (hundreds of thousands of cells) start to
  feel the round-trip. Cell-level persistence is on the roadmap.
- **Desktop only.** Mobile / tablet show a "please open on desktop" message —
  the canvas grid has no touch handlers yet.

## License

GNU AGPL v3 — see [license.txt](./license.txt).
