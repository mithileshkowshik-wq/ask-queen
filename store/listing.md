# Chrome Web Store listing

Paste these into the developer dashboard. Nothing in `store/` is shipped in the extension zip.

## Title

Ask Queen

## Summary (132 characters at most)

This is the manifest `description`, which the store shows as the summary. Keep the two identical.

> Explain chess moves on chess.com and lichess with the QUEEN chess language model.

## Category and language

- Category: Education
- Language: English

## Description

```
Game Review says a move was a mistake. Ask Queen tells you what the QUEEN chess model would have played, and why.

After a game on chess.com or lichess, click a move, then click Ask Queen. The extension reads the position from the page, works out whose move it is, and asks QUEEN, a chess language model from Princeton NLP, for its move and its reasoning in plain English.

WHAT YOU CAN ASK
• Explain a move. QUEEN analyses the position before the move you clicked. If it would play the same move, it explains why. If not, it shows its own move and the reasons for it.
• Ask what QUEEN would play next in the position on the board.
• The answer is a short card: QUEEN's move, its estimate, the main line and a few short reasons, with QUEEN's full text one click away. The short text is written on your device, by Chrome's built-in AI when it is available, and nothing extra is sent.

WHERE IT WORKS
• chess.com: Game Review and Analysis.
• lichess.org: the analysis board, studies and finished games. Variations work.
• If the move list can't be read, it reads the pieces and asks you whose move it is.

FAIR PLAY
Ask Queen is for games that are over. It does not appear during games in progress (live, daily or correspondence, playing or watching) or on puzzles. It can't stop someone copying a position into another analysis tool by hand; using outside help during a game is against both sites' rules, and that is on the player.

LIMITS, STATED PLAINLY
• Answers can be wrong. QUEEN is a language model, not an engine. Check anything important with an engine.
• QUEEN explains its own move. It can't judge an arbitrary move, so when it disagrees with the move played, the explanation is for QUEEN's move.
• The servers are free and run by volunteers. They can be slow (15 to 60 seconds is normal), out of quota, or unavailable. A free Hugging Face token raises the quota, and Settings explains how.
• Standard chess only. No Chess960 or other variants.
• Off during games.

PRIVACY
Nothing is sent until you click. A click sends the position, its moves and, if you added one, your Hugging Face token to a community-run QUEEN server on Hugging Face. If that server fails, the same request is sent once to a backup server. No username, game link, clock or chat. No analytics and no ads. The servers are third parties and are named in the extension and in the privacy policy.

Unofficial. Not affiliated with or endorsed by Chess.com, Lichess, Princeton NLP or Hugging Face.
```

## Non-affiliation line

Shown in the description above, in Settings, in the README and in `LICENSE`:

> Unofficial. Not affiliated with or endorsed by Chess.com, Lichess, Princeton NLP or Hugging Face.

## Graphics

| Asset | File | Notes |
|---|---|---|
| Store icon, 128×128 | `icons/128.png` | A gold crown on a dark tile. No site or company marks. |
| Small promo tile, 440×280 | `store/promo-440x280.png` | Rendered from the fixture page `store/promo-tile.html` by `node store/make-promo.js`. No site logos. Provenance: `store/promo.md`. |
| Screenshots, 1280×800 | `store/screenshots/` | Rendered by `node store/make-screenshots.js`: the real extension on a store-only fixture page with a recorded server reply. No site logos. Provenance: `store/screenshots.md`. |

Upload them in this order:

1. `01-best-move.png`: the answer card for Queen's move, with the estimate, the reasons, the main line and other moves.
2. `02-explain-move.png`: explaining a move Queen disagrees with.
3. `03-ask.png`: the ask view with a move selected.
4. `04-first-use.png`: the first-use notice naming the servers.

## Links

- Homepage: https://github.com/mithileshkowshik-wq/ask-queen
- Privacy policy: https://github.com/mithileshkowshik-wq/ask-queen/blob/main/PRIVACY.md
- Support: https://github.com/mithileshkowshik-wq/ask-queen/issues

## Wording rules for future edits

- Don't present the extension as endorsed by anyone, and don't rank it against other tools.
- Don't use the Chess.com, Lichess, Princeton or Hugging Face logos, and keep the non-affiliation line.
- Keep the five limits: the free servers can be slow or unavailable, QUEEN explains its own move, answers can be wrong,
  standard chess only, off during games.
