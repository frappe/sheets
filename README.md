# Frappe Sheets

A spreadsheet app for Frappe — Google-Sheets-style grid built with Vue 3 and
HTML Canvas. Designed to fit the Espresso design system used across the rest
of the Frappe product family.

## Features

- Formula engine with ~100 functions (`SUM`, `VLOOKUP`, `IF`, `COUNTIF`, …)
- Cross-sheet references
- Sort, filter, find & replace
- Frozen rows & columns
- Merged cells, cell borders
- Multi-sheet workbooks with tab drag-to-reorder
- CSV import / export
- Cell-level formatting: bold, italic, underline, strikethrough,
  font family / size, text & fill color, vertical alignment, number formats
- Hyperlinks
- Undo / redo, copy / cut / paste, paste-special (values / formats / formulas)
- `Cmd+K` command palette, keyboard-shortcut help (`?`)
- Formula reference picker: click or arrow-keys to insert refs while typing
  formulas (range pick with `Shift + arrow`)
- Zoom in / out, hide / unhide columns and rows

## Install

Requires Frappe Framework 15 or 16.

```bash
cd $PATH_TO_YOUR_BENCH
bench get-app https://github.com/asif-mulani/frappe-sheets-next --branch main
bench --site $YOUR_SITE install-app sheets
```

After install, open the app from the Frappe desk app-switcher, or visit
`https://<your-site>/sheets` directly.

## Frappe Cloud

Add this repo URL as a custom app on your Frappe Cloud bench. The frontend
assets are pre-built and committed to `sheets/public/` so no Node
build runs on Cloud — see [BUILD.md](./BUILD.md) for the release workflow.

## Contributing

This app uses `pre-commit` for code formatting and linting. Please
[install pre-commit](https://pre-commit.com/#installation) and enable it for
this repository:

```bash
cd apps/sheets
pre-commit install
```

Pre-commit runs ruff, eslint, prettier, and pyupgrade.

## Current limitations

- **Single-user editing.** Concurrent edits from multiple users overwrite each
  other (last write wins). Multi-user collaboration is on the roadmap.
- **JSON-blob persistence.** Each sheet is stored as one JSON document.
  Comfortable up to ~50k populated cells; expect degradation past that.
- **Desktop only.** Mobile / tablet show a "please open on desktop" message —
  the canvas grid has no touch handlers yet.
- **5 MB cap** per workbook (enforced at API + DocType level).

## License

MIT — see [license.txt](./license.txt).
