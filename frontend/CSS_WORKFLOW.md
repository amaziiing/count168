# CSS workflow

- Edit source styles in `frontend/public/css/*.css`.
- Do not edit files in `frontend/dist/css/*` directly. They are build output and will be overwritten.
- In local dev (`npm run dev`), `/css/*` serves from `frontend/public/css/*` (Vite `public/` folder).
- After CSS changes, run:

```bash
cd frontend
npm run build:deploy
```

## Build variants — do not mix them up

- `npm run build` / `npm run build:site` — **dev commits only**. Their postbuild hook (`scripts/git-sync-after-build.mjs`) runs `git restore frontend/dist/assets frontend/dist/index.html` + `git clean -fd`, deleting the freshly built Vite hash bundles to keep commits small.
- `npm run build:deploy` — **deploy commits**. No stripping hook; the new hashed assets stay in `dist/assets` and get committed.

Committing a deployable dist built with plain `build` makes `dist/index.html` reference hash bundles that were never committed → server returns 404 for the entry JS/CSS → blank white page. Before pushing a deploy commit, verify the referenced bundles exist:

```bash
cd frontend
for f in $(grep -oE 'assets/index-[A-Za-z0-9_-]+\.(js|css)' dist/index.html | sort -u); do test -f "dist/$f" && echo "OK $f" || echo "MISSING $f"; done
```

(`c168_mobile/frontend` has no stripping hook; plain `npm run build` is fine there.)

- Deploy **`frontend/dist`** to the server (includes `dist/css/` copied from `public/css/`).
- Production loads login/secondary-password styles from `/frontend/dist/css/style.css` (see `dist/index.html`).
- If you only upload `dist/` but styles are missing, confirm `dist/css/style.css` exists after build and was uploaded.
