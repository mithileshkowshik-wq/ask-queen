# Performance: idle cost with the panel closed

Ask Queen does almost nothing while its panel is closed. This note records how that cost is measured and the result.

## What runs while the panel is closed
- The panel calls `AQ.gate()` about once a second, and only while the tab is visible.
- `AQ.gate()` returns a cached answer. It does the full evaluation again only when one of these happens:
  - the URL changes
  - the board element changes
  - the user clicks or presses a key (two passive listeners just set a flag)
- A quiet tick is therefore one `document.querySelector` and a string compare, with no layout reads.
- There are no listeners on site events beyond those two passive flag setters and the key guard, and no writes to the site's DOM or styles.

## Measurement (E2E, `Browser closed-panel idle cost stays under 1 ms per second`)
- **Setup:**
  - Page: the `chesscom-live-markup` fixture, built from the owner's captured chess.com Game Review markup.
  - The launcher is visible and the panel is closed.
  - Browser: headless Chromium 159 (Playwright 1.65.1), Apple Silicon.
- **Main metric:** the CDP `Performance.getMetrics` `ScriptDuration` delta over 10 s of idle time, divided by 10.
- **Second metric:** the cost of one cached `AQ.gate()` call, averaged over 1,000 calls in the content-script world.
- The test writes both numbers to `docs/review/evidence/round-<N>/perf.json` and fails at 1 ms per second or more.

| Run | Script time while idle | One cached `AQ.gate()` call |
|---|---|---|
| 2026-11-19, `round-dev` | **0.209 ms per second** | 0.0015 ms |

`ScriptDuration` counts all script time in the page's renderer, including the test harness's own probes, so the extension's share is at most this figure.
