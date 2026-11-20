# Fix pass 1: UI and copy workstream (Fable 5.2)

You are implementing the **UI and copy** half of fix pass 1 for the Ask Queen Chrome extension (`/Users/mithileshk/Desktop/Ask_Queen`). A GPT-6.2-sol agent is working on the logic files **in parallel**. Edit only the files you own, which are listed in `docs/review/contract.md`.

## Read first
- `docs/review/spec.md` (frozen v4): the target.
- `docs/review/rubric.md` (frozen v4): how the work is scored.
- `docs/review/contract.md`: interfaces you **must** code against exactly.
- Round-1 reviews:
  - `docs/review/round-1/gpt.json`
  - `docs/review/round-1/fable.md`
- The current `content/panel.js`, `options.*` and `README.md`.

The logic side is being rewritten now, so rely on the contract, not on the current `background.js` or adapters.

## Your files
- `content/panel.js`
- `options.html`
- `options.js`
- `README.md`
- `PRIVACY.md`
- `CHANGELOG.md`
- `LICENSE`
- `store/**`
- `docs/live-checklist.md`
- `icons/32.png` (new); you may regenerate the other icons

## Deliver
1. **`content/panel.js`**, consuming `AQ.readPosition()` and the port protocol exactly as the contract defines them.
   - **States:** every §5.1 state.
   - **Gate handling:** the §2 entry rules. The launcher shows only when `gate === null`. If the gate changes while the panel is open: abort, clear the answer, and show the gated message with Close as the only action.
   - **First use:** a notice through `getPrefs`/`setPrefs`.
   - **Following the board:** a debounced `MutationObserver` while the panel is open, at most 4 reads per second, updating within 300 ms. While closed, a cheap check with no layout reads, and nothing in hidden tabs.
   - **Click time:** re-read the position; if it differs from the label, re-render and don't send.
   - **Stale results:** a banner with a one-action re-ask.
   - **Disagree banner:** shown when `crossCheck` fails.
   - **"Can't read this board":** shown when `board.valid` is false.
   - **Side source:** shown with a switch. Unknown side: White/Black buttons, Ask disabled until one is chosen.
   - **Mate:** "The game is over here" for Best move after `#`.
   - **Result card**, following §4.5, §5.2 and §5.3:
     - headline rules by `best.source`, and the `suggestion` line
     - no verdict unless the move is verified
     - truncation notice directly under the headline, with "Try the other server" (send a fresh ask that prefers the other server: add `prefer: "other"` to the ask message and report it as a contract addition)
     - evaluation text, critical line, analysis rendered by the escape-first Markdown subset (no links or images)
     - Copy FEN and Ask again
     - a footer with the server, the time and "cached"
     - when `positionCheck === "mismatch"`: "Queen analysed a different position", with a fallback action
   - **Errors:** one state per code, each with a headline, one sentence and one primary action, with Details collapsed. No jargon in headlines.
   - **Waiting:** the 60 s "still waiting" state and the backup state.
   - **Accessibility (§6):**
     - the close focus order
     - `role="status"` and `role="alert"`, with the timer not announced
     - Escape only when focus is inside the panel
     - panel key events stopped at the host
     - a 3:1 contrast or better for boundaries and focus
     - targets of at least 24 px
     - a pressed state that doesn't rely on colour
     - forced colors, 200% zoom and 320 px width
     - decorative glyphs `aria-hidden`
   - **Layout:** a dock-left/dock-right toggle remembered through `setPrefs`.
   - **Footer:** "explanations can be wrong".
   - **Shadow root:** keep one shadow root. Open mode is allowed and makes axe testing easier, so prefer **open**.
   - **Test hooks:** give the main controls stable `data-testid` attributes, and list them in your report so the test agent can use them.
2. **`options.html` and `options.js`** (§4.7):
   - a token input; show/hide applies only to text being typed
   - a saved token shown as `hf_…abcd` and never refilled into the field
   - Save and Remove, with an `hf_` format check
   - a note that the token goes to community-run servers not operated by Hugging Face, Princeton or the author, recommending a read-only token
   - the primary server choice
   - a custom server (an HTTPS Space origin plus its API shape), which requests the exact-origin optional permission through `chrome.permissions.request` on save, with a separate checkbox giving consent to send the token there (stored in `tokenFor`)
   - accessibility at the same bar as the panel
3. **Store package and docs:**
   - `store/listing.md`: title, short and full description, the non-affiliation line, fair play, limits
   - `store/single-purpose.md`
   - `store/permissions.md`: a justification for each permission, each host, the optional permission and site access
   - `store/data-use.md`: the dashboard answers
   - `store/reviewer-instructions.md`: no login needed; uses the lichess analysis board; explains the quota message
   - `store/OWNER-TODO.md`: host `PRIVACY.md` at a public URL, set `homepage_url`, create the developer account, upload the dashboard draft, record the Space-owner decision (§12), confirm the QUEEN licence, and sign `docs/live-checklist.md`
   - a 440×280 promo tile (`store/promo-440x280.png`), generated from scratch with no site logos; Python stdlib or macOS `sips` are fine
   - `PRIVACY.md` (§7)
   - `CHANGELOG.md` (1.0.0)
   - `LICENSE` (MIT for the extension code, plus an attribution note for QUEEN, princeton-nlp/queen_pawn-8, with its licence status: no blanket licence is asserted for the combined weights)
   - `README.md` covering every item in §10
   - `docs/live-checklist.md`: a template, plus a transcribed record: "2026-11-19, reported in chat by the owner: chess.com Game Review, selected move 8...b5, position read correctly ('it was chess.com and it works'), extension version 0.1.0". Mark it **"owner signature pending"**. Do not sign on the owner's behalf.
   - 1280×800 screenshots are produced by the test harness and are not your job. Have `store/listing.md` reference `docs/review/evidence/round-N/` as their source.

## Constraints
- Plain JS, no dependencies, concise. `panel.js` should stay around 600 lines or less if possible.
- The copy must be excellent: plain, honest, chess-player vocabulary.
- Do not edit logic-owned files. If the contract blocks something, note it.
- Do not commit.
- Run `node --check` on your JS files.

## Final report
List:
- the files changed
- the `data-testid` list
- any contract additions or issues
- anything the test agent needs to drive each §5.1 state
