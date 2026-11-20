# Round 5: Fable 5.2 review (condensed)

**Overall 9.6** (weighted mean 9.645). No caps triggered. Full result: `fable.json`.

| Criterion | Score |
|---|---|
| C1 Position and side to move | 9.5 |
| C2 QUEEN client | 10 |
| C3 Answer fidelity | 10 |
| C4 Panel UX and copy | 9.5 |
| C5 Accessibility | 9.5 |
| C6 Security, privacy, fair play | 9.5 |
| C7 Chrome Web Store readiness | 9.5 |
| C8 Performance | 10 |
| C9 Tests, evidence, docs | 9.5 |

## Issues
**Major**
1. **chess.com share-panel PGN** (`content/chesscom.js:16-19, 46-49`). Its `[Result]` counts as finished-game evidence with no visibility check and no check that it belongs to the game on screen. A hidden leftover textarea opened a game in progress that had no clock-turn class.
2. **No live lichess check.** The store reviewer is sent to lichess.

**Minor**
3. The final live record has fields the coordinator derived and no named signature.
4. chess.com variations are read only through `data-parent-node`.
5. **Launcher/panel race:** a launcher tick during `loadPrefs()` un-hides the launcher under the open panel.
6. **Uncapped evaluation and critical line:** the comment-strip regex is quadratic on them, so a 2 MB reply blocks the worker.
7. **Stale cached gate:** when the result row renders late, the launcher stays hidden until the next input.
8. **Copy:** "stays in this browser" contradicts "sent with every question"; "Queen" and "QUEEN" are mixed; the reloaded error repeats "Reload this page".
9. Three loop fixes lack regression tests.
10. Chess960 on an ordinary game URL reaches the board fallback, which shows a "disagree" note.
11. A lingering `.clock-player-turn` class could keep a finished game gated.
12. There is no screen-reader walkthrough.
13. Placeholder URLs and the dashboard screenshot are still to do (owner steps).
14. On a scanned board the critical line has no move numbers.
