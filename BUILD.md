# Building & releasing

Frappe Cloud does **not** run `npm install` or `npm run build` for this app.
The pre-built frontend assets need to be in
`sheets/public/sheets/` before every push that
includes frontend changes.

## Local release workflow

```bash
cd frontend
npm install            # first time only / after package.json changes
npm run build          # writes to ../sheets/public/sheets/
cd ..

# Sanity check — these should all exist:
ls sheets/public/sheets/
#   index.html  index.js  index.css  Inter.var.woff2  Inter-Italic.var.woff2  ...

# Commit the rebuilt assets alongside any source changes:
git add sheets/public/sheets/
git commit -m "build: rebuild frontend assets"
git push
```

Frappe Cloud picks up the new commit and serves those files via the
`/assets/sheets/sheets/` URL prefix.

## Why pre-built?

Wiring Frappe Cloud to run Node during install is a larger lift (custom
build hook, longer cold-start, build failures during deploy). Pre-built
assets are slower for the repo but make every Cloud deploy deterministic.

When the project warrants it, the post-launch fix is a `before_app_install`
hook in `pyproject.toml` that runs `npm ci && npm run build`.
