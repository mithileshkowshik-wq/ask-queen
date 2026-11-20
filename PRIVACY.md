# Ask Queen privacy policy

Last updated: 19 November 2026. Applies to Ask Queen 1.0.0 and later.

Ask Queen is a Chrome extension with one purpose: to explain a position from a finished or analysed game of standard
chess on chess.com or lichess.org, using the QUEEN chess language model. This policy says what the extension sends,
to whom, and what it keeps.

## The short version

- Nothing leaves your browser until you click an ask button in the Ask Queen panel.
- A click sends the chess position, its moves and a few generation settings to a QUEEN server. If you saved a Hugging
  Face token, the token is sent too.
- If that server fails in a way that may be temporary, the same request is sent once to a backup server.
- Those servers are run by third parties, who can see what is sent.
- There are no analytics, no ads, no tracking, and nothing is sold.

## What is sent, and when

A request is made only when you click one of these in the panel: **Explain …**, **Best move for …**, **Ask again**,
**Try again**, **Try the other server**, or the re-ask button on an out-of-date answer. Opening a page, opening the
panel and stepping through moves send nothing.

Each request contains:

| Sent | What it is |
|---|---|
| The position | A FEN string: where the pieces are, whose move it is, castling rights, en passant square and move counters. |
| The moves | The moves from that position to the one you asked about, in standard notation (SAN). Empty when the extension works from the pieces alone. |
| Generation settings | The answer length limit, the temperature, a seed number and, for one server, a fixed instruction sentence. None of these describe you. |
| Your Hugging Face token | Only if you saved one in Settings. Sent as an `Authorization` header over HTTPS. |

If the first server fails in a way that may be temporary (it can't be reached, is asleep, or times out), the same
request is sent once to a backup server. That is the only request the extension makes without a click of its own. So
one question can reach two servers, and each server that is tried receives the request whether or not it answers.

The extension does not send your username, the game's link or ID, the page address, clocks, chat, cookies, or anything
else from the page. Requests are made without cookies and without a referrer. As with any web request, the server also
sees your IP address and ordinary browser headers such as the user agent.

## Who receives it

Every request goes to a server on this list and nowhere else:

- `https://boneyland-queen-pawn-8.hf.space`, a community-run Hugging Face Space that hosts the QUEEN model. Tried
  first unless you choose otherwise.
- `https://hugging-apps-queen-pawn-8.hf.space`, a second community-run Space with the same model.
- Your own custom Space at an `https://….hf.space` address, only if you set one up in Settings and approve that
  address in Chrome.

The server you chose in Settings is tried first. The backup for a failed attempt is the other built-in server, or the
default one when your first choice is a custom server. **Try the other server** asks them in the opposite order.

These servers are third parties. They are not operated by Chess.com, Lichess, Princeton NLP, Hugging Face or the
author of this extension. The people who run a Space, and Hugging Face as its host, can see the contents and headers
of each request, including your token if you saved one. What they log or keep is outside this extension's control;
see [Hugging Face's privacy policy](https://huggingface.co/privacy). For that reason, use a read-only token made just
for Ask Queen, with no access to private models or data.

Your token is sent to a built-in server whenever that server is tried, as the first choice or as the backup. It is
sent to a custom server only if you ticked the **Send my Hugging Face token to …** box for that exact address when
you saved it. Without that, requests to the custom server carry no token. The choice belongs to one address: saving a
different address clears it, and the token does not go to the new address until you tick the box again for it.

The author of this extension receives nothing. The extension has no server of its own.

## What is stored on your device

Stored in Chrome's local extension storage, in this browser profile only, never synced:

| Stored | Why |
|---|---|
| Your Hugging Face token | To send it with requests, if you saved one. |
| The custom server address approved for the token | To know whether the token may go to your custom server. |
| Your server choice, and a custom server's address and type | To know where to send requests. |
| Whether you have seen the first-use notice | So it is shown once. |
| Which side the panel is docked on | So it stays where you put it. |

Only the extension's own background and Settings pages can read the token from this storage. The extension's scripts
that run inside chess.com and lichess.org cannot, and neither can those sites. Settings shows a saved token only by
its last four characters. The token is never logged. A server that receives your token could repeat it in its answer,
so the background removes any copy of the token it finds in an answer, and any text shaped like a Hugging Face token,
before the answer reaches the page. **Remove token** in Settings deletes the token, and removing the extension deletes
everything above.

## Answers kept in memory

To avoid asking a free server the same thing twice, the extension keeps recent answers in the memory of its
background process. They are never written to disk. Exactly what happens to them:

- An answer is reused only for 15 minutes after it arrived.
- At most 32 answers are held. When a 33rd arrives, the oldest is dropped.
- An answer older than 15 minutes is not removed by a timer. It is dropped the next time the same question is asked,
  or when newer answers push it out. Until then it stays in memory, unused.
- All answers are dropped when you change the token or server settings, and when Chrome unloads the extension's
  background process, which it does on its own after a period of inactivity and when the browser closes.

**Ask again** always skips this cache.

## What the extension reads on the page

On chess.com and lichess.org, the extension reads the board and the move list to work out the position on screen.
This happens in your browser. It leaves your browser only as the position and moves described above, and only when
you click.

On games in progress, puzzles and chess variants the extension's button is hidden and nothing is sent. If you reach
such a page with the panel already open, the question in flight is cancelled, any answer is removed, and the panel
shows one short message saying why (for example "Available after the game ends"), with Close as its only button.

## What the extension never does

- It does not sell your data, and it shares it with no one except the QUEEN servers a question is sent to: the
  server tried first and, if that attempt fails, the backup.
- It does not use or transfer your data for anything unrelated to its single purpose.
- It does not use your data for advertising, profiling, or to determine creditworthiness or for lending.
- It contains no analytics, no trackers and no remotely loaded code.

Its use of data follows the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Your choices

- Use it without a token. Fewer questions are answered for free, but no credential is sent.
- Remove your token in Settings at any time, and revoke it on Hugging Face.
- Point the extension at a server you run yourself.
- Remove the extension to delete everything it stored.

## Changes

If the extension starts sending or storing anything else, this policy and the first-use notice change first, and the
change is listed in `CHANGELOG.md`.

## Contact

Questions and requests: open an issue at <https://github.com/ask-queen/ask-queen/issues>.
