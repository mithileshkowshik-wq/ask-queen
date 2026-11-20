# Ask Queen: scoring rubric (v4, frozen, merged from the Opus 5.5, Fable 5.2 and GPT-6.2-astra drafts)

A **9** means "ready to submit to the Chrome Web Store, and a serious club player would trust it". The target behaviour is defined in [`spec.md`](spec.md), which this rubric cites by section (§).

## Scoring procedure
1. Score each criterion from 0 to 10 in steps of 0.5.
   - **Levels 6, 9 and 10** are lists of positive **conditions**. Each bullet or lettered item counts as one condition. A level is earned only when every condition at that level and at the levels below it is met.
   - **The text at level 3** only describes what such a build typically looks like. It is not a requirement. Any build that meets all the level-6 conditions scores at least 6, whatever the level-3 text says.
   - **The formula below is the only rule, and it gives exactly one score.** `⌊x⌋₀.₅` means round x down to the nearest 0.5. `n6/N6`, `n9/N9` and `n10/N10` are the number of conditions met out of the total at each level.
     - **0** only when the criterion's feature is entirely absent: no shipped code or artifact addresses it at all. Otherwise use the formula, even if the build doesn't match the level-3 description.
     - **Not all level-6 conditions met:** score = `3 + ⌊2.5 × n6/N6⌋₀.₅`, which gives 3 to 5.
     - **All level-6 conditions met, not all level-9:** score = `6 + ⌊2.5 × n9/N9⌋₀.₅`, which gives 6 to 8.
     - **Counting conditions:** each bullet or lettered item counts as one condition, and so does each nested sub-bullet. For example, the Survival and Timeout tests in C2 level 9 are two conditions.
     - **All level-9 conditions met:** score = `9 + ⌊n10/N10⌋₀.₅`, which gives 9, 9.5 (half or more of level 10) or 10 (all of level 10).
2. **No evidence, no credit.** A condition counts as met only when you cite one of these:
   - a passing test name in `docs/review/evidence/round-N/report.json`
   - a `file:line`
   - a screenshot filename
   - an owner sign-off file
   README claims are not evidence.
3. **Evidence requirements for each criterion.**
   - For every score below 10, cite each unmet condition (with `file:line`, test or screenshot) and state expected versus observed behaviour.
   - For every 9-level condition you claim is met, cite the positive evidence.
4. **Overall** = Σ(weight × score) / 100, rounded to one decimal. Then apply every triggered cap; the lowest cap wins.
5. **Owner-only steps** count as met when the artifact is complete and the step is listed in `store/OWNER-TODO.md`. Owner-only steps are hosting the privacy policy URL, the developer account, the dashboard upload, and the decision about the Spaces. The one exception is the live **chess.com** check, which needs the owner's dated entry in `docs/live-checklist.md`. A live lichess check is optional, because the lichess fixtures and E2E stay mandatory.
   - **Fixture expectations depend on the fixture type.**
     - A fixture that **sends** asserts the full outbound request: the root FEN (all six fields) plus the ordered SAN moves.
     - A **gated or unreadable** fixture asserts the expected UI and **zero** requests.
   - **Shadow-DOM evidence.** Accessibility and E2E evidence about the panel counts only if it can be shown to have acted on nodes inside the panel's shadow root.
6. **Fixed constraints. Do not penalize these:**
   - The backend is the unofficial community HF Spaces, with their latency and quota.
   - QUEEN needs a GPU and cannot run locally.
   - QUEEN explains only its own best move.
   - Live sites cannot be automated headlessly.
   - The code is plain JS with no build step and no runtime dependencies. Dev-only test tooling is allowed.
7. **Core flows (CF)**, used by the caps:
   - **CF1:** chess.com Game Review, Analysis or a finished game, mainline move selected: Explain and Best move.
   - **CF2:** lichess analysis board, study or finished-game analysis, mainline or variation selected.
   - **CF3:** lichess finished game in the round view.
   - **CF4:** board fallback with the side detected.
   - **CF5:** board fallback with the White/Black buttons.
   - **CF6:** recovery: quota → add token → retry, and primary down → backup.

## Criteria (weights sum to 100)

### C1. Position and side-to-move correctness (24)
- **3:** Reads a standard-start mainline on at least one site. At least one known path silently sends a wrong position.
- **6:** Both sites pass fixture tests on the full outbound request (FEN + moves) for these cases:
  - mainline mid-game
  - start position
  - last move
  - flipped board
  - board fallback with the side detected
  - board fallback with the side buttons
  Variation and custom-start pages either work or fall back visibly.
- **9:** Every one of the following, each with a named test:
  - (a) The §3.7 fixture matrix passes, with at least 12 fixtures per site, each asserted according to its fixture type (procedure step 5).
  - (b) Strict SAN validation (§3.2). Any token that fails discards the whole list, and nothing is "cleaned" into a different move.
  - (c) Moves are never replayed from the standard start unless that start is verified (§3.2).
  - (d) The pre-send cross-check and the post-response `fen` check both run (§3.3). The post-response check compares against the snapshot taken at click time. A mismatch falls back visibly and is never sent silently.
  - (d2) When the page exposes the root FEN (for example a lichess `[FEN]` tag), a custom-start Explain sends that root plus the moves (§3.2).
  - (e) Board-scan hygiene (§3.4): animation and drag pieces are ignored, impossible boards are rejected, last-move squares only, main board only.
  - (f) The request is rebuilt from a fresh read at click time and matches the button label (§3.5).
  - (g) The side to move is never silently defaulted, and its source is shown with a one-click switch.
  - (h) Exact site FENs keep all six fields.
  - (i) The owner's dated live chess.com check is recorded.
- **10:** Everything in 9, plus:
  - a full SAN replay that reproduces the scanned placement exactly
  - chess.com variations read as lines
  - zero mismatches on 5 adversarial fixtures the reviewer writes, limited to realistic site DOM (recorded or lila-derived markup)

### C2. QUEEN client reliability and courtesy (13)
- **3:** The happy path works on one Space. There are no timeouts, errors are shown raw or classified by regex on English text, and the client falls back on every error.
- **6:** Both recorded response shapes parse in tests. Connect, idle and overall timeouts exist. Cancel aborts the fetch. Fallback works. A quota error leads to token setup. Nothing is sent without a click.
- **9:** All of §4, with tests:
  - typed error codes assigned in the background (§4.4)
  - fallback only on transient classes, at most once per ask (§4.3)
  - schema validation, with an unknown shape giving `bad_response`
  - an SSE parser tested with arbitrary chunk splits, CRLF and a stream that ends with no `complete`
  - one request in flight per browser, and duplicate clicks coalesced
  - a bounded session cache, with "Ask again" bypassing it with a new seed
  - an overall deadline of 150 s or less, with a "still waiting" message at 60 s
  - two separate E2E tests (§4.1):
    - **Survival:** a stream of heartbeats only, lasting 90 s and then completing, still delivers its answer with no fallback.
    - **Timeout:** a silent primary is aborted at 45 s and the backup is tried once. With the backup also silent, the ask ends in `timeout` within 150 s.
  - every failure lands in a named state, including "both servers unavailable"
  - a configurable custom server through an optional host permission, and the result names the server that answered
- **10:** Everything in 9, plus `Retry-After` is honoured and shown, a "both servers unavailable" state links to custom-server setup, and duplicate asks from two tabs produce one GPU job.

### C3. Answer fidelity (11)
- **3:** Sides or move numbers are mislabelled, agreement is asserted wrongly, or raw model tokens are shown.
- **6:** Labels and the agree/disagree verdict are correct, and caveats exist for weak move sources and truncation.
- **9:** All of §4.5 and §5.3:
  - The best move is shown in SAN with the correct number and side.
  - `sameMove` normalizes castling, check and mate marks, glyphs and promotion.
  - On disagreement, the copy says the played move was not analysed.
  - The source-precedence rule in §4.5 is followed. Only a **verified** move becomes the headline or is used for the agree/disagree verdict. An unverified prose move is shown only as "Queen's text suggests X (unverified)". A `random_legal_fallback` move is never presented as Queen's.
  - When an evaluation is supplied, it names a side. When a critical line is supplied, it is numbered SAN. When either is missing, its row is left out.
  - "the player / the opponent" is mapped to White/Black.
  - Truncation is flagged at the top, with "Try the other server".
  - Both Space formats render the same card.
  - The recorded truncated reply renders the exact card given in §4.5.
- **10:** Everything in 9, plus a regression fixture for every `move_source` value and both `finish_reason` values, each with a screenshot.

### C4. Panel UX and copy (10)
- **3:** An answer can be obtained, but states are unclear, the user hits dead ends, there is jargon in headlines, or the panel covers the board or move list with no remedy.
- **6:** The ask, thinking (with elapsed time), result and error states each have a next action and a screenshot. "Explanations can be wrong" is visible.
- **9:** All of §5:
  - Every §5.1 state has a screenshot.
  - The copy rules in §5.2 are followed.
  - A first-use notice is shown.
  - A result is marked stale when the board moves, with a one-action re-ask.
  - The open panel covers neither the board nor the move-navigation controls at 1280×800 and 1440×900 on the fixtures. Alternatively, it can be docked to the other side in one action and that choice is remembered.
  - The board is asked about in 2 clicks or fewer.
- **10:** Everything in 9, plus a keyboard shortcut shown in the UI, and a copy review that finds no redundant sentences and consistent terms throughout.

### C5. Accessibility (7)
- **3:** Mouse-only flows, or focus is lost on close, or there are no announcements.
- **6:** The whole flow works by keyboard with visible focus. Focus moves into the panel on open and follows the spec §6 close order (normally back to the launcher). Text contrast is 4.5:1 or better. Reduced motion is honoured. Every control has an accessible name.
- **9:** All of §6:
  - Live regions: `status` for thinking and result, `alert` for errors, and the timer is not announced.
  - Escape closes the panel only when focus is inside it.
  - Panel key events don't trigger site shortcuts.
  - UI boundaries and focus have 3:1 contrast or better.
  - Targets are at least 24×24 px.
  - State is never shown by colour alone.
  - The layout works at 200% zoom and at 320 px width.
  - axe reports zero serious or critical issues in every state. The scan must provably include the panel's nodes: it lists a known panel control, and a deliberately unnamed test control planted in the panel is detected.
  - The options page meets the same bar.
- **10:** Everything in 9, plus a documented screen-reader walkthrough with no blockers, and an `Alt+Q`-style `commands` shortcut.

### C6. Security, privacy and fair play (10)
- **3:** Unescaped sinks, a token readable by content scripts, a wildcard in the **required** `host_permissions`, or UI shown during games in progress.
- **6:** All untrusted text goes through `textContent` or the escape-first renderer, with a test. The token is stored locally and sent only to the Queen servers over HTTPS. Only FEN, moves and generation parameters are sent. The UI says the servers are third-party.
- **9:** All of §2 and §7:
  - The fail-closed fair-play gating matrix is tested (§2).
  - An XSS corpus is tested in unit and E2E.
  - The background validates the sender and the payload.
  - Content scripts never read the token.
  - An E2E network allowlist proves the extension contacts no other hosts.
  - A first-use third-party notice is shown.
  - The token has Remove and guidance.
  - The privacy policy matches the behaviour line by line.
- **10:** Everything in 9, plus a renderer that builds DOM nodes with no `innerHTML`, a one-page threat model, and a reviewer who cannot get mid-game help in 5 adversarial tries.

### C7. Chrome Web Store readiness (12)
- **3:** It loads unpacked as MV3 with no remote code, but there is no privacy policy, no package script and no listing material, or the **required** host permission is a wildcard.
- **6:** Host permissions are exact, there is an allowlist package script, and there are draft versions of the privacy policy, listing and non-affiliation line.
- **9:** All of §9:
  - A zip-content test passes, and the extracted zip loads cleanly.
  - Every permission has a justification.
  - The data-use answers match the policy.
  - The single-purpose statement is written down.
  - Screenshots at 1280×800 and the 440×280 promo tile come from fixture pages with no site logos.
  - Reviewer instructions need no login.
  - The listing states fair play and the limits.
  - The version is 1.0.0 or later and matches the zip name and the CHANGELOG.
  - LICENSE and model attribution are present.
  - `store/OWNER-TODO.md` covers the hosting, account and Space-owner decision (§12).
- **10:** Everything in 9, plus `_locales/en`, and a draft upload that passes the dashboard checks (owner screenshot).

### C8. Performance and site non-interference (5)
- **3:** Polling with layout reads on every page forever, changes to site DOM or styles, or overlap with site controls.
- **6:** With the panel closed, each tick is one cheap selector check with no layout reads, and nothing runs in hidden tabs. There is one host element, and site CSS and JS are untouched.
- **9:** All of §8: the open panel updates from changes (debounced to 4/s or less, within 300 ms), no `preventDefault`/`stopPropagation` on site events, and one launcher plus stable timer and listener counts after 10 SPA navigations (tested).
- **10:** Everything in 9, plus a measured idle cost under 1 ms per second, documented.

### C9. Tests, evidence and docs (8)
- **3:** No automated tests, or tests that don't exercise the shipped code.
- **6:** One command runs the unit tests and the DOM-fixture tests for both sites, all green, and the README explains how.
- **9:** All of §10 and §11:
  - The suite covers the fixture matrix, the XSS corpus, SSE fragmentation, error codes, best-move extraction, and an E2E on the real unpacked extension with a mocked Space.
  - Each fixture has a distinct identity, asserted before its payload is checked.
  - Screenshots are generated for every state.
  - An axe and keyboard E2E runs.
  - Three reviewer mutations each make a test fail: flipping side parity, removing the escaping, and replaying from the standard start.
  - The README covers install, use, fair play, privacy, token, troubleshooting, the custom server, test, package and limits.
- **10:** Everything in 9, plus CI on push, and a regression test for every bug fixed during the review loop.

## Hard caps (applied after the weighted mean; the lowest wins)
| ID | Condition | Cap |
|---|---|---|
| H1 | A core flow silently sends QUEEN a position (placement, side, castling, en passant, move list or root) that differs from the board the user is looking at for the labelled ask. A castling or en-passant value that the board fallback shows to the user as a guess (spec §3.4) does not count as silent. | **5.0** |
| H1b | The same, in one of these named situations: custom start, Chess960 or variant, mid-animation, mini-board, localized notation. When a case matches both H1 and H1b, H1b applies (the two are mutually exclusive). Board-fallback clocks of `0 1` never trigger H1 or H1b. | **7.0** |
| H2 | Model, site or server text reaches an HTML, attribute or URL sink unescaped, or remote code is run. | **4.0** |
| H3 | The HF token goes anywhere other than the configured Queen servers. Also: the token is logged or synced, or is readable by content scripts. Also: the token is displayed anywhere except as text the user is typing into the options field. A stored token may show only its last 4 characters. | **4.0** |
| H4 | A crash or dead end in a core flow: an uncaught exception that breaks the panel, a state with no way out short of reloading, or a wait with no deadline and no cancel. | **5.0** |
| H5 | A Chrome Web Store blocker: remote code; a missing privacy policy or disclosure for FEN, moves and the token going to third parties; an unjustified or broad **required** permission, or a **granted** optional permission broader than the one exact origin the user chose; a listing or icon that implies endorsement by Chess.com, Lichess, Princeton or Hugging Face; test or docs files in the zip. The **declared** `optional_host_permissions: ["https://*.hf.space/*"]` that spec §1 requires does not trigger H5 or the level-3 anchors, as long as it is justified in `store/`. | **5.0** |
| H6 | Fair play: any UI path to a QUEEN answer on a page showing a game in progress (live, daily or correspondence) or an unsolved puzzle. | **5.0** |
| H7 | A move that isn't **verified** under spec §4.5 is presented as "Queen plays / prefers X", or is used for the agree/disagree verdict. That includes a random server-picked move and an unverified prose move. | **6.0** |
| H8 | No passing automated tests → **6.0**. No Playwright E2E on the unpacked extension, or no screenshot per state → **7.5**. No dated owner live chess.com check → **8.5**. | as listed |
| H9 | Any criterion below 5 → **6.9**. Any criterion below 7 → **8.5**. C1, C3, C7 or C9 below 9 → **8.9**. | as listed |

## Reviewer output (JSON)
`{ "reviewer", "round", "criteria": {"C1": {"score", "met": [...], "unmet": [{"condition", "evidence", "expected", "observed"}]}, ...}, "weighted_mean", "caps_triggered": [{"id", "evidence"}], "overall", "issues": [{"severity": "blocker|major|minor", "criterion", "where", "problem", "fix"}] }`
