# Ask Queen

A Chrome extension that explains chess moves on chess.com and lichess.org. It sends the position to
[QUEEN](https://huggingface.co/princeton-nlp/queen_pawn-8) (`princeton-nlp/queen_pawn-8`), a chess language model that plays at
roughly 2700 Elo and writes out its best move with the reasoning behind it.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.

## Use

- **chess.com**: open a game in Game Review or Analysis and click a move in the move list.
- **lichess.org**: open the analysis board, a finished game or a study and click a move.

Then click **♛ Ask Queen** in the bottom-right corner and pick one:

- **Explain 14...Nf6** (it names the move you selected) compares that move with the one Queen would have played.
- **Best move for White** asks what Queen would play next.

Answers usually take 15–60 seconds. Step to another move and ask again; the panel follows the board.

If the move list can't be read (a variation, a puzzle, a custom position), Ask Queen reads the pieces off the board instead
and asks you who is to move when it can't tell.

## Good to know

- **Queen explains its own move.** It can't comment on an arbitrary move, so "Explain" analyses the position
  *before* your move and tells you whether Queen agrees. When it doesn't, the explanation is for Queen's move, not yours.
- **Explanations can be wrong.** Queen is a language model, not an engine. Check anything important with Stockfish.
- **The backend is unofficial.** Requests go to two free community Hugging Face Spaces, `boneyland/queen-pawn-8` and
  `hugging-apps/queen-pawn-8`, with the second as a backup. Neither is run by Princeton or by this project, and either can be
  slow, asleep or gone.
- **It can't run locally on a Mac.** QUEEN needs an NVIDIA GPU, which is why the extension uses hosted Spaces.
- **Free GPU quota runs out.** If you see a quota error, add a free Hugging Face token in the settings (click the toolbar
  icon). A "read" token is enough, and since it is sent to community Spaces, don't use one with write access.

## Files

- `content/common.js`, `content/lichess.js`, `content/chesscom.js`: read the position from the page.
- `content/panel.js`: the button and panel.
- `background.js`: talks to the Spaces.
- `options.html`, `options.js`: settings.

No build step and no dependencies.
