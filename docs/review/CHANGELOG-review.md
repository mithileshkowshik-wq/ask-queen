# Fixes made during the review loop

Reviewers must verify each claim below against the code and evidence. None of them should be taken on trust.

## Fix pass 1 (after round 1: GPT-6.2-sol 3.3, Fable 5.2 4.0)
**Who did the work**
- Logic: Opus 5.5. It took over a partial GPT-6.2-sol draft and reviewed every line of it.
- UI and copy: Fable 5.2.
- Coordinator fix: the lichess round view now handles both current and older lila tag names.

**Changes by area**
- **Token (H3):**
  - `chrome.storage.local.setAccessLevel(TRUSTED_CONTEXTS)` is called at the service worker's top level and in `onInstalled`.
  - An E2E test reads the token from a content script and checks that the read fails.
  - Options shows a saved token as `hf_…abcd`, and has Remove, a format check, the third-party note, and per-origin consent before the token is sent to a custom server.
- **Fair-play gating (H6):** each adapter has a fail-closed `gate` value: `in_progress`, `variant`, `puzzle` or `unknown_context`. Gated fixtures on both sites check the UI and zero requests. If the gate changes while the panel is open, the request is aborted and the answer cleared.
- **Store (H5, C7):**
  - The two exact host permissions are required; the wildcard is optional and granted per exact origin.
  - Release files: `PRIVACY.md`, `store/**` (listing, single purpose, permission justifications, data-use answers, reviewer instructions, `OWNER-TODO`, promo tile), `LICENSE` with attribution, `CHANGELOG.md`.
  - The manifest is version 1.0.0, with a 32 px icon, `homepage_url` (placeholder) and `minimum_chrome_version`.
  - `scripts/package.sh` builds the zip. A test checks the zip contents and that the extracted zip loads.
- **Move trust (H7, C3):**
  - §4.5 source precedence, with `sanMatchesUci` checking disambiguation.
  - Unverified prose appears only as a "suggests (unverified)" line, with no verdict.
  - Random or guessed moves from the server are never presented as Queen's.
  - "Player" and "opponent" are mapped to White and Black. The evaluation names a side. The critical line is numbered.
  - The truncation notice sits under the headline, with "Try the other server".
- **Position (H1/H1b, C1):**
  - New `content/chess.js` with strict SAN, a root-relative pre-send check (including zero plies), and post-response `verifyBest` and `verifyExplain` against the click-time snapshot.
  - Custom-start detection; the root comes only from a PGN `[FEN]` tag.
  - Board-scan hygiene: main board only, transient pieces skipped, impossible boards rejected, last-move classes only, chess.com user marks filtered.
  - Six-field `fen6`.
- **Client (C2):**
  - Timeouts: 20 s connect, 45 s idle (reset by any bytes), 150 s overall.
  - Keepalive every 20 s, and `still_waiting` at 60 s.
  - Typed error codes, including `all_unavailable`; fallback only on transient errors.
  - Schema validation.
  - Coalescing and one request in flight, a 32-entry, 15-minute cache, a new seed for "Ask again", and a 2 s gap between asks.
  - Custom server.
  - The SSE parser is exported and unit-tested.
- **UX and accessibility (C4/C5/C8):**
  - Every §5.1 state, a first-use notice, stale results, a dock toggle, and a "disagree" banner.
  - Live regions, the close-focus order, Escape scoped to the panel, panel keys kept from reaching the site, and contrast and target fixes.
  - The panel follows the board with a `MutationObserver` while open.
- **Tests (C9):**
  - 285 checks, about 32 fixtures per site, each with an identity marker.
  - XSS corpus; SSE fragmentation; every error code.
  - E2E: Survival and Timeout; cancel aborts; cache hit; network allowlist; failed token read.
  - axe reaching inside the shadow root, proven by a planted control; keyboard-only flow; 10 SPA navigations.
  - Mutation-sanity tests; a screenshot for every state; layout checks at 1440×900.
- **Live checklist:** `docs/live-checklist.md` holds the owner's 2026-11-19 chess.com confirmation copied from chat, marked **owner signature pending**.

## Fix pass 2, logic (after round 2: GPT-6.2-sol 4.0, Fable 5.2 5.0)
Done by Opus 5.5. Each line gives the fix and the test that guards it; every test name is in `docs/review/evidence/round-dev/report.json`.

- **H6, chess.com gating failed open** (`content/chesscom.js` `scope`). The order is now: puzzles, then variants (route, badge, PGN `[Variant]`), then the standalone analysis board (no game id). Every page tied to a game needs a finished game on screen, meaning a result token (`1-0`, `0-1`, `½-½`) or a game-over container. That covers `/game/…`, `/analysis/game/…` and Game Review. `tab=review` and `/review` only label the page. "Draw"/"resign" text no longer counts.
  - Guarded by: `Adapter fixture chesscom-{live-tab-review,daily-tab-review,live-review,analysis-daily,analysis-live}`, `Panel fixture …` and `Browser fixture …` (zero requests), `Open panel navigation gate chesscom-…` (5 tests), `AQ.gate() is layout-free and agrees with readPosition() on every fixture`.
- **H3, token echo** (`background.js` `scrub`). Redaction is the last step of normalization and covers every string in the result. It removes the saved token and anything `hf_`-shaped with 8 or more characters, also when `*`, `_`, `` ` `` or `~` sit between the characters. Markup is stripped first, so `hf_ab<b></b>cd…` is rejoined and then removed.
  - Guarded by: `Token redaction runs last and catches the saved token split by markup or Markdown`, `Worker echoing the saved token in its answer never reaches the panel`, `Browser token echoed by a server never appears in the panel`.
- **H1, exact castling and en passant rights** (`content/chess.js` `verifyBest`, `background.js` `normalized`/`validAsk`). When the page gives an exact FEN, the snapshot carries its `castle`/`ep`. Best then needs them equal, and Explain needs returned rights that include them. Otherwise the result is `positionCheck: "mismatch"` and "Work from the pieces" sends fen6.
  - Guarded by: `With exact rights in the snapshot, Best needs equal rights and Explain may only lose rights`, `Panel fixture lichess-rights-mismatch`, `Browser fixture lichess-rights-mismatch` (mismatch, then a fen6 request).
- **H1b, animation** (`content/common.js` `AQ.scan`). Any moving, dragged or fading piece makes the board `valid: false` with "The board is moving". A partial scan is never offered.
  - Guarded by: `Adapter/Panel/Browser fixture {lichess,chesscom}-animation` (the moving piece is a real one), `A moving piece keeps the board unreadable until it lands`.
- **H1b, chess.com custom roots** (`content/chesscom.js`). A share-panel PGN `[FEN]` is used as the root, and `[SetUp]` without a FEN blocks replay. `data-whole-move-number` on the first row is a custom-start sign.
  - Guarded by: `Adapter/Browser fixture chesscom-tagged-root` (root plus prior moves), `chesscom-row-number`, `lichess-custom-line` (custom root with a prior move on lichess).
- **H7, provider-specific legality** (`background.js` `normalized`). A prose move is confirmed only by `critical_line_uci[0]` on boneyland, or by `critical_line.legal_steps[0].uci` on hugging-apps when it is a real object. (Corrected in fix pass 3: the recording's `critical_line` is an object with `legal_steps`, so hugging-apps prose can be confirmed. Only a repr string, or a field from the other provider's shape, stays unverified.)
  - Guarded by: `Prose is confirmed only by the answering provider's own legality field`.
- **Real boneyland recording** (`test/fixtures/boneyland-success.sse`). `evaluation` is the model's sentence, so it is used as `evaluationText` and no sign is parsed. Numbers remain a fallback. "4. Nxe5" becomes "4.Nxe5" in prose and in the critical line, and the BEST_MOVE/CRITICAL_LINE/EVALUATION lines are dropped from the prose. The mock serves the recording for its own position.
  - Guarded by: `The real boneyland recording normalizes with its evaluation sentence and a numbered line`, `Browser fixture lichess-recorded` (exact Evaluation row, screenshot `result-evaluation.png`).
- **Minors.**
  - Only well-formed tags are stripped, so "a<b" survives. Guarded by: `Provider text drops well-formed HTML, SVG and model tokens but keeps a lone '<'`.
  - 401/403 counts as `token_rejected` only when a token was sent; otherwise it is `unreachable`, so the backup is tried. Guarded by: `All background codes have a fixture…`, `Worker treats 401 without a token as a dead server and tries the backup`.
  - `Retry-After` (seconds or an HTTP date) on 429/503 becomes `error.retryAfter`. Guarded by: `Worker passes Retry-After (seconds|HTTP date) with the busy error`, `Browser error busy` (countdown).
  - When another tab holds the in-flight slot, the error is `busy` with `reason: "other_tab"`. Guarded by: `Worker tells a second tab that another tab is already asking`.
- **C8, layout-free `AQ.gate()`** (`content/common.js` and both adapters; contract in `docs/review/contract.md`). Guarded by: `AQ.gate() is layout-free and agrees with readPosition() on every fixture`.
- **Tests added.**
  - The 10-navigation E2E counts real pending timers by wrapping `setTimeout`/`setInterval` in the content-script world.
  - The keyboard E2E has capture and bubble listeners on window and document.
  - `Browser panel and options fit 320x568|640x400 with 24 px targets`, with screenshots.
  - `Browser options: token format, masked token, Remove, exact-origin permission and per-origin consent`.
  - `A click on another line's move while an ask is in flight cancels it and asks about the new move`.
  - `Browser quota recovery: add a token in Settings, then retry on the same page`.
- **Harness.**
  - Fixture URLs may carry a query string (`?tab=review`).
  - chess.com game fixtures carry the finished result their real pages show.
  - `minimum_chrome_version` is 158. Playwright is pinned to 1.65.0, which ships Chromium 158.0.8127.18, so local runs and CI test exactly the minimum version. The owner's installed Chrome is 158.0.8127.37 (159 would have blocked installing it). Guarded by: `Chromium major equals the manifest minimum_chrome_version`.
  - CI is `.github/workflows/test.yml`; it runs on push and pull request.
- **C5, key isolation from site capture listeners** (`content/keyguard.js`, a separate `document_start` entry). The guard's window capture listener runs first and stops panel-origin keys before any site handler, including window capture listeners that page scripts register while the page parses. It leaves Tab, Enter and Space to their default actions, and Escape inside the open panel presses Close. It is in the package allowlist and the zip test.
  - Guarded by: `Browser keyboard-only ask, Escape and site shortcut isolation` (`siteEarlyKeys` stays 0 for a page-script window capture listener; bubble and late capture listeners on window and document also stay 0), and `Manifest is MV3 …` (entry order).

## Live fix (coordinator, Opus 5.5): chess.com move list rejected on the real site
- **Problem.** The owner's live check of 1.0.0 on chess.com Game Review (2026-11-19) found that the board was read correctly, but the move list was never used, so only Best move was offered. The owner captured the real markup: `<span data-figurine="B"></span> f4 ` puts spaces around the move text. The rebuilt SAN was therefore "B f4", which strict SAN correctly rejects, discarding the whole list.
- **Fix.** `content/chesscom.js` removes whitespace when rebuilding SAN, because whitespace is never part of SAN. The move-list selector also accepts the live `.move-list-row .node` structure.
- **Guarded by:** `Adapter|Panel|Browser fixture chesscom-live-markup` and `…-live-markup-black`. These fixtures reproduce the captured markup verbatim: `data-whole-move-number` rows, padded figurine text, `offset-for-annotation-icon`, and timestamp cells. Both return `null` (falling back to the board) without the fix.

## Fix pass 3, logic (after round 3: GPT-6.2-sol 4.0, Fable 5.2 7.0)
Done by Opus 5.5. Each entry gives the fix and the test that guards it; every name is a test in `docs/review/evidence/round-dev/report.json`.

- **Root cause of the castling, rights and placement findings (GPT H1, Fable H1b): full SAN replay** (`content/chess.js` `replay`). It is a legal-move replay. Disambiguation is resolved by "the mover's king is not left in check". It handles castling (right, empty path, no attacked king squares), en passant, promotion, rights lost on king and rook moves and on rook captures, en passant written only when a legal capture exists, and the clocks.
  - **Before sending** (`content/common.js` `AQ.position`): the replay must rebuild the scanned board, and must match the exact site FEN's side, castling and en passant. Otherwise the list is dropped and the "disagree" state shows. `lichess-rights-mismatch` is now a disagree fixture: the only POST is the exact FEN, never the line.
  - **In the background:**
    - `validAsk` rejects any ask whose line, plus the played move for Explain, does not replay onto the snapshot. It answers `illegal_position` and makes no fetch.
    - The returned FEN must equal the replayed position, including castling and en passant.
  - Guarded by:
    - `Full SAN replay: legal moves, disambiguation by pins, castling, en passant, promotion, rights and clocks`
    - `Adapters drop a move list whose replay doesn't match the exact FEN's castling or en passant`
    - `Background checks the returned FEN against the replayed line, rights and en passant included`
    - `Worker rejects malformed snapshots and lines that don't replay onto the snapshot, with no fetch`
    - `Adapter/Panel/Browser fixture lichess-rights-mismatch`
    - every sending fixture (each now passes the replay)
- **lichess custom starts and variants** (`content/lichess.js`).
  - `variant-fromPosition` on `main.analyse` or `.round__app`, and the game-meta "From position" text, are custom-start signs, so the board fallback is used unless a PGN `[FEN]` root exists.
  - Any other `variant-<key>` except `standard` is gated, studies included.
  - Black-first column trees (`<index>1</index><move class="empty">`) and inline numbers (`<move><index>3.</index>…`) are custom-start signs.
  - Finished games in the analysis view are recognised by `.analyse__moves .result`.
  - The PGN is read from lila's `div.pgn` text.
  - Fixtures are rebuilt from lila markup: `lichess-finished`, `lichess-study`, `lichess-frompos-round`, `lichess-frompos-analysis`, `lichess-study-960`, `lichess-study-crazyhouse`, `lichess-inline-custom`, `lichess-column-black-first`.
  - Guarded by: the matching `Adapter/Panel/Browser fixture …` tests.
- **chess.com finished evidence scoped to the game (GPT H6, Fable 4)** (`content/chesscom.js` `scope`).
  - PGN is read only from the share panel's read-only textarea or a `data-pgn` on the board or its layout.
  - A result token counts only inside the move list; a game-over element counts only inside the main board layout.
  - A running clock (`.clock-player-turn`, `.clock-running`) always gates.
  - Fixtures: `chesscom-live-notes-result`, `chesscom-live-sidebar-result`, `chesscom-live-tab-review-sidebar`, `chesscom-live-clock-and-result`. Each runs direct and as a Browser fixture, with zero POSTs.
- **chess.com SAN and highlights (GPT major).**
  - Each text node is trimmed and then joined, so the live padding around figurines still reads (`chesscom-live-markup`, `chesscom-live-markup-black`), but `e 4` inside one node fails (`chesscom-inner-space`).
  - A side is read only from exactly two highlight squares of one colour, after dropping the mark colours in rgb() and rgba() form (`chesscom-marks-only`, `chesscom-mixed-highlights`, `chesscom-user-marked`).
- **Token (GPT H3, Fable 8)** (`background.js` `invisible`, `scrub`, `guard`).
  - `\p{Cf}` and U+00AD are stripped from every provider string first.
  - The saved token is matched across whitespace, newlines and Markdown marks.
  - A final check spells the displayed fields with only letters and digits, both alone and joined. A field that leaks is replaced with "[redacted]"; a leak split across fields clears them all.
  - Guarded by: `Token redaction also catches paragraph, cross-field and invisible-character splits`, plus the pass-2 echo tests.
- **Background.**
  - **Snapshot shape (GPT major).** Primitive, array and null snapshots, unknown keys, and wrongly typed rights are rejected cleanly. Guarded by: `Worker rejects malformed snapshots …`.
  - **Keys include rights (Fable 10).** The cache and coalescing keys include `snapshot.castle`/`ep`. Guarded by: `Worker keys the cache and coalescing on the snapshot's exact rights`.
  - **Retry-After cooldown for every ask and tab (GPT C2).** The longest `Retry-After` is kept after a fallback. A settings change, such as adding a token for a quota, lifts the cooldown: `Worker lifts a Retry-After cooldown when the settings change (a token for a quota)`. Guarded by: `Worker keeps a Retry-After cooldown for every ask and tab, then asks again`.
  - **Evaluation rows (Fable 3, GPT C3).** hugging-apps' EVALUATION line is extracted before the structured lines are dropped, and player/opponent is mapped. A sentence that names no side is dropped, and an "equal" one is shown as equal for White and Black. Guarded by: `Evaluation rows: both real recordings name a side, …`.
  - **hugging-apps prose confirmation (Fable 7).** It is confirmed by the recorded `critical_line.legal_steps` object. Guarded by: `hugging-apps prose is confirmed by its recorded critical_line.legal_steps object`.
- **Closed-panel cost (GPT C8).** `AQ.gate()` caches its answer and recomputes only on a URL change, a board element change, or a click or key press, so a quiet tick costs one `querySelector`. `AQ.confirm()` is the full read for the moment the gate opens. The contract is in `docs/review/contract.md`, and the measurement is in `docs/perf.md`.
  - Guarded by: `AQ.gate() caches: a quiet tick is one querySelector; URL, board or a click recomputes it`, `AQ.gate() is layout-free and agrees with readPosition() on every fixture`, `Browser closed-panel idle cost stays under 1 ms per second` (writes `perf.json`; measured at 0.209 ms per second).
- **Keyboard shortcut (C4/C5 level 10).** The manifest declares `commands.open-panel` (Alt+Q), and `onCommand` sends `chrome.tabs.sendMessage(tab.id, {type:"openPanel"})`. No new permission is needed.
  - Guarded by: `Worker opens the tab's panel on the Alt+Q command and ignores other commands`, `Browser Alt+Q command message opens the panel, and the shortcut is shown`.
- **`_locales/en`.** It holds `extName`, `extDescription` and `openPanel`, with `default_locale: "en"`. It is in the zip.
  - Guarded by: `Manifest is MV3 …`, `Allowlist zip contains exactly the runtime files …`, `Extracted allowlist zip loads in Chromium` (`chrome.i18n.getMessage("extName")`).
- **Tests.**
  - True 200% zoom: `Browser 200% zoom: panel and options fit, keep 24 px targets and work by keyboard`, using CDP device scale 2 at 640×400.
  - `Browser result-promising` (a `promising_or_analysis` screenshot).
  - `Browser stale Best result whose new position only allows Explain re-asks with Explain`.
  - Stale banner order, asserted inside `Browser cache replay and stale result after a cursor change`.
  - `Live regions exist and are empty before any text is written into them`.
  - `Another tab's ask shows its own copy, not the busy-server copy`.
  - The escaping mutation test now targets the DOM renderer's single text sink.

## Fix pass 4, logic (after round 4: GPT-6.2-sol 5.0, Fable 5.2 9.7)
Done by Opus 5.5. Each entry gives the fix and its guarding test; every name is a test in `docs/review/evidence/round-dev/report.json`.

- **GPT H1, board-fallback en passant** (`content/chess.js` `enPassant`, `content/common.js` `boardFromPieces`). A double push sets the square only when the side to move can legally take, using the same rule as the replay.
  - The `E4` constant now has `-`. `board-ep` is a positive case where Black's d4 pawn can take; `board-ep-pinned` is the same push with the taker pinned, so no square.
  - Guarded by: `Adapter/Panel/Browser fixture {lichess,chesscom}-board-side`, `…-board-ep`, `…-board-ep-pinned` (full outbound FEN), `Board hygiene rejects impossible boards and ignores ambiguous highlights`.
- **GPT H6, a running clock checked before standalone /analysis** (`content/chesscom.js` `scope`).
  - Guarded by: `Adapter/Panel/Browser fixture chesscom-spa-analysis-live`, `Browser staggered SPA move to /analysis that keeps the live board and running clock stays gated` (the route and the board change in separate steps; zero POSTs).
- **GPT C8, no layout reads while closed** (`content/common.js` `AQ.confirm`, `AQ.styled`). The gate-open confirmation is evidence-only, using `checkVisibility()` style visibility on result, clock and badge elements. There is no board scan and no rect reads. A CSS-hidden finished marker keeps the launcher hidden.
  - Guarded by: `Browser closed launcher ticks make no layout reads, also across a URL change` (counts getBoundingClientRect, getClientRects and offset/client sizes in the content-script world), `Adapter/Panel/Browser fixture chesscom-css-hidden-result`, `AQ.gate() is layout-free and agrees with readPosition() on every fixture` (rects throw; confirm closes the CSS-hidden case).
- **GPT majors.**
  - **Empty move list** (`background.js` `normalized`). The returned FEN is compared field by field with `req.fen`, as on a first-move Explain or the board fallback. Guarded by: `With no preceding moves the returned FEN must equal the request root (first-move capture, GPT round 4)`.
  - **"Try the other server" after a failure.** The failing server becomes the tab's last server and is sent as `error.server`. Guarded by: `Worker 'Try the other server' after a bad_response avoids the server that just failed`.
  - **Study with a tagged custom start.** Guarded by: `Adapter/Panel/Browser fixture lichess-study-tagged` (Explain 31.d5, root plus `d4 O-O-O`).
  - **Retry-After cap.** One 600 s cap, applied in the background for both header forms. Guarded by: `Worker caps Retry-After at the panel's 600 s for both header forms`.
- **Fable major 1, token** (`background.js` `guard`). The final check runs on the text as rendered, with line-leading list, heading and label markers stripped. It compares against the token body as well, and flags any 8 characters in a row of it.
  - Guarded by: `Token redaction also catches paragraph, cross-field and invisible-character splits` (ordered-list and "7)" splits, an echo without the prefix, a heading or label split), and `Browser token echoed by a server never appears in the panel` (the mock now echoes as list items and as the body alone).
- **Fable minors.**
  - **lichess FEN-input lag.** One re-read 300 ms later, by nudging the panel's own host. Guarded by: `A lichess FEN input a step behind the board gets one re-read 300 ms later, not a loop`.
  - **chess.com Chess960 off /variants/.** On a game page whose list starts at White's move 1 with no custom sign, a first move impossible from the standard start is gated as a variant, layout-free. Guarded by: `Adapter/Panel/Browser fixture chesscom-960-game`.
  - **lichess evidence narrowed.** Only `.result-wrap .result` and `.analyse__moves .result` count, and `[Result]` only from `div.pgn`. Guarded by: the lichess fixtures.
  - **Analysis capped at 20,000 characters.** Guarded by: `Very long provider prose is capped at 20,000 characters before it is parsed`.
  - **Bare-number evaluations get no row.** Guarded by: `Both recorded API shapes normalize …`.
  - **`getPrefs` returns the real `shortcut`.** Guarded by: `Worker protects local storage on startup and install and limits prefs writes`.
- **Regression tests.**
  - The content-side replay: `chesscom-replay-catches` (list `e4 e5 Nf3 Nc6 Bc4` against a board with the knight on f6, so disagree and only the board goes out).
  - `A board-fallback answer has no move numbers in its headline (clocks are unknown)`.
  - The zoom200 screenshots come from CDP `Page.captureScreenshot`, with `innerWidth` asserted to be 640.
  - `docs/perf.md` now names Chromium 158 and Playwright 1.65.0, and describes the evidence-only confirm.

## Post-round-5 fixes (GPT round-5 probes)
Done by Opus 5.5.

- **GPT H3, token spelled out through label headings** (`background.js` `guard`, `content/panel.js` `md`).
  - The probe: "hf_" followed by the lines "ABCD:", "EFGH:", "IJKL:", "MNOP:". The panel turned each label into an h4 and recased it ("Abcd"), so the panel text spelled the saved token. The old guard dropped label lines before comparing, so it missed them.
  - The panel no longer recases label headings. They show their own letters, with `_` as a space. The renderer now never adds or recases a letter. It only drops markup, `<PIECE_…>`/`<SQUARE_…>` tags, line-leading list numbers (shown as list markers) and, in a bare critical line, move numbers.
  - The guard compares a canonical form: letters and digits only, case-sensitive. It checks each string as written, without the tags and list numbers, and without move numbers. The fields are also joined in display order (evaluation, critical line, analysis). If any 8 characters in a row of the token body appear, the field is redacted as before (a split across fields clears them all). The marker-stripping list is gone.
  - Guarded by: `Token guard compares letters and digits only: label, list, bold and number splits are caught (GPT round 5)` (also covers a bare critical line, case sensitivity, and recorded prose and SAN with a realistic token left intact) and `Panel never shows 8 characters in a row of the token body through label, list or bold splits (GPT round 5)` (the probe end to end through `normalized` and the panel; panel text, letters and digits only, holds no 8-character run of the body; plus label, "- " list, "**…**" and ordered-list variants).
- **GPT H6, an unchanged daily board accepted after an SPA move to /analysis** (`content/chesscom.js` `scope`).
  - A daily game has no running clock, so the round-4 clock check did not apply. Every board element that the adapter sees while any gate is set goes into a `WeakSet`. The standalone /analysis path (no game id) treats such a board as `in_progress`. A new board element, as on a fresh analysis page, is unaffected.
  - Game-page evidence does not consult the set, so a game that finishes in place still opens. Layout-free: one `querySelectorAll` of the board selector, no rect reads. This fails closed: a board seen gated stays closed under standalone /analysis until the page reloads or the site mounts a new board.
  - Guarded by: `An unchanged daily game board stays closed after an SPA move to /analysis; a new board opens (GPT round 5)` (the repro: launcher hidden, `readPosition().gate` is `in_progress`, zero asks; then a new analysis board asks), `Browser SPA move to /analysis that keeps a daily game board stays closed; a new board opens (GPT round 5)` (real navigation, zero POSTs, then a new board's ask gives one POST), and the existing `Browser closed launcher ticks make no layout reads, also across a URL change` and `AQ.gate() caches: …` (finish in place opens).
- Mutation sanity: with each fix reverted, its new tests fail. With the old renderer alone, the panel test fails (the guard is case-sensitive, so a recased heading would leak).

## Post-round-5 fixes, logic (review issues)
Done by Opus 5.5, from `docs/review/round-5/fable.json`. Each issue was reproduced before the fix, and each new test fails with its fix reverted.

- **Fable major 1, share-panel PGN as finished-game evidence** (`content/chesscom.js` `finishedPgn`).
  - The repro: on an in-progress daily game (no clock-turn class), a hidden leftover share textarea, or a `data-pgn` on the board, with another game's moves and `[Result "1-0"]` opened `readPosition()`, `AQ.gate()` and `AQ.confirm()`, and the move list was offered.
  - A PGN's `[Result]` now counts only when its element passes the same visibility as the other evidence (`checkVisibility()` style visibility in `confirm()`, no layout reads in `gate()`), and its movetext (tags, `{[%clk …]}` comments, variations, NAGs, numbers and the result removed) is exactly the visible main line of the move list: same length, same SAN after `stripSan`. A prefix does not count, so an older game that only shares this game's opening is refused. Otherwise it is dropped as evidence and the other checks decide. `[Variant]`, `[FEN]` and `[SetUp]` are used as before.
  - Guarded by: `Adapter/Panel/Browser fixture chesscom-share-pgn-hidden-stale` (hidden, other moves; gated, zero POSTs), `…-share-pgn-hidden` (hidden copy of this game's own PGN; guards the visibility rule alone), `…-share-pgn-other-game` (visible, a longer game with the same opening; guards the exact-movetext rule alone), `…-share-pgn-finished` (visible and matching on a finished game with no other evidence; opens and asks `e4 e5`). The jsdom rect mock now gives no box under a `display:none` ancestor, as a browser does.
- **Fable minor 6, huge replies block the worker** (`background.js` `normalized`, `plainAnalysis`).
  - The repro: a 320 KB `"<!--"` evaluation took 2.8 s in `normalized()`.
  - Every provider string is cut to 20,000 characters before any regex work (including the invisible-character pass). An evaluation sentence over 2,000 characters and a critical line over 4,000 (string, array or `legal_steps`) are dropped, not cut, so a cut can't change a move. Both strip regexes are linear: an opener's attributes stop at the next `<`, and an unclosed comment runs to the end of the text, as in a browser.
  - Guarded by: `A 2 MB evaluation or critical line normalizes in under 200 ms and is dropped, not shown (Fable round 5)` (2 MB `<!--` and `<svg` runs in the evaluation, the critical line as a string and an array, the analysis, hugging-apps' EVALUATION line and `legal_steps`; each under 200 ms, measured at 27 ms or less; under the caps a 1,900-character sentence and a 60-move line are kept). With the fix reverted the test does not finish in 20 s.
- **Fable minor 7, stale cached gate after late hydration** (`content/common.js`, `evidence` in both adapters).
  - The repro: a result row appended to the move list of `chesscom-daily` left `AQ.gate()` at `in_progress` with no input, while `readPosition()` already said open.
  - A document `MutationObserver` (child lists and text, no attributes) marks the cache for a recompute when a change lands inside an adapter's evidence areas, or adds or removes one: chess.com's move lists and game-over elements; lichess's `.result-wrap`, `.analyse__moves` and `div.pgn`. It only matches selectors, so it is layout-free; clock ticks and chat elsewhere leave the cache alone.
  - Guarded by: `A result rendered after the board marks the cached gate for a recompute; other page churn does not (Fable round 5)` (chess.com and lichess round; churn elsewhere keeps one `querySelector` per tick; the result opens the gate and its removal closes it again), `Browser result row rendered 500 ms after load shows the launcher with no input (Fable round 5)` (launcher hidden before the row, shown within 2 s after it, zero input events, zero POSTs), and the existing `Browser closed launcher ticks make no layout reads, also across a URL change` and `Browser closed-panel idle cost stays under 1 ms per second`. `AQ.gate() caches: …` now shows an attribute-only change (not observed) waiting for a click.
- **Fable minor 5, launcher re-shown under the opening panel** (`content/panel.js` `openPanel`, `showLauncher`; three lines).
  - The repro: with `getPrefs` delayed 1.1 s, the launcher was visible again 850 ms into the open.
  - `openPanel()` sets an `opening` flag before it awaits `loadPrefs()` (cleared in `finally`), and `showLauncher()` keeps the launcher hidden while it is set.
  - Guarded by: `A slow getPrefs (1.1 s, a waking worker) never re-shows the launcher while the panel opens (Fable round 5)` (samples every 50 ms for 1.6 s from the click).
- **Fable minor 11, `.clock-player-turn` after a game ends: no code change.** The suggested rule (a running clock doesn't gate when a result token is in the move list) is exactly the case `chesscom-live-clock-and-result` (GPT round 3) was built to refuse: a Game Review link with a result row in the move list while the clock still runs. With the rule applied that fixture opens. A result row can't be tied to the game being played (a resignation or a flag leaves no trace on the board), so it could be a leftover from the previous game, the same class of stale evidence as Fable major 1, while the turn class is the only live signal. The cost of keeping it is a just-finished live page that stays closed if chess.com leaves the class on, with Game Review still working. The owner capture asked for in the review (a just-finished /game/live page's clock markup) is still the way to decide this.
- **Fable minor 9, regression tests for the narrowed lichess result evidence** (`content/lichess.js`, no code change).
  - Guarded by: `Adapter/Panel/Browser fixture lichess-round-stray-result` (a `.result` in the chat on a round page; fails if the selector is widened to `.result`), `…-game-analysis-stray-result` (a `.result` outside `.analyse__moves` on a game analysis page; same), `…-game-analysis-textarea-result` (a `[Result "1-0"]` in a PGN textarea; fails if `[Result]` is read from any PGN text instead of `div.pgn`). All gated with zero POSTs.
