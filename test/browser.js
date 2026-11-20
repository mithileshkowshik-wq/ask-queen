const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const { chromium } = require("playwright");
const { createMock, HOSTS } = require("./mock");
const { selectors, uiFor } = require("./ui");
const { SITES, XSS, START, OPENING } = require("./fixtures");

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
    const page = await ctx.newPage();
    await page.goto(new URL("options.html", sw.url()).href);
    assert.match(await page.title(), /Ask Queen/i);
  } finally { await ctx.close(); }
}

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
      expression: "(" + cb.toString() + ")()", awaitPromise: true, returnByValue: true });
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
      if (id && SITES[id]?.url === url.origin + url.pathname && req.resourceType() === "document") {
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
        await page.goto(SITES[id].url + "?aqFixture=" + id, { waitUntil: "domcontentloaded" });
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
            if (e.unreadable) assert.match(await ui("ask").textContent(), /Can't read this board/i);
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
          assert(await ui("gate-close").isVisible());
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
        await ui("stale-reask").click();
        await output(ui, "result");
        assert.deepEqual(posts(since)[1]?.body.data.slice(0, 2), [START, ""]);
      });
    });

    for (const error of ["quota", "token_rejected", "unreachable", "asleep", "busy", "illegal_position", "game_over",
      "bad_response", "all_unavailable", "mismatch"]) {
      await test("Browser error " + error, async () => {
        const { since } = await setup(error);
        await withPage("lichess-analysis", async (page, ui) => {
          await ui("launcher").click();
          await ui("best").click();
          await code(ui, error);
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
        await page.evaluate(() => {
          window.siteShortcutCount = 0;
          document.addEventListener("keydown", () => window.siteShortcutCount++);
        });
        await ui("launcher").waitFor();
        await focus(ui("launcher"), "Tab");
        await page.keyboard.press("Enter");
        await ui("panel").waitFor();
        assert(await ui("panel").evaluate((el) => el.getRootNode().activeElement === el));
        await page.evaluate(() => { window.siteShortcutCount = 0; });
        await focus(ui("explain"), "Tab");
        await page.keyboard.press("Enter");
        await output(ui, "result");
        assert.equal(posts(since).length, 1);
        assert.equal(await page.evaluate(() => window.siteShortcutCount), 0);
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
        let baseline;
        // The first open builds the panel's controls, so the baseline is taken after one round trip.
        for (let i = -1; i < 10; i++) {
          if (i === 0) { await proxy.send("HeapProfiler.collectGarbage"); baseline = await counts(); }
          await ui("launcher").click();
          await navigate(page, i % 2 ? "chesscom-analysis" : "chesscom-review");
          await ui("explain").waitFor();
          await ui("close").click();
          await ui("launcher").waitFor();
          assert.equal(await ui("host").count(), 1);
          assert.equal(await ui("launcher").count(), 1);
        }
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
