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

### lichess (optional)

No live check recorded.
