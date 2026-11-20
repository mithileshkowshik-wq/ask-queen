# Owner to-do before submitting

Steps only the owner can do. Tick each one and fill in the blanks. Nothing here is shipped in the extension zip.

## 1. Host the privacy policy at a public URL

- [ ] Publish `PRIVACY.md` at a public address that needs no login.
- [ ] If that address is not `https://github.com/ask-queen/ask-queen/blob/main/PRIVACY.md`, update it in two places:
      `PRIVACY_URL` at the top of `content/panel.js`, and the footer link in `options.html`.
- [ ] Check the contact link at the end of `PRIVACY.md` and replace it if issues are not open at that address.
- [ ] Paste the URL into the dashboard's Privacy practices tab.

Privacy policy URL: ____________________

## 2. Set `homepage_url`

- [ ] `manifest.json` has the placeholder `https://github.com/ask-queen/ask-queen`. Create that repository or change
      the value to the real home page. A test asserts the current value, so change the test with it.

Home page: ____________________

## 3. Create the developer account

- [ ] Register at the Chrome Web Store developer dashboard (one-time registration fee) and verify the contact email.
- [ ] Decide the publisher name shown on the listing.
- [ ] Replace "The Ask Queen authors" in `LICENSE` with the copyright holder's name if you want one named.

## 4. Upload the dashboard draft

- [ ] Run the tests: `cd test && npm test`.
- [ ] Build the zip: `sh scripts/package.sh`, which writes `dist/ask-queen-<version>.zip`.
- [ ] Upload the zip as a draft.
- [ ] Listing tab: paste from `store/listing.md`. Upload `icons/128.png`, `store/promo-440x280.png`, and up to five
      1280×800 screenshots from the latest `docs/review/evidence/round-N/`.
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

Decision: ____________________
Date: ____________________
Notes (replies from Space owners, expected load): ____________________

## 6. Confirm the QUEEN licence

- [ ] Read the model card for `princeton-nlp/queen_pawn-8` and the terms of its components.
- [ ] Confirm they allow this use: a public extension that sends positions to hosted copies of the model.
- [ ] If the terms name a licence, update the "Licence status of QUEEN" paragraph in `LICENSE`. It currently says
      that no blanket licence is asserted for the combined weights.

Confirmed by: ____________________ Date: ____________________

## 7. Sign the live check

- [ ] Open `docs/live-checklist.md`. The chess.com check from 2026-11-19 is transcribed there from chat and marked
      "owner signature pending".
- [ ] Repeat the check on the release build (1.0.0), fill in the row, and sign it. The live chess.com check is
      mandatory. A live lichess check is optional.
