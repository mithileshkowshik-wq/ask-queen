# Screen-reader walkthrough: VoiceOver with Chrome on macOS

> **This is not a record of a VoiceOver session.** Nobody has listened to these steps yet. The walkthrough is derived
> from two things: the roles, names and live regions in the code (`content/panel.js`, `content/keyguard.js`,
> `options.html`, `options.js`), and Chromium's accessibility tree for each step, captured by the test
> `Browser accessibility tree for each step of the screen-reader walkthrough` and saved as `a11y-tree.txt` in the
> evidence folder of every test run (`docs/review/evidence/round-N/`). The tree shows what a screen reader is given.
> What VoiceOver then says, and when, is a prediction until the owner runs the [checklist](#owner-checklist) below.

Written 2026-11-20 for Ask Queen 1.0.0, from a test run on Chromium 158. The answer card (steps 8 to 10 of the panel)
and the "Chrome's on-device AI" section of Settings were added on 2026-11-25. Their trees come from fake cards and a
stand-in for Chrome's model, in the tests `Browser card-…`, `Browser tidying…` and `Browser Settings: Chrome's
on-device AI…`.

## How to read the tables

- **Given** is the role and name from the accessibility tree, in the tree's own notation.
- **Expected speech** is what VoiceOver normally says for that role and name. Exact wording varies with the VoiceOver
  version and verbosity settings. Chess notation is a guess throughout: VoiceOver may read "3...Be7" as "three, B e
  seven" or spell out the dots.
- Decorative glyphs (the crown, the dock arrow, the close cross, the side discs, the thinking animation) are
  `aria-hidden` and absent from the tree, so none of them should be spoken.

## The panel

The launcher and the panel live in one shadow root on an element appended to `<html>`, after the page's `<body>`. In
reading order they come after everything on the chess site.

| Step | What you do | Given | Expected speech | Focus afterwards |
|---|---|---|---|---|
| 1. Find the launcher | Navigate to the end of the page or use the Form Controls rotor. The shortcut (⌥Q by default) skips straight to step 2. | `button "Ask Queen"`, with the shortcut in its `title` and `aria-keyshortcuts` | "Ask Queen, button". The shortcut may or may not be read as a hint. | On the launcher |
| 2. Open | Press the launcher (VO-Space, Enter or Space) | `dialog "Ask Queen"`. It is non-modal: no `aria-modal`, no focus trap, and the page behind stays reachable. | "Ask Queen, web dialog" | On the dialog itself. With the shortcut, on the primary ask button instead. |
| 3. First-use notice (first open only) | Read on, then press Got it | `heading "Before your first question" [level=3]`, two paragraphs naming the servers and what is sent, `link "Privacy policy (opens in a new tab)"`, `button "Got it"` | The heading, the paragraphs and the link, read as you move through them | Back on the dialog |
| 4. The ask view | Read on | `heading "3.Bc4" [level=3]`, `paragraph: White played this. Black is to move.`, `button "Explain 3.Bc4"`, `button "Best move for Black"`, `button "Read the board again"` | Each in turn. The buttons name the move, so they make sense out of context. | Unchanged |
| 5. Step to another move on the site | Use the site's own controls | The heading and both button names change. Nothing is put in a live region. | Nothing from Ask Queen. Read the buttons again to hear the new move. | Kept on the same button if it still exists, otherwise on the dialog |
| 6. Ask | Press an ask button | `status` now holds three paragraphs: "Queen is thinking…", "Position after 3.Bc4, Black to move", "Usually 15 to 60 seconds." The seconds counter is `text: 0 s`, outside the region. `button "Cancel"` appears. | The three sentences, once, politely (after current speech). The counter is not announced. | Stays on the button you pressed |
| 7. A long wait | Wait 60 s, or for the backup server | The third paragraph becomes "Still waiting. Free servers queue requests." or "The first server didn't answer. Trying the backup server." | The status region again, with the new sentence | Unchanged |
| 7b. The answer is being shortened | Wait, only when Chrome's model takes more than a quarter of a second | The same `status` holds "Queen has answered.", the position line, and "Shortening it on this device." `button "Cancel"` is still there. | The status region again, politely. Most answers skip this step. | Unchanged |
| 8. The answer | Wait | The same `status` now holds `heading "Queen plays 4.Nxe5" [level=3]`. Below it, not in a live region: the context line, any caveat, then the card (step 9), `button "Copy FEN"`, `button "Ask again"`, and "Answered by … in 2 s". The answer is written once and not changed afterwards. | The headline only. Move past the ask buttons to read the rest. | Unchanged, or on the answer section if focus was on Cancel |
| 9. Read the card | VO-Right through it | In order: `paragraph: plus 1.51, White is better` and `paragraph: Queen's estimate after 4.Nxe5` (the visible "+1.51" chip is `aria-hidden`, so the number is given once, in words); `heading "Why 4.Nxe5" [level=4]` and a `list` of up to three `listitem`s; `heading "Main line" [level=4]` and `paragraph: 4.Nxe5 Qf6 5.O-O Ne6 6.d4 d6`; `heading "Key idea" [level=4]` and a paragraph; `heading "Other moves" [level=4]` and a `list` whose items read as the move, its tag and one line, for example "4.O-O Slightly worse …"; a collapsed disclosure "Queen's full answer"; and one paragraph saying who wrote the short text. In Explain, when Queen prefers another move and its text rates yours, `heading "Queen on 4.O-O" [level=4]` with its tag and line comes before the estimate. | Each in turn. The Headings rotor lists the card's sections. "Plus one point five one, White is better." | Unchanged |
| 10. Queen's full answer | Tab to "Queen's full answer" and press Enter or Space | A disclosure (`summary`). Open, it holds Queen's text as paragraphs and lists, then `heading "Evaluation" [level=4]` and Queen's evaluation sentence. With no card (no clear move, or nothing to shorten) it is already open, and "There are no short points …" comes before it. | "Queen's full answer, collapsed" (wording varies), then "expanded" | On the disclosure |
| 11. An error | For example, the free quota runs out | `alert` holds a level-3 heading and one sentence, for example "Queen's servers are busy" and "Too many questions are waiting right now, so give it a minute." Then one action button and `group: Details` (a collapsed disclosure). | The heading and the sentence at once, interrupting. | Unchanged |
| 12. A requested pause | The server sent Retry-After | `button "Try again in 20 s" [disabled]`. The number changes each second while the panel is visible. | "Try again in 20 s, dimmed, button" when you reach it. The countdown is not announced. | Unchanged |
| 13. The board moves under an answer | Step on the site while an answer is shown | The hidden `status` at the top of the dialog gets "The board has moved. This answer is for the earlier position." The same sentence is visible above the answer with one re-ask button, and `button "Ask again" [disabled]`. | The sentence, once, politely | Unchanged |
| 14. The page becomes a game in progress, a variant or a puzzle | Navigate on the site | The same hidden `status` gets, for example, "Available after the game ends. Ask Queen stays off while a game is being played, whether you are playing or watching." The dialog keeps one button: `button "Close"`. | That sentence, once, politely | On the dialog if it was on a removed button |
| 15. Close | Press Escape with focus in the panel, or press Close | The dialog leaves the tree. | "Ask Queen, button" as focus lands on the launcher | The launcher. If it is hidden, whatever had focus before the panel opened, else the page. |

Other things that hold at every step:

- The dialog's header reads `heading "Ask Queen" [level=2]`, `button "Move the panel to the left"` (or right),
  `button "Settings"`, `button "Close"`. Settings opens the options page in a new tab.
- The footer reads "Queen is a language model on community servers. Explanations can be wrong." followed by
  "Keyboard shortcut: ⌥Q" when a shortcut is bound.
- Keys pressed inside the panel are kept from the site's own shortcut handlers. Tab, Enter and Space keep their
  normal effect. VoiceOver's own commands are not touched.
- When the side to move can't be detected, the ask view has `group "Side to move"` with two toggle buttons,
  "White to move" and "Black to move", each with `aria-pressed`. "Best move" stays dimmed until one is pressed.

## The options page

The page has `lang="en"`, the title "Ask Queen settings", one `main` landmark, a level-1 heading and five regions
named by their level-2 headings.

| Step | What you do | Given | Expected speech | Focus afterwards |
|---|---|---|---|---|
| 1. Arrive | Open Settings from the panel or the toolbar icon | `heading "Ask Queen settings" [level=1]`, then `region "Hugging Face token (optional)"`, `region "Server"`, `region "Custom server (optional)"`, `region "Chrome's on-device AI (optional)"`, `region "Keyboard shortcut"` | The page title, then the heading. The regions appear in the Landmarks rotor. | Start of the page |
| 2. Token field | Tab to it | `textbox "New token"` (a password field), described by the token warning and by the error region | "New token, secure edit text", then the warning after a pause | In the field |
| 3. Show what I'm typing | Tab on | `checkbox "Show what I'm typing"` | "Show what I'm typing, unchecked, checkbox" | On the checkbox |
| 4. Save with nothing or a malformed token | Press Save token | `alert: Paste a token first.` or `alert: That doesn't look like a Hugging Face token. …` | The message at once | Back in the token field |
| 5. Save a token | Press Save token | `status: Token saved. Go back to your game and ask again.` The line above the field becomes "Saved token: hf_…1234", and `button "Remove token"` appears. | The status sentence, politely. The saved-token line is not announced. | On Save token |
| 6. Remove the token | Press Remove token | `status: Token removed from this browser.` | The status sentence | In the token field |
| 7. Choose a server | Change the pop-up | `combobox "Ask this server first"`, described by its help line. `status: Saved.` | "Ask this server first, pop-up button", then "Saved." | On the pop-up |
| 8. Custom server address | Type an address | `textbox "Space address"`, described by the help line and the error region. `checkbox "Send my Hugging Face token to this server too" [disabled]` becomes enabled and is renamed "Send my Hugging Face token to https://….hf.space". | The field and its help. The checkbox rename is not announced. | In the field |
| 9. Save a bad address | Press Save custom server | `alert: Enter the address of a Hugging Face Space, like https://your-name-your-space.hf.space.` | The message at once | Back in the address field |
| 10. Save a good address | Press Save custom server, then allow it in Chrome's own prompt | `status: Saved. Choose it under Server to ask it first.` The line above becomes "Saved custom server: …. Your token is not sent to it." | Chrome's permission prompt (browser UI, not this page), then the status sentence | On Save custom server |
| 11. Remove the custom server | Press Remove custom server | `status: Custom server removed, along with Chrome's access to it.` | The status sentence | In the address field |
| 12. Chrome's on-device AI | Read the region | A paragraph saying what it does, then the state as a paragraph: "Ready on this device.", "Not downloaded yet.", "Chrome is downloading the model.", "Not available on this device." or "Not supported by this Chrome.", then a paragraph of detail (the size, or what the model needs). The state is set when the page loads and is not announced. | Each paragraph as you move through it | Unchanged |
| 13. Download the model | Only when the state is "Not downloaded yet.": press Download | `button "Download"`, described by the detail paragraph (several GB, one time, shared by Chrome). After the press: the state paragraph reads "Chrome is downloading the model.", `progressbar "Download progress"` appears with a percentage beside it, and `status: Download started.` | "Download, button", then the size after a pause. After the press, "Download started." The percentage is not announced as it changes: move to the progress bar to hear it. | On the state paragraph, because the button is gone |
| 14. The download ends | Wait | `status: Downloaded. Ask Queen uses it from your next question.` and the state becomes "Ready on this device." If Chrome refuses: `alert: Chrome couldn't download the model: …` and the Download button is back. | The status sentence politely, or the alert at once | Unchanged |

The three `alert` regions and four `status` regions are in the page, empty, from the start, so their first message is
announced. The test `Browser options live regions are rendered and empty before their first message, and every
message state passes axe` checks this in the accessibility tree.

## Gaps the code already shows

None of these blocks a task, but each is silent where a sighted user sees a change:

- **Stepping through moves** (panel step 5) changes the heading and button names without an announcement.
- **"Reading the board…"** while a piece is moving is visible text only. The ask buttons are dimmed for that moment.
- **The retry countdown** (step 12) ends silently. The button becomes "Try again" and is enabled, but nothing says so.
- **Cancel** empties the status region and moves focus to the dialog. No sentence says the question was stopped.
- **Copy FEN** changes its own label to "Copied" for 1.5 s. It is not a live region, so that may not be spoken.
- **The gate and stale messages** are in the tree twice: once in the hidden status region and once as visible text.
  Reading through the dialog you hear them twice.
- **The card is not announced.** Only the headline is in the live region. The estimate, the reasons and the line have
  to be read by moving into the answer.
- **Tags are plain text** after the move ("4.c3 Weakest"). Nothing says "tag", and the colour of a tag carries no
  extra meaning that the words don't.
- **Queen's move in the main line** is highlighted by colour and weight only. The headline already names it.
- **The download percentage** in Settings changes silently. Only the start and the end are announced.
- **The answer section** takes focus only when focus was on Cancel. It has no name of its own, so VoiceOver may say
  little when focus lands there.

## Owner checklist

Run on macOS with Chrome and VoiceOver (⌘F5), on a lichess analysis board (no login needed). Tick each line, write
what differed, and sign.

- [ ] The launcher is reachable and is announced as "Ask Queen, button".
- [ ] Opening it announces a dialog named "Ask Queen", and VO-Right reads the header buttons by name.
- [ ] The first-use notice reads in order and "Got it" returns you to the dialog.
- [ ] The ask buttons are announced with their move, for example "Explain 3.Bc4".
- [ ] Pressing one announces "Queen is thinking…" once. The seconds counter is never read out.
- [ ] The headline ("Queen plays …" or "Queen agrees with …") is announced when the answer arrives, without moving focus.
- [ ] The estimate is read as words ("plus 1.51, White is better"), once, and no crown, arrow or cross is spoken.
- [ ] "Why …", "Main line", "Key idea" and "Other moves" appear in the Headings rotor, and the reasons read as a list.
- [ ] "Queen's full answer" opens with VO-Space and its text can be read with VO-Right.
- [ ] Stepping to another move on the site announces "The board has moved. This answer is for the earlier position."
- [ ] An error (turn Wi-Fi off and ask) is announced at once, and its button is reachable with Tab.
- [ ] Escape closes the panel and focus returns to the launcher.
- [ ] ⌥Q (or the key you bound) opens the panel and lands on the main ask button.
- [ ] In Settings, saving with an empty token field announces "Paste a token first." and returns to the field.
- [ ] Saving a token announces "Token saved. Go back to your game and ask again."
- [ ] The "Chrome's on-device AI" region reads its state, and Download (if shown) announces "Download started."
- [ ] Note any of the "gaps" above that got in your way.

```
Date:
macOS, Chrome and Ask Queen versions:
Differences from this document:
Signed by the owner:
```
