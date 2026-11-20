# Performance: idle cost with the panel closed

Ask Queen does almost nothing while its panel is closed. This note records how that cost is measured and the result.

## What runs while the panel is closed
- The panel calls `AQ.gate()` about once a second, and only while the tab is visible.
- `AQ.gate()` returns a cached answer. It does the full evaluation again only when one of these happens:
  - the URL changes
  - the board element changes
  - the user clicks or presses a key (two passive listeners just set a flag)
- A quiet tick is therefore one `document.querySelector` and a string compare. Even a recompute uses only URL checks and cheap selectors.
- When the gate turns open, the panel calls `AQ.confirm()` before it shows the launcher. This is evidence-only:
  - It re-runs the gate with `el.checkVisibility()` on the few evidence elements: results, clocks, variant badges and game-over elements.
  - `checkVisibility()` reads computed style (display, visibility, content-visibility), not layout.
  - It never scans the board and never calls `getBoundingClientRect` or `getClientRects`.
- The board scan and other layout reads (`readPosition()`) happen only when the panel opens and when you click Ask.
- Nothing else touches the site: there are no listeners on site events beyond those two passive flag setters and the key guard, and no writes to the site's DOM or styles.

## Measurement
Two E2E tests cover this:
- `Browser closed-panel idle cost stays under 1 ms per second` measures the cost.
- `Browser closed launcher ticks make no layout reads, also across a URL change` checks that the launcher ticks make no layout reads. It counts `getBoundingClientRect`, `getClientRects` and the offset/client size getters in the content-script world over quiet ticks and over a URL change that re-opens the gate, and asserts the count is 0.

Setup for the cost measurement:
- **Page:** the `chesscom-live-markup` fixture, built from the owner's captured chess.com Game Review markup. The launcher is visible and the panel is closed.
- **Browser:** headless Chromium 158, as installed by Playwright 1.65.0 and used by the E2E (`minimum_chrome_version` is 158). Apple Silicon.
- **Main metric:** the CDP `Performance.getMetrics` `ScriptDuration` delta over 10 s of idle time, divided by 10.
- **Second metric:** the cost of one cached `AQ.gate()` call, averaged over 1,000 calls in the content-script world.
- The test writes both numbers to `docs/review/evidence/round-<N>/perf.json` and fails at 1 ms per second or more.

| Run | Script time while idle | One cached `AQ.gate()` call |
|---|---|---|
| 2026-11-19, `round-dev` (fix pass 3) | 0.209 ms per second | 0.0015 ms |
| 2026-11-19, `round-dev` (fix pass 4, final run) | **0.228 ms per second** | 0.0034 ms |

`ScriptDuration` counts all script time in the page's renderer, including the test harness's own probes, so the extension's share is at most this figure.
