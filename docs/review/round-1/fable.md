# Round 1: Fable 5.2 review (condensed from its JSON report)

**Overall 4.0** (weighted mean 4.3).

| Criterion | Score |
|---|---|
| C1 Position and side to move | 3 |
| C2 QUEEN client | 5 |
| C3 Answer fidelity | 4 |
| C4 Panel UX and copy | 6 |
| C5 Accessibility | 5 |
| C6 Security, privacy, fair play | 4.5 |
| C7 Chrome Web Store readiness | 3 |
| C8 Performance | 6.5 |
| C9 Tests, evidence, docs | 4.5 |

**Caps triggered:**
- H3 4.0: a content script can read the token (reviewer probe), and the options page refills the full token.
- H6 5.0: no fair-play gating; a live-round fixture with a running clock got an answer, and `/training` showed the launcher.
- H5 5.0: wildcard host permission, no `PRIVACY.md`.
- H7 6.0: an unverified prose move or a `random_legal_fallback` move is used as the headline and verdict ("Queen plays 3...not").
- H9 6.9.
- H1b 7.0: `START_FEN` hard-coded, `cleanSan` turns "Sf3" into "f3", the first `cg-board` is used (mini-boards).
- H8 7.5: no screenshot for every state.
- H8 8.5: no `docs/live-checklist.md`.

## Issues (most severe first)
**Blockers**
1. **C6 token.** Call `setAccessLevel(TRUSTED_CONTEXTS)` at the service worker's top level and in `onInstalled`. Add an E2E that reads the token from a content script and expects failure. In options: show a saved token as `hf_…abcd`, add Remove, an `hf_` format check, and a note that the servers are third-party.
2. **C6 gating.** Add a fail-closed `scope()` per adapter that returns ok, in_progress, variant, puzzle or unknown from positive evidence:
   - lichess: an analysis or study tree, or a round view with a result and no running clock
   - chess.com: the review or analysis routes, or a game-over state

   Show the launcher only when the scope is ok. If the scope changes while the panel is open: abort the request, clear the answer, and show the §2 message with Close only. Add gating fixtures on both sites asserting the UI and zero requests.
3. **C7 permissions.** Make `host_permissions` the two exact origins and move the wildcard to optional. Add `PRIVACY.md` and the justifications in `store/`.
4. **C3 move trust.** Apply the §4.5 source precedence and the `sanMatchesUci` check. A move that can't be verified gives "Queen didn't name a clear move" plus a suggestion and no verdict. Fix the test that asserts Be7 is promoted, and add the 3 named extraction cases.
5. **C1 position.** Strict SAN (any failure discards the list); detect custom starts and variants; send the root plus moves when the root is known, otherwise fall back; add the §3.3 pre-send check (including zero plies) with a "disagree" state, and the post-response check against the click-time snapshot.

**Major**
6. **C1 fixtures.** The §3.7 matrix with at least 12 fixtures per site. Each has an identity asserted first, then the full six-field FEN plus SAN. Gated fixtures assert the UI and zero requests. The mock returns a FEN consistent with the request.
7. **C1 board reading.** Re-read at click time. Main board only. Skip animating and dragging pieces. Reject impossible boards. Use only the site's last-move classes. Keep all six FEN fields.
8. **C2 client.** Implement §4.1 to §4.7: timeouts, keepalive, typed codes (including `all_unavailable`), fallback on transient errors only, shape validation, coalescing, cache, a new seed for Ask again, the custom server, and the server name in the result. Export the SSE parser and give it unit tests. Add the Survival and Timeout E2Es.
9. **C7 store material.** `scripts/package.sh` with a zip test, `store/**`, `LICENSE` with attribution, `CHANGELOG.md`, version 1.0.0, a 32 px icon, `homepage_url` and `minimum_chrome_version`.
10. **C1 owner check.** The owner adds a dated entry to `docs/live-checklist.md`.
11. **C3 result card.** Map player/opponent to White/Black, put the truncation notice under the headline with "Try the other server", label the evaluation with a side, normalize `e8Q` and `e8=Q` as the same move, and add fixtures for each `move_source` and `finish_reason`.
12. **C4 UX.**
    - first-use notice
    - stale banner with a re-ask
    - per-code error headline, one sentence and one action, with Details collapsed
    - dock toggle or overlap assertions
    - a screenshot for every §5.1 state
13. **C5 focus and keys.** The §6 close order, `role="status"` and `role="alert"`, Escape only when focus is inside the panel, stop panel key events from reaching the site, and an axe plus keyboard E2E that reaches inside the shadow root.
14. **C9 README and fixtures.** A complete README, fixture identities, no hard-coded Chromium path, and the missing unit suites.

**Minor**
15. **C5 contrast and targets.** `--line` at 3:1 or better, `.link` at least 24 px tall, a non-colour pressed cue, and higher contrast for the options placeholder.
16. **C8 updates.** A debounced `MutationObserver` instead of the 1.5 s poll, and a 10-navigation test.
17. **C6 hardening.** Background checks on the sender and payload, the XSS corpus in unit and E2E tests, a network allowlist E2E, and optionally a renderer that builds DOM nodes.
