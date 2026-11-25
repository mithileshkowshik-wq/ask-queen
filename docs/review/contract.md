# Implementation contract (fix pass 1)

This is the shared interface between the **logic work** (GPT-6.2-sol) and the **UI work** (Fable 5.2). Neither side changes it without the coordinator. Spec references (§) point to `docs/review/spec.md` v4.

## File ownership

### Logic: GPT-6.2-sol
- `manifest.json`
- `background.js`
- `content/chess.js` (new)
- `content/format.js` (answer card, new)
- `content/common.js`
- `content/lichess.js`
- `content/chesscom.js`
- `scripts/package.sh`
- everything under `test/`

### UI: Fable 5.2
- `content/panel.js`
- `options.html`
- `options.js`
- `README.md`
- `PRIVACY.md`
- `CHANGELOG.md`
- `LICENSE`
- `store/**`
- `docs/live-checklist.md`
- icons:
  - `icons/32.png` is new
  - `icons/16.png`, `icons/48.png` and `icons/128.png` may be regenerated

## Load order
- **Key guard (fix pass 2):** `content/keyguard.js` is its own `content_scripts` entry with `run_at: "document_start"`, so its window capture listener runs before any site listener. For `keydown`/`keyup`/`keypress` whose `composedPath()` includes the `aq-host` element it calls `stopImmediatePropagation()` (no `preventDefault`, so Tab, Enter and Space keep their default actions), and on Escape inside the open panel it clicks `[data-testid="aq-close"]`. The panel's own key listeners therefore no longer see panel keys; Escape-to-close goes through the Close button's handler.
- **Content scripts:** `content/chess.js`, then `content/common.js`, `content/lichess.js`, `content/chesscom.js`, `content/format.js`, and `content/panel.js` last.
- **Background:** `background.js` loads `content/chess.js` and `content/format.js` with `importScripts("content/chess.js", "content/format.js")`, so neither may touch the DOM, and `format.js` uses no `chrome.*` API either.

## `content/chess.js`: pure chess helpers on `globalThis.AQChess`
These helpers have no DOM access.

**Parsing and formatting**
- `START_FEN`
- `parseFen(fen)` returns `{ placement: {e1:"K",…}, side, castle, ep, half, full }`, or `null`.
- `placementToString(map)` returns the board field of a FEN.
- `isStrictSan(s)` is the §3.2 pattern, applied after `stripSan`.
- `stripSan(s)` removes `+`, `#`, `!`, `?` and annotation glyphs, and keeps `=Q`. It never deletes other characters.
- `sameMove(a, b)` follows §5.3.

**Board checks**
- `isPlausibleBoard(map)` returns `{ ok, reason }`, using the §3.4 rules.
- `preSendCheck({ rootFen, moves, board, highlightSide })` returns `{ ok, reason }` (§3.3, checks 1–4).

**Response verification**
- `verifyBest(returnedFen, snapshot)` and `verifyExplain(returnedFen, snapshotPlacement, san)` return a boolean (§3.3 post-response).
- `sanMatchesUci(san, uci, fen)` returns a boolean (§4.5, including disambiguation).

**Labels**
- `moveLabel(san, rootFen, plyIndex)` returns, for example, `"14...Nf6"`.

## `AQ.readPosition()` (content scripts)
Returns `null` when there is no board at all. Otherwise it returns:
```
{
  site: "lichess" | "chess.com",
  page: "analysis" | "study" | "review" | "game" | "unknown",
  gate: null | "in_progress" | "variant" | "puzzle" | "unknown_context",  // non-null => launcher hidden (§2)
  root: { fen, verified, source: "standard" | "pgn" | "fen-input" } | null,
  moves: [SAN, …] | null,   // strict SAN from root up to and including the selected move; null if unusable
  board: { placement, side, sideSource: "fen" | "moves" | "lastmove" | null, castle, ep, fen6: string | null,
           castleGuessed: bool, valid: bool, reason: string | null } | null,
  crossCheck: { ok: bool, reason: string | null },   // when both moves and board exist
  snapshotKey: string   // stable string identifying the visible position, for stale detection
}
```
**Rules**
- A board with a moving, dragged or fading piece has `valid: false` and `reason: "The board is moving"`. The panel re-reads on the next mutation; a partial scan is never sent (fix pass 2).
- If `crossCheck.ok` is false, `moves` must be `null` and `root` must not claim to be verified. The panel shows the "disagree" banner (§3.3).
- `fen6` is set only when the page exposes an exact FEN tied to the board. All six fields are kept.
- **Full replay (fix pass 3).** `AQChess.replay(rootFen, sans)` returns the six-field FEN after a legal SAN line, or `null`. A verified `moves` list must replay onto the scanned placement exactly, and when `fen6` is set, onto its side, castling and en passant. Otherwise `crossCheck` fails (the "disagree" state) and only the board is used. The background replays every ask as well: the line, plus `played` for Explain, must land on `snapshot.placement`/`side`, or the ask is rejected with `illegal_position` and nothing is sent. The returned `fen` must equal the replayed position (the position after `moves`) in placement, side, castling and en passant. With an empty `moves` (a first-move Explain, or the board fallback) that is `req.fen` itself (fix pass 4).
- **En passant in the board fallback (fix pass 4).** `board.ep` is set from a visible double push only when the side to move can legally capture (`AQChess.enPassant(map, side, square)`), the same rule as the replay and python-chess.
- **lichess FEN-input lag (fix pass 4).** When a read's only problem is "The site FEN disagrees with the board", the adapter sets `data-aq-recheck` on the panel's own host element once, 300 ms later. The open panel's MutationObserver sees that change and reads again. The same disagreement is not retried.

## `AQ.gate()` and `AQ.confirm()` (content scripts, fix passes 2 and 3)
`AQ.gate()` returns `{ hasBoard: bool, gate: null | "in_progress" | "variant" | "puzzle" | "unknown_context" }` from the URL and cheap selector checks only: no `getBoundingClientRect`, `getComputedStyle` or other layout reads (visibility is judged only by `[hidden]`/`aria-hidden`). `gate` is `null` when `hasBoard` is false. The closed panel uses it to show or hide the launcher; `readPosition()` (with layout reads) stays the authority when the panel opens and at click time. A unit test checks that it agrees with `readPosition().gate` on every fixture with layout reads made to throw.
- **Cost (fix pass 3).** The result is cached. It is recomputed only when `location.href` changes, the first board element (`document.querySelector` of the site's board selector) changes, or after a `pointerdown`/`keydown` anywhere (passive capture listeners that only set a flag). A quiet tick costs one `querySelector`. A change with no such trigger keeps the old answer until the next trigger; on a game page that means staying closed. The measured idle cost is in `docs/perf.md`.
- **Late evidence (post-round 5).** Each adapter names its `evidence` areas (chess.com: the move lists and game-over elements; lichess: `.result-wrap`, `.analyse__moves`, `div.pgn`). One document `MutationObserver` (`childList`, `characterData`, subtree; no attributes) also marks the cache for a recompute when a change lands inside such an area, or adds or removes one. It only matches selectors, so it stays layout-free, and clock ticks and chat elsewhere leave the cache alone. A result row rendered after the board therefore shows the launcher within the normal tick, with no input.
- **chess.com share PGN (post-round 5).** A PGN's `[Result]` counts as finished-game evidence only when its element passes the same visibility as the other evidence (`AQ.shown` in `gate()`, `checkVisibility()` in `confirm()`, `AQ.visible` in `readPosition()`) and its movetext, without tags, comments, variations, NAGs, numbers and the result, is exactly the visible main line of the move list (same length, same SAN after `stripSan`). Its other tags (`[Variant]`, `[FEN]`, `[SetUp]`) are used as before.
- `AQ.confirm()` (fix pass 4) is evidence-only. It runs the same gate evaluation with style visibility (`el.checkVisibility()`, which reads computed style rather than layout) on the few evidence elements: results, clocks, variant badges and game-over elements. It returns `true` only when that gate is `null`. It does not scan the board and never calls `getBoundingClientRect`/`getClientRects`. The panel calls it before it shows the launcher when `AQ.gate()` turns open, so a finished-game marker hidden by CSS keeps the launcher closed. `readPosition()` runs only when the panel opens and at click time.
- **Held boards (post-round 5).** chess.com's adapter remembers, in a `WeakSet`, every board element it has seen while any gate was set. The standalone /analysis path (no game id) gates such a board as `in_progress`. Only a new board element opens there. Game-page evidence does not consult the set, so a game that finishes in place still opens.

## Messages
**Long-lived request:** the panel opens `chrome.runtime.connect({ name: "queen" })` and posts:
```
{ type: "ask", mode: "explain" | "best", fen, moves: "e4 e5 …", played: SAN | null,
  snapshot: { placement, side, castle?, ep? }, fresh: bool, prefer?: "other" }
```
- `snapshot.castle` and `snapshot.ep` (fix pass 2) are sent together, and only when `board.fen6` is set; they are fen6's third and fourth fields. The background then also requires, for Best, returned castling and en passant equal to them, and for Explain, returned castling that includes every right in `snapshot.castle` (rights only shrink). Otherwise `positionCheck` is `"mismatch"`.
- `prefer: "other"` is only valid with `fresh: true` ("Try the other server").
- `moves` and `played` may carry `+`, `#` and annotation glyphs as the page shows them; the background strips them before validation, caching and the Space call.
`fen` is the root FEN (six fields). For Explain, `moves` are the moves *before* the played move. The background validates the request per §1: `sender.id`, the FEN regex, strict SAN, and the length caps.

**Background → panel**, on the same port:
- `{ status: "connecting" | "waiting" | "still_waiting" | "backup" | "keepalive" | "tidying", server: "boneyland" | "hugging-apps" | "custom" }` (`tidying`: Queen has answered and the worker is writing the answer card, at most 6 s; see "Answer card")
- `{ result: R }`
- `{ error: { code, detail, server?, retryAfter?, reason? } }` (fix pass 4: `server` is the server that failed last, and it becomes the tab's last server, so a following `prefer: "other"` asks the other one. `retryAfter` is capped at **600 s** in the background, the single shared cap; the panel shows the number as given) (fix pass 3: a server that sent `Retry-After` rests for that long in the background for every ask and tab. While it rests, a `busy`/`quota` primary answers at once with the remaining `retryAfter` and makes no request; a resting `asleep` primary goes straight to the backup) (`detail` is a plain string; `retryAfter` is seconds from a `Retry-After` header on a 429/503; `reason: "other_tab"` with `code: "busy"` means another tab's ask holds the one-in-flight slot, with `detail` "Another tab is already asking Queen."), where `code` is one of the §4.4 codes: `quota`, `token_rejected`, `unreachable`, `asleep`, `timeout`, `busy`, `illegal_position`, `game_over`, `bad_response`, `cancelled`, `extension_reloaded`, `all_unavailable`.

Disconnecting the port means cancel. The background aborts within 1 s.

Every string in `R` and in errors has the saved token, and any `hf_` token-shaped text, replaced with `[token removed]` as the last step before posting (also when `*`, `_`, `` ` `` or `~` are wedged between its characters).

**Final token guard (post-round 5).** After that, `evaluationText`, `criticalLine` and `analysis` are reduced to letters and digits (case-sensitive). Each is checked as written, without `<PIECE_…>`/`<SQUARE_…>` tags and line-leading list numbers, and without move numbers. They are also checked joined in that display order. A field that holds any 8 characters in a row of the token body becomes `[redacted]`, and a split across fields clears them all. In return, the panel's renderer never adds or recases a letter (label headings keep the label's own letters). It only drops markup, those tags, list numbers and, in a bare critical line, move numbers.

**Normalized result `R`:**
```
{ server, seconds, cached: bool, fen, analysis: string /* model prose, plain text, raw tokens removed, player/opponent→White/Black */,
  best: { san, uci, source: "structured" | "prose_verified" } | null,
  suggestion: { san, source: "prose_unverified" } | null,
  evaluation: number | null /* a bare number gets no evaluationText (fix pass 4) */, evaluationText: string | null /* the model's EVALUATION sentence (boneyland's field, or hugging-apps' EVALUATION prose line), player/opponent mapped; it always names White or Black ("Equal for White and Black: …" for an equal sentence), else null; else built from a number */,
  criticalLine: string | null /* numbered SAN */, truncated: bool, moveSource: string,
  positionCheck: "ok" | "mismatch" }
```
`positionCheck` is computed in the background with `verifyBest`/`verifyExplain` against the request's `snapshot`.

**Answer card additions to `R`** (docs/output-format.md):
```
played:    SAN | null       // req.played for Explain (check marks stripped), null for Best
promising: [SAN]            // Queen's PROMISING_MOVES line: strict SAN (the backup server's long-hand converted at R.fen),
                            // legal in R.fen (AQChess.replay), not R.best, each once, at most 3
estimate:  { ahead: "w" | "b" | null, words: string, number: string | null } | null
           // from evaluationText by rule: "White is slightly better" / "+0.21" (U+2212 minus when Black is ahead,
           // Queen's digits); "About equal" with number null; null for any other wording (show the sentence)
card?:     Card | null      // present only when the worker wrote it; otherwise the panel gets it from AQ.tidy(R)
```
`played`, `promising` and `estimate` are always present and pass `scrub` and `guard` with the rest of `R`.

**Caps (post-round 5).** Before any regex work every provider string is cut to 20,000 characters. An evaluation sentence over 2,000 characters gives no `evaluationText`, and a critical line over 4,000 characters gives no `criticalLine` (dropped, not cut). The markup-stripping regexes are linear (an unclosed comment runs to the end of the text).

**Keyboard shortcut (fix pass 3).** The manifest declares `commands: { "open-panel": { suggested_key: { default: "Alt+Q" } } }`. On that command the background sends `chrome.tabs.sendMessage(tab.id, { type: "openPanel" })` to the active tab, which needs no `tabs` permission. The panel opens on it only when `sender.id` is this extension.

**One-shot** messages through `chrome.runtime.sendMessage`:
- `{ type: "openOptions" }`
- `{ type: "getPrefs" }` returns `{ firstUseSeen, dock: "right" | "left", shortcut }`. `shortcut` (fix pass 4) is the key actually bound to the `open-panel` command, from `chrome.commands.getAll()`, for example `"Alt+Q"`, or `""` when unbound.
- `{ type: "setPrefs", prefs }`

The token is never sent to content scripts.

- `{ type: "guard", result: { evaluationText, criticalLine, analysis, card } }` (answer card) returns the same four keys after `scrub` and the final token guard with the saved token, or `null` for any other shape (other keys, a string over its cap, a malformed card). Only `AQ.tidy` sends it.

## Answer card (`content/format.js`, `AQ.tidy`)

**Where Gemini Nano runs.** `background.js` checks `typeof LanguageModel !== "undefined"` after `normalized()`. When the worker has it, the worker posts `{ status: "tidying" }`, writes the card with `AQFormat.tidy` (6 s), guards it with the token and sends `R` with `card` set (and caches it with `R`). When the worker has no `LanguageModel`, `R` goes without a `card` key and the content script writes it with its own window's `LanguageModel` (the web Prompt API, behind the site's permissions policy). Chrome's Prompt API page says the API isn't in Web Workers and is available to top-level windows and their same-origin iframes; Google's extension guidance says it works in the extension service worker; Playwright's Chromium 158 exposes `LanguageModel` in this extension's service worker (`availability()` answers `"unavailable"` there, as it has no model). The browser suite records each context in `docs/review/evidence/round-*/nano-contexts.json`.

**`AQ.tidy(result) -> Promise<result>`** (content scripts, `content/common.js`)
- Resolves within 6 s and never rejects. A `result` that already has a `card` key (the worker wrote it, or `null`) comes back at once, unchanged.
- Otherwise it returns `{ ...result, card }`: Gemini Nano's card when this window's `LanguageModel.availability()` is `"available"` and the reply passes validation, the rules' card when the model is missing, not downloaded, slow (5.75 s) or failing, and `card: null` when there is nothing to build (no verified `best`, `positionCheck` not `"ok"`, or no paragraph whose first sentence says "best move is"/"best move:" and names `best`), or when the worker's guard can't be reached. Every card, the rules' included, passes the `guard` message first.
- `create()` is called only after `availability()` returned `"available"`. Downloading the model is the options page's job (it needs a user gesture).

**`Card`**
```
{ source: "nano" | "rules" | "mixed",       // who wrote the strings shown: all Nano, none Nano, or both
  why: [string],                            // 1 to 3 (a card with none is null)
  idea: string,                             // "" when none
  played: { san, tag, reason } | null,      // Explain only: Queen's own paragraph on the played move, when it has one;
                                            // that move is then not in `others`
  others: [{ san, tag, reason }] }          // up to 3, Queen's PROMISING_MOVES order, each with a paragraph of its own
// san: bare SAN (the panel adds ctx.lab()); tag: "Also good" | "Slightly worse" | "Worse" | "Much worse" | "Weakest" | null,
// always by rule; reason: "" when none. Moves, tags and the estimate are never Nano's.
```
Strings are plain text for `text()`: no markup, no line breaks. On a board-only read the panel drops move numbers from them, as it does for the critical line (only removing characters). The final token guard treats every card string as a displayed field: one that leaks is dropped (a reason becomes `""`), a split across fields clears all of them, and a card left without a `why` bullet becomes `null`.

**Validation** of Nano's reply (docs/output-format.md §3): a wrong shape (not JSON, other keys, `why` not 1–3 strings, `others` entries not `{move, reason}`) means the rules write the whole card. Each string is then checked against its own source (why and idea: the best paragraph, the position and the evaluation; a reason: that move's paragraph): length (why 12–90, idea 110, reason 100), moves (and their numbers), squares (named or a source move's target), other numbers, claim words, markup, and token-like text (`hf_`, 20+ letters and digits in a row). A failing string is replaced by the rules' string for that field; when every bullet fails, the rules' bullets are used.

## Storage
- `chrome.storage.local` holds `token`, `tokenFor` (a list of origins approved for the token), `primary`, `custom: { origin, api: "boneyland" | "hugging-apps" }`, `firstUseSeen` and `dock`.
- The background sets `TRUSTED_CONTEXTS` on install and on every startup.
