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
- **H7, provider-specific legality** (`background.js` `normalized`). A prose move is confirmed only by `critical_line_uci[0]` on boneyland, or by `critical_line.legal_steps[0].uci` on hugging-apps when it is a real object. The recording has a repr string there, so hugging-apps prose stays unverified.
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
