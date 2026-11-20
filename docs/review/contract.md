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
- If `crossCheck.ok` is false, `moves` must be `null` and `root` must not claim to be verified. The panel shows the "disagree" banner (§3.3).
- `fen6` is set only when the page exposes an exact FEN tied to the board. All six fields are kept.

## Messages
**Long-lived request:** the panel opens `chrome.runtime.connect({ name: "queen" })` and posts:
```
{ type: "ask", mode: "explain" | "best", fen, moves: "e4 e5 …", played: SAN | null,
  snapshot: { placement, side }, fresh: bool }
```
`fen` is the root FEN (six fields). For Explain, `moves` are the moves *before* the played move. The background validates the request per §1: `sender.id`, the FEN regex, strict SAN, and the length caps.

**Background → panel**, on the same port:
- `{ status: "connecting" | "waiting" | "still_waiting" | "backup" | "keepalive", server: "boneyland" | "hugging-apps" | "custom" }`
- `{ result: R }`
- `{ error: { code, detail } }`, where `code` is one of the §4.4 codes: `quota`, `token_rejected`, `unreachable`, `asleep`, `timeout`, `busy`, `illegal_position`, `game_over`, `bad_response`, `cancelled`, `extension_reloaded`, `all_unavailable`.

Disconnecting the port means cancel. The background aborts within 1 s.

**Normalized result `R`:**
```
{ server, seconds, cached: bool, fen, analysis: string /* model prose, plain text, raw tokens removed, player/opponent→White/Black */,
  best: { san, uci, source: "structured" | "prose_verified" } | null,
  suggestion: { san, source: "prose_unverified" } | null,
  evaluation: number | null, evaluationText: string | null /* e.g. "Black is slightly better (≈ −0.3)" */,
  criticalLine: string | null /* numbered SAN */, truncated: bool, moveSource: string,
  positionCheck: "ok" | "mismatch" }
```
`positionCheck` is computed in the background with `verifyBest`/`verifyExplain` against the request's `snapshot`.

**One-shot** messages through `chrome.runtime.sendMessage`:
- `{ type: "openOptions" }`
- `{ type: "getPrefs" }` returns `{ firstUseSeen, dock: "right" | "left" }`
- `{ type: "setPrefs", prefs }`

The token is never sent to content scripts.

## Storage
- `chrome.storage.local` holds `token`, `tokenFor` (a list of origins approved for the token), `primary`, `custom: { origin, api: "boneyland" | "hugging-apps" }`, `firstUseSeen` and `dock`.
- The background sets `TRUSTED_CONTEXTS` on install and on every startup.
