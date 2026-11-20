# Changelog

All notable changes to Ask Queen. Versions follow [semantic versioning](https://semver.org/), and the version here
matches `manifest.json` and the name of the packaged zip.

## 1.0.0 (2026-11-19)

First version prepared for the Chrome Web Store.

### Added

- **Fair-play gating.** The launcher appears only on finished games, Game Review, analysis boards and studies. Games in
  progress, puzzles, variants and unrecognised pages get nothing. Reaching one with the panel open cancels the request
  and removes the answer.
- **First-use notice** naming the third-party servers, with a link to the privacy policy.
- **Typed errors.** Each failure has its own state with a plain headline, one sentence, one action and collapsed
  details, including "Both servers are unavailable".
- **Waiting states:** "Still waiting" after 60 seconds and "Trying the backup server".
- **Out-of-date answers** are marked when the board moves, with one button to ask about the new position.
- **"Try the other server"** on answers that were cut off.
- **Settings:** Remove token, a token format check, a custom server on your own Hugging Face Space, and a separate
  consent before your token is sent to it. The consent belongs to one address and is cleared when the address changes.
- **Keyboard shortcut.** Alt+Q opens the panel where the launcher is showing. The panel shows the shortcut, and it
  can be changed at `chrome://extensions/shortcuts`.
- **Dock left or right**, remembered.
- **Retry timing.** When a server says how long to wait, the retry button counts down. A question from another tab
  gets its own message: "Another tab is already asking Queen".
- **Privacy policy, licence, this changelog,** and the Chrome Web Store listing material in `store/`.
- A 32 px icon.

### Changed

- **Position reading is strict.** A move list is used only when every move is valid and the list agrees with the
  pieces on the board. Otherwise Queen works from the pieces and the panel says so.
- **Custom starting positions** are sent from their real start, not replayed from the standard one.
- **The click re-reads the board.** If the position changed since the button was labelled, nothing is sent.
- **Answers are checked** against the position you asked about. An answer for a different position is discarded.
- **The explanation is built as page elements, never parsed as HTML**, so nothing a server sends can become markup.
- **Only verified moves are headlines.** A move becomes "Queen plays …" or a verdict only when the server checked it
  for legality. Anything else is shown as "Queen's text suggests … (unverified)".
- **The result card** follows one order: position, headline, caveats, evaluation, critical line, explanation, actions,
  server and time.
- **The panel follows the board** as it changes, not on a timer.
- **Timeouts:** 20 seconds to connect, 45 seconds of silence, 150 seconds in total. The backup server is tried once,
  and only for failures that may be temporary.
- **Courtesy to the free servers:** one question at a time, a short pause between questions, and a 15-minute memory of
  recent answers. "Ask again" asks afresh.
- **Accessibility:** focus returns where it came from on close, Escape closes only from inside the panel, keys typed
  in the panel don't trigger site shortcuts, answers and errors are announced, and controls meet contrast and size
  targets.

### Security

- **Permissions narrowed** to the two built-in servers. Any other server is an optional permission for one exact
  address, requested when you save it.
- **The token is locked away** from the scripts that run in chess.com and lichess.org, is shown only by its last four
  characters, and is never put back into the Settings field.
- **The background checks** who is asking and what is asked before any request is made.

## 0.1.0 (2026-11-19)

Development build, loaded unpacked. Explain and Best move on chess.com and lichess.org through two community servers.
