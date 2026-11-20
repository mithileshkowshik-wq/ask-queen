# Ask Queen

Ask Queen is a Chrome extension for the moment after a game when the review tells you a move was good or bad but not
why. On chess.com and lichess.org it reads the position you are looking at and asks
[QUEEN](https://huggingface.co/princeton-nlp/queen_pawn-8) (`princeton-nlp/queen_pawn-8`, a chess language model from
Princeton NLP) for its move and the reasoning behind it.

Unofficial. Not affiliated with or endorsed by Chess.com, Lichess, Princeton NLP or Hugging Face.

## What it does and doesn't do

It does:

- **Explain a move.** Click a move, then **Explain 14...Nf6**. Queen analyses the position *before* that move and says
  what it would play. If that is the move you clicked, Queen agrees and explains it. If not, you get Queen's move and its
  reasons.
- **Find Queen's move.** **Best move for White** asks what Queen would play in the position on the board.
- **Read the position for you**, including whose move it is. When it can't tell, it asks you: White or Black.

It doesn't:

- **Judge your move directly.** Queen explains only its own choice. When it prefers another move, the panel says so
  plainly: "This explains Bd7. Queen can't judge Nf6 directly."
- **Replace an engine.** Queen is a language model. Its explanations can be wrong, and the panel says so on every
  screen. Check anything that matters with an engine.
- **Work during a game**, on puzzles, or on Chess960 and other variants. See [Fair play](#fair-play).
- **Run on your computer.** QUEEN needs a large GPU, so the extension uses free community servers. They can be slow,
  out of quota, asleep or gone.

## Install

**Chrome Web Store.** Not listed yet. Once it is, install it from the listing and skip the steps below.

**Unpacked, from this folder.**

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder.

It needs a recent version of Chrome. The exact minimum is `minimum_chrome_version` in `manifest.json`.

## Use

**chess.com.** Open a finished game in Game Review or Analysis and click a move in the move list.

**lichess.org.** Open the analysis board, a study, or a finished game, and click a move. Variations work: the line you
selected is the line Queen gets.

Then, on either site:

1. Click **♛ Ask Queen** in the bottom corner. The first time, a short notice explains where your position is sent.
2. Click **Explain 14...Nf6** or **Best move for White**. The button names exactly what will be asked.
3. Wait. An answer usually takes 15 to 60 seconds, and the free servers queue requests, so it can take longer. After
   two and a half minutes the extension gives up and tells you. **Cancel** stops it at any time.

The answer shows, in order: the position Queen analysed, its move, any caveats, its evaluation and main line when the
server supplied them, and its explanation. **Copy FEN** copies the analysed position. **Ask again** gets a fresh
answer.

Good to know while you use it:

- **The panel follows the board.** Step to another move and the buttons change with it. An answer for the earlier
  position is marked "The board has moved", with one button to ask about the new one.
- **If the move list can't be used** (some custom positions, or a list that disagrees with the pieces), Queen works
  from the pieces instead. The panel shows how it decided whose move it is, with a switch. Castling rights are then a
  guess, and the panel says so. Only Best move is offered, because Explain needs the move before the position.
- **Move the panel** with the arrow in its header if it covers something. The side is remembered.
- **Keyboard.** Tab reaches the launcher and everything in the panel, and Escape closes the panel when focus is in it.

## Fair play

Ask Queen is for games that are over. It shows its button only where the page gives positive evidence of a finished
game, Game Review, an analysis board or a study. Otherwise it shows nothing:

- **Games in progress** (live, daily and correspondence, whether you are playing or watching), including lichess
  analysis of a correspondence game that is still going.
- **Puzzles**, solved or not.
- **Chess960 and every other variant.** Queen only knows standard chess.
- **Pages it doesn't recognise.** If it can't establish that a game is over, it stays hidden.

If you reach one of these with the panel open, the question in flight is cancelled, any answer is removed, and the
panel shows why ("Available after the game ends"), with Close as the only button.

The limit of this rule: the extension can't stop anyone copying a position into an analysis board by hand. Using any
outside help during a game breaks the sites' rules, and that is on the player.

## Privacy

The full policy is in [PRIVACY.md](PRIVACY.md). In short:

- **Nothing is sent until you click** an ask button. No background calls, no analytics, no ads.
- **Each click sends** the position (FEN), the moves (SAN) and the generation settings to a QUEEN server. If you saved
  a Hugging Face token, it is sent too. Nothing else: no username, game link, clock or chat.
- **A failed attempt is retried once** on a backup server, which then receives the same request.
- **The servers are third parties.** They are community-run Hugging Face Spaces, `boneyland/queen-pawn-8` and
  `hugging-apps/queen-pawn-8`. They are not run by Chess.com, Lichess, Princeton, Hugging Face or this project, and
  the people who run them can see what is sent.
- **Stored in your browser only:** your token, your server choices, and two panel preferences.

## Hugging Face token

Ask Queen works without a token. The free servers answer only a few questions per visitor, so sooner or later the
panel says **The free quota is used up**. A free Hugging Face token raises that limit.

1. In the panel, click **Add a free Hugging Face token** (or click the extension's toolbar icon) to open Settings.
2. Follow the link to Hugging Face and create a token. Make it **read-only**, just for Ask Queen, with no access to
   private models or data.
3. Paste it under **New token** and click **Save token**.
4. Go back to your game and click **Try again**. No reload is needed.

What to know about the token:

- It is sent with every question to the QUEEN servers, which are run by community members, not by Hugging Face,
  Princeton or this project. That is why it should be read-only and used for nothing else.
- Once saved, Settings shows only its last four characters (`hf_…abcd`). It is never shown in full again and never
  synced. Web pages, including chess.com and lichess, can't read it.
- **Remove token** deletes it from the browser. To cancel it everywhere, revoke it on Hugging Face.

## Troubleshooting

| The panel says | What it means | What to do |
|---|---|---|
| No **Ask Queen** button | The page is a game in progress, a puzzle, a variant, or one the extension doesn't recognise. | Open the finished game, its review, or an analysis board. |
| **Can't read this board** | The pieces don't make a legal position right now, often mid-animation. | Step to another move, or click **Read the board again**. |
| "The move list and the board disagree…" | The moves don't lead to the position shown. | Nothing: Queen works from the pieces. Check the side to move. |
| "The board changed, so nothing was sent." | The position moved between showing the button and your click. | Check the button's label and click again. |
| **Queen didn't name a clear move** | The answer had no move the server could verify. | Read the explanation, or click **Ask again**. |
| "The answer was cut off." | Queen ran out of room before finishing. | Click **Try the other server**. |
| **Queen analysed a different position** | The answer didn't match the board you asked about, so it was discarded. | Click **Work from the pieces**, or **Ask again**. |
| **The free quota is used up** | The free servers answer only a few questions per visitor. | Add a free Hugging Face token, or try again later. |
| **Your token was rejected** | The server refused the saved token. | Replace or remove it in Settings. |
| **Can't reach Queen's server** | The connection failed. | Check your connection, then **Try again**. |
| **Queen's server is waking up** | Free servers sleep when idle. | Wait a minute or two, then **Try again**. |
| **Queen took too long** | No answer within the time limit. | **Try again**, ideally at a quieter time. |
| **Queen's servers are busy** | Too many questions are queued. | Wait, then **Try again**. If the server says how long, the button counts down. |
| **Another tab is already asking Queen** | Queen answers one question at a time per browser. | Wait for that answer, then **Try again**. |
| **Both servers are unavailable** | Neither free server answered. | Try later, or set up a custom server. |
| **Queen can't use this position** | The server rejected the moves or the position. | Click **Work from the pieces**, or check the side to move. |
| **The game is over here** | The position is checkmate or stalemate. | Pick an earlier move. |
| **The server's format changed** | The reply wasn't in a shape the extension understands. | Update Ask Queen, or click **Try the other server**. |
| **The question was stopped** | The request ended before an answer came. | Click **Try again**. |
| **Ask Queen was updated** | The extension was updated or reloaded while the page was open. | Click **Reload this page**. |

Every error has a collapsed **Details** line with the technical reason.

## Custom server

If you run your own copy of a QUEEN Space on Hugging Face, Ask Queen can use it.

1. Open Settings and enter the Space's own address under **Custom server**, like
   `https://your-name-your-space.hf.space` (not its `huggingface.co` page).
2. Choose which built-in server it answers like: `/analyse_position` (boneyland) or `/analyze` (hugging-apps).
3. Click **Save custom server**. Chrome asks you to allow that one address, and nothing else.
4. Under **Server**, choose **Your custom server** to ask it first.

Your token is **not** sent to a custom server unless you tick the **Send my Hugging Face token to …** box for that
address. The choice covers that one address: change the address and you have to tick it again.
**Remove custom server** forgets it and gives back Chrome's access to it.

## Test and package

Tests are dev-only and nothing in `test/` ships.

```sh
cd test
npm install
npx playwright install chromium   # once
npm test
```

One command runs everything: unit tests, the DOM fixtures for both sites, and an end-to-end run of the real unpacked
extension in Chromium against a mocked server. Results and a screenshot of every panel state are written to
`docs/review/evidence/round-dev/`.

To build the zip for the Chrome Web Store:

```sh
sh scripts/package.sh
```

It writes `dist/ask-queen-<version>.zip` from an allowlist: the manifest, the scripts, the settings page, the icons
and `LICENSE`. Tests, docs and `store/` are left out.

The code is plain JavaScript with no build step and no runtime dependencies:

- `content/chess.js`: chess helpers with no page access, shared with the background.
- `content/common.js`, `content/lichess.js`, `content/chesscom.js`: read the position from the page.
- `content/panel.js`: the launcher and the panel.
- `background.js`: the only code that talks to the servers.
- `options.html`, `options.js`: Settings.
- `store/`: Chrome Web Store listing material. `docs/`: review notes and the owner's live checks.

## Known limits

- **The servers aren't ours.** Both are free community Spaces. They can be slow, out of quota, asleep, changed or gone,
  and nobody has promised otherwise.
- **Queen explains its own move**, not an arbitrary one.
- **Answers can be wrong**, cut off, or missing a clear move. The panel labels each case.
- **Standard chess only**, and never during a game.
- **Working from the pieces is less exact.** Castling rights are guessed from where the kings and rooks stand, and the
  move counters are reset, so Queen's move is numbered as move 1.
- **chess.com variations** are read as a line only when the page exposes how the moves connect. Otherwise Queen works
  from the pieces.
- **Site changes can break reading.** Both sites change their pages without notice. The extension checks the move list
  against the pieces and stops rather than guess, so the usual symptom is "Can't read this board", not a wrong answer.
- **One question at a time** per browser, with a short pause between questions, out of courtesy to the free servers.

## Licence

The extension's code is MIT licensed. QUEEN is a separate work with its own terms. See [LICENSE](LICENSE).
