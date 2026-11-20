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

### lichess (optional)

No live check recorded.
