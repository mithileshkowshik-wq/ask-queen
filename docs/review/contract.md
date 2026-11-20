# Implementation contract (fix pass 1)

This is the shared interface between the **logic work** (GPT-6.2-sol) and the **UI work** (Fable 5.2). Neither side changes it without the coordinator. Spec references (§) point to `docs/review/spec.md` v4.

## File ownership

### Logic: GPT-6.2-sol
- `manifest.json`
- `background.js`
- `content/chess.js` (new)
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
- **Content scripts:** `content/chess.js`, then `content/common.js`, `content/lichess.js`, `content/chesscom.js`, and `content/panel.js` last.
- **Background:** `background.js` loads `content/chess.js` with `importScripts("content/chess.js")`, so `chess.js` must not touch the DOM.

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
- **Full replay (fix pass 3).** `AQChess.replay(rootFen, sans)` returns the six-field FEN after a legal SAN line, or `null`. A verified `moves` list must replay onto the scanned placement exactly, and when `fen6` is set, onto its side, castling and en passant. Otherwise `crossCheck` fails (the "disagree" state) and only the board is used. The background replays every ask as well: the line, plus `played` for Explain, must land on `snapshot.placement`/`side`, or the ask is rejected with `illegal_position` and nothing is sent. The returned `fen` must equal the replayed position (the position after `moves`) in placement, side, castling and en passant.

## `AQ.gate()` and `AQ.confirm()` (content scripts, fix passes 2 and 3)
`AQ.gate()` returns `{ hasBoard: bool, gate: null | "in_progress" | "variant" | "puzzle" | "unknown_context" }` from the URL and cheap selector checks only: no `getBoundingClientRect`, `getComputedStyle` or other layout reads (visibility is judged only by `[hidden]`/`aria-hidden`). `gate` is `null` when `hasBoard` is false. The closed panel uses it to show or hide the launcher; `readPosition()` (with layout reads) stays the authority when the panel opens and at click time. A unit test checks that it agrees with `readPosition().gate` on every fixture with layout reads made to throw.
- **Cost (fix pass 3).** The result is cached. It is recomputed only when `location.href` changes, the first board element (`document.querySelector` of the site's board selector) changes, or after a `pointerdown`/`keydown` anywhere (passive capture listeners that only set a flag). A quiet tick costs one `querySelector`. A change with no such trigger keeps the old answer until the next trigger; on a game page that means staying closed. The measured idle cost is in `docs/perf.md`.
- `AQ.confirm()` is one full `readPosition()` that returns `true` only when it reads a board with `gate === null`. The panel calls it, or `readPosition()`, before it shows the launcher when `AQ.gate()` turns open.

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
- `{ status: "connecting" | "waiting" | "still_waiting" | "backup" | "keepalive", server: "boneyland" | "hugging-apps" | "custom" }`
- `{ result: R }`
- `{ error: { code, detail, retryAfter?, reason? } }` (fix pass 3: a server that sent `Retry-After` rests for that long in the background for every ask and tab. While it rests, a `busy`/`quota` primary answers at once with the remaining `retryAfter` and makes no request; a resting `asleep` primary goes straight to the backup) (`detail` is a plain string; `retryAfter` is seconds from a `Retry-After` header on a 429/503; `reason: "other_tab"` with `code: "busy"` means another tab's ask holds the one-in-flight slot, with `detail` "Another tab is already asking Queen."), where `code` is one of the §4.4 codes: `quota`, `token_rejected`, `unreachable`, `asleep`, `timeout`, `busy`, `illegal_position`, `game_over`, `bad_response`, `cancelled`, `extension_reloaded`, `all_unavailable`.

Disconnecting the port means cancel. The background aborts within 1 s.

Every string in `R` and in errors has the saved token, and any `hf_` token-shaped text, replaced with `[token removed]` as the last step before posting (also when `*`, `_`, `` ` `` or `~` are wedged between its characters).

**Normalized result `R`:**
```
{ server, seconds, cached: bool, fen, analysis: string /* model prose, plain text, raw tokens removed, player/opponent→White/Black */,
  best: { san, uci, source: "structured" | "prose_verified" } | null,
  suggestion: { san, source: "prose_unverified" } | null,
  evaluation: number | null, evaluationText: string | null /* the model's EVALUATION sentence (boneyland's field, or hugging-apps' EVALUATION prose line), player/opponent mapped; it always names White or Black ("Equal for White and Black: …" for an equal sentence), else null; else built from a number */,
  criticalLine: string | null /* numbered SAN */, truncated: bool, moveSource: string,
  positionCheck: "ok" | "mismatch" }
```
`positionCheck` is computed in the background with `verifyBest`/`verifyExplain` against the request's `snapshot`.

**Keyboard shortcut (fix pass 3).** The manifest declares `commands: { "open-panel": { suggested_key: { default: "Alt+Q" } } }`. On that command the background sends `chrome.tabs.sendMessage(tab.id, { type: "openPanel" })` to the active tab, which needs no `tabs` permission. The panel opens on it only when `sender.id` is this extension.

**One-shot** messages through `chrome.runtime.sendMessage`:
- `{ type: "openOptions" }`
- `{ type: "getPrefs" }` returns `{ firstUseSeen, dock: "right" | "left" }`
- `{ type: "setPrefs", prefs }`

The token is never sent to content scripts.

## Storage
- `chrome.storage.local` holds `token`, `tokenFor` (a list of origins approved for the token), `primary`, `custom: { origin, api: "boneyland" | "hugging-apps" }`, `firstUseSeen` and `dock`.
- The background sets `TRUSTED_CONTEXTS` on install and on every startup.
