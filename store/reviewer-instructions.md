# Instructions for the Chrome Web Store reviewer

For the "Test instructions" field. No account or login is needed anywhere.

```
No login is required. Use the free lichess analysis board.

1. Open https://lichess.org/analysis
2. Play a few moves on the board, for example 1. e4 e5 2. Nf3 Nc6 3. Bc4. The last move stays selected.
3. Click the "Ask Queen" button in the bottom-right corner of the page.
4. The first time, a notice explains where the position is sent. Click "Got it".
5. Click "Explain 3.Bc4" (the button names the selected move) or "Best move for Black".
6. Wait. An answer normally takes 15 to 60 seconds. The model runs on free community GPU servers that queue requests.

IF YOU SEE "The free quota is used up"
This is expected and is not a defect. The servers allow only a few free questions per visitor (by IP address), and review traffic can use that up. The extension is working: it has reached the server and reported the server's limit. To continue, either wait and try again later, or click "Add a free Hugging Face token", create a free read-only token at huggingface.co/settings/tokens, paste it into Settings, save, return to the lichess tab and click "Try again".

OTHER MESSAGES YOU MAY SEE
"Queen's server is waking up", "Queen took too long" or "Both servers are unavailable" mean the free servers are asleep or busy. Click "Try again" after a minute.

WHERE THE BUTTON DOES NOT APPEAR, BY DESIGN
The extension is for finished games only. It shows nothing on games in progress, on puzzles (https://lichess.org/training), on variants such as Chess960, and on pages without a board (https://lichess.org).

SETTINGS
Click the extension's toolbar icon. The page holds an optional Hugging Face token, the server choice, and an optional custom server. Saving a custom server asks Chrome for access to that one address only.
```

Notes for the owner, not for the field:

- The steps use lichess because its analysis board needs no account. chess.com Game Review needs a login, so it is not
  part of the reviewer's path.
- If review happens while both community servers are down, the reviewer will see an error state, not an answer. The
  text above explains that. See the Space-owner decision in `OWNER-TODO.md`.
