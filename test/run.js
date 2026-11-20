// Evidence harness: unit tests (jsdom) + E2E (Playwright Chromium with the unpacked extension,
// fixture pages and a mocked QUEEN Space). Usage: node test/run.js <round>
// Writes docs/review/evidence/round-<N>/{report.json, log.txt, *.png}.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");
const { chromium } = require("playwright");
const { SITES, sse, hugging, boneylandSuccess } = require("./fixtures");

const ROOT = path.resolve(__dirname, "..");
const ROUND = process.argv[2] || "dev";
const OUT = path.join(ROOT, "docs/review/evidence", `round-${ROUND}`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const log = [];
const say = (s) => { log.push(s); console.log(s); };
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? undefined : detail });
  say(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- static checks
function staticChecks() {
  say("\n## Static");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const js = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory() && !["node_modules", "test", "docs", ".git", "dist"].includes(e.name)) walk(p);
    else if (e.name.endsWith(".js")) js.push(p);
  });
  walk(ROOT);
  for (const f of js) {
    let ok = true, err;
    try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); } catch (e) { ok = false; err = String(e.stderr); }
    check(`syntax ${path.relative(ROOT, f)}`, ok, err);
  }
  const src = js.map((f) => fs.readFileSync(f, "utf8")).join("\n");
  check("manifest_version is 3", manifest.manifest_version === 3);
  check("no remote code (eval / new Function / remote <script>)", !/\beval\(|new Function\(|<script[^>]+src=["']https?:/.test(src));
  for (const perm of manifest.permissions || []) check(`permission "${perm}" is used`, src.includes(`chrome.${perm}`));
  results.push({ name: "info: host_permissions", ok: true, detail: manifest.host_permissions });
  say(`INFO  host_permissions: ${JSON.stringify(manifest.host_permissions)}`);
  say(`INFO  content_scripts.matches: ${JSON.stringify(manifest.content_scripts.map((c) => c.matches))}`);
}

// ---------------------------------------------------------------- unit tests
function contentWindow(html, url) {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  // jsdom has no layout: give cg-board its fixture size so square math works.
  dom.window.Element.prototype.getBoundingClientRect = function () {
    const w = parseFloat(this.style?.width) || 0, h = parseFloat(this.style?.height) || 0;
    return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 };
  };
  for (const f of ["common.js", "lichess.js", "chesscom.js"]) dom.window.eval(fs.readFileSync(path.join(ROOT, "content", f), "utf8"));
  return dom.window;
}

function unitTests() {
  say("\n## Unit");
  const w = contentWindow("<body></body>", "https://lichess.org/");
  const AQ = w.AQ;
  const eq = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, want: b });
  eq("cleanSan strips annotations", AQ.cleanSan("Nf3!?"), "Nf3");
  eq("cleanSan normalizes 0-0+", AQ.cleanSan("0-0+"), "O-O");
  eq("cleanSan keeps promotion", AQ.cleanSan("e8=Q#"), "e8=Q");
  eq("sameMove ignores check marks", AQ.sameMove("Qxf7#", "Qxf7"), true);
  const startPieces = {};
  "RNBQKBNR".split("").forEach((p, i) => { const f = "abcdefgh"[i]; startPieces[f + 1] = p; startPieces[f + 8] = p.toLowerCase(); startPieces[f + 2] = "P"; startPieces[f + 7] = "p"; });
  const afterE4 = { ...startPieces, e4: "P" }; delete afterE4.e2;
  const b = AQ.boardFromPieces(afterE4, ["e4", "e2"]);
  eq("boardFromPieces: side + ep after 1.e4", AQ.fenWithSide(b, b.side), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");
  eq("boardFromPieces: no highlight -> side unknown", AQ.boardFromPieces(startPieces, null).side, null);

  // background.js fixBestMove
  const bg = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const m = /function fixBestMove[\s\S]*?\n}\n/.exec(bg);
  check("background.js defines fixBestMove", !!m);
  if (m) {
    const fixBestMove = new Function(`${m[0]}; return fixBestMove;`)();
    eq("fixBestMove prefers the move named in the prose", fixBestMove({ move_source: "promising_or_analysis", best_move_san: "d5", analysis: "The best move is 3...Be7, developing." }).best_move_san, "Be7");
    eq("fixBestMove keeps a structured best move", fixBestMove({ move_source: "best_move", best_move_san: "Nf3", analysis: "The best move is e4" }).best_move_san, "Nf3");
  }

  // Adapters on fixtures
  for (const [name, site] of Object.entries(SITES)) {
    const win = contentWindow(site.html, site.url);
    let pos, err;
    try { pos = win.AQ.readPosition(); } catch (e) { err = e.message; }
    if (!site.expect) { check(`adapter ${name}: no board -> null`, pos === null, pos); continue; }
    check(`adapter ${name}: moves`, !err && JSON.stringify(pos?.moves) === JSON.stringify(site.expect.moves), { got: pos?.moves, err });
    if ("side" in site.expect) check(`adapter ${name}: side to move`, pos?.board?.side === site.expect.side, { got: pos?.board?.side });
    if (site.expect.fenPrefix) {
      const fen = win.AQ.fenWithSide(pos.board, pos.board.side);
      check(`adapter ${name}: FEN`, fen.startsWith(site.expect.fenPrefix), { got: fen });
    }
  }
}

// ---------------------------------------------------------------- E2E
const sseOf = (event, data) => `event: heartbeat\ndata: null\n\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const SCENARIOS = {
  success: { boneyland: () => sseOf("complete", [boneylandSuccess]) },
  agree: { boneyland: () => sseOf("complete", [{ ...boneylandSuccess, best_move_san: "Bc4", best_move_uci: "f1c4" }]) },
  truncated: { boneyland: () => sse("boneyland-truncated.sse") },
  quota: {
    boneyland: () => sseOf("error", { error: "You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token for more quota - https://huggingface.co/settings/tokens" }),
    "hugging-apps": () => sseOf("error", { error: "You have exceeded your ZeroGPU runs limit. Authenticate with a Hugging Face token for more quota - https://huggingface.co/settings/tokens" }),
  },
  fallback: { boneyland: 503, "hugging-apps": () => sseOf("complete", hugging) },
  gameover: { boneyland: () => sseOf("error", { error: "The game is already over: 1-0" }) },
  xss: { boneyland: () => sseOf("complete", [{ ...boneylandSuccess, analysis: "**Bold** <img src=x onerror=\"window.__xss=1\"> <script>window.__xss=2</script>" }]) },
};

async function e2e() {
  say("\n## E2E");
  const exe = [chromium.executablePath(), `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`].find((p) => fs.existsSync(p));
  const ctx = await chromium.launchPersistentContext("", {
    executablePath: exe, headless: true, viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
  });
  let scenario = "success", delay = 1500;
  const calls = [];
  // Several fixtures share a URL, so serve whichever fixture open() asked for.
  let currentSite = null;
  await ctx.route(/^https:\/\/(lichess\.org|www\.chess\.com)\//, (r) =>
    r.request().resourceType() === "document" ? r.fulfill({ contentType: "text/html", body: SITES[currentSite].html }) : r.fulfill({ status: 404, body: "" }));
  await ctx.route(/\.hf\.space\//, async (route) => {
    const req = route.request(), url = new URL(req.url());
    const space = url.hostname.startsWith("boneyland") ? "boneyland" : "hugging-apps";
    const plan = SCENARIOS[scenario][space];
    calls.push({ space, method: req.method(), path: url.pathname, body: req.postData(), auth: req.headers().authorization || null });
    if (plan === undefined || typeof plan === "number") return route.fulfill({ status: plan || 503, body: "unavailable" });
    if (req.method() === "POST") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ event_id: `mock-${scenario}` }) });
    await sleep(delay);
    return route.fulfill({ contentType: "text/event-stream", body: plan() });
  });

  let sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker"));
  const extId = new URL(sw.url()).host;

  // Drive the closed shadow root from the extension's isolated world (chrome.dom.openOrClosedShadowRoot).
  async function open(siteName) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const cdp = await ctx.newCDPSession(page);
    const worlds = [];
    cdp.on("Runtime.executionContextCreated", (e) => { if (e.context.auxData?.type === "isolated" && e.context.name === "Ask Queen") worlds.push(e.context.id); });
    await cdp.send("Runtime.enable");
    currentSite = siteName;
    await page.goto(SITES[siteName].url);
    await sleep(2200);
    const ui = async (body) => {
      const expression = `(async () => { const host = [...document.documentElement.children].find((e) => chrome.dom.openOrClosedShadowRoot(e)); const R = host && chrome.dom.openOrClosedShadowRoot(host); ${body} })()`;
      for (const id of worlds.slice().reverse()) {
        const r = await cdp.send("Runtime.evaluate", { expression, contextId: id, awaitPromise: true, returnByValue: true }).catch(() => null);
        if (r && !r.exceptionDetails) return r.result.value;
      }
      throw new Error("extension world not found");
    };
    const click = (text) => ui(`const b = [...R.querySelectorAll("button")].find((b) => !b.closest("[hidden]") && b.getClientRects().length > 0 && b.textContent.replace(/^\\W+/, "").trim().startsWith(${JSON.stringify(text)})); if (!b) return false; b.click(); return true;`);
    const state = () => ui(`return { fab: !!R.querySelector(".fab") && !R.querySelector(".fab").hidden, panel: !!R.querySelector(".panel") && !R.querySelector(".panel").hidden, text: (R.querySelector(".panel")?.innerText || "").slice(0, 20000) };`);
    return { page, errors, ui, click, state };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const lastPost = () => calls.filter((c) => c.method === "POST").at(-1);
  const postedData = () => { try { return JSON.parse(lastPost().body).data; } catch { return null; } };
  const waitFor = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(200); } return false; };

  // 1. lichess analysis: button, panel, explain flow
  {
    const s = await open("lichess-analysis");
    check("lichess: floating button visible", (await s.state()).fab);
    await shot(s.page, "01-lichess-button");
    await s.click("Ask Queen");
    await sleep(500);
    const st = await s.state();
    check("lichess: panel opens and names the selected move", st.panel && /3\.Bc4/.test(st.text), st.text.slice(0, 200));
    await shot(s.page, "02-lichess-ask");

    scenario = "success"; calls.length = 0;
    await s.click("Explain");
    await sleep(600);
    check("thinking state shown", /thinking/i.test((await s.state()).text));
    await shot(s.page, "03-thinking");
    await waitFor(async () => /prefers|agrees/i.test((await s.state()).text));
    const d = postedData();
    check("explain sends the position BEFORE the selected move", d && d[1] === "e4 e5 Nf3 Nc6", d);
    check("explain sends the standard start FEN", d && /^rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1$/.test(d[0]), d && d[0]);
    check("result: disagreement headline", /Queen prefers/.test((await s.state()).text), (await s.state()).text.slice(0, 300));
    await shot(s.page, "04-result-disagree");

    scenario = "agree";
    await s.click("Ask again");
    await waitFor(async () => /agrees/i.test((await s.state()).text));
    check("result: agreement headline", /Queen agrees/.test((await s.state()).text));
    await shot(s.page, "05-result-agree");

    scenario = "success"; calls.length = 0;
    await s.click("Best move for");
    await waitFor(async () => /Queen plays/i.test((await s.state()).text));
    check("best-move mode sends all moves", postedData()?.[1] === "e4 e5 Nf3 Nc6 Bc4", postedData());

    scenario = "truncated";
    await s.click("Explain");
    await waitFor(async () => /length limit|prefers|agrees/i.test((await s.state()).text));
    check("truncated answer: notes the length limit", /length limit/i.test((await s.state()).text));
    check("truncated answer: best move repaired from prose (Be7)", /Be7/.test((await s.state()).text));
    await shot(s.page, "06-truncated");

    scenario = "quota";
    await s.click("Explain");
    await waitFor(async () => /quota/i.test((await s.state()).text));
    check("quota error: plain-language message", /quota/i.test((await s.state()).text));
    await shot(s.page, "07-quota-error");

    scenario = "fallback"; calls.length = 0;
    await s.click("Try again");
    await waitFor(async () => /prefers|agrees|plays/i.test((await s.state()).text), 10000);
    check("fallback: primary fails, backup answers", calls.some((c) => c.space === "boneyland") && calls.some((c) => c.space === "hugging-apps" && c.method === "GET") && /prefers|agrees|plays/i.test((await s.state()).text), calls.map((c) => `${c.space} ${c.method}`));
    await shot(s.page, "08-fallback-result");

    scenario = "gameover";
    await s.click("Ask again");
    await waitFor(async () => /already over/i.test((await s.state()).text));
    check("game-over error explained", /already over/i.test((await s.state()).text));
    await shot(s.page, "09-game-over");

    scenario = "xss";
    await s.click("Try again");
    await waitFor(async () => /prefers|agrees/i.test((await s.state()).text));
    await sleep(500);
    const xss = await s.ui(`return { flag: window.__xss || null, imgs: R.querySelectorAll(".md img, .md script").length, bold: !!R.querySelector(".md strong") };`);
    check("model text is escaped (no injected img/script, no execution)", xss.imgs === 0 && xss.flag === null && xss.bold, xss);

    // Cancel aborts the request
    scenario = "success"; delay = 4000; calls.length = 0;
    await s.click("Ask again");
    await sleep(500);
    await s.click("Cancel");
    await sleep(300);
    check("cancel returns to idle", !/thinking/i.test((await s.state()).text));
    delay = 1500;

    await s.page.keyboard.press("Escape");
    await sleep(300);
    check("Escape closes the panel", !(await s.state()).panel);
    check("lichess analysis: no page errors", s.errors.length === 0, s.errors);
    await s.page.close();
  }

  // 2. variation + round + custom FEN: request built from the right input
  for (const [site, label, want] of [
    ["lichess-variation", "variation", (d) => d[1] === "e4 e5 Bc4"],
    ["lichess-round", "round view", (d) => d[1] === "e4"],
  ]) {
    const s = await open(site);
    await s.click("Ask Queen"); await sleep(400);
    scenario = "success"; calls.length = 0;
    await s.click("Explain");
    await waitFor(async () => /prefers|agrees/i.test((await s.state()).text));
    check(`lichess ${label}: explain sends correct moves`, want(postedData() || []), postedData());
    await shot(s.page, `10-lichess-${site.split("-")[1]}`);
    await s.page.close();
  }
  {
    const s = await open("lichess-custom-fen");
    await s.click("Ask Queen"); await sleep(400);
    scenario = "success"; calls.length = 0;
    await s.click("Best move");
    await waitFor(async () => /plays|prefers/i.test((await s.state()).text));
    check("lichess custom start: sends the exact FEN, no moves", postedData()?.[0] === "4k3/8/8/8/8/8/4P3/3K4 b - - 0 1" && postedData()?.[1] === "", postedData());
    await s.page.close();
  }

  // 3. Side picker when side to move is unknown
  {
    const s = await open("lichess-board-only");
    await s.click("Ask Queen"); await sleep(400);
    check("side picker shown when side is unknown", /Who is to move/i.test((await s.state()).text), (await s.state()).text.slice(0, 300));
    await shot(s.page, "11-side-picker");
    await s.click("Black to play"); await sleep(200);
    scenario = "success"; calls.length = 0;
    await s.click("Best move for Black");
    await waitFor(async () => /plays|prefers/i.test((await s.state()).text));
    check("side picker: chosen side is sent", / b /.test(postedData()?.[0] || ""), postedData());
    await shot(s.page, "12-board-fallback-result");
    await s.page.close();
  }

  // 4. chess.com review
  {
    const s = await open("chesscom-review");
    check("chess.com: floating button visible", (await s.state()).fab);
    await s.click("Ask Queen"); await sleep(400);
    check("chess.com: panel names 3.Bc4", /3\.Bc4/.test((await s.state()).text));
    await shot(s.page, "13-chesscom-ask");
    scenario = "success"; calls.length = 0;
    await s.click("Explain");
    await waitFor(async () => /prefers|agrees/i.test((await s.state()).text));
    check("chess.com: explain sends moves before 3.Bc4", postedData()?.[1] === "e4 e5 Nf3 Nc6", postedData());
    await shot(s.page, "14-chesscom-result");
    check("chess.com: no page errors", s.errors.length === 0, s.errors);
    await s.page.close();
  }

  // 5. No board -> no button
  {
    const s = await open("lichess-no-board");
    check("no board: button hidden", !(await s.state()).fab);
    await s.page.close();
  }

  // 6. Options page + token is sent
  {
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/options.html`);
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, "15-options.png") });
    check("options page renders", (await page.content()).length > 200);
    await sw.evaluate(() => chrome.storage.local.set({ token: "hf_testtoken" }));
    const s = await open("lichess-analysis");
    await s.click("Ask Queen"); await sleep(400);
    scenario = "success"; calls.length = 0;
    await s.click("Explain");
    await waitFor(async () => /prefers|agrees/i.test((await s.state()).text));
    check("HF token sent as Bearer to the Space", calls.some((c) => c.auth === "Bearer hf_testtoken"), calls.map((c) => c.auth));
    await sw.evaluate(() => chrome.storage.local.remove("token"));
    await s.page.close(); await page.close();
  }
  await ctx.close();
}

(async () => {
  const t0 = Date.now();
  staticChecks();
  unitTests();
  try { await e2e(); } catch (e) { check("E2E harness completed", false, e.stack); }
  const failed = results.filter((r) => !r.ok);
  say(`\n${results.length - failed.length}/${results.length} passed, ${failed.length} failed in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ round: ROUND, date: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, results }, null, 2));
  fs.writeFileSync(path.join(OUT, "log.txt"), log.join("\n"));
  process.exit(failed.length ? 1 : 0);
})();
