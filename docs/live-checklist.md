# Live checks by the owner

The live sites can't be driven by automated tests (bot checks and logins), so the owner checks by hand that Ask Queen
reads the real pages correctly. A live **chess.com** check is mandatory before release. A live **lichess** check is
optional, because the lichess fixtures and end-to-end tests stay mandatory.

Only the owner signs this file.

## How to run a check

1. Load the build you are checking (`chrome://extensions` shows its version).
2. Open a finished game on the live site, in Game Review or Analysis, and click a move in the move list.
3. Open the Ask Queen panel. Write down the move it names and whose turn it says it is.
4. Ask, and when the answer arrives click **Copy FEN**. Compare it with the position you expect: for **Explain**, the
   position before the selected move; for **Best move**, the position on the board.
5. Record the result below and sign it.

## Template

Copy this block for each check.

```
Date:
Site and page:
Extension version:
Selected move:
Asked (Explain or Best move):
Expected position (FEN, or a description):
Position Ask Queen read (label in the panel, and the copied FEN):
Result (read correctly / wrong, with details):
Signed by the owner:
```

## Records

### chess.com, 2026-11-19

**Status: owner signature pending.** This record was transcribed from the owner's report in chat. It has not been
signed by the owner.

```
Date:                2026-11-19
Site and page:       chess.com, Game Review
Extension version:   0.1.0
Selected move:       8...b5
Asked:               not recorded
Expected position:   the game position at the selected move 8...b5 (FEN not recorded)
Position read:       reported as read correctly
Result:              read correctly. Reported in chat by the owner: "it was chess.com and it works"
Signed by the owner: PENDING
```

To complete this record, the owner should repeat the check on the release build (1.0.0), fill in the fields marked
"not recorded", and replace PENDING with a name and date.

### chess.com, 2026-11-19, build 1.0.0 (first pass)

**Status: reported by the owner in chat; owner signature pending.** Transcribed by the coordinator from the owner's
screenshots of a finished game in chess.com Game Review (`/analysis/game/live/187446826044/review?move=16`).

```
Date:                2026-11-19
Site and page:       chess.com, Game Review (finished live game)
Extension version:   1.0.0 (commit before the live fix)
Selected move:       9.O-O (ply 16)
Asked:               Best move (Explain was not offered; see result)
Expected position:   rnbq1rk1/p3bppp/1p2pn2/3p4/3P1B2/3BPN2/PP1N1PPP/R2Q1RK1 b - - (after 9.O-O), Black to move
Position read:       "Position on the board, Black to move", with the side detected from the last move; castling
                     correctly none for both sides; the analysis names the same pieces (Bf4, Bd3, Nb8, Be7, d4/d5)
Result:              Launcher appeared (gating correct) and the board was read correctly. The move list was NOT used,
                     because padded figurine text was rejected; this was fixed after the check (see
                     docs/review/CHANGELOG-review.md, "Live fix"). Explain still needs a re-check on the fixed build.
Signed by the owner: PENDING
```

### chess.com, 2026-11-19, build 1.0.0 (after the live fix, commit 651b93a), SIGNED

**Status: signed by the owner in chat ("confirmed Mithilesh Kowshik", 2026-11-19).** The fields were filled in by the
coordinator from the owner's screenshot and the FEN the owner copied with **Copy FEN**.

```
Date:                2026-11-19
Site and page:       chess.com, Game Review of a finished live game (/analysis/game/live/187446826044/review)
Extension version:   1.0.0 (commit 651b93a, with the chess.com move-list fix)
Selected move:       15.Nf3 (White; marked "??" by chess.com)
Asked:               Explain 15.Nf3
Expected position:   the position before 15.Nf3: White knight on d2, f3 empty, White to move on move 15, no castling
                     rights (both sides castled)
Position read:       Panel: "15.Nf3, White played this. Black is to move." with buttons "Explain 15.Nf3" and
                     "Best move for Black". Copy FEN after the answer:
                     r1r3k1/p4ppp/npNqpn2/3p4/3P4/4P3/PP1N1PPP/2RQ1RK1 w - - 2 15
Result:              read correctly. The move list is used, the side and move number are right, and the FEN is the
                     exact position before the selected move.
Signed by the owner: Mithilesh Kowshik, 2026-11-19 (in chat)
```

### chess.com, 2026-11-19, build 1.0.0 (commit 73f0d99, after fix pass 3): re-check, SIGNED

**Status: signed by the owner in chat.** The owner reloaded the extension and Game Review
(`/analysis/game/live/187446826044/review`) and reported: "ask queen still appears and panel shows explain move".
The owner also captured the live clock and result markup. The review clocks are `div.move-time-time.player-clock`,
not a running clock. The result is `div.main-line-row.move-list-row.result-row > span.game-result` ("0-1") inside
the move list. Both are now reproduced in the `chesscom-live-markup*` fixtures.

```
Date:                2026-11-19
Site and page:       chess.com, Game Review of a finished live game
Extension version:   1.0.0 (commit 73f0d99)
Selected move:       a mainline move (not recorded)
Asked:               panel showed "Explain <move>" (launcher and move list working)
Expected position:   as in the signed 651b93a record above
Result:              launcher shown; move list read; Explain offered. Keyboard shortcut: bound to ⌥Q in
                     chrome://extensions/shortcuts (scope "In Chrome"), and it opens the panel. The owner confirmed in
                     chat: "alt q ... bring up the extension ... that works". The first attempt failed only because
                     Chrome had not yet bound the new command's default key on the existing install.
Signed by the owner: Mithilesh Kowshik, 2026-11-19 (in chat: "confirmed 73f0d99 – Mithilesh Kowshik")
```

**Note on the shortcut, added in fix pass 4. The record above is unchanged.** On this build the owner's first ⌥Q
press did nothing. Chrome had not bound the new command's key on the existing install, so no key was assigned. After
the owner bound it at `chrome://extensions/shortcuts`, ⌥Q opened the panel. The README now says to set the key there
if the shortcut does nothing.

### Final commit check (ce55dc9)

Run by the owner on 2026-11-20 on commit `ce55dc9` (version 1.0.0), extension reloaded from that commit, on a
finished chess.com game. The owner sent the two Copy FEN strings below and wrote "everything looks good".
Lines marked *derived* were worked out by the coordinator from those FENs, not reported by the owner.

```
Date: 2026-11-20
Commit hash: ce55dc9
Extension version: 1.0.0
Site and page: chess.com, finished game

Explain
  Selected move: 29.Rg3 (derived: the two FENs differ only by Rg1-g3)
  Button pressed: Explain 29.Rg3 (derived from the selected move)
  Copy FEN from the answer: r5k1/5pp1/p3r3/8/1N1p1q1P/P2P1b1P/P1P2P1K/1R2Q1R1 w - - 1 29
  Matches the position before 29.Rg3: yes (White to move, no castling, no en passant, clocks 1 29)

Best move
  Selected move: 29.Rg3
  Button pressed: Best move for Black (derived)
  Copy FEN from the answer: r5k1/5pp1/p3r3/8/1N1p1q1P/P2P1bRP/P1P2P1K/1R2Q3 b - - 2 29
  Matches the position after 29.Rg3: yes. AQChess.replay(first FEN, ["Rg3"]) returns exactly this string.

Launcher hidden on a game in progress, and Alt+Q (⌥Q) opening the panel: covered by the owner's
  "everything looks good"; no individual result reported.
Anything wrong or surprising: none reported.
Confirmed by the owner in the session on 2026-11-20 ("everything looks good").
```

### lichess (optional)

No live check recorded. This is the path the Chrome Web Store reviewer is told to follow in
`store/reviewer-instructions.md`, and it needs no account, so one pass before upload is worth doing.

```
Date:
Commit hash:
Extension version:

Analysis board (https://lichess.org/analysis), after playing 1. e4 e5 2. Nf3 Nc6 3. Bc4
  "Ask Queen" button shown (yes / no):
  First-use notice shown on the first open, then "Got it" (yes / no):
  Buttons offered (expected "Explain 3.Bc4" and "Best move for Black"):
  Explain 3.Bc4: Copy FEN from the answer
    (expected r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3):
  Best move for Black: Copy FEN from the answer
    (expected r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3):
  Buttons follow the board when stepping back one move (yes / no):

Where the button must not appear
  A puzzle (https://lichess.org/training):
  The home page (https://lichess.org):
  A game in progress, if one is at hand:

Optional extras
  A study chapter:
  A finished game:

If "The free quota is used up" appeared, what was done (waited / added a token), and did "Try again" then work:
Anything wrong or surprising:
Signed by the owner (name and date):
```
