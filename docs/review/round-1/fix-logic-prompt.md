# Fix pass 1: logic workstream (GPT-6.2-sol)

You are implementing the **logic** half of fix pass 1 for the Ask Queen Chrome extension, in the current directory (a git repo). A Fable 5.2 agent is working on the UI files **in parallel**. Edit only the files you own, which are listed in `docs/review/contract.md`.

## Read first
- `docs/review/spec.md` (frozen v4): the target.
- `docs/review/rubric.md` (frozen v4): how the work is scored.
- `docs/review/contract.md`: interfaces you **must** implement exactly. The UI side codes against it.
- Round-1 reviews, for the issues to fix:
  - `docs/review/round-1/gpt.json`
  - `docs/review/round-1/fable.md`
- The current code.

## Your files
- `manifest.json`
- `background.js`
- `content/chess.js` (new)
- `content/common.js`
- `content/lichess.js`
- `content/chesscom.js`
- `scripts/package.sh`
- `test/**`

## Deliver
1. **`content/chess.js`.** The pure helpers from the contract: `parseFen`, `isStrictSan`/`stripSan` (strict, never turning one move into another), `sameMove` (castling forms, check marks, glyphs, `e8Q` = `e8=Q`), `isPlausibleBoard`, `preSendCheck` (§3.3 checks 1–4, root-relative piece count), `verifyBest`, `verifyExplain` (§3.3 single-move application, including castling, en passant, promotion and capture), `sanMatchesUci` (with disambiguation; `Nbd2` vs `f3d2` must fail), `moveLabel`. No DOM; it must load with `importScripts`.
2. **Adapters** (`common.js`, `lichess.js`, `chesscom.js`). Return the exact `readPosition()` shape from the contract.
   - **Fail-closed `gate`** (§2). The launcher must still work on the flows the owner uses: chess.com **Game Review** and **Analysis**, and lichess **analysis**, **study** and **finished games**. Hide it for games in progress, puzzles and variants, and when the context is unknown. Base every decision on positive evidence:
     - chess.com: `/analysis…` and `…/review` routes, or a visible game-over or result state on a finished game page
     - lichess: an analysis or study tree; for a round view, a game result with no running clock
     - puzzles: chess.com `/puzzles`, lichess `/training` and `/streak`
     - variants: lichess game meta or PGN `[Variant`; chess.com variant routes or badge
   - **Root verification and custom-start detection.** The custom-start signs are a lichess `[FEN]` tag and the lichess `.copyables` FEN. Use `fen6` when the page exposes a full FEN.
   - **Strict SAN:** chess.com figurines must decode to the letters `NBRQK`.
   - **Board scan hygiene:**
     - main board only (the largest or primary board, never mini-boards)
     - skip `anim`, `dragging`, `ghost` and `fading` pieces
     - reject impossible boards
     - count only the site's last-move highlight classes
       - lichess: `square.last-move`
       - chess.com: `.highlight`, which can include user-marked squares, so filter them (for example by the highlight colour or by data attributes), or treat the side as unknown when there are more than 2 highlights
   - **`snapshotKey`.**
3. **`background.js`:**
   - call `setAccessLevel(TRUSTED_CONTEXTS)` at top level and in `onInstalled`
   - validate the sender and the payload
   - §4.1 timeouts (20 s connect, 45 s idle reset by any bytes, 150 s overall), a port keepalive every 20 s, and `still_waiting` at 60 s
   - §4.3 fallback policy and §4.4 typed codes, including precedence after a fallback
   - schema validation, with HTML and SVG dropped
   - the §4.5 source precedence, using `sanMatchesUci`
   - `positionCheck` through `verifyBest`/`verifyExplain`
   - the normalized result `R`, including player/opponent → White/Black, the evaluation text for a named side, and a numbered critical line
   - single in-flight request with coalescing
   - a cache of 32 entries for 15 min
   - a random seed when `fresh`
   - a 2 s spacing between user asks
   - custom server support (exact-origin optional permission, and `tokenFor` consent before sending the token)
   - the `getPrefs`, `setPrefs` and `openOptions` messages
   - an exported SSE parser that unit tests can load
4. **`manifest.json`:**
   - the two exact host permissions, with `https://*.hf.space/*` as an optional permission
   - `minimum_chrome_version`
   - version `1.0.0`
   - icons at 16, 32, 48 and 128 (`icons/32.png` is created by the UI agent; reference it)
   - `homepage_url`: use `https://github.com/ask-queen/ask-queen` as a placeholder; it is listed in `OWNER-TODO`
   - content script order: `chess.js` first
   - no unused permissions
5. **`scripts/package.sh`.** An allowlist zip, `dist/ask-queen-<version>.zip`, that includes `content/chess.js`.
6. **Tests (`test/`):**
   - Extend `run.js` and `fixtures.js`, and add unit suites as needed.
   - Required coverage:
     - the §3.7 matrix with at least 12 fixtures per site; each fixture has an identity marker asserted first, then is asserted according to its type (full six-field root FEN plus SAN, or UI plus zero requests)
     - the gating fixtures
     - the XSS corpus (unit tests against panel rendering can be E2E only, since `panel.js` is UI-owned)
     - SSE chunk splits, CRLF and a stream with no `complete`
     - every error code
     - best-move extraction, including "the best move is not obvious", "clearly Nf3" and "3...black bishop"
     - `verifyExplain` positive and negative fixtures (a2 to a3 displaced)
     - the Survival (90 s of heartbeats) and Timeout (45 s, then the backup) E2Es
     - the cancel abort observed by the mock
     - a cache hit (2 asks, 1 request)
     - a network allowlist
     - a content-script token read that fails
     - the zip contents, and that the extracted zip loads
     - an axe scan through `@axe-core` run inside the shadow root, proven by a planted unnamed control
     - a keyboard-only flow
     - 10 SPA navigations
     - the mutation-sanity notes
   - **The mock** must return a `fen` consistent with each request so the post-response check passes. Add one mismatch case.
   - **No hard-coded browser path:** use Playwright's `chromium` and fall back to the cached path only if needed.
   - **Screenshots:** `run.js` must save a screenshot for **every §5.1 state** at 1280×800, plus the 1440×900 overlap checks. The UI agent is building those states in `panel.js` now. Drive them through the contract's behaviour and the visible button text, and keep the selectors in one helper so they are easy to adjust.
   - **Run** `npm install` in `test/` if you add dev dependencies, then `node test/run.js dev` until it is green, except for tests that depend on UI behaviour not yet present. List those precisely in your final report.

## Constraints
- Plain JS, no build step, no runtime dependencies, no `eval`. Keep it simple and concise; the shipped JS should total about 1,500 lines or less.
- Do not edit UI-owned files. If the contract seems wrong, implement it anyway and note the problem in your report.
- Do not commit; the coordinator commits.

## Final report
List:
- the files changed
- what each requirement maps to
- any contract issues
- the last `node test/run.js dev` summary, with every failing test explained
