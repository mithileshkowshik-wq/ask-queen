# Screenshot provenance

`store/screenshots/` holds the 1280×800 screenshots for the Chrome Web Store listing. Upload them in file order.

| # | File | What it shows |
|---|---|---|
| 1 | `01-best-move.png` | The answer card for "Best move for White": Queen's move, the estimate chip, Why, Main line, Key idea and Other moves with their tags. |
| 2 | `02-explain-move.png` | "Explain 4.O-O" where Queen prefers another move: the verdict, Queen's note on the move played with its tag, then the card. |
| 3 | `03-ask.png` | The ask view with a move selected, showing both ask buttons. |
| 4 | `04-first-use.png` | The first-use notice naming the servers and what is sent. |

## How they were made

- **Renderer:** `node store/make-screenshots.js`. It loads the unpacked extension in the Chromium that Playwright
  installed for the tests, at a 1280×800 viewport and a device scale factor of 1, and saves a screenshot per state.
- **The panel is the real one.** Nothing in it is drawn or edited: the content scripts read the page, the service
  worker asks the server, and `content/panel.js` renders the reply.
- **The server is the tests' mock** (`test/mock.js`). Its answer is the recorded reply from boneyland/queen-pawn-8 in
  `test/fixtures/boneyland-success.sse`, for the position after 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4. Both answers shown come
  from that one recording.
- **The card's short sentences** are picked from Queen's own text by the extension's rules
  (`content/format.js`). Chrome's built-in AI is not available in the test Chromium, and it is not stubbed here.
- **The page behind the panel** is a plain fixture built by the script: one board and a move list in the markup the
  extension's adapter reads, with a neutral style and Unicode chess pieces. The moves after 4.O-O only fill the list.
- In shots 1 and 2 the panel is scrolled to the answer, as a user would scroll it. In shot 2 the answer is longer than
  the panel, so the last reason under Other moves runs below the fold.
- **Last rendered:** 2026-11-26, with Chromium 158.0.8127.18.

To render them again:

```sh
node store/make-screenshots.js
```

## What they do not contain

No Chess.com, Lichess, Princeton or Hugging Face logo, wordmark, screenshot or board artwork, and no claim of
endorsement. The first-use notice names those parties in its own text, to say they don't run the servers.
