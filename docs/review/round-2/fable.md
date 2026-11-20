# Round 2: Fable 5.2 review (condensed from its JSON report)

**Overall 5.0** (weighted mean 8.8).

| Criterion | Score |
|---|---|
| C1 Position and side to move | 8 |
| C2 QUEEN client | 9.5 |
| C3 Answer fidelity | 10 |
| C4 Panel UX and copy | 9 |
| C5 Accessibility | 9 |
| C6 Security, privacy, fair play | 8 |
| C7 Chrome Web Store readiness | 9 |
| C8 Performance | 9 |
| C9 Tests, evidence, docs | 9 |

**Caps triggered:**
- H6 5.0: chess.com gating fails open.
- H8 8.5: no owner-signed live check for 1.0.0.
- H9 8.9: C1 is below 9.

## Issues
**Blocker**
1. **C6 / H6.** `content/chesscom.js:13,22-27` opens the gate for any chess.com URL with `?tab=review`, ending in `/review`, or under `/analysis`, before it checks whether the game is in progress.
   - **What the probe showed**, in real Chromium with the repo's own `chesscom-in-progress` fixture:
     - At `/game/live/ID?tab=review`, the launcher appears and an answer is returned.
     - The same happens at `/analysis/game/daily/ID` and `/analysis/game/live/ID` while the game is still being played.
     - Line 26 accepts any `.board-layout-sidebar .result` whose text contains "draw" or "resign", so a "Draw offered" element would open the gate.
   - **Fix:**
     1. Check puzzles and variants first.
     2. On game paths, require positive evidence that the game is finished, whatever the query string says.
     3. Apply the same requirement to `/analysis/game/(live|daily)/<id>` and the review routes; without that evidence, treat the game as in progress.
     4. Only a standalone `/analysis` with no game ID is open without that evidence.
     5. Treat `tab=review` as a page label, never as evidence.
     6. Tighten the result regex to result tokens or game-over containers.
   - **Gated fixtures to add**, each with zero requests, both opened directly and navigated to with the panel open:
     - a live game with `?tab=review`
     - a daily game with `?tab=review`
     - `/game/live/ID/review`
     - `/analysis/game/daily/ID` in progress
     - `/analysis/game/live/ID` in progress

**Major**
2. **C1 / H8.** `docs/live-checklist.md` is not an owner entry. It is unsigned and records v0.1.0. This is an owner action.
3. **C1.** The repeat-click guard (`content/panel.js:452`) compares only the mode, FEN and moves.
   - **Problem:** with "Explain 2.Nf3" in flight, clicking "Explain 2.Bc4" in a sibling line is swallowed, and the answer that arrives is for 2.Nf3.
   - **Fix:** compare the whole request, including `played`.
   - **Test:** a panel test with one disconnect, then a second request carrying the new `played`.
4. **C9.** The boneyland success fixture is synthetic, and the mock always sends `evaluation: null`, so the evaluation row is never tested or shown. `background.js:112` assumes the evaluation is relative to the side to move. Use a real recording (`test/fixtures/boneyland-success.sse`, recorded by the coordinator), assert the exact evaluation text, add a screenshot, and fix the sign if needed.

**Minor**
5. **C3 tag stripper.** `background.js:77` strips from `<` to the end of the text when there is no `>`, so "a<b" silently cuts the explanation. Strip only well-formed tags, and add this case to the corpus.
6. **C2 401/403 classification.** `background.js:28` treats any 401 or 403 as `token_rejected`, even when no token was sent. Return `token_rejected` only when a token was sent; otherwise return `unreachable`, which is transient, so the backup is tried. Add a test.
7. **C5 capture-phase keys.** Key isolation in `content/panel.js:204-207` works in the bubble phase only, so a site's capture-phase `window` listener still receives panel keys. Add a capture listener (registered early) that calls `stopImmediatePropagation` when `composedPath` includes the host, and extend the E2E with a capture-phase counter.
8. **C5 narrow viewports.** Add an E2E at 320×568 and 640×400, for the panel and for options: nothing extends past the viewport, all targets are 24 px or larger, and screenshots are saved.
9. **C5 live regions.** The `role="status"` regions are created together with their text, so screen readers may not announce them. Use one persistent, empty `status` element and write the thinking text and the headline into it.
10. **C8 timer test.** The 10-navigation test counts `aq-timer` nodes, not real timers. Count live timers by wrapping `setInterval`/`setTimeout` in the isolated world.
11. **C6 options tests.** The options flows have no E2E. Cover:
    - a bad-format token gives an error
    - masking, with the full token absent from the DOM even after a reload
    - Remove
    - `chrome.permissions.request` with exactly `[origin + "/*"]`
    - `tokenFor` stored only with consent
12. **C1 custom-start detection.**
    - chess.com: read `data-whole-move-number` on the row.
    - lichess: the study fixture uses analysis-board markup (`.copyables textarea`); confirm the real study DOM during the owner's live pass.
13. **C4 copy.** "Ask again" has two meanings. Use "Try again" for plain retries and keep "Ask again" for a fresh re-ask. When the one-in-flight slot is taken by another tab, say "Another tab is already asking Queen." instead of the busy copy.
14. **C2 Retry-After.** Read `Retry-After` on 429 and 503, show "Try again in N s", and keep the button disabled until then. This is a level-10 item.
15. **C7 Chrome version.** `minimum_chrome_version` is 158, the version of Playwright's Chromium. Add an `OWNER-TODO` line to check that stable Chrome is at least that version. `_locales/en` is a level-10 item.
16. **C9 CI.** Add a GitHub Actions workflow, and map each `CHANGELOG-review` fix to the test that guards it. This is a level-10 item.
