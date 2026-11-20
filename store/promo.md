# Promo tile provenance

`store/promo-440x280.png` is the 440×280 small promo tile for the Chrome Web Store listing.

## How it was made

- **Source:** `store/promo-tile.html`, a self-contained fixture page. It is drawn entirely with CSS and system fonts.
  It loads no images, no network resources and no scripts.
- **Renderer:** `node store/make-promo.js`, which opens that page in headless Chromium through the Playwright
  installed for the tests, at a 440×280 viewport and a device scale factor of 1, and saves a screenshot.
- **Last rendered:** 2026-11-19, with Chromium 158.0.8127.18.

To render it again after editing the page:

```sh
node store/make-promo.js
# If Playwright's own Chromium build is not installed:
PROMO_CHROMIUM=/path/to/chromium node store/make-promo.js
```

## What it shows

- The extension's name and its crown glyph (the Unicode chess queen, U+265B, in gold on the panel's dark colour).
- One line of description.
- A small abstract grid of squares. It is decoration, not a screenshot of either site's board.
- An example result card. Its two lines are the panel's own wording for a disagreement, as produced by
  `content/panel.js`: the context line ("Position before 14...Nf6, Black to move") and the headline ("14...Nf6 was
  played. Queen prefers 14...Bd7."). The moves are the example from spec §5.2. The same state, rendered by the real
  panel on a fixture page, is the screenshot `result-disagree.png` in `docs/review/evidence/round-N/`.

## What it does not contain

No Chess.com, Lichess, Princeton or Hugging Face logo, wordmark, screenshot or board artwork, and no claim of
endorsement.
