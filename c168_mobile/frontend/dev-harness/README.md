# dev-harness (dev only — not part of the build)

Headless-browser harness for the mobile add-transaction **account picker**
(`src/pages/transaction/AddTransactionSheet.jsx` → `AccountPicker`). It exists because the repo has no
test runner and the reported bug (searching an account on a phone, then deleting: "卡着几秒") can only
be reproduced in a real browser at a phone CPU speed.

Nothing here is bundled: `vite build` only builds `index.html`, so this folder never reaches `dist/`.

## Run

```bash
cd c168_mobile/frontend
npm run dev -- --port 5200 --strictPort   # in another shell
node dev-harness/picker-loop.mjs --n=2000 --throttle=10
```

- `--n` = accounts in the mock list (a group scope can return thousands).
- `--throttle` = CDP `Emulation.setCPUThrottlingRate`; 10 approximates a mid/low-end phone, 1 is desktop.
- `CHROME_PATH` overrides the Chromium binary (default: the Playwright cache under `%LOCALAPPDATA%`).

Exit code 0 = all checks pass, 1 = a check failed, 2 = harness error.

## What it checks

| Check | Guards against |
|---|---|
| `open: mounting the picker shows a page of the list, not every account` | opening the picker mounting the whole account list (measured 6.0s freeze at 2000 accounts before the fix) |
| `ime: list filters while composing` / `typing is not rewritten` / `typing survives the next keystroke` | phone IME / word-mode keyboards being fought by the search field |
| `delete: list re-expands to the full match set` | filtering correctness after the windowed rendering |
| `delete: max frame gap …` | the reported "delete freezes for seconds" |
| `pick: tapping an account selects it and closes the picker` | selection |
| `perf: delete jank at N accounts stays near the M-account floor` | per-keystroke work scaling with the account count (2.1s at 2000 accounts before the fix) |

`profile-open.mjs` is a one-off CPU-profile helper (`node dev-harness/profile-open.mjs --n=5000`) that
attributes the open cost per function — it is what showed the remaining open time is layout work in the
shared portal positioning, not the account rows.

Delete this folder once these components have a proper test seam (vitest + a DOM environment, or Playwright in CI).
