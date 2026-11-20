# Brief: Ask Queen rubric + target spec

You are one of three independent experts (Opus 5.5, Fable 5.2, GPT-6.2-astra) drafting a **hard scoring rubric** and a **target spec** for the Chrome extension in this repository (`/Users/mithileshk/Desktop/Ask_Queen`). Two other models (GPT-6.2-sol and Fable 5.2) will later use the rubric to score the extension out of 10, and fixes will be made until both score ≥ 9.0. A 9 must be genuinely hard to earn: it should mean "ready to publish on the Chrome Web Store and delight a serious club player".

## What the product is for (the user's own goals)
- After playing a game on **chess.com** (and **lichess.org**), when Game Review doesn't explain *why* a move was good or bad, the user clicks a button in the browser and gets an explanation from **QUEEN** (princeton-nlp/queen_pawn-8, a 3B chess language model, ~2700 Elo, writes a best move + natural-language analysis; paper arXiv 2610.03695).
- The extension must read the position **automatically from the page**, detect **whose move it is** automatically, and fall back to **"White to play / Black to play"** buttons when it can't tell. Then send the position to the existing QUEEN model (no training) and show QUEEN's output in the browser.
- The user intends to **publish on the Chrome Web Store**.

## Fixed constraints (do not penalize these; design within them)
1. QUEEN needs an NVIDIA GPU + vLLM; no official hosted API exists. The backend is two **unofficial community Hugging Face Spaces** on ZeroGPU: `boneyland/queen-pawn-8` (`/analyse_position`, primary) and `hugging-apps/queen-pawn-8` (`/analyze`, fallback). Anonymous ZeroGPU quota is small and per-IP; an HF token raises it.
2. QUEEN only explains **its own** best move; it cannot explain an arbitrary given move. "Explain my move" = analyze the position before the move and compare Queen's choice to the played move.
3. Live chess.com/lichess cannot be automated headlessly (bot check / login). Evidence for scoring = code, unit tests on DOM fixtures (lichess fixtures mirror the open-source lila markup), a Playwright E2E that loads the real unpacked extension on fixture pages with a **mocked Space** replaying recorded real responses, screenshots of every UI state, plus the user's manual confirmation that position reading works on live chess.com.
4. User code style: simple and concise; plain JS, no build step, no runtime dependencies.

## Current implementation (read the files)
- `manifest.json` (MV3), `background.js` (Gradio REST + SSE client, fallback Space, abort on disconnect, best-move-from-text repair), `content/common.js` (FEN helpers, adapter registry), `content/lichess.js`, `content/chesscom.js` (site adapters: move list first, board-scan fallback, last-move highlight → side to move), `content/panel.js` (shadow-DOM floating button + panel, safe markdown renderer, states: ask/thinking/result/error), `options.html/js` (HF token, primary server), `icons/`, `README.md`.
- Recorded real Space responses: see `test/fixtures/` once present (a success, a truncated `length` answer).

## Your deliverable
Return Markdown with two parts:

### Part 1 — Rubric
- 6–9 criteria with **weights summing to 100**. Must include **Chrome Web Store readiness** (policy: single purpose, no remote code, least-privilege permissions + justifications, privacy policy & data-use disclosure covering FEN/moves and HF token sent to third-party Spaces, listing assets/wording without implying endorsement by chess.com/lichess, packaging that excludes test/docs, versioning) and **position-reading correctness**.
- For each criterion: what it covers, and **anchored descriptors for scores 3, 6, 9 and 10** — concrete, checkable conditions, not adjectives.
- **Hard caps** (conditions that cap the overall score, e.g. at 5), at minimum: sends a wrong position to Queen in a core flow; XSS / unescaped model or site text inserted as HTML; crash or dead-end in a core flow; a Chrome Web Store policy blocker.
- Scoring procedure: overall = weighted mean to one decimal, then apply caps; what evidence the reviewer must cite (file:line or screenshot) for every score below 10.

### Part 2 — Target spec ("what a 9/10 Ask Queen looks like")
Concise, concrete, testable: architecture and permissions, position reading per site (incl. variations, custom start positions, side-to-move detection, fallback UX), QUEEN request/response handling (timeouts, cancellation, fallback, quota/onboarding, caching, rate courtesy toward the community Spaces), panel UX states and copy principles, accessibility (keyboard, focus, contrast, reduced motion), security/privacy, performance (polling cost, no layout interference with the sites), store listing package, docs, tests. Flag the **public-scale risk** of depending on unofficial Spaces and state what the spec requires about it (graceful degradation, configurable server, and a recommendation for the owner — e.g. contact Space owners or duplicate the Space — as a pre-launch decision, not a code requirement).

Be strict, specific and brief. Do not edit any files.
