# Round 4: Fable 5.2 review (condensed)

**Overall 9.7** (weighted mean 9.7). No caps triggered.

| Criterion | Score |
|---|---|
| C1 Position and side to move | 9.5 |
| C2 QUEEN client | 10 |
| C3 Answer fidelity | 10 |
| C4 Panel UX and copy | 9.5 |
| C5 Accessibility | 9.5 |
| C6 Security, privacy, fair play | 10 |
| C7 Chrome Web Store readiness | 9.5 |
| C8 Performance | 10 |
| C9 Tests, evidence, docs | 9.5 |

## Issues
**Major**
1. **Token echo** (`background.js:93-113`; `panel.js:174-203`). The scrubber misses a token split across ordered-list markers ("1. hf_Saved… / 2. …"); the renderer removes the markers, which joins the token back together. It also misses the token body without its `hf_` prefix.
   - **Fix:**
     - Run the final check on the text as rendered, with the markers stripped.
     - Compare against the body as well as the whole token.
     - Reject any run of 8 or more characters of the body.
     - Add tests.
2. **Live record on the final commit.** The only live record with a full Explain and FEN is for `651b93a`. The owner should repeat the full template on the final commit: one Explain and one Best move, with the selected move, the expected position and the copied FEN. Record what happened with the shortcut on the first load as it happened, without rewriting earlier text.
3. **No live lichess check.** The store reviewer will test on lichess, which has never been checked live. One specific risk: lila sets the FEN input's value as a property, which the `MutationObserver` can't see. Fix: re-read once about 300 ms after a read whose only failure is "The site FEN disagrees".

**Minor**
4. **chess.com variations** are read only through `data-parent-node`, which no captured markup contains. Capture the live sub-line markup.
5. **chess.com Chess960** away from `/variants/` URLs isn't gated. Also gate when the standard-start replay fails at move 1.
6. **The shortcut hint shows the manifest default, not the real binding.** Get the real binding through `getPrefs` using `chrome.commands.getAll`, and use the platform's notation.
7. **Missing regression tests:**
   - a finished-game element hidden by CSS
   - board-fallback headlines with no move numbers
   - the content-side check that the replay rebuilds the board

   Also, `AQ.confirm()` is not used by the panel.
8. **Very long answers.** About 20,000 inline marks overflow the stack in `inline()`. Wrap `showResult` in try/catch, make `inline()` iterative, and cap the analysis at 20,000 characters.
9. **lichess result evidence is broader than needed.** Accept only `.result-wrap .result` and `.analyse__moves .result`, and read `[Result]` only from `div.pgn` text.
10. **Evaluation and empty move lists.** Drop the evaluation row for bare numbers. When the move list is empty, compare the first four FEN fields with `req.fen`.
11. **Screen-reader walkthrough** (level 10).
12. **Evidence and docs drift:**
    - the 200%-zoom screenshots aren't captured at the zoomed size
    - `perf.md` names the wrong Chromium version
    - `permissions.md` still says "HTML-escaped"
    - the README package list omits `_locales`
13. **Copy:** the checkmate view says the game is over twice, and "Queen" and "QUEEN" are spelled inconsistently.
14. **Owner steps:** placeholder URLs and the dashboard screenshot.
