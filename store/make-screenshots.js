#!/usr/bin/env node
// Renders the Chrome Web Store screenshots to store/screenshots/ at exactly 1280×800 (see store/screenshots.md).
// Dev-only; nothing in store/ ships. The unpacked extension runs in the tests' Chromium on a plain fixture page,
// and the tests' mocked server answers with the recorded reply, so every panel in the shots is the real one.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch } = require("../test/browser");
const { createMock, HOSTS } = require("../test/mock");
const F = require("../test/fixtures");
require("../content/chess.js");

const OUT = path.join(__dirname, "screenshots");
const SITE = "https://lichess.org/analysis"; // an address the extension runs on; the page served there is ours
// The recorded reply answers the position after 3...Nd4. The moves after it only fill the list.
const GAME = [...F.RECORDED_MOVES, ..."O-O Nxf3+ Qxf3 Nf6 d4 d6 dxe5 dxe5 Rd1 Bd6 Bg5 O-O Nc3 c6 Rd3 Qe7 Rad1 Bc7".split(" ")];
const PIECE = { k: ["king", "♚"], q: ["queen", "♛"], r: ["rook", "♜"], b: ["bishop", "♝"], n: ["knight", "♞"], p: ["pawn", "♟"] };
const SQ = 80;
const CSS = `
  body { margin: 0; display: flex; gap: 24px; padding: 80px 0 0 40px; background: #e9e6e1; color: #2a2630; font: 15px/1 system-ui, -apple-system, sans-serif; }
  cg-board { display: block; position: relative; width: ${8 * SQ}px; height: ${8 * SQ}px; border-radius: 6px; overflow: hidden; box-shadow: 0 10px 30px rgba(40, 30, 50, .18);
    background: conic-gradient(#a79fb5 25%, #ebe7ee 0 50%, #a79fb5 0 75%, #ebe7ee 0) 0 0 / ${2 * SQ}px ${2 * SQ}px; }
  piece, square { position: absolute; left: 0; top: 0; width: ${SQ}px; height: ${SQ}px; }
  square { background: rgba(217, 180, 95, .6); }
  piece { text-align: center; font: ${SQ * .8}px/${SQ}px "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif; color: #2a2630; }
  piece.white { color: #fff; -webkit-text-stroke: 3px #2a2630; paint-order: stroke fill; }
  ${Object.values(PIECE).map(([role, glyph]) => `.${role}::before { content: "${glyph}\\FE0E"; }`).join(" ")}
  aside { width: 160px; height: ${8 * SQ}px; box-sizing: border-box; padding: 18px 16px; border-radius: 6px; background: #f7f5f2; box-shadow: 0 10px 30px rgba(40, 30, 50, .1); }
  h1 { margin: 0 0 12px; font-size: 13px; font-weight: 600; color: #7a7384; }
  .tview2 { display: grid; grid-template-columns: 26px 1fr 1fr; gap: 2px 0; }
  index { padding: 7px 0; color: #9a94a3; }
  move { padding: 7px 8px; border-radius: 5px; }
  move.active { background: #2a2630; color: #fff; }`;

// The page after `ply` moves of GAME, that move selected, in the markup the extension's adapter reads.
function fixture(ply, last) {
  const at = (sq) => `style="transform:translate(${"abcdefgh".indexOf(sq[0]) * SQ}px,${(8 - sq[1]) * SQ}px)"`;
  const fen = AQChess.replay(F.START, GAME.slice(0, ply));
  const pieces = Object.entries(F.expand(fen)).map(([sq, p]) => `<piece class="${p < "a" ? "white" : "black"} ${PIECE[p.toLowerCase()][0]}" ${at(sq)}></piece>`);
  const moves = GAME.map((san, i) => `${i % 2 ? "" : `<index>${i / 2 + 1}</index>`}<move p="${"aa".repeat(i + 1)}"${i === ply - 1 ? ' class="active"' : ""}><san>${san}</san></move>`);
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Game analysis</title><style>${CSS}</style>
    <body><main class="analyse"><cg-board>${last.map((sq) => `<square class="last-move" ${at(sq)}></square>`).join("")}${pieces.join("")}</cg-board></main>
    <aside><h1>Moves</h1><div class="tview2">${moves.join("")}</div></aside></body></html>`;
}

(async () => {
  if (!AQChess.replay(F.START, GAME)) throw new Error("GAME has an illegal move");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ask-queen-shots-"));
  const mock = await createMock(temp);
  const ctx = await launch(path.join(temp, "profile"), path.join(__dirname, ".."), mock.args);
  try {
    let html = "";
    await ctx.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (HOSTS.has(url.hostname) || url.protocol === "chrome-extension:") return route.continue();
      return url.href === SITE ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html }) : route.abort();
    });
    const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    const ui = (name) => page.locator(`[data-testid="aq-${name}"]`);
    const save = async (name) => {
      await page.mouse.move(600, 780); // off the panel, so no button is drawn hovered
      await page.screenshot({ path: path.join(OUT, name + ".png"), animations: "disabled" });
      console.log(name + ".png");
    };
    // Opens the fixture page and the panel. With `ask`, clicks that button and scrolls the panel to the answer.
    async function open(ply, last, ask, firstUseSeen = true) {
      html = fixture(ply, last);
      await sw.evaluate((prefs) => chrome.storage.local.set(prefs), { primary: "boneyland", dock: "right", firstUseSeen });
      await page.goto(SITE);
      await ui("launcher").click();
      await ui("panel").waitFor();
      if (!ask) return;
      await ui(ask).click();
      await page.locator('[data-testid="aq-out"][data-state="result"]').waitFor();
      await ui("out").evaluate((out) => { out.parentElement.scrollTop = out.offsetTop - out.parentElement.offsetTop + 1; });
    }
    fs.mkdirSync(OUT, { recursive: true });
    await open(6, ["c6", "d4"], "best");
    await save("01-best-move");
    await open(7, ["e1", "g1"], "explain");
    await save("02-explain-move");
    await open(7, ["e1", "g1"]);
    await save("03-ask");
    await open(7, ["e1", "g1"], null, false);
    await save("04-first-use");
    console.log("Rendered with Chromium " + ctx.browser()?.version());
  } finally {
    await ctx.close();
    await mock.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})();
