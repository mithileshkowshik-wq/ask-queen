const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const { createMock, HOSTS } = require("./mock");
const { selectors, uiFor } = require("./ui");
const { SITES, XSS, START, OPENING, RECORDED_FEN, RECORDED_MOVES } = require("./fixtures");
const { fakeLanguageModel, BONY_REPLY, bony } = require("./format");

const WAIT = 7000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, timeout = WAIT) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await fn();
    if (result) return result;
    await sleep(20);
  }
  throw new Error("Condition was not reached within " + timeout + " ms");
}

function browserPath() {
  if (fs.existsSync(chromium.executablePath())) return undefined;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH !== "0" && process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(os.homedir(), process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright");
  if (!fs.existsSync(cache)) throw new Error("Playwright Chromium is missing");
  const installs = fs.readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => +b.split("-")[1] - +a.split("-")[1]);
  for (const install of installs) {
    const dir = path.join(cache, install);
    const binary = fs.readdirSync(dir, { recursive: true }).find((f) => {
      const name = path.basename(f);
      if (!["chrome", "chrome.exe", "Google Chrome for Testing", "Chromium"].includes(name)) return false;
      return fs.statSync(path.join(dir, f)).isFile();
    });
    if (binary) return path.join(dir, binary);
  }
  throw new Error("No Playwright Chromium executable in " + cache);
}
function launch(dir, extension, args = []) {
  const executablePath = browserPath();
  return chromium.launchPersistentContext(dir, {
    ...(executablePath ? { executablePath } : { channel: "chromium" }), headless: true,
    viewport: { width: 1280, height: 800 }, timeout: 15000, ignoreHTTPSErrors: true,
    ignoreDefaultArgs: ["--disable-extensions", "--disable-background-timer-throttling"],
    args: ["--disable-extensions-except=" + extension, "--load-extension=" + extension, ...args],
  });
}
const worker = (ctx) => ctx.serviceWorkers()[0] || ctx.waitForEvent("serviceworker", { timeout: WAIT });

async function launchedSmoke(extension, temp) {
  const ctx = await launch(path.join(temp, "zip-profile"), extension);
  try {
    const sw = await worker(ctx);
    const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
    assert.equal(manifest.version, "1.0.0");
    assert.equal(await sw.evaluate(() => chrome.i18n.getMessage("extName")), "Ask Queen", "the zip's _locales/en loads");
    const page = await ctx.newPage();
    await page.goto(new URL("options.html", sw.url()).href);
    assert.match(await page.title(), /Ask Queen/i);
  } finally { await ctx.close(); }
}

// Evaluates in the content scripts' isolated world: a function, or an expression string (to embed test data).
async function isolated(page, cb) {
  const session = await page.context().newCDPSession(page);
  const ids = [];
  session.on("Runtime.executionContextCreated", ({ context }) => {
    if (context.auxData?.type === "isolated") ids.push(context.id);
  });
  await session.send("Runtime.enable");
  try {
    let contextId;
    await until(async () => {
      for (const id of ids) {
        const result = await session.send("Runtime.evaluate", { contextId: id, returnByValue: true,
          expression: "typeof AQ !== 'undefined' && !!globalThis.chrome?.runtime?.id" }).catch(() => null);
        if (result?.result.value) { contextId = id; return true; }
      }
      return false;
    });
    const { result, exceptionDetails } = await session.send("Runtime.evaluate", { contextId,
      expression: typeof cb === "string" ? cb : "(" + cb.toString() + ")()", awaitPromise: true, returnByValue: true });
    assert(!exceptionDetails, exceptionDetails?.exception?.description);
    return result.value;
  } finally { await session.detach(); }
}

async function navigate(page, id) {
  const fixture = SITES[id];
  await page.evaluate(({ url, html, id }) => {
    const target = new DOMParser().parseFromString(html, "text/html");
    history.pushState({}, "", url);
    document.body.replaceChildren(...Array.from(target.body.children));
    document.documentElement.dataset.fixture = id;
  }, { url: fixture.url, html: fixture.html, id });
  assert.equal(await page.locator("html").getAttribute("data-fixture"), id);
}

// axe reaches into the open shadow root through fromShadowDom (a plain nested array would mean iframes).
const axeTarget = (sel) => ({ include: [{ fromShadowDom: [selectors.host, sel] }] });
const seriousOrCritical = (result) => result.violations.filter((v) => ["serious", "critical"].includes(v.impact))
  .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));

async function withAxe(page, cb, arg) {
  // Evaluated over CDP, so the options page's CSP (script-src 'self') does not block it.
  if (!await page.evaluate(() => !!window.axe)) await page.evaluate(fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
  return page.evaluate(cb, arg);
}

async function axeProof(page) {
  const result = await withAxe(page, async ({ panel, host, close }) => {
    const r = document.querySelector(host).shadowRoot;
    const dialog = r.querySelector(panel);
    const control = dialog.querySelector(close);
    const unnamed = document.createElement("button");
    unnamed.id = "aq-axe-unnamed";
    control.id = "aq-axe-known";
    dialog.append(unnamed);
    try {
      return await axe.run({ include: [{ fromShadowDom: [host, panel] }] }, { runOnly: ["button-name"] });
    } finally {
      unnamed.remove();
      control.removeAttribute("id");
    }
  }, { panel: selectors.panel, host: selectors.host, close: selectors.close });
  const lists = (nodes, id) => nodes.some((node) => (JSON.stringify(node.target) + node.html).includes(id));
  assert(result.passes.some((r) => r.id === "button-name" && lists(r.nodes, "aq-axe-known")), "axe sees known shadow control");
  assert(result.violations.some((r) => r.id === "button-name" && lists(r.nodes, "aq-axe-unnamed")),
    "axe detects deliberately unnamed shadow control");
}

async function runBrowser(extension, temp, out, test, packaged) {
  const aes = [], outside = [], uncaught = [];
  const mock = await createMock(temp);
  let ctx;
  try {
    ctx = await launch(path.join(temp, "e2e-profile"), extension, mock.args);
    ctx.setDefaultTimeout(WAIT);
    await ctx.route("**/*", async (route) => {
      const req = route.request(), url = new URL(req.url());
      if (HOSTS.has(url.hostname)) return route.continue();
      if (url.protocol === "chrome-extension:") return route.continue();
      const id = url.searchParams.get("aqFixture");
      url.searchParams.delete("aqFixture");
      if (id && SITES[id]?.url === url.href && req.resourceType() === "document") {
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: SITES[id].html });
      }
      if (req.resourceType() !== "favicon" && url.pathname !== "/favicon.ico") outside.push(req.url());
      return route.abort();
    });
    const sw = await worker(ctx);
    const browser = ctx.browser();
    await test("Chromium major equals the manifest minimum_chrome_version", async () => {
      const actual = browser?.version() || await sw.evaluate(() => navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1]);
      const { minimum_chrome_version: minimum } = require("../manifest.json");
      assert.equal(actual.split(".")[0], minimum, actual);
    });

    let id = 0;
    async function setup(plan = "ok", settings = {}) {
      mock.setPlan(plan);
      const running = await worker(ctx);
      await running.evaluate(({ sequence, settings }) => chrome.storage.local.set({
        primary: "boneyland", firstUseSeen: true, token: "", tokenFor: [`https://cache-${sequence}.hf.space`],
        dock: "right", ...settings,
      }), { sequence: ++id, settings });
      return { since: mock.calls.length };
    }
    async function withPage(id, fn, options = {}) {
      const page = await ctx.newPage();
      page.on("pageerror", (err) => uncaught.push({ id, message: err.message }));
      try {
        if (options.viewport) await page.setViewportSize(options.viewport);
        if (options.instrument) await page.addInitScript(options.instrument);
        const url = new URL(SITES[id].url);
        url.searchParams.set("aqFixture", id);
        await page.goto(url.href, { waitUntil: "domcontentloaded" });
        assert.equal(await page.locator("html").getAttribute("data-fixture"), id);
        const ui = uiFor(page);
        await ui("host").waitFor({ state: "attached" });
        return await fn(page, ui);
      } finally { await page.close(); }
    }
    const posts = (since) => mock.calls.slice(since).filter((r) => r.method === "POST");
    const get = (since, server = "boneyland") => mock.calls.slice(since).find((r) => r.method === "GET" && r.server === server);
    const output = (ui, state, timeout) => until(async () => await ui("out").isVisible() &&
      await ui("out").getAttribute("data-state") === state, timeout);
    const code = async (ui, expected, timeout) => {
      await output(ui, "error", timeout);
      assert.equal(await ui("out").getAttribute("data-code"), expected);
      assert.equal(await ui("error").getAttribute("role"), "alert");
      assert.equal(await ui("error-details").getAttribute("open"), null);
      assert(await ui("error-action").isVisible());
    };

    async function shot(page, name) {
      await page.screenshot({ path: path.join(out, name + ".png"), animations: "disabled" });
      const ui = uiFor(page);
      const target = await ui("panel").isVisible() ? selectors.panel : await ui("launcher").isVisible() ? selectors.launcher : null;
      if (target) {
        try {
          // axe leaves colour contrast "incomplete" for a shadow host on <html>, so the scan runs with it in <body>.
          const result = await withAxe(page, async ({ context, host }) => {
            const el = document.querySelector(host);
            document.body.append(el);
            try { return await axe.run(context); } finally { document.documentElement.append(el); }
          }, { context: axeTarget(target), host: selectors.host });
          const failures = seriousOrCritical(result);
          if (failures.length) aes.push({ state: name, failures });
        } catch (err) { aes.push({ state: name, error: err.message.split("\n")[0] }); }
      }
    }

    async function clickAsk(ui, e) {
      if (e.choose) {
        assert(await ui("best").isDisabled());
        await ui("side-" + e.choose.toLowerCase()).click();
      }
      const button = ui(e.explain ? "explain" : "best");
      assert.match(await button.textContent(), e.explain ? /^Explain / : /^Best move for (White|Black)$/);
      if (e.explain) assert.equal(await button.textContent(), "Explain " + e.explain);
      await button.click();
    }

    await test("First-use notice and only an explicit click sends a request", async () => {
      const { since } = await setup("ok", { firstUseSeen: false });
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").waitFor();
        await shot(page, "launcher-idle");
        await ui("launcher").click();
        await ui("notice").waitFor();
        assert.match(await ui("notice").textContent(), /community servers/i);
        await shot(page, "first-use");
        await ui("notice-ok").click();
        assert(await ui("explain").isVisible());
        assert.equal(posts(since).length, 0);
        await shot(page, "ask-move");
        await test("axe reaches named and deliberately unnamed controls in the panel shadow root", () => axeProof(page));
      });
    });

    const stateFor = {
      "lichess-no-board": "no-board", "lichess-in-progress": "direct-in-progress",
      "lichess-variant": "direct-variant", "lichess-puzzle": "direct-puzzle",
      "lichess-start": "ask-start", "lichess-board-side": "ask-side-detected", "lichess-board-unknown": "ask-side-unknown",
      "lichess-disagree": "ask-disagree", "lichess-impossible": "ask-unreadable", "lichess-mate": "ask-game-over",
    };
    for (const [id, { expect: e }] of Object.entries(SITES)) {
      await test("Browser fixture " + id, async () => {
        const { since } = await setup();
        await withPage(id, async (page, ui) => {
          if (e.gate || e.noBoard) {
            await sleep(300);
            assert.equal(await ui("launcher").isVisible(), false);
            assert.equal(await ui("panel").isVisible(), false);
          } else {
            await ui("launcher").click();
            if (e.unreadable) assert.match(await ui("ask").textContent(), e.moving ? /Can't read this board|moving/i : /Can't read this board/i);
            if (e.disagree) assert.match(await ui("disagree").textContent(), /disagree/i);
            if (e.mate) {
              assert.match(await ui("game-over").textContent(), /game is over here/i);
              assert.equal(await ui("best").count(), 0);
              assert(await ui("explain").isVisible());
            }
            if (e.choose) assert(await ui("best").isDisabled());
          }
          if (stateFor[id]) await shot(page, stateFor[id]);
          if (e.fen) {
            await clickAsk(ui, e);
            await output(ui, "result");
            assert.deepEqual(posts(since).map((r) => r.body.data.slice(0, 2)), [[e.fen, e.moves]]);
            if (id === "lichess-recorded") {
              assert.match(await ui("headline").textContent(), /4\.Nxe5/);
              assert.equal((await ui("eval").textContent()).trim().replace(/^Evaluation:?\s*/i, ""),
                "White is better by approximately 1.51 pawns, retaining the extra pawn and a modest space advantage after the best play.");
              assert.match(await ui("line").textContent(), /4\.Nxe5 Qf6 5\.O-O Ne6 6\.d4 d6/);
              await shot(page, "result-evaluation");
            }
          } else {
            await sleep(200);
            assert.equal(posts(since).length, 0);
          }
        });
      });
    }

    for (const [id, state, expected] of [
      ["lichess-in-progress", "navigated-in-progress", /available after the game ends/i],
      ["chesscom-960", "navigated-variant", /only knows standard chess/i],
      ["lichess-puzzle", "navigated-puzzle", /isn't available on puzzles/i],
      ...["live-tab-review", "daily-tab-review", "live-review", "analysis-daily", "analysis-live"].map((id) =>
        ["chesscom-" + id, "navigated-chesscom-" + id, /available after the game ends/i]),
    ]) {
      await test("Open panel navigation gate " + id, async () => {
        const { since } = await setup();
        await withPage(id.startsWith("lichess") ? "lichess-analysis" : "chesscom-review", async (page, ui) => {
          await ui("launcher").click();
          await navigate(page, id);
          await ui("gate").waitFor();
          assert.match(await ui("gate").textContent(), expected);
          assert(!await ui("out").isVisible());
          assert(!await ui("best").isVisible());
          // One Close: the header's (GPT round 5).
          assert.deepEqual(await ui("panel").locator("button:visible").evaluateAll((all) => all.map((b) => b.getAttribute("aria-label") || b.textContent)), ["Close"]);
          await shot(page, state);
          assert.equal(posts(since).length, 0);
        });
      });
    }

    const resultPlans = [
      ["ok", "explain", "result-disagree", /was played.*prefers/],
      ["agree", "explain", "result-agree", /agrees with 3\.Bc4/],
      ["critical_line", "best", "result-best", /Queen plays 3\.\.\.Be7/],
      ["prose", "best", "result-from-text", /Queen plays 3\.\.\.Be7/],
      ["unclear", "best", "result-no-clear-move", /didn't name a clear move/],
      ["truncated", "best", "result-truncated", /didn't name a clear move/],
      ["promising", "best", "result-promising", /didn't name a clear move/],
    ];
    for (const [plan, ask, name, title] of resultPlans) {
      await test("Browser " + name, async () => {
        const { since } = await setup(plan);
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui(ask).click();
          await output(ui, "result");
          assert.match(await ui("headline").textContent(), title);
          if (plan === "prose") assert(await ui("from-text").isVisible());
          if (plan === "promising") {
            assert.match(await ui("suggestion").textContent(), /3\.\.\.Be7 \(unverified\)/);
            assert.equal(await ui("verdict").count(), 0);
            assert.doesNotMatch(await ui("out").textContent(), /\bd5\b.*Queen|Queen plays/);
          }
          if (plan === "truncated") {
            assert.match(await ui("suggestion").textContent(), /3\.\.\.Be7 \(unverified\)/);
            for (const id of ["verdict", "eval", "line"]) assert.equal(await ui(id).count(), 0);
            assert(await ui("truncated").isVisible());
          }
          const expectedMoves = ask === "explain" ? OPENING.slice(0, -1) : OPENING;
          assert.deepEqual(posts(since)[0]?.body.data.slice(0, 2), [START, expectedMoves.join(" ")]);
          await shot(page, name);
          if (plan === "truncated") {
            await ui("other-server").click();
            await output(ui, "result");
            assert.equal(posts(since)[1]?.server, "hugging-apps");
            assert.notEqual(posts(since)[0]?.body.data[4], posts(since)[1]?.body.data[4]);
          }
        });
      });
    }

    await test("Browser cache replay and stale result after a cursor change", async () => {
      const { since } = await setup();
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        await ui("best").click();
        await output(ui, "result");
        assert.match(await ui("result-footer").textContent(), /cached/);
        assert.equal(posts(since).length, 1);
        await shot(page, "result-cached");
        await navigate(page, "lichess-start");
        await ui("stale").waitFor();
        assert.match(await ui("stale").textContent(), /board has moved/i);
        await shot(page, "result-stale");
        // Result order: the analysed position, then the headline, then the stale note and its one action.
        assert.deepEqual(await ui("out").evaluate((out) => ["aq-context", "aq-headline", "aq-stale"].map((id) =>
          [...out.querySelectorAll("[data-testid]")].findIndex((el) => el.dataset.testid === id))
          .every((at, i, all) => at >= 0 && (!i || at > all[i - 1]))), true);
        await ui("stale-reask").click();
        await output(ui, "result");
        assert.deepEqual(posts(since)[1]?.body.data.slice(0, 2), [START, ""]);
      });
    });

    await test("Browser stale Best result whose new position only allows Explain re-asks with Explain", async () => {
      const { since } = await setup();
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        await navigate(page, "lichess-mate");
        await ui("stale").waitFor();
        assert.match(await ui("stale-reask").textContent(), /Explain 2\.\.\.Qh4#/);
        await ui("stale-reask").click();
        await output(ui, "result");
        assert.deepEqual(posts(since)[1]?.body.data.slice(0, 2), [START, "f3 e5 g4"]);
        await shot(page, "result-stale-explain");
      });
    });

    await test("Browser board-fallback result: no move number in the headline, critical line numbered from the asked position (round 5)", async () => {
      const { since } = await setup("board-line");
      await withPage("lichess-board-side", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        assert.equal(posts(since)[0].body.data[0], SITES["lichess-board-side"].expect.fen); // placeholder clocks "0 1"
        assert.equal(await ui("headline").textContent(), "Queen plays e5");
        assert.equal(await ui("line").textContent(), "1...e5 2.Nf3 Nc6");
        assert.equal(await ui("line-note").textContent(), "Numbered from this position");
        await shot(page, "result-board-line");
      });
    });

    await test("Browser result goes stale while the board animates and offers the re-ask within 300 ms of it settling (GPT round 5)", async () => {
      const { since } = await setup();
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        assert(await ui("ask-again").isEnabled());
        await navigate(page, "lichess-animation"); // another position, its piece still in flight
        await sleep(300);
        assert(await ui("stale").isVisible(), "stale while the board moves");
        assert(await ui("ask-again").isDisabled());
        assert(!await ui("stale-reask").isVisible(), "nothing to ask mid-move");
        // Land on a new position and time, inside the page, how long the re-ask takes to appear.
        const took = await page.evaluate(({ html, host, reask }) => new Promise((resolve) => {
          document.body.replaceChildren(...new DOMParser().parseFromString(html, "text/html").body.children);
          const t0 = performance.now(), button = document.querySelector(host).shadowRoot.querySelector(reask);
          const look = () => (!button.hidden || performance.now() - t0 > 2000 ? resolve(performance.now() - t0) : setTimeout(look, 5));
          look();
        }), { html: SITES["lichess-start"].html, host: selectors.host, reask: selectors["stale-reask"] });
        assert(took <= 300, "re-ask after " + Math.round(took) + " ms");
        assert.equal(await ui("stale-reask").textContent(), "Best move for White");
        assert(await ui("ask-again").isDisabled());
        await shot(page, "result-stale-settled");
        await ui("stale-reask").click();
        await output(ui, "result");
        assert.deepEqual(posts(since).map((r) => r.body.data.slice(0, 2)), [[START, OPENING.join(" ")], [START, ""]]);
      });
    });

    await test("Browser Alt+Q command message opens the panel, and the shortcut is shown", async () => {
      await setup();
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").waitFor();
        await page.bringToFront();
        // The command handler's own call, made from the worker the way onCommand makes it.
        await (await worker(ctx)).evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          await chrome.tabs.sendMessage(tab.id, { type: "openPanel" });
        });
        await ui("panel").waitFor();
        // The real binding from getPrefs, in the platform's notation (⌥Q on macOS).
        assert.match(await ui("shortcut").textContent(), process.platform === "darwin" ? /⌥Q/ : /Alt\+Q/);
      });
    });

    await test("Browser staggered SPA move to /analysis that keeps the live board and running clock stays gated", async () => {
      const { since } = await setup();
      await withPage("chesscom-in-progress", async (page, ui) => {
        await sleep(1500);
        assert.equal(await ui("launcher").isVisible(), false);
        // Step 1: only the route changes; the live board and its clock stay mounted.
        await page.evaluate(() => history.pushState({}, "", "/analysis"));
        await sleep(2500);
        assert.equal(await ui("launcher").isVisible(), false, "route changed, live board kept");
        // Step 2: a click (which marks the gate for a recompute) still finds the running clock.
        await page.mouse.click(5, 5);
        await sleep(1500);
        assert.equal(await ui("launcher").isVisible(), false, "after a click");
        assert.equal(posts(since).length, 0);
      });
    });

    await test("Browser SPA move to /analysis that keeps a daily game board stays closed; a new board opens (GPT round 5)", async () => {
      const { since } = await setup();
      await withPage("chesscom-daily", async (page, ui) => {
        await sleep(1500);
        assert.equal(await ui("launcher").isVisible(), false);
        // A daily game has no running clock: only the board element tells it apart from a standalone analysis board.
        await page.evaluate(() => history.pushState({}, "", "/analysis"));
        await sleep(2500);
        assert.equal(await ui("launcher").isVisible(), false, "route changed, daily board kept");
        await page.mouse.click(5, 5);
        await sleep(1500);
        assert.equal(await ui("launcher").isVisible(), false, "after a click");
        assert.equal(posts(since).length, 0);
        // Positive control: the standalone analysis page with its own new board opens and asks.
        await navigate(page, "chesscom-analysis");
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        assert.equal(posts(since).length, 1);
      });
    });

    await test("Browser closed launcher ticks make no layout reads, also across a URL change", async () => {
      await setup();
      await withPage("chesscom-analysis", async (page, ui) => {
        await ui("launcher").waitFor();
        await isolated(page, () => {
          globalThis.aqLayoutReads = 0;
          for (const name of ["getBoundingClientRect", "getClientRects"]) {
            const original = Element.prototype[name];
            Element.prototype[name] = function (...args) { globalThis.aqLayoutReads++; return original.apply(this, args); };
          }
          for (const name of ["offsetWidth", "offsetHeight", "clientWidth", "clientHeight"]) {
            const owner = name.startsWith("offset") ? HTMLElement.prototype : Element.prototype;
            const desc = Object.getOwnPropertyDescriptor(owner, name);
            Object.defineProperty(owner, name, { ...desc, get() { globalThis.aqLayoutReads++; return desc.get.call(this); } });
          }
          return true;
        });
        await sleep(2500); // quiet ticks
        await page.evaluate(() => history.pushState({}, "", "/analysis?tab=analysis"));
        await sleep(2500); // the gate recomputes and the launcher is confirmed
        assert(await ui("launcher").isVisible());
        assert.equal(await isolated(page, () => globalThis.aqLayoutReads), 0);
      });
    });

    await test("Browser closed-panel idle cost stays under 1 ms per second", async () => {
      await setup();
      await withPage("chesscom-live-markup", async (page, ui) => {
        await ui("launcher").waitFor();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Performance.enable");
        const script = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration").value;
        const before = await script(), seconds = 10;
        await sleep(seconds * 1000);
        const perSecond = (await script() - before) * 1000 / seconds;
        const gate = await isolated(page, () => {
          const t0 = performance.now();
          for (let i = 0; i < 1000; i++) AQ.gate();
          return (performance.now() - t0) / 1000;
        });
        const result = { page: "chesscom-live-markup", seconds, scriptMsPerSecond: +perSecond.toFixed(3), gateCallMs: +gate.toFixed(4) };
        fs.writeFileSync(path.join(out, "perf.json"), JSON.stringify(result, null, 2) + "\n");
        await cdp.detach();
        assert(perSecond < 1, JSON.stringify(result));
      });
    });

    // --- Post-round-5 fixes, logic ---
    await test("Browser result row rendered 500 ms after load shows the launcher with no input (Fable round 5)", async () => {
      const { since } = await setup();
      await withPage("chesscom-daily", async (page, ui) => {
        await page.waitForFunction(() => window.aqAppendedAt > 0);
        // The closed panel had already read the in-progress gate (and cached it) when the row arrived.
        assert.equal(await page.evaluate(() => window.aqLauncherBefore), true, "launcher hidden before the result");
        await ui("launcher").waitFor({ timeout: 2000 }); // within the normal one-second tick
        assert.equal(await page.evaluate(() => window.aqInputs), 0, "no click or key press");
        assert.equal(posts(since).length, 0);
      }, { instrument: () => {
        window.aqInputs = 0;
        for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => window.aqInputs++, true);
        // The finished page hydrates late: the result row arrives 500 ms after load.
        addEventListener("load", () => setTimeout(() => {
          window.aqLauncherBefore = document.querySelector('[data-testid="aq-host"]')?.shadowRoot
            ?.querySelector('[data-testid="aq-launcher"]')?.hidden;
          document.querySelector("wc-simple-move-list").insertAdjacentHTML("beforeend", '<div class="game-result">1-0</div>');
          window.aqAppendedAt = performance.now();
        }, 500));
      } });
    });

    for (const error of ["quota", "token_rejected", "unreachable", "asleep", "busy", "illegal_position", "game_over",
      "bad_response", "all_unavailable", "mismatch"]) {
      await test("Browser error " + error, async () => {
        const { since } = await setup(error, error === "token_rejected" ? { token: "hf_RejectedFixture12345" } : {});
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui("best").click();
          await code(ui, error);
          if (error === "busy") {
            // The mock sends Retry-After: 20; the retry stays off and counts down.
            assert.match(await ui("error-action").textContent(), /Try again in \d+ s/);
            assert(await ui("error-action").isDisabled());
          }
          await shot(page, "error-" + error);
          assert.equal(posts(since).length, ["unreachable", "asleep", "all_unavailable"].includes(error) ? 2 : 1);
          if (["mismatch", "illegal_position"].includes(error)) {
            assert.match(await ui("error-action").textContent(), /Work from the pieces/);
            await ui("error-action").click();
            assert(!await ui("explain").isVisible());
          }
        });
      });
    }

    await test("Browser primary 503 uses the backup and shows its recorded reply", async () => {
      const { since } = await setup("backup");
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "backup");
        await shot(page, "trying-backup");
        await output(ui, "result");
        assert.deepEqual(posts(since).map((r) => r.server), ["boneyland", "hugging-apps"]);
        assert.match(await ui("result-footer").textContent(), /hugging-apps/i);
      });
    });

    await test("Browser Survival: 90 seconds of heartbeats keep the original worker and attempt alive", async () => {
      const { since } = await setup("survival");
      const original = await worker(ctx);
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "thinking");
        await shot(page, "thinking");
        await output(ui, "still_waiting", 68000);
        assert.match(await ui("wait").textContent(), /Still waiting/);
        await shot(page, "still-waiting");
        await output(ui, "result", 40000);
        assert.equal(await worker(ctx), original);
        assert.deepEqual(posts(since).map((r) => r.server), ["boneyland"]);
        assert(Date.now() - get(since).started >= 89000);
      });
    });

    for (const backupWorks of [false, true]) {
      await test("Browser Timeout: primary aborts at 45 seconds and backup " + (backupWorks ? "answers" : "times out at 90 s"), async () => {
        const { since } = await setup(backupWorks ? "timeout-backup" : "timeout");
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui("best").click();
          await until(() => get(since)?.aborted, 53000);
          const primary = get(since);
          assert(Math.abs(primary.aborted - primary.started - 45000) <= 2500);
          await until(() => get(since, "hugging-apps"));
          assert.deepEqual(posts(since).map((r) => r.server), ["boneyland", "hugging-apps"]);
          if (backupWorks) {
            await output(ui, "result");
            assert.match(await ui("result-footer").textContent(), /hugging-apps/i);
          } else {
            await code(ui, "timeout", 53000);
            const backup = get(since, "hugging-apps");
            assert(Math.abs(backup.aborted - primary.started - 90000) <= 5000);
            await shot(page, "error-timeout");
          }
        });
      });
    }

    for (const action of ["cancel", "close", "navigate", "tab"]) {
      await test("Browser streaming mock observes abort on " + action, async () => {
        const { since } = await setup("cancel");
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui("best").click();
          const stream = await until(() => get(since));
          const when = Date.now();
          if (action === "navigate") await navigate(page, "lichess-in-progress");
          else if (action === "tab") await page.close();
          else await ui(action).click();
          await until(() => stream.aborted, 1300);
          assert(stream.aborted - when <= 1000, String(stream.aborted - when));
          assert.equal(posts(since).length, 1);
        });
      });
    }

    await test("Browser XSS corpus, network allowlist and isolated-world token denial", async () => {
      const fake = "hf_fixtureOnly123";
      const { since } = await setup("xss", { token: fake });
      await withPage("lichess-analysis", async (page, ui) => {
        const probe = await isolated(page, async () => {
          try {
            const got = await chrome.storage.local.get("token");
            return { readable: true, hasToken: Object.hasOwn(got, "token") };
          } catch { return { readable: false, hasToken: false }; }
        });
        assert.deepEqual(probe, { readable: false, hasToken: false });
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        const analysis = await ui("analysis").evaluate((el) => [...el.querySelectorAll("*")].map((node) =>
          [node.localName, [...node.attributes].map((attr) => [attr.name, attr.value])]));
        for (const [name, attrs] of analysis) {
          assert(["p", "ul", "ol", "li", "h4", "strong", "em", "code"].includes(name), name);
          for (const [key, value] of attrs) assert(name === "li" && key === "value" && /^\d+$/.test(value));
        }
        assert.equal(await page.evaluate(() => window.aqExecuted), undefined);
        assert.doesNotMatch(await ui("analysis").textContent(), /DROP_SVG|<PIECE|<SQUARE|hf_fixtureOnly123/);
        assert.match(await ui("analysis").textContent(), /&lt;img/);
        const calls = mock.calls.slice(since);
        assert.deepEqual(calls.map((r) => r.auth === "Bearer " + fake), [true, true]);
        assert.deepEqual(calls.map((r) => r.method), ["POST", "GET"]);
        assert.deepEqual(Object.keys(calls[0].body), ["data"]);
        assert.deepEqual(calls[0].body.data.slice(0, 4), [START, OPENING.join(" "), 2048, 0.6]);
        assert.equal(calls[0].body.data.length, 5);
        assert(calls.every((r) => HOSTS.has(r.host) && !r.cookie && !r.referrer));
        assert.deepEqual(outside, []);
      });
    });

    await test("Browser token echoed by a server never appears in the panel", async () => {
      const token = "hf_EchoedToken12345678";
      await setup("echo", { token });
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        const text = await page.evaluate((host) => document.querySelector(host).shadowRoot.textContent, selectors.host);
        assert.match(text, /\[(?:token removed|redacted)\]/);
        assert(!text.replace(/[*_\x60~\s]/g, "").includes(token.slice(3)), "token reassembled in the panel");
      });
    });

    await test("Browser keyboard-only ask, Escape and site shortcut isolation", async () => {
      const { since } = await setup();
      await withPage("chesscom-review", async (page, ui) => {
        const focus = async (locator, event) => {
          for (let i = 0; i < 30; i++) {
            if (await locator.evaluate((el) => el.getRootNode().activeElement === el)) return;
            await page.keyboard.press(event);
          }
          throw new Error("Keyboard could not reach intended control");
        };
        // Site handlers in both phases, on window and document, registered after the extension loaded.
        await page.evaluate(() => {
          window.siteShortcutCount = 0;
          const count = () => window.siteShortcutCount++;
          for (const target of [window, document]) for (const capture of [true, false]) target.addEventListener("keydown", count, capture);
        });
        await ui("launcher").waitFor();
        await focus(ui("launcher"), "Tab");
        await page.keyboard.press("Enter");
        await ui("panel").waitFor();
        assert(await ui("panel").evaluate((el) => el.getRootNode().activeElement === el));
        await page.evaluate(() => { window.siteShortcutCount = 0; window.siteEarlyKeys = 0; });
        await focus(ui("explain"), "Tab");
        await page.keyboard.press("Enter");
        await output(ui, "result");
        assert.equal(posts(since).length, 1);
        assert.equal(await page.evaluate(() => window.siteShortcutCount), 0);
        // The page's own window capture listener, registered while the page parsed (before document_idle), saw none.
        assert.equal(await page.evaluate(() => window.siteEarlyKeys), 0);
        await page.keyboard.press("Escape");
        await ui("panel").waitFor({ state: "hidden" });
        assert(await ui("launcher").evaluate((el) => el.getRootNode().activeElement === el));
        await ui("launcher").click();
        await page.locator("#site-previous").focus();
        await page.keyboard.press("Escape");
        assert(await ui("panel").isVisible());
      });
    });

    await test("Browser ten SPA navigations retain one launcher and stable timer and listener counts", async () => {
      await setup();
      await withPage("chesscom-analysis", async (page, ui) => {
        const stats = await isolated(page, () => ({ host: document.querySelectorAll('[data-testid="aq-host"]').length,
          timer: document.querySelector('[data-testid="aq-host"]').shadowRoot.querySelectorAll('[data-testid="aq-timer"]').length }));
        const proxy = await ctx.newCDPSession(page);
        const counts = () => proxy.send("Memory.getDOMCounters");
        // Count real timers in the content scripts' world: every setTimeout/setInterval still pending.
        await isolated(page, () => {
          const live = globalThis.aqLiveTimers = new Set();
          const wrap = (set, once) => {
            const original = globalThis[set];
            globalThis[set] = (fn, ms, ...args) => {
              const id = original((...a) => { if (once) live.delete(id); if (typeof fn === "function") fn(...a); }, ms, ...args);
              live.add(id);
              return id;
            };
          };
          wrap("setTimeout", true);
          wrap("setInterval", false);
          for (const clear of ["clearTimeout", "clearInterval"]) {
            const original = globalThis[clear];
            globalThis[clear] = (id) => { live.delete(id); return original(id); };
          }
          return true;
        });
        const timers = async () => { await sleep(1500); return isolated(page, () => globalThis.aqLiveTimers.size); };
        let baseline, baseTimers;
        // The first open builds the panel's controls, so the baseline is taken after one round trip.
        for (let i = -1; i < 10; i++) {
          if (i === 0) { baseTimers = await timers(); await proxy.send("HeapProfiler.collectGarbage"); baseline = await counts(); }
          await ui("launcher").click();
          await navigate(page, i % 2 ? "chesscom-analysis" : "chesscom-review");
          await ui("explain").waitFor();
          await ui("close").click();
          await ui("launcher").waitFor();
          assert.equal(await ui("host").count(), 1);
          assert.equal(await ui("launcher").count(), 1);
        }
        assert.equal(await timers(), baseTimers, "pending timers after 10 navigations");
        await proxy.send("HeapProfiler.collectGarbage");
        const after = await counts();
        assert.equal(after.jsEventListeners, baseline.jsEventListeners);
        assert.equal(stats.host, 1);
        assert.equal(stats.timer, 0);
        assert.equal(await ui("out").locator('[data-testid="aq-timer"]').count(), 0);
        await proxy.detach();
      });
    });

    for (const id of ["lichess-analysis", "chesscom-review"]) {
      await test("Browser overlap or remembered dock at 1280×800 and 1440×900 for " + id, async () => {
        await setup();
        for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          await withPage(id, async (page, ui) => {
            await ui("launcher").click();
            const panel = await ui("panel").boundingBox();
            const occludes = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
            const board = await page.locator(".fixture-board").boundingBox(), nav = await page.locator(".site-controls").boundingBox();
            assert(panel && board && nav);
            await shot(page, id + "-layout-" + viewport.width);
            const left = await ui("panel").evaluate((el) => el.classList.contains("left"));
            await ui("dock").click();
            const docked = await ui("panel").evaluate((el) => el.classList.contains("left"));
            assert.equal(docked, !left);
            await ui("close").click();
            await ui("launcher").click();
            assert.equal(await ui("panel").evaluate((el) => el.classList.contains("left")), docked);
            const prefs = await (await worker(ctx)).evaluate(() => chrome.storage.local.get("dock"));
            assert.equal(prefs.dock, docked ? "left" : "right");
            if (occludes(panel, board) || occludes(panel, nav)) await shot(page, id + "-redocked-" + viewport.width);
          }, { viewport });
        }
      });
    }

    for (const [name, fail] of [["cancelled", false], ["extension_reloaded", true]]) {
      await test("Browser port state " + name, async () => {
        const { since } = await setup();
        await withPage("lichess-analysis", async (page, ui) => {
          if (fail) await isolated(page, () => {
            chrome.runtime.connect = () => { throw new Error("Extension context invalidated"); };
          });
          else await isolated(page, () => {
            chrome.runtime.connect = () => ({ onMessage: { addListener() {} },
              onDisconnect: { addListener: (cb) => setTimeout(cb, 20) }, postMessage() {}, disconnect() {} });
          });
          await ui("launcher").click();
          await ui("best").click();
          await code(ui, name);
          await shot(page, "error-" + name);
          assert.equal(posts(since).length, 0);
        });
      });
    }

    // Nothing past the viewport edge and every control target at least 24×24 px (inline links in text excepted).
    const layoutProblems = (page, host) => page.evaluate((host) => {
      const root = host ? document.querySelector(host).shadowRoot : document;
      const scope = host ? root.querySelector('[data-testid="aq-panel"]') : document.documentElement;
      const box = scope.getBoundingClientRect(), problems = [];
      if (box.left < -0.5 || box.top < -0.5 || box.right > innerWidth + 0.5 || (host && box.bottom > innerHeight + 0.5))
        problems.push("outside the viewport: " + JSON.stringify(box));
      if (scope.scrollWidth > scope.clientWidth + 1) problems.push("horizontal overflow " + scope.scrollWidth + " > " + scope.clientWidth);
      for (const el of root.querySelectorAll("button, input, select, textarea, summary, a")) {
        if (!el.getClientRects().length || el.closest("p, li")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) problems.push(`${el.dataset.testid || el.id || el.localName} is ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return problems;
    }, host);
    // True 200% zoom: a 1280×800 window at device scale 2 lays out as 640×400 CSS px, like Chrome's 200% zoom.
    await test("Browser 200% zoom: panel and options fit, keep 24 px targets and work by keyboard", async () => {
      await setup();
      const zoom = async (page) => {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: 640, height: 400, deviceScaleFactor: 2, mobile: false });
        return cdp;
      };
      await withPage("lichess-analysis", async (page, ui) => {
        const cdp = await zoom(page);
        assert.equal(await page.evaluate(() => devicePixelRatio), 2);
        await ui("launcher").waitFor();
        await ui("launcher").focus();
        await page.keyboard.press("Enter");
        await ui("explain").waitFor();
        assert.deepEqual(await layoutProblems(page, selectors.host), [], "panel at 200%");
        for (let i = 0; i < 30 && !await ui("best").evaluate((el) => el.getRootNode().activeElement === el); i++) await page.keyboard.press("Tab");
        await page.keyboard.press("Enter");
        await output(ui, "result");
        assert.deepEqual(await layoutProblems(page, selectors.host), [], "result at 200%");
        // Captured through CDP at the emulated size, so the image shows the 200% layout.
        assert.equal(await page.evaluate(() => innerWidth), 640);
        fs.writeFileSync(path.join(out, "zoom200-result.png"), Buffer.from((await cdp.send("Page.captureScreenshot")).data, "base64"));
        await cdp.detach();
      });
      const page = await ctx.newPage();
      try {
        const cdp = await zoom(page);
        await page.goto(new URL("options.html", (await worker(ctx)).url()).href);
        assert.deepEqual(await layoutProblems(page, null), [], "options at 200%");
        await page.keyboard.press("Tab");
        assert.notEqual(await page.evaluate(() => document.activeElement?.localName), "body", "keyboard focus enters the options page");
        assert.equal(await page.evaluate(() => innerWidth), 640);
        fs.writeFileSync(path.join(out, "zoom200-options.png"), Buffer.from((await cdp.send("Page.captureScreenshot")).data, "base64"));
        await cdp.detach();
      } finally { await page.close(); }
    });

    for (const viewport of [{ width: 320, height: 568 }, { width: 640, height: 400 }]) {
      const size = viewport.width + "x" + viewport.height;
      await test("Browser panel and options fit " + size + " with 24 px targets", async () => {
        await setup();
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui("explain").waitFor();
          assert.deepEqual(await layoutProblems(page, selectors.host), [], "ask view");
          await shot(page, "narrow-ask-" + size);
          await ui("best").click();
          await output(ui, "result");
          assert.deepEqual(await layoutProblems(page, selectors.host), [], "result view");
          await shot(page, "narrow-result-" + size);
        }, { viewport });
        const page = await ctx.newPage();
        try {
          await page.setViewportSize(viewport);
          await page.goto(new URL("options.html", (await worker(ctx)).url()).href);
          assert.deepEqual(await layoutProblems(page, null), [], "options");
          await page.screenshot({ path: path.join(out, "narrow-options-" + size + ".png"), fullPage: true });
        } finally { await page.close(); }
      });
    }

    await test("Browser options: token format, masked token, Remove, exact-origin permission and per-origin consent", async () => {
      const sw = await worker(ctx);
      const stored = (keys) => sw.evaluate((keys) => chrome.storage.local.get(keys), keys);
      await sw.evaluate(() => chrome.storage.local.remove(["token", "tokenFor", "custom"]));
      const page = await ctx.newPage();
      try {
        await page.goto(new URL("options.html", sw.url()).href);
        const t = (id) => page.locator(`[data-testid="opt-${id}"]`);
        await t("token").fill("hf_short");
        await t("token-save").click();
        assert.match(await t("token-error").textContent(), /doesn't look like/i);
        assert.equal((await stored("token")).token, undefined);
        const token = "hf_OptionsFixture1234567";
        await t("token").fill(token);
        await t("token-save").click();
        await until(async () => (await t("saved-token").textContent()).includes("hf_…4567"));
        assert.equal((await stored("token")).token, token);
        // The full token is in neither the markup nor any field value, also after a reload.
        const dom = () => page.evaluate(() => document.documentElement.outerHTML + [...document.querySelectorAll("input")].map((i) => i.value).join(" "));
        assert(!(await dom()).includes(token));
        await page.reload();
        await until(async () => (await t("saved-token").textContent()).includes("hf_…4567"));
        assert(!(await dom()).includes(token));
        // Stub Chrome's permission prompt and record exactly what is asked for.
        await page.evaluate(() => {
          window.aqAsked = [];
          chrome.permissions.request = async (p) => { window.aqAsked.push(p); return true; };
          chrome.permissions.remove = async () => true;
        });
        const first = "https://queentest.hf.space", second = "https://other-space.hf.space";
        await t("custom-origin").fill(first + "/some/page");
        await t("custom-consent").check();
        await t("custom-save").click();
        await until(async () => (await stored("custom")).custom?.origin === first);
        assert.deepEqual((await stored("tokenFor")).tokenFor, [first]);
        await page.screenshot({ path: path.join(out, "options-saved.png"), fullPage: true });
        // A different server needs its own opt-in: the earlier consent is not carried over.
        await t("custom-origin").fill(second);
        await t("custom-save").click();
        await until(async () => (await stored("custom")).custom?.origin === second);
        assert.deepEqual((await stored("tokenFor")).tokenFor, []);
        assert.deepEqual(await page.evaluate(() => window.aqAsked), [{ origins: [first + "/*"] }, { origins: [second + "/*"] }]);
        await t("token-remove").click();
        await until(async () => (await stored("token")).token === undefined);
        assert.doesNotMatch(await t("saved-token").textContent(), /hf_/);
      } finally {
        await page.close();
        await sw.evaluate(() => chrome.storage.local.remove(["token", "tokenFor", "custom"]));
      }
    });

    await test("Browser quota recovery: add a token in Settings, then retry on the same page", async () => {
      const { since } = await setup("quota-token");
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await code(ui, "quota");
        assert.match(await ui("error-action").textContent(), /token/i);
        const opened = ctx.waitForEvent("page", { predicate: (p) => p.url().endsWith("/options.html"), timeout: WAIT });
        await ui("error-action").click();
        const options = await opened;
        await options.waitForLoadState("domcontentloaded");
        const token = "hf_QuotaRecovery1234567";
        await options.locator('[data-testid="opt-token"]').fill(token);
        await options.locator('[data-testid="opt-token-save"]').click();
        await until(async () => /saved/i.test(await options.locator('[data-testid="opt-token-status"]').textContent()));
        await options.close();
        await page.bringToFront();
        assert.match(await ui("error-action").textContent(), /Try again/);
        await ui("error-action").click();
        await output(ui, "result");
        const sent = posts(since);
        assert.deepEqual(sent.map((r) => r.auth), [undefined, "Bearer " + token]);
        await shot(page, "result-after-token");
      });
    });

    await test("Browser options live regions are rendered and empty before their first message, and every message state passes axe (round 5)", async () => {
      const sw = await worker(ctx);
      await sw.evaluate(() => chrome.storage.local.remove(["token", "tokenFor", "custom"]));
      const page = await ctx.newPage();
      try {
        await page.goto(new URL("options.html", sw.url()).href);
        const t = (id) => page.locator(`[data-testid="opt-${id}"]`);
        const said = (id, text) => until(async () => text.test(await t(id).textContent()));
        const scan = async (name) => {
          await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
          assert.deepEqual(seriousOrCritical(await withAxe(page, () => axe.run())), [], name);
        };
        // Before any message each region is empty, rendered (not display: none) and in the accessibility tree.
        const regions = { "token-error": "alert", "token-status": "status", "primary-status": "status", "custom-error": "alert", "custom-status": "status" };
        for (const [id, role] of Object.entries(regions)) {
          assert.deepEqual(await t(id).evaluate((el) => [el.getAttribute("role"), el.textContent, el.checkVisibility(), getComputedStyle(el).display !== "none"]),
            [role, "", true, true], id);
        }
        const cdp = await ctx.newCDPSession(page);
        const { nodes } = await cdp.send("Accessibility.getFullAXTree");
        await cdp.detach();
        assert.deepEqual(nodes.filter((n) => !n.ignored && ["alert", "status"].includes(n.role?.value)).map((n) => n.role.value).sort(),
          Object.values(regions).sort(), "empty regions in the accessibility tree");
        // Then every message the page can show, each scanned while it is on screen.
        await t("token-save").click();
        await said("token-error", /Paste a token first/);
        await scan("options-token-empty");
        await t("token").fill("hf_short");
        await t("token-save").click();
        await said("token-error", /doesn't look like/);
        await scan("options-token-error");
        await t("token").fill("hf_OptionsAxeFixture1234");
        await t("token-save").click();
        await said("token-status", /Token saved/);
        await scan("options-token-saved");
        await t("primary").selectOption("hugging-apps");
        await said("primary-status", /Saved/);
        await t("custom-origin").fill("https://huggingface.co/spaces/someone/queen");
        await t("custom-save").click();
        await said("custom-error", /not its huggingface\.co page/);
        await scan("options-custom-error");
        await page.evaluate(() => { chrome.permissions.request = async () => true; chrome.permissions.remove = async () => true; });
        await t("custom-origin").fill("https://queentest.hf.space");
        await t("custom-save").click();
        await said("custom-status", /Saved\. Choose it under Server/);
        assert.match(await t("custom-saved").textContent(), /Your token is not sent to it/);
        await scan("options-custom-saved");
        await t("custom-remove").click();
        await said("custom-status", /Custom server removed/);
        await t("token-remove").click();
        await said("token-status", /Token removed/);
        await scan("options-removed");
      } finally {
        await page.close();
        await sw.evaluate(() => chrome.storage.local.remove(["token", "tokenFor", "custom", "primary"]));
      }
    });

    // What a screen reader is given at each step of docs/a11y-walkthrough.md: Chromium's accessibility tree as
    // Playwright's ARIA snapshot, saved as a11y-tree.txt, with the roles, names and focus moves the doc relies on.
    await test("Browser accessibility tree for each step of the screen-reader walkthrough", async () => {
      const tree = [];
      const snap = async (step, locator) => {
        const text = await locator.ariaSnapshot();
        tree.push("## " + step + "\n" + text + "\n");
        return text;
      };
      const focused = (page) => page.evaluate(() => {
        let el = document.activeElement;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
        return el?.dataset?.testid || el?.localName;
      });
      await setup("busy", { firstUseSeen: false });
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").waitFor();
        assert.match(await snap("Launcher", ui("launcher")), /^- button "Ask Queen"/);
        await ui("launcher").focus();
        await page.keyboard.press("Enter");
        await ui("notice").waitFor();
        assert.equal(await focused(page), "aq-panel", "opening moves focus to the dialog");
        const notice = await snap("First-use notice", ui("panel"));
        assert.match(notice, /^- dialog "Ask Queen"/);
        for (const name of ["Move the panel to the left", "Settings", "Close", "Got it"]) assert(notice.includes(`button "${name}"`), name);
        assert.match(notice, /link "Privacy policy \(opens in a new tab\)"/);
        await ui("notice-ok").click();
        assert.equal(await focused(page), "aq-panel");
        const ask = await snap("Ask", ui("panel"));
        assert.match(ask, /button "Explain 3\.Bc4"[\s\S]*button "Best move for Black"[\s\S]*button "Read the board again"/);
        assert.equal(ask.match(/- status/g)?.length, 2, "both status regions are exposed while empty");
        assert.match(ask, /- alert/, "and the alert region");
        assert.doesNotMatch(ask, /♛|×|←/, "decorative glyphs are hidden");
        await ui("best").click();
        await code(ui, "busy");
        const error = await snap("Error with a Retry-After pause", ui("panel"));
        assert.match(error, /- alert:\s+- heading "Queen's servers are busy" \[level=3\]\s+- paragraph: Too many questions/);
        assert.match(error, /button "Try again in \d+ s" \[disabled\]/);
        await page.keyboard.press("Escape");
        await ui("panel").waitFor({ state: "hidden" });
        assert.equal(await focused(page), "aq-launcher", "closing returns focus to the launcher");
      });
      await setup("cancel");
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").focus();
        await page.keyboard.press("Enter");
        await output(ui, "thinking");
        const thinking = await snap("Thinking", ui("panel"));
        assert.match(thinking, /- status:\s+- paragraph: Queen is thinking…\s+- paragraph: Position after 3\.Bc4, Black to move\s+- paragraph: Usually 15 to 60 seconds\./);
        assert.doesNotMatch(thinking.match(/- status:[\s\S]*?Usually[^\n]*/)[0], /\d s(?!\w)/, "the seconds are outside the status region");
        assert.equal(await focused(page), "aq-best", "focus stays on the button that was pressed");
      });
      await setup();
      await withPage("lichess-analysis", async (page, ui) => {
        await ui("launcher").click();
        await ui("best").click();
        await output(ui, "result");
        const result = await snap("Result", ui("panel"));
        assert.match(result, /- status:\s+- heading "Queen plays 3\.\.\.Be7" \[level=3\]/);
        assert.match(result, /button "Copy FEN"[\s\S]*button "Ask again"/);
        await navigate(page, "lichess-start");
        await ui("stale").waitFor();
        const stale = await snap("Stale result", ui("panel"));
        assert.match(stale, /- status: The board has moved\. This answer is for the earlier position\./);
        assert.match(stale, /button "Ask again" \[disabled\]/);
        await navigate(page, "lichess-in-progress");
        await ui("gate").waitFor();
        const gated = await snap("Gated", ui("panel"));
        assert.match(gated, /- status: Available after the game ends\./);
        assert.deepEqual(gated.match(/- button[^\n]*/g), ['- button "Close"']);
      });
      const page = await ctx.newPage();
      try {
        await page.goto(new URL("options.html", (await worker(ctx)).url()).href);
        const settings = await snap("Settings", page.locator("body"));
        assert.match(settings, /heading "Ask Queen settings" \[level=1\]/);
        for (const name of ["New token", "Space address"]) assert(settings.includes(`textbox "${name}"`), name);
        for (const name of ["Ask this server first", "It answers like"]) assert(settings.includes(`combobox "${name}"`), name);
        assert.match(settings, /checkbox "Send my Hugging Face token to this server too" \[disabled\]/);
        assert.equal(settings.match(/- alert/g)?.length, 2);
        await page.locator('[data-testid="opt-token-save"]').click();
        assert.match(await snap("Settings after saving with no token", page.locator("body")), /- alert: Paste a token first\./);
        assert.equal(await focused(page), "opt-token", "focus goes back to the field");
      } finally { await page.close(); }
      fs.writeFileSync(path.join(out, "a11y-tree.txt"), tree.join("\n"));
    });

    await test("Browser options render and pass axe", async () => {
      const page = await ctx.newPage();
      try {
        await page.goto(new URL("options.html", (await worker(ctx)).url()).href);
        assert.match(await page.title(), /Ask Queen/i);
        await page.screenshot({ path: path.join(out, "options.png") });
        const result = await withAxe(page, () => axe.run());
        assert.deepEqual(seriousOrCritical(result), []);
      } finally { await page.close(); }
    });
    // --- The answer card (docs/output-format.md): the two places Gemini Nano can run, with a scripted LanguageModel ---
    {
      const LANG = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
      const probe = `(async () => typeof LanguageModel === "undefined" ? "absent" : String(await Promise.race([
        LanguageModel.availability(${JSON.stringify(LANG)}).catch((e) => "error " + e.name),
        new Promise((resolve) => setTimeout(resolve, 2000, "no answer in 2 s"))])))()`;
      const fake = (plan) => `(${fakeLanguageModel})(${JSON.stringify(plan)})`;
      const install = (plan) => `(() => {
        globalThis.aqSavedLanguageModel = Object.getOwnPropertyDescriptor(globalThis, "LanguageModel") || null;
        Object.defineProperty(globalThis, "LanguageModel", { value: ${fake(plan)}, configurable: true, writable: true });
      })()`;
      const restore = `(() => {
        const saved = globalThis.aqSavedLanguageModel;
        if (saved) Object.defineProperty(globalThis, "LanguageModel", saved); else delete globalThis.LanguageModel;
      })()`;
      const reply = JSON.stringify(BONY_REPLY);

      await test("Browser card: which contexts of this Chromium expose LanguageModel, recorded as evidence", async () => {
        await withPage("lichess-recorded", async (page) => {
          const found = { chromium: browser?.version() || null, worker: await (await worker(ctx)).evaluate(probe),
            contentScript: await isolated(page, probe), page: await page.evaluate(probe) };
          fs.writeFileSync(path.join(out, "nano-contexts.json"), JSON.stringify(found, null, 2) + "\n");
          for (const value of Object.values(found).slice(1)) assert.match(value, /^(?:absent|unavailable|downloadable|downloading|available|error \w+|no answer in 2 s)$/);
        });
      });

      await test("Browser card, content path: AQ.tidy uses its window's LanguageModel and the worker's real token guard", async () => {
        await withPage("lichess-recorded", async (page) => {
          const value = await isolated(page, `(async () => {
            ${install({ reply })};
            try {
              const r = await AQ.tidy(${JSON.stringify(bony)});
              const attached = { ...r, card: null };
              const same = (await AQ.tidy(attached)).card === null;
              return { card: r.card, same, calls: LanguageModel.calls.map((c) => c[0]) };
            } finally { ${restore}; }
          })()`);
          assert.equal(value.card.source, "nano");
          assert.deepEqual(value.card.why, BONY_REPLY.why);
          assert.deepEqual(value.card.others.map((o) => o.tag), ["Slightly worse", "Weakest"]);
          assert.equal(value.same, true);
          assert.deepEqual(value.calls, ["availability", "create", "clone", "prompt", "destroy"]);
          const unready = await isolated(page, `(async () => {
            ${install({ reply, availability: "downloadable" })};
            try { return { source: (await AQ.tidy(${JSON.stringify(bony)})).card.source, calls: LanguageModel.calls.map((c) => c[0]) }; }
            finally { ${restore}; }
          })()`);
          assert.deepEqual(unready, { source: "rules", calls: ["availability"] }, "create() only when available");
        });
      });

      await test("Browser card, worker path: a LanguageModel in the service worker writes the card and the port reports 'tidying'", async () => {
        await setup("ok");
        const sw = await worker(ctx);
        await sw.evaluate(install({ reply, extension: true }));
        try {
          await withPage("lichess-recorded", async (page) => {
            const ask = { type: "ask", mode: "best", fen: START, moves: RECORDED_MOVES.join(" "), played: null,
              snapshot: { placement: RECORDED_FEN.split(" ")[0], side: "w" }, fresh: true };
            const seen = await isolated(page, `new Promise((resolve) => {
              const port = chrome.runtime.connect({ name: "queen" }), seen = [];
              port.onMessage.addListener((m) => { seen.push(m); if (m.result || m.error) { port.disconnect(); resolve(seen); } });
              port.postMessage(${JSON.stringify(ask)});
            })`);
            assert(seen.some((m) => m.status === "tidying"), JSON.stringify(seen.map((m) => m.status || Object.keys(m))));
            const { result } = seen.at(-1);
            assert.equal(result.card.source, "nano");
            assert.deepEqual(result.card.why, BONY_REPLY.why);
            assert.deepEqual(result.estimate, { ahead: "w", words: "White is better", number: "+1.51" });
            assert.deepEqual(result.promising, ["O-O", "c3"]);
            const calls = await sw.evaluate(() => LanguageModel.calls.map((c) => c[0]));
            assert.deepEqual(calls, ["availability", "create", "clone", "prompt", "destroy"]);
          });
        } finally { await (await worker(ctx)).evaluate(restore); }
      });
    }

    await test("Browser screenshots pass axe in every displayed panel state", () => assert.deepEqual(aes, []));
    await test("Browser reports no unexpected requests, uncaught errors, or mock mismatches", () => {
      assert.deepEqual(outside, []);
      assert.deepEqual(uncaught, []);
      assert.deepEqual(mock.errors, []);
    });
  } finally {
    if (ctx) await ctx.close();
    await mock.close();
  }
  if (packaged) await test("Extracted allowlist zip loads in Chromium", () => launchedSmoke(packaged, temp));
}

module.exports = { runBrowser, launch };
