# Owner to-do before submitting

Steps only the owner can do. Tick each one and fill in the blanks. Nothing here is shipped in the extension zip.

## 1. Privacy policy, home page and support (done)

The repository is public, so `PRIVACY.md` is served by GitHub without a login.

- [x] Privacy policy URL: https://github.com/mithileshkowshik-wq/ask-queen/blob/main/PRIVACY.md
      (linked from `content/panel.js` `PRIVACY_URL` and the footer of `options.html`).
- [x] Home page (`homepage_url`): https://github.com/mithileshkowshik-wq/ask-queen
- [x] Support and the contact link in `PRIVACY.md`: https://github.com/mithileshkowshik-wq/ask-queen/issues
- [ ] Keep GitHub Issues turned on for the repository.
- [ ] Paste the policy URL into the dashboard's Privacy practices tab.

## 2. Commit email

Commits use the GitHub no-reply address, so the public history doesn't show a personal email. Keep
`git config user.email` set to the no-reply address in this repository.

## 3. Create the developer account

- [ ] Register at the Chrome Web Store developer dashboard (one-time registration fee) and verify the contact email.
- [ ] Decide the publisher name shown on the listing.
- [ ] Replace "The Ask Queen authors" in `LICENSE` with the copyright holder's name if you want one named.

## 4. Upload the dashboard draft

- [ ] Confirm that stable Chrome is at or above `minimum_chrome_version` in `manifest.json` (check
      `chrome://version` on a stable install). The value is the Chromium version the tests run on. If stable Chrome
      is older, users can't install the extension yet: wait, or lower the value and run the tests on that version.
- [ ] Run the tests: `cd test && npm test`.
- [ ] Build the zip: `sh scripts/package.sh`, which writes `dist/ask-queen-<version>.zip`.
- [ ] Upload the zip as a draft.
- [ ] Listing tab: paste from `store/listing.md`. Upload `icons/128.png`, `store/promo-440x280.png`, and the four
      1280×800 screenshots in `store/screenshots/`, in the order listed in `store/listing.md`.
- [ ] Privacy practices tab: paste `store/single-purpose.md`, each block of `store/permissions.md`, and the answers
      and certifications in `store/data-use.md`.
- [ ] Test instructions: paste the block from `store/reviewer-instructions.md`.
- [ ] Confirm the draft passes the dashboard's own checks, and keep a screenshot.

## 5. Decide how to depend on the community servers (spec §12)

Both QUEEN servers are free community Spaces that this project does not control. They can sleep, change, add a login,
disappear, or be overwhelmed by public traffic, and a store reviewer who hits the free quota may reject the extension
as not working. Choose one before launch and record it here:

- [ ] **Option 1.** Contact the owners of `boneyland/queen-pawn-8` and `hugging-apps/queen-pawn-8` for permission and
      an idea of the load they can take.
- [ ] **Option 2.** Duplicate a Space under your own Hugging Face account, make it the default, and keep the other
      two as fallback. This needs a code change to the built-in server list and its host permission.
- [ ] **Option 3.** Launch unlisted, or to trusted testers only, first.

Decision: launch publicly with the two community Spaces as they are. The owner accepts the risk.
Date: 2026-11-26
Notes (replies from Space owners, expected load): ____________________

## 6. Confirm the QUEEN licence

- [ ] Read the model card for `princeton-nlp/queen_pawn-8` and the terms of its components.
- [ ] Confirm they allow this use: a public extension that sends positions to hosted copies of the model.
- [ ] If the terms name a licence, update the "Licence status of QUEEN" paragraph in `LICENSE`. It currently says
      that no blanket licence is asserted for the combined weights.

Checked on 2026-11-26: the model card for `princeton-nlp/queen_pawn-8` declares no licence. Its base model is
`HuggingFaceTB/SmolLM3-3B` (Apache-2.0), and it also includes LC0 BT5 board-encoder weights. The extension ships none of
these weights; it only sends positions to hosted Spaces. Asking Princeton NLP (for example, in the model's Community
tab) is still the owner's call.

Confirmed by: ____________________ Date: ____________________

## 7. Sign the live check

- [x] Live chess.com check on the release build. Done: `docs/live-checklist.md` holds the owner-signed record for
      build 1.0.0 (Game Review, Explain 15.Nf3, 2026-11-19).
- [ ] If the position-reading code for chess.com changes again before upload, repeat the check on that build and add
      a new signed record. The earlier records stay as they are.
- [ ] Optional: a live lichess check (analysis board, a study, and a finished game), recorded the same way.
