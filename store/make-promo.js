#!/usr/bin/env node
// Renders store/promo-tile.html to store/promo-440x280.png at exactly 440×280. Dev-only; nothing in store/ ships.
// Uses the Playwright already installed for the tests. Set PROMO_CHROMIUM to a Chromium binary if Playwright's
// own browser build isn't installed.
const path = require("node:path");
const { chromium } = require("../test/node_modules/playwright");

(async () => {
  const browser = await chromium.launch(process.env.PROMO_CHROMIUM ? { executablePath: process.env.PROMO_CHROMIUM } : {});
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "promo-tile.html"));
  await page.screenshot({ path: path.join(__dirname, "promo-440x280.png") });
  console.log("promo-440x280.png rendered with Chromium " + browser.version());
  await browser.close();
})();
