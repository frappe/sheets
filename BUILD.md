# Building & releasing

Frappe Cloud does **not** run `npm install` or `npm run build` for this app.
The pre-built frontend assets need to be in
`frappe_sheets_next/public/frappe_sheets_next/` before every push that
includes frontend changes.

## Local release workflow

```bash
cd frontend
npm install            # first time only / after package.json changes
npm run build          # writes to ../frappe_sheets_next/public/frappe_sheets_next/
cd ..

# Sanity check — these should all exist:
ls frappe_sheets_next/public/frappe_sheets_next/
#   index.html  index.js  index.css  Inter.var.woff2  Inter-Italic.var.woff2  ...

# Commit the rebuilt assets alongside any source changes:
git add frappe_sheets_next/public/frappe_sheets_next/
git commit -m "build: rebuild frontend assets"
git push
```

Frappe Cloud picks up the new commit and serves those files via the
`/assets/frappe_sheets_next/frappe_sheets_next/` URL prefix.

## Why pre-built?

Wiring Frappe Cloud to run Node during install is a larger lift (custom
build hook, longer cold-start, build failures during deploy). Pre-built
assets are slower for the repo but make every Cloud deploy deterministic.

When the project warrants it, the post-launch fix is a `before_app_install`
hook in `pyproject.toml` that runs `npm ci && npm run build`.
