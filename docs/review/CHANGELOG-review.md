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
