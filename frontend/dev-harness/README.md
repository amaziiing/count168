# dev-harness (dev only — not part of the build)

Throwaway-free, but not production code: a headless-browser harness for
`src/pages/transaction/components/AccountSelect.jsx` (the account search in the Transaction page,
including the phone / mobile-browser use case).

It exists because the repo has no test runner, and this bug (typing with an IME / word-mode keyboard,
and multi-second freezes when deleting after filtering) can only be reproduced in a real browser.
Nothing here is bundled: `vite build` only builds `index.html`, so this folder never reaches `dist/`.

## Run

```bash
cd frontend
npm run dev -- --port 5199 --strictPort   # in another shell
node dev-harness/loop.mjs --n=5000 --throttle=10
```

- `--n` = number of accounts in the mock list (a group scope can hold thousands).
- `--throttle` = CDP `Emulation.setCPUThrottlingRate`; 10 approximates a mid/low-end phone, 1 is desktop.
- `CHROME_PATH` overrides the Chromium binary (default: the Playwright cache under `%LOCALAPPDATA%`).

Exit code 0 = all checks pass, 1 = at least one check failed, 2 = harness error.

## What it checks

| Check | Guards against |
|---|---|
| `ime: list filters while composing` | typed text not reaching the filter until a delete |
| `ime: composing text is not rewritten` / `survives the next keystroke` | the app rewriting a controlled input mid-composition (breaks IME / word-mode keyboards) |
| `ime: search box still displays uppercase` / `css: shared rule uppercases every custom-select search box` | the uppercase look regressing while the value stays untouched (shared rule in `public/css/select-unified.css`) |
| `delete: list re-expands to the full match set` | filtering correctness after the option window was added |
| `delete: max frame gap …` | the "delete hangs for seconds" freeze |
| `scroll: … loads more rows` | the option window hiding accounts from the user |
| `keyboard: ArrowDown x3 + Enter …` / `arrowing past the window edge` / `Enter selects the row the user saw` | keyboard selection drifting from what is rendered |
| `keyboard: wrap-around …` | `ArrowUp` on the first row mounting the whole account list |
| `click: tapping a row selects it` | click selection |
| `perf: jank at N accounts stays near the M-account floor` | per-keystroke work scaling with the account count (the original defect: 4.1s at 5000 accounts) |

Delete this folder once the component has a proper test seam (vitest + a DOM environment, or Playwright in CI).
