# Single purpose

For the "Single purpose" field on the dashboard's Privacy practices tab.

```
Ask Queen has one purpose: to explain a chess position from a finished or analysed game of standard chess on chess.com or lichess.org, using the QUEEN chess language model.

When the user clicks a move and then clicks Ask Queen, the extension reads the position from the page, sends it to a QUEEN server, and shows the model's move and explanation in a panel on that page. Everything else in the extension serves that: the Settings page holds an optional Hugging Face token and the choice of QUEEN server.
```

What it deliberately does not do, so the purpose stays narrow:

- No play assistance. It is hidden on games in progress and on puzzles.
- No engine, opening book, move overlay, or change to either site's interface beyond its own button and panel.
- No analytics, ads, account features or unrelated tools.
