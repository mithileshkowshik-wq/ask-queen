# Ask Queen: target spec (what a 9/10 looks like), v3

This spec is merged from the Opus 5.5, Fable 5.2 and GPT-6.2-astra drafts. The rubric cites its sections as §N. The fixed constraints are listed in `rubric.md`.

## 1. Architecture and permissions
- MV3, plain JS, no build step, no runtime dependencies, no remote code, no `eval` or `new Function`.
- `permissions: ["storage"]`.
- `host_permissions`: exactly `https://boneyland-queen-pawn-8.hf.space/*` and `https://hugging-apps-queen-pawn-8.hf.space/*`.
- `optional_host_permissions: ["https://*.hf.space/*"]` is declared. When the user saves a custom server, the extension requests only that **exact origin** at runtime through `chrome.permissions.request({origins: [origin + "/*"]})`.
- No `tabs`, `scripting`, `webRequest`, `externally_connectable` or `web_accessible_resources`.
- Content scripts run on `https://www.chess.com/*` and `https://lichess.org/*` only, in the top frame. Host-wide matching is justified because board pages on these sites have no common path prefix, and chess.com navigates as an SPA.
- `minimum_chrome_version` equals the version the E2E runs on.
- **The background service worker is the only code that touches the network.**
  - Only the background and the options page access the token.
  - **`chrome.storage.local` is exposed to content scripts by default** (Chrome docs), so the build must do one of these:
    - The background calls `chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})` on install and on every service-worker startup, before any token is stored or read.
    - The token is kept in a store that content scripts can't reach.
  - A test asserts that a read of the token key from a content script fails.
  - Any panel preferences then go through the background.
  - One port per request. Messages are `{status}`, `{result}` or `{error: {code, detail}}`.
  - The background checks `sender.id` and validates the payload:
    - FEN by regex, at most 100 characters
    - moves as strict SAN tokens, at most 600 plies
  - It rejects anything else.

## 2. Scope and fair play (fail closed)
- **Single purpose:** explain a position from a finished or analysed game of standard chess on chess.com or lichess with the QUEEN model.
- **Where the launcher appears.** It appears only where the adapter has positive evidence of one of these: a finished game, Game Review, an analysis board or a study. If a board is present but that can't be established, show nothing.
- **Games in progress get no UI.** That covers live, daily and correspondence games, as a player or a spectator. It includes lichess analysis of an ongoing correspondence game. Puzzles, solved or unsolved, are out of scope and get no launcher. If a puzzle is reached with the panel open, the panel shows "Queen isn't available on puzzles".
- **Standard chess only.** Chess960 and every other variant are out of scope.
- **Entry rules** for out-of-scope pages:
  - **Arriving directly** on an in-progress game, a variant or a puzzle: the launcher is hidden and no requests are made.
  - **Navigating to one with the panel open:** the in-flight request is aborted, any displayed answer is removed, and the panel shows "Available after the game ends" or "Queen only knows standard chess", with Close as the only action.
  - Each entry rule needs a screenshot and a zero-request assertion.
- **Main board only.** Never mini-boards, TV previews or hover previews.
- **Fixture tests** cover each gating case on both sites. README and listing state the rule and its limit (the extension can't stop someone copying a position elsewhere).

## 3. Position reading
### 3.1 Sources, in priority order
1. A move list from a verified start → `fen = root, moves = SAN…`.
2. An exact FEN exposed by the page and tied to the selected board, such as the lichess `.copyables` input. Keep all six fields.
3. A board scan plus an unambiguous last-move pair. The side is shown as "detected" with a one-click switch.
4. A board scan plus "White to play / Black to play". Neither is preselected, and Ask stays disabled until one is chosen.

### 3.2 Move-list rules
- After stripping check, mate and annotation marks, every token must match `^(O-O(-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](x[a-h])?[1-8](=[QRBN])?)$`, case-sensitive. Any failure discards the whole list. Never send a list that has been partially fixed or "cleaned".
  - Localized letters ("Sf3"), figurines that weren't decoded, and move numbers must fail rather than turn into a different move.
- **Never replay from the standard start unless the start is verified.** A standard root counts as verified when two things hold: the page shows none of the custom-start signs below, and the §3.3 pre-send cross-check passes against the standard start. Signs of a custom start are:
  - a `[FEN]` or `[SetUp]` tag
  - a first move number other than 1
  - Black moving first
  - a variant marker
  - a failed cross-check
- If a custom start has a known root FEN (for example a lichess `[FEN]` tag), send that root plus the moves. Explain is allowed, and move labels use the root's move number and side. Otherwise use source 2, 3 or 4, which offer Best move only.
- **Variations.**
  - On lichess, read the selected line by `move[p]` ancestor paths, including nested lines.
  - On chess.com, read the selected line if the DOM exposes its ancestry. Otherwise fall back.
  - Never send mainline moves while the board shows a variation.
- **Explain** is defined by the position *before* the selected move, so it is offered only when that position and the played move are both known. Explain on a mating move is valid.
- **Best move** at a board where the last SAN ends in `#` shows "The game is over here" and makes no request. Stalemate can't be seen from SAN, so it arrives as the server's `game_over` code.

### 3.3 Cross-checks (the main defence against a wrong position)
**Pre-send.** Whenever both a move list and a board scan exist, all of these must hold:
1. The side to move, computed from the root's side and the ply parity, agrees with the side derived from the highlight, when the highlight can be read.
2. The number of pieces on the board equals the root's piece count (32 for the standard start) minus the captures in the list.
3. The piece type and colour of the last SAN sit on its destination square. For castling, the king and rook are on their castled squares; for a promotion, the promoted piece is.
4. **At zero plies:** the scanned placement must equal the root's placement exactly, and the known side, if any, must match. An untagged custom position therefore never passes as the standard start.

On a mismatch, discard the list, use the board, and say "The move list and the board disagree, so Queen will work from the pieces." (The 10-level version uses a full SAN replay that reproduces the scanned placement instead.)

**Post-response.** Check the returned `fen` against the **click-time snapshot** (§3.5), never against the live board, because the user may step through moves while waiting.
- **Best move:** the returned placement **and** side must equal the snapshot's.
- **Explain:** the returned side must be the mover of the played move, **and applying the played SAN to the returned position must reproduce the snapshot's placement exactly.** This is a single-move check, not full move generation.
  - **Squares that may differ:**
    - a normal move: exactly the from-square and the to-square
    - en passant: from, to and the captured pawn's square
    - castling: the king and rook squares
  - **What each differing square must hold:**
    - The from-square holds the moving piece (a pawn for a promotion) in the returned position and is empty in the snapshot.
    - The to-square holds the moved piece (the promoted piece for a promotion) in the snapshot.
    - Every other square is identical.
  - The SAN's piece letter, its disambiguation and its destination must match the squares found.
  - Fixtures: one positive (the correct pre-move reply) and one negative (the same reply with an unrelated piece moved, for example a2 to a3, which must be rejected).

On a mismatch, replace the result with "Queen analysed a different position" and offer the board fallback.

### 3.4 Board scan
- Skip pieces that are dragging, ghost, fading or animating. Alternatively, require two identical scans at least 100 ms apart.
- Handle flipped boards.
- Reject impossible boards with a "can't read this board" state. An impossible board has:
  - not exactly one king per side
  - pawns on rank 1 or 8
  - more than 16 pieces for one side
- Count only the site's last-move highlight classes, never user-marked squares or premoves. Use the pair only if it is unambiguous.
- Castling rights come from an exact FEN when there is one. Otherwise they are inferred and disclosed as a guess. En passant is set only from a visible double pawn push. Clocks are `0 1` unless there is an exact FEN.

### 3.5 Following the board
- The ask view updates within 300 ms of the user stepping, driven by a `MutationObserver` that is debounced.
- On click, re-read the board. If it differs from the label, re-render and don't send.
- Bind each request and result to that snapshot. Mark a result stale when the board moves.

### 3.6 Worked example
For `1.e4 e5 2.Nf3 Nc6 3.Bc4` with 3.Bc4 selected:
- **Explain 3.Bc4** sends the standard root FEN plus `e4 e5 Nf3 Nc6`, with White to move.
- **Best move for Black** sends the moves including `Bc4`.

### 3.7 Fixture matrix (at least 12 per site, table-driven)
Each fixture is asserted according to its type:
- A fixture that **sends** asserts the full outbound request: the root FEN (all six fields) plus the ordered SAN moves.
- A **gated or unreadable** fixture asserts the expected UI and zero requests.

Every routed fixture has a distinct identity, which is asserted before its payload is checked.
The matrix covers each of these:
- mainline mid-game
- the start position
- the final move
- a selected variation (nested on lichess)
- a flipped board
- castling just played (on each side)
- en passant just played
- promotion just played (including underpromotion)
- a custom start FEN (lichess analysis and a study chapter from a position)
- Chess960 and a variant (gated)
- a game in progress (gated)
- an unsolved puzzle (gated)
- a finished game (round view on lichess)
- figurine and letter notation (chess.com)
- no move list with the side detected
- no move list with the side unknown
- a mini-board present
- mid-animation
- user-marked squares
- a rook returned to its home square (no castling right)
- an impossible board

## 4. QUEEN request and response
### 4.1 Timeouts and lifetime
- Connect (the POST that returns `event_id`): 20 s.
- Stream idle: 45 s. **The idle timer resets on any received bytes, including Gradio `heartbeat` events.**
- **Overall: 150 s per ask, including the fallback.**
- At 60 s, show "Still waiting. Free servers queue requests."
- A keepalive crosses the port at least every 20 s so the service worker stays alive. Two E2E tests prove this:
  - **Survival:** a mocked stream that sends only heartbeats for 90 s and then completes. The original attempt must deliver its answer, with no fallback.
  - **Timeout:** the primary stream sends no bytes. At 45 s the client aborts it (the mock observes the abort) and tries the backup once, as §4.3 requires. With the backup also silent, the ask ends in `timeout` at about 90 s, inside the 150 s overall deadline, with the worker still alive to report it. A second variant has the backup answer, and the ask must succeed.
- Deterministic synthetic fixtures are allowed for hangs and injected failures.

### 4.2 Cancellation
Cancel, closing the panel, a new ask, navigation and closing the tab all abort the fetch within 1 s. The mock observes the abort. Late replies are ignored.

### 4.3 Fallback
- **Try the backup once** on any of these: network error, 5xx, 404, a sleeping or building Space (HTML body or 503), a connect or idle timeout, or a stream that closes with no answer.
- **Never fall back** on quota, a rejected token, an illegal position, game over, cancel, or `bad_response`. ZeroGPU quota is per visitor, so a second Space only wastes a community GPU job.

### 4.4 Error codes (assigned in the background, never by regex in the panel)
`quota`, `token_rejected`, `unreachable`, `asleep`, `timeout`, `busy`, `illegal_position`, `game_over`, `bad_response`, `cancelled`, `extension_reloaded`, and `all_unavailable` (both servers failed with transient errors).
- `busy` means a Gradio queue-full message, or an HTTP 429 without quota wording.
- Each code has a test fixture.
- `illegal_position` from a move list offers the board fallback.
- **Validate the response shape:** `analysis` must be a string, `best_move_san` a string or null, and `fen` a string. Anything else is `bad_response` ("The server's format changed. Check for an update."). Discard any HTML or SVG supplied by the server.

### 4.5 Best-move integrity
Moves are trusted in this order (**source precedence**). Only verified moves (the first two levels) may become the headline or drive the agree/disagree verdict.
1. **Structured (verified):** the Space's `best_move_san` when `move_source` is `best_move` or `critical_line`. The Space checks these for legality.
2. **Prose confirmed by the server (verified):** a SAN taken from the prose that passes the §3.2 pattern (case-sensitive, never `/i`) **and** matches the first legality-checked move the Space returned (`critical_line_uci[0]` on boneyland, `critical_line.legal_steps[0].uci` on hugging-apps). It is labelled "taken from Queen's text".
   - **How to match SAN against UCI:** take the piece on the UCI from-square in the returned `fen`. Its type must equal the SAN piece (a pawn if there is no letter). The UCI to-square must equal the SAN destination, and the promotion letters must agree. For castling, compare against `e1g1`, `e1c1`, `e8g8` or `e8c8`.
3. **Unverified prose:** passes the pattern but has no server confirmation, so it may be illegal (for example `Qh5` at the start). The card headline reads "Queen didn't name a clear move", the move appears only as "Queen's text suggests X (unverified)", and there is no verdict.
4. **`promising_or_analysis` or `random_legal_fallback` guesses from the server:** never shown as Queen's move. If one conflicts with the prose, the prose wins under rule 2 or 3.

**Expected card for the recorded truncated reply** (`test/fixtures/boneyland-truncated.sse`): the headline is "Queen didn't name a clear move". "The answer was cut off" sits directly under the headline, with "Try the other server". Then "Queen's text suggests 3...Be7 (unverified)". There is no verdict, no evaluation row (it is null), and no critical-line row (it is empty). The analysis text follows.

- **Truncation:** a truncated answer (`finish_reason: "length"`) is flagged at the top, with a "Try the other server" action.
- Never render `raw_text` or `<PIECE_…>` / `<SQUARE_…>` tokens.

### 4.6 Caching and courtesy toward the Spaces
- A bounded session cache: about 32 entries for 15 minutes, in background memory or `storage.session`. It is keyed by root FEN, moves, server and settings. A cache hit is marked as cached.
- "Ask again" bypasses the cache and uses a new seed.
- One request in flight per browser profile. Duplicate clicks are coalesced. At least 2 s between the starts of user asks; the one automatic backup attempt is exempt.
- Every Space call follows an explicit click. No prefetching, background calls or health polling.

### 4.7 Token and custom server
- Works with no token. On the first `quota`, offer "Add a free Hugging Face token".
- **Settings:**
  - a token field where show and hide apply only to text being typed; once saved, the token is shown as `hf_…abcd` and is never revealed again
  - an `hf_` format check
  - Save and Remove buttons
  - a note that the token goes to community-run servers not operated by Hugging Face, Princeton or the author
  - a recommendation of a read-only or least-privilege token
  - Retry works without reloading the page
- **Server choice:** a primary server, plus an optional custom Space URL with its API shape.
  - Saving a custom server requests only that exact HTTPS origin, as described in §1.
  - Sending the token to the new origin needs its own explicit confirmation. Without it, requests to that server carry no token.
- The result footer names the server that answered and the elapsed time.

## 5. Panel UX and copy
### 5.1 States (one screenshot each)
**Launcher and setup**
- launcher hidden: no board, game in progress, variant, or puzzle (each arrived at directly)
- panel open when navigating to an in-progress game or a variant (§2 entry rules)
- launcher idle
- first-use notice

**Ask states**
- ask with a move selected
- ask at the start position
- ask with the fallback and the side detected
- ask with the side unknown
- move list and board disagree
- can't read this board
- game over here (Best move after a mate)

**Waiting states**
- thinking
- still waiting
- trying the backup

**Results**
- agree
- disagree
- best move
- move taken from text
- no clear move
- truncated
- cached
- stale

**Errors**
- one per error code, including `all_unavailable` ("both servers unavailable")
- extension reloaded

### 5.2 Copy rules
- **Buttons** say exactly what will be asked: "Explain 14...Nf6", "Best move for White".
- **Be honest on disagreement:** "14...Nf6 was played. Queen prefers 14...Bd7." followed by "This explains Bd7. Queen can't judge Nf6 directly."
- **Never imply the answer is correct.** "Explanations can be wrong" stays visible.
- **No jargon in headlines.** Words like Space, SSE, ZeroGPU and HTTP stay out of headlines; detail goes in a collapsed "Details". Every error has one headline, one sentence and exactly one primary action.
- **Result order:**
  1. context (the position analysed)
  2. headline
  3. caveats and truncation
  4. evaluation, for a named side
  5. critical line
  6. analysis
  7. actions: Copy FEN, Ask again
  8. footer: server and time
- **Rendering:** a Markdown subset only (headings, lists, bold, italic, code). No links or images.

### 5.3 Result fidelity
- **Labels:** move numbers and sides come from the request, not from the prose.
- **`sameMove`** normalizes `0-0`/`O-O`, `+`/`#`, glyphs and promotion.
- **The player and the opponent** in the backup server's prose are mapped to White and Black.

### 5.4 Layout
The open panel must cover neither the board nor the site's move navigation at 1280×800 and 1440×900 on both review fixtures. Failing that, it must have a one-action dock left/right toggle that is remembered.

## 6. Accessibility (WCAG 2.2 AA for the extension's UI)
- **Focus.** Everything is reachable by keyboard. Opening the panel moves focus inside it. Closing the panel moves focus to the first of these that applies:
  1. the launcher, if it is visible
  2. the page element that had focus before the panel opened, if it is still in the document
  3. `document.body`, for example after navigating to a page where the launcher is hidden
- **The panel is a labelled dialog** that is non-modal, with no focus trap.
- **Escape** closes the panel only when focus is inside it. Panel key events don't reach the site's shortcut handlers.
- **Live regions.** Thinking and the result headline use `role="status"`; errors use `role="alert"`. The elapsed timer is not announced.
- **Decorative glyphs** are `aria-hidden`. Toggles use `aria-pressed` plus a cue that isn't colour.
- **Contrast.** Text is 4.5:1 or better, and control boundaries and focus are 3:1 or better.
- **Sizing.** Targets are at least 24×24 px.
- **Motion and display.** Reduced motion removes every animation. Forced-colors mode works, and so do 200% zoom and a 320 px width.
- **The options page** meets the same bar.
- **Evidence.** An axe scan of every state, and a keyboard-only E2E of a full ask.
  - The scan must provably reach inside the panel's shadow root: it reports a known panel control, and a deliberately unnamed test control planted in the panel is flagged.
  - The shadow root may be **open or closed**; closed mode is not a security boundary. If it is closed, the test must document how it reaches the nodes, for example through `chrome.dom.openOrClosedShadowRoot` in the extension's world.

## 7. Security and privacy
- **The only HTML sink** is the escape-first renderer. It is tested with a corpus that includes `<img onerror>`, `"><svg onload>`, `javascript:`, nested `**<b>**`, entities, and the hugging-apps HTML outputs. The output may contain only `p, ul, ol, li, h4, strong, em, code`, with a numeric `li[value]` as the only attribute.
- **The token** is accessed only by the background and the options page, as set out in §1. It is never logged, never synced, and never sent anywhere except as `Authorization` over HTTPS to the configured servers. A test asserts this.
- **Each click sends** the FEN, the SAN moves and the generation parameters. The token is added only if one is set **and** the destination is a built-in server or a custom origin the user approved for the token (§4.7). Otherwise the request carries no `Authorization` header. Nothing else is sent: no usernames, game IDs, URLs, clocks or chat, and there are no analytics. An E2E network allowlist asserts this.
- **First-use notice** names the third-party servers and links to the privacy policy.
- **`PRIVACY.md`**, also hosted at a public URL, states:
  - what is sent and to whom (their operators can see the request and headers)
  - what is stored locally
  - the cache lifetime
  - no sale, ads or analytics
  - single-purpose use
  - a contact

## 8. Performance and non-interference
- **Panel closed:** at most one cheap selector check per second or so, or event-driven. No layout reads, and nothing runs in hidden tabs.
- **Panel open:** a debounced `MutationObserver`, at most 4 reads per second.
- **One host element** on `documentElement`, with no writes to the site's DOM or styles and no layout shift. Nothing calls `preventDefault` or `stopPropagation` on events that didn't originate in the panel.
- **Navigation and reload:** after 10 SPA navigations there is still exactly one launcher and the timer count is stable (tested). After an extension reload, the panel shows "Reload this page" with no console errors.

## 9. Chrome Web Store package
- **Manifest:**
  - name "Ask Queen"
  - version 1.0.0 or later
  - a description of 132 characters or fewer, with no superlatives
  - icons at 16, 32, 48 and 128 px
  - `homepage_url`
  - `minimum_chrome_version`
- **`scripts/package.sh`** builds `dist/ask-queen-<version>.zip` from an allowlist: `manifest.json`, `background.js`, `content/`, `options.*`, `icons/`, `LICENSE`, plus `_locales/` if it exists. In that case the test also checks the locale file in the extracted zip. A test asserts the zip has no `test/`, `docs/`, `store/`, `.git`, `node_modules` or `package*.json`, and that the extracted zip loads.
- **`store/`** (not packaged) holds:
  - the title, summary and description
  - the single-purpose statement
  - a justification for each permission, each host, the optional host permission, and site access
  - the data-use answers: authentication information (the token) and website content (position and moves), with the certifications
  - screenshots at 1280×800 and a 440×280 promo tile, made from fixtures with no site logos
  - reviewer instructions that need no login (lichess analysis board) and explain the quota message
  - `OWNER-TODO.md`
- **Wording:** "Unofficial. Not affiliated with or endorsed by Chess.com, Lichess, Princeton NLP or Hugging Face." No "official" or "best". The listing states the limits:
  - the free servers can be slow or unavailable
  - Queen explains its own move
  - answers can be wrong
  - standard chess only
  - off during games
- **Release files:** semver, with the version matching the zip name and `CHANGELOG.md`. A `LICENSE` file, plus attribution for the QUEEN model and its licence status.

## 10. Docs
**README covers:**
- what the extension does and doesn't do
- install (store and unpacked)
- use on each site
- fair play
- a privacy summary
- token setup
- an error → action troubleshooting table
- the custom server
- how to test and package
- known limits

**Also include:**
- `PRIVACY.md`
- `CHANGELOG.md`
- `docs/live-checklist.md`, the owner's dated checks. Live chess.com is **mandatory**, recording the selected move, the expected position and the extension version. Live lichess is optional.

## 11. Tests
- One command (`npm test` in `test/`) runs everything. Dev-only dependencies are Playwright, jsdom and axe-core.
- **Unit tests:**
  - strict SAN and `cleanSan`
  - `sameMove`
  - `boardFromPieces`
  - the cross-check invariants
  - the renderer XSS corpus
  - the SSE parser with arbitrary chunk splits, CRLF and a stream with no `complete`
  - error classification
  - best-move extraction, including "the best move is not obvious", "clearly Nf3" and "3...black bishop"
  - the gating matrix
- **DOM fixtures:** the §3.7 matrix. Each routed fixture has a distinct identity, asserted before its payload is checked.
- **Recorded Space responses.** Real recordings are required for each Space's success and for the truncated reply. Quota, illegal-position and game-over fixtures should use the real wording where it is known. Hangs, malformed and hostile responses may be synthetic.
  - a success from each Space
  - truncated
  - quota, illegal position and game over
  - 5xx and asleep (HTML)
  - a heartbeat-only stream for 90 s (survival), and a stream that sends nothing (45 s timeout)
  - malformed
  - hostile
- **E2E** (real unpacked extension, real hostnames, mocked Space):
  - Explain agree and disagree
  - Best move
  - the side picker
  - the backup path
  - every error state
  - cancel (the mock sees the abort)
  - a cache hit (two asks, one request)
  - keepalive
  - a keyboard-only run
  - axe
  - gating
  - the network allowlist
  - the zip contents
  - a screenshot of every §5.1 state
- **Mutation sanity:** flipping side parity, removing the escaping, or replaying from the standard start must each fail a test.

## 12. Public-scale risk: unofficial Spaces
**Risk.** Both backends are community ZeroGPU Spaces that the project doesn't control. They can sleep, change their API, add authentication, disappear, or be overwhelmed by public traffic. Their operators can see request contents and headers. Anonymous quota is small, and a Web Store reviewer who hits it may reject the extension as not working.

**Required in code:**
- named, recoverable states for every failure, including "both servers unavailable"
- schema validation
- a configurable custom server
- the §4.6 courtesy rules
- honest wording in the listing, README and first-use notice

**Owner decision before launch** (recorded in `store/OWNER-TODO.md`; not a code requirement). Choose one:
1. Contact both Space owners for permission and expected load.
2. Duplicate a Space under your own HF account and make it the default, keeping the others as fallback.
3. Launch unlisted or to trusted testers first.

Also confirm that the QUEEN model's licence allows this use.

## Changes in v2 (agreement round B)
Every blocking change from all three reviewers was applied:
- the scoring rule for intermediate scores
- the keepalive and timeout tests separated
- the post-response check against the click-time snapshot
- the root-relative piece count
- verified-root rules
- the scope of Explain and mate
- source precedence and verification for prose moves
- fixture-type expectations
- H1/H1b made exclusive
- entry rules for out-of-scope pages
- token display and access rules
- optional versus granted permissions
- shadow-root evidence for axe
- `_locales` allowed in the zip
- the live lichess check made optional

## Changes in v3 (agreement round C)
- **Token access:** corrected the default; `storage.local` is exposed to content scripts, so restricting it is mandatory and tested.
- **Timeout test:** now consistent with the fallback rule.
- **Zero-ply root:** compared exactly against the board.
- **Explain check:** the single-move application check, with a negative fixture.
- **Close focus:** the order for where focus goes on close.
- **Custom-origin token:** consent rule added to §7.
- **Scoring:** a deterministic formula.
- **Smaller additions:**
  - the puzzle message
  - the `busy` and `all_unavailable` codes
  - how to match SAN against UCI
  - placement of the truncation notice

## Recorded dissent (from the drafts)
- **Closing the panel.** The Fable draft wanted an in-flight answer to keep running after the panel closes, with an "answer ready" launcher state. The Opus and GPT-6.2-astra drafts wanted close to cancel. The majority won: §4.2 has close cancel the request.
- **The keyboard shortcut.** The Opus draft required a `commands` shortcut at 9. The others didn't. It is at level 10 (C4 and C5).
