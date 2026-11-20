# Round 3: Fable 5.2 review (condensed)

**Overall 7.0** (weighted mean 8.8).

| Criterion | Score |
|---|---|
| C1 Position and side to move | 8 |
| C2 QUEEN client | 10 |
| C3 Answer fidelity | 8 |
| C4 Panel UX and copy | 9 |
| C5 Accessibility | 9 |
| C6 Security, privacy, fair play | 9 |
| C7 Chrome Web Store readiness | 9 |
| C8 Performance | 9 |
| C9 Tests, evidence, docs | 9.5 |

**Caps triggered:**
- H1b 7.0: a lichess From Position game is replayed from the standard start.
- H9 8.9: C1 and C3 are below 9.

The owner's signed live check is accepted.

## Issues
**Blocker**
1. **H1b: From Position replayed from the standard start** (`content/lichess.js:52-56, 108-115`; `common.js:109-114`).
   - **Problem:** a lichess From Position game or study is replayed from the standard start with `KQkq`, even when its start has the standard placement but different castling rights. lila marks these pages with `div.round__app.variant-fromPosition` and `main.analyse.variant-fromPosition`, and the round view and studies have no PGN textarea.
   - **Fix:**
     - Treat `variant-fromPosition` (and the game-meta "From position" link) as a custom-start sign.
     - Use a root only if the page exposes one. Otherwise use the board fallback, with the castling guess disclosed.
     - Do the equivalent for chess.com custom positions.
     - Add lila-derived fixtures: a From Position round view, a From Position study chapter, and a From Position finished-game analysis page.

**Major**
2. **Finished lichess games in the analysis view get no launcher** (`content/lichess.js:27-30`).
   - **Problem:** lila renders the result as `div.analyse__moves > div > div.result` (`ui/analyse/src/view/components.ts` `renderResult`), and finished-game pages have no PGN textarea. The adapter therefore treats the page as `in_progress`. The `lichess-finished` fixture hides this by using round-view markup.
   - **Fix:**
     - Accept `.analyse__moves .result` holding a result token.
     - Rebuild the fixture from lila markup (`input.copyable.analyse__underboard__fen`, `div.pgn` as text) and assert the full request.
3. **The hugging-apps card loses its evaluation** (`background.js:82,116,136-141`).
   - **Problem:** the recording ends with "EVALUATION: the player is slightly worse by approximately 0.21 pawns, …". That line is deleted from the prose, and there is no top-level `evaluation` field, so the evaluation disappears.
   - **Fix:**
     - Extract the EVALUATION line before deleting it, and map player/opponent.
     - Show a string evaluation only if it names White or Black or says the position is equal.
     - Treat a bare signed number as numeric, or leave it out.
     - Add a test comparing both real recordings' cards row by row, and a test for an evaluation that names no side.
4. **chess.com "finished" evidence is too broad** (`content/chesscom.js:13-14,35-38`).
   - **Problem:** any `<textarea>` starting with a PGN tag counts, so a user can type `[Result "1-0"]` into a notes box. Any `.game-result` element anywhere on the page also counts.
   - **Fix:**
     - Read PGN only from the share panel's read-only textarea, or from `data-pgn` on the board or game container.
     - Count result tokens only inside the move list or the main layout's game-over elements.
     - Add gated fixtures for both cases.
5. **Variant study chapters on lichess aren't gated** (`content/lichess.js:21-25`).
   - **Problem:** the adapter checks for `.study__chapter [data-variant]`, which lila doesn't render.
   - **Fix:** gate on lila's `variant-<key>` class on `main.analyse` or `.round__app` when the key is not `standard` or `fromPosition`. Add study fixtures for chess960 and one other variant.
6. **lila tree custom-start signs are missed** (`content/lichess.js:52-56`).
   - **Problem:** in the inline view, the move number sits inside the move (`<move><index>3.</index><san>…`). In the column view, Black moving first is shown as `<index>1</index><move class="empty">...</move>`.
   - **Fix:** read both signs, and add fixtures for both views starting from a 32-piece custom position.

**Minor**
7. **Fixtures and regression tests.**
   - `lichess-finished` and `lichess-study` don't use lila's real markup.
   - Four fixes have no regression test:
     - the persistent live regions
     - the "Another tab is already asking Queen" panel copy
     - the stale re-ask falling back to Explain
     - the stale banner's position
   - `CHANGELOG-review` wrongly says the hugging-apps `critical_line` is a repr string. In the recording it is an object with `legal_steps`, so recheck the H7 confirmation for hugging-apps.
8. **Token redaction misses invisible characters.** Zero-width spaces, soft hyphens, word joiners and BOMs inside the token get through. Strip `\p{Cf}` and U+00AD before scrubbing.
9. **CSS-hidden finished element shows the launcher.** A finished-game element hidden with CSS makes the launcher appear; the click-time read then gates the panel. When `AQ.gate()` opens, confirm once with a full read before showing the launcher. Also add a documented measurement of idle cost (level 10).
10. **Cache and coalescing keys omit rights.** The keys leave out `snapshot.castle` and `snapshot.ep`, so a cached "ok" answer can be served to an ask that should be a mismatch.
11. **Board-fallback numbering.** With placeholder `0 1` clocks, the panel shows "Queen plays 1.d3". Drop the number and keep the side.
12. **Copy review.**
    - The agree verdict repeats its headline.
    - "The board has moved" and "The board changed" name the same event.
    - The fallback view explains the missing move list twice.
    - The card says "Critical line" while the docs say "main line".
    - There is no shortcut (level 10).
13. **`OWNER-TODO` and packaging.** `OWNER-TODO` section 7 is outdated now that the check is signed. The placeholder URLs are still in place (owner step). `_locales/en` is missing (level 10).
14. **Level-10 items:** a screen-reader walkthrough, a `commands` shortcut, a renderer that builds DOM nodes with no `innerHTML`, and a threat model.
