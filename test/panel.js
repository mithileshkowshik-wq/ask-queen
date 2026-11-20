const assert = require("node:assert/strict");
const { fixtureDoc, read } = require("./unit");
const { selectors, rootFor, nodeFor } = require("./ui");
const F = require("./fixtures");
const bg = require("../background.js");
const source = () => read("content/panel.js");
const settle = () => new Promise(setImmediate);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const bodyOf = (id) => F.SITES[id].html.match(/<body>([\s\S]*)<\/body>/)[1];

async function panelFixture(id, { firstUseSeen = true, mutate = (source) => source, prefsDelay = 0 } = {}) {
  const s = fixtureDoc(id);
  const { w } = s;
  const calls = [], events = {};
  const prefs = { firstUseSeen, dock: "right" };
  let disconnected = 0;
  Object.defineProperty(w.document, "hidden", { value: false, configurable: true });
  w.chrome = { runtime: {
    id: "test-extension",
    sendMessage: async (m) => {
      if (m.type === "getPrefs") return prefsDelay ? new Promise((resolve) => setTimeout(() => resolve({ ...prefs }), prefsDelay)) : { ...prefs };
      if (m.type === "setPrefs") Object.assign(prefs, m.prefs);
    },
    connect: ({ name }) => {
      assert.equal(name, "queen");
      return { onMessage: { addListener: (cb) => { events.message = cb; } },
        onDisconnect: { addListener: (cb) => { events.disconnect = cb; } },
        postMessage: (m) => calls.push(JSON.parse(JSON.stringify(m))),
        disconnect() { disconnected++; },
      };
    },
  } };
  w.eval(mutate(source()));
  await settle();
  const element = (name) => nodeFor(w.document, name);
  const click = (name) => {
    const el = element(name);
    assert(el && !el.hidden && !el.disabled, name + " is actionable");
    el.click();
  };
  return { ...s, calls, prefs, element, click, events, root: rootFor(w.document),
    async close() { if (!element("panel")?.hidden) element("close")?.click(); await settle(); s.close(); },
    async open() { click("launcher"); await settle(); }, get disconnected() { return disconnected; } };
}

const result = { server: "boneyland", seconds: 1, cached: false, fen: F.ITALIAN, analysis: "Develop the bishop.",
  best: { san: "Be7", uci: "f8e7", source: "structured" }, positionCheck: "ok" };
const renderedTags = new Set(["P", "UL", "OL", "LI", "H4", "STRONG", "EM", "CODE"]);
function assertSafeAnalysis(analysis) {
  assert(analysis);
  for (const el of analysis.querySelectorAll("*")) {
    assert(renderedTags.has(el.tagName), el.tagName + " is outside the Markdown subset");
    for (const attr of el.attributes) assert(el.tagName === "LI" && attr.name === "value" && /^\d+$/.test(attr.value));
  }
  assert.match(analysis.textContent, /&lt;img/);
  assert.match(analysis.textContent, /\[click\]\(javascript:/);
  assert.doesNotMatch(analysis.textContent, /<(?:PIECE|SQUARE)_/);
}

function runPanelTests(test) {
  for (const [name, { expect: e }] of Object.entries(F.SITES)) {
    test("Panel fixture " + name, async () => {
      const s = await panelFixture(name);
      try {
        assert.equal(s.w.document.documentElement.dataset.fixture, name);
        if (e.gate || e.noBoard) { assert(s.element("launcher").hidden); assert.equal(s.calls.length, 0); return; }
        await s.open();
        if (e.unreadable) {
          assert.match(s.element("ask").textContent, /can't read this board/i);
          assert.equal(s.element("best"), null);
        } else if (e.mate) {
          assert.match(s.element("game-over").textContent, /game is over here/i);
          assert.equal(s.element("best"), null);
          assert(s.element("explain"));
        } else {
          if (e.disagree) assert.match(s.element("disagree").textContent, /disagree/i);
          if (e.choose) {
            assert(s.element("best").disabled);
            s.click("side-" + e.choose.toLowerCase());
          }
          const type = e.explain ? "explain" : "best";
          assert.match(s.element(type).textContent, e.explain ? /^Explain / : /^Best move for (White|Black)$/);
          if (e.explain) assert.equal(s.element("explain").textContent, "Explain " + e.explain);
          s.click(type);
          assert.equal(s.calls.length, 1);
          assert.equal(s.calls[0].fen, e.fen);
          assert.equal(s.calls[0].moves, e.moves);
          assert(bg.validAsk(s.calls[0]));
          const answer = bg.normalized([{ fen: e.replyFen, analysis: "Develop.", best_move_san: null }],
            "boneyland", s.calls[0], "boneyland", 1);
          assert.equal(answer.positionCheck, "ok");
          s.events.message({ result: answer });
          assert(s.element("headline"));
        }
        if (e.mate || e.unreadable) assert.equal(s.calls.length, 0);
      } finally { await s.close(); }
    });
  }
  test("First-use notice and docking write only the panel prefs", async () => {
    const s = await panelFixture("lichess-analysis", { firstUseSeen: false });
    try {
      await s.open();
      assert.match(s.element("notice").textContent, /community servers/i);
      s.click("notice-ok");
      assert(s.prefs.firstUseSeen);
      s.click("dock");
      assert.equal(s.prefs.dock, "left");
      assert(s.element("panel").classList.contains("left"));
    } finally { await s.close(); }
  });
  test("Shipped panel renders each typed error with an alert, action and collapsed details", async () => {
    for (const code of [...Object.keys(bg.CODES), "mismatch"]) {
      const s = await panelFixture("lichess-analysis");
      try {
        await s.open();
        s.click("best");
        if (code === "mismatch") s.events.message({ result: { ...result, positionCheck: "mismatch" } });
        else s.events.message({ error: { code, detail: "<b>detail</b>" } });
        assert.equal(s.element("out").dataset.code, code);
        assert.equal(s.element("error").getAttribute("role"), "alert");
        assert(s.element("error-action"));
        assert.equal(s.element("error-details").open, false);
        assert.equal(s.element("error-details").querySelector("b"), null);
      } finally { await s.close(); }
    }
  });
  test("Shipped result renderer passes hostile strings through the escape-first Markdown subset", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      s.events.message({ result: { ...result, analysis: F.XSS.join("\n\n") + "\n\n14. Play \x60e4\x60" } });
      assertSafeAnalysis(s.element("analysis"));
    } finally { await s.close(); }
  });
  test("Mutation sanity: disabling escaping in the shipped renderer fails the hostile-result assertion", async () => {
    const s = await panelFixture("lichess-analysis", { mutate: (source) => source.replace("const text = (s) => document.createTextNode(s);",
      'const text = (s) => { const t = document.createElement("template"); t.innerHTML = s; return t.content; };') });
    try {
      await s.open();
      s.click("best");
      s.events.message({ result: { ...result, analysis: F.XSS.join("\n\n") } });
      assert.throws(() => assertSafeAnalysis(s.element("analysis")), assert.AssertionError);
    } finally { await s.close(); }
  });
  test("Panel renders 200,000 characters of inline marks: inline() loops and nodes are appended one by one (Fable round 5)", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      // Far past the background's 20,000-character cap. The recursive inline() overflowed the stack at 20,000
      // characters, and append(...nodes) at about 200,000.
      s.events.message({ result: { ...result, analysis: "\x60a\x60".repeat(66666) + " *the* **end**" } });
      assert.equal(s.element("out").dataset.state, "result");
      assert.equal(s.element("analysis").querySelectorAll("code").length, 66666);
      assert.equal(s.element("analysis").textContent, "a".repeat(66666) + " the end");
    } finally { await s.close(); }
  });
  test("A reply the panel can't render becomes the bad_response error and the panel keeps working (Fable round 5)", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      // The renderer's one text sink fails, as it did when a very long reply overflowed the stack.
      const createTextNode = s.w.document.createTextNode;
      s.w.document.createTextNode = () => { throw new s.w.RangeError("Maximum call stack size exceeded"); };
      s.events.message({ result });
      s.w.document.createTextNode = createTextNode;
      assert.equal(s.element("out").dataset.state, "error");
      assert.equal(s.element("out").dataset.code, "bad_response");
      assert.equal(s.element("headline"), null, "no half-built result");
      assert.match(s.element("error-details").textContent, /could not be shown: Maximum call stack/);
      assert.equal(s.element("error-action").textContent, "Try the other server");
      s.click("error-action");
      assert.deepEqual(s.calls.map((c) => [c.fresh, c.prefer]), [[false, undefined], [true, "other"]]);
      s.events.message({ result });
      assert.match(s.element("headline").textContent, /Queen plays 3\.\.\.Be7/);
    } finally { await s.close(); }
  });
  test("Panel rejects clicks after the cursor changes, then flags earlier results stale", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      s.events.message({ result });
      const replace = (id) => {
        const match = F.SITES[id].html.match(/<body>([\s\S]*)<\/body>/);
        s.w.document.body.innerHTML = match[1];
      };
      replace("lichess-start");
      s.click("best");
      assert.equal(s.calls.length, 1);
      assert.match(s.element("changed").textContent, /board (?:changed|has moved)/i);
      assert(!s.element("stale").hidden);
      s.click("stale-reask");
      assert.equal(s.calls.length, 2);
      assert.equal(s.calls[1].fen, F.START);
      assert.equal(s.calls[1].moves, "");
    } finally { await s.close(); }
  });
  test("A click on another line's move while an ask is in flight cancels it and asks about the new move", async () => {
    const s = await panelFixture("lichess-sibling-nf3");
    try {
      await s.open();
      assert.equal(s.element("explain").textContent, "Explain 2.Nf3");
      s.click("explain");
      s.w.document.body.innerHTML = F.SITES["lichess-sibling-bc4"].html.match(/<body>([\s\S]*)<\/body>/)[1];
      await new Promise((resolve) => setTimeout(resolve, 400));
      assert.equal(s.element("explain").textContent, "Explain 2.Bc4");
      s.click("explain");
      assert.equal(s.disconnected, 1);
      assert.deepEqual(s.calls.map((c) => c.played), ["Nf3", "Bc4"]);
      assert.equal(s.calls[1].moves, "e4 e5");
    } finally { await s.close(); }
  });
  test("A shown result goes stale as soon as the board starts moving; its re-ask comes within 300 ms of the board settling (GPT round 5)", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      const show = (id) => { s.w.document.body.innerHTML = bodyOf(id); };
      const state = () => ({ reading: !!s.element("reading"), stale: !s.element("stale").hidden, reask: !s.element("stale-reask").hidden,
        again: !s.element("ask-again").disabled });
      await s.open();
      s.click("best");
      s.events.message({ result });
      assert.deepEqual(state(), { reading: false, stale: false, reask: false, again: true });
      show("lichess-animation"); // another position, with its piece still in flight
      await sleep(300);
      assert.deepEqual(state(), { reading: true, stale: true, reask: false, again: false });
      assert.match(s.element("live").textContent, /board has moved/i);
      assert(s.element("best").disabled && s.element("explain").disabled);
      show("lichess-start"); // the pieces land on a new position
      await sleep(300);
      assert.deepEqual(state(), { reading: false, stale: true, reask: true, again: false });
      assert.equal(s.element("stale-reask").textContent, "Best move for White");
      s.click("stale-reask");
      s.events.message({ result: { ...result, fen: F.START, best: { san: "e4", uci: "e2e4", source: "structured" } } });
      assert.deepEqual(state(), { reading: false, stale: false, reask: false, again: true });
      // A piece that moves and lands back on the asked position: stale while it moves, current again afterwards.
      show("lichess-animation");
      await sleep(300);
      assert.deepEqual(state(), { reading: true, stale: true, reask: false, again: false });
      show("lichess-start");
      await sleep(300);
      assert.deepEqual(state(), { reading: false, stale: false, reask: false, again: true });
      assert.equal(s.element("live").textContent, "");
      assert.deepEqual(s.calls.map((c) => [c.fen, c.moves]), [[F.START, F.OPENING.join(" ")], [F.START, ""]]);
    } finally { await s.close(); }
  });
  test("Live regions exist and are empty before any text is written into them", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      for (const id of ["status", "live"]) {
        assert.equal(s.element(id).getAttribute("role"), "status", id);
        assert.equal(s.element(id).textContent.trim(), "", id);
      }
      const region = s.element("status");
      s.click("best");
      assert.equal(s.element("status"), region, "the same node gets the thinking text");
      assert.match(region.textContent, /\S/);
      s.events.message({ result });
      assert.equal(s.element("status"), region, "and then the headline");
      assert(region.contains(s.element("headline")));
    } finally { await s.close(); }
  });
  test("A board-fallback answer has no move number in its headline, and its critical line is numbered from the asked position", async () => {
    const s = await panelFixture("lichess-board-side");
    try {
      const lineFor = (best, criticalLine, fen = F.E4) => {
        s.click("best");
        s.events.message({ result: { ...result, fen, best: { san: best, source: "structured" }, criticalLine } });
        return [s.element("line").textContent, s.element("line-note")?.textContent ?? null];
      };
      await s.open();
      // Black to move: the line counts from this position and says so once.
      assert.deepEqual(lineFor("e5", "1...e5 2.Nf3 Nc6"), ["1...e5 2.Nf3 Nc6", "Numbered from this position"]);
      // That is the line the background builds: it numbers a supplied line from the reply's FEN, which has the
      // placeholder clocks that were sent, whatever numbers the server wrote.
      const reply = { fen: F.E4, analysis: "Take the centre.", best_move_san: "e5", best_move_uci: "e7e5", move_source: "best_move", critical_line_san: "14...e5 15.Nf3 Nc6" };
      assert.equal(bg.normalized([reply], "boneyland", s.calls[0], "boneyland", 1).criticalLine, "1...e5 2.Nf3 Nc6");
      assert.match(s.element("headline").textContent, /\be5\b/);
      assert.doesNotMatch(s.element("headline").textContent, /\d+\.(?:\.\.)?e5/);
      assert.match(s.element("out").textContent, /Position on the board \(move numbers unknown\), Black to move/);
      assert.equal(s.root.querySelectorAll('[data-testid="aq-line-note"]').length, 1);
      // A reply whose FEN carries other clocks than the placeholders that were sent: those numbers are not shown.
      assert.deepEqual(lineFor("e5", "14...e5 15.Nf3"), ["e5 Nf3", null]);
      // White to move.
      s.click("side-switch");
      assert.deepEqual(lineFor("d4", "1.d4 d5 2.c4", F.E4.replace(" b ", " w ")), ["1.d4 d5 2.c4", "Numbered from this position"]);
      assert.equal(s.element("headline").textContent, "Queen plays d4");
    } finally { await s.close(); }
    // With the page's exact FEN the clocks are known: real move numbers, no note.
    const exact = await panelFixture("lichess-custom-start");
    try {
      await exact.open();
      exact.click("best");
      exact.events.message({ result: { ...result, fen: exact.calls[0].fen, best: { san: "Kd7", source: "structured" }, criticalLine: "42...Kd7 43.Rh7+" } });
      assert.equal(exact.element("headline").textContent, "Queen plays 42...Kd7");
      assert.equal(exact.element("line").textContent, "42...Kd7 43.Rh7+");
      assert.equal(exact.element("line-note"), null);
    } finally { await exact.close(); }
  });
  test("UI copy: one spelling of Queen, the token copy says where it is stored and sent, and the reloaded error says reload once (round 5)", async () => {
    const options = read("options.html");
    for (const [file, text] of Object.entries({ "options.html": options, "content/panel.js": source(), "store/promo-tile.html": read("store/promo-tile.html") }))
      assert.doesNotMatch(text, /QUEEN/, file + " calls the model Queen");
    assert.match(options, /stored only in this browser/);
    assert.match(options.replace(/\s+/g, " "), /sent only with your questions, and only to the Queen server being asked\. The built-in servers always get it; a custom server gets it only if you tick the box/);
    assert.doesNotMatch(options, /every question|stays in this browser/);
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      s.events.message({ error: { code: "extension_reloaded" } });
      assert.doesNotMatch(s.element("error").textContent, /reload/i);
      assert.equal(s.element("error-action").textContent, "Reload this page");
    } finally { await s.close(); }
  });
  test("Another tab's ask shows its own copy, not the busy-server copy", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      s.events.message({ error: { code: "busy", detail: "Another tab is already asking Queen.", reason: "other_tab" } });
      assert.match(s.element("error").textContent, /Another tab is already asking Queen/);
    } finally { await s.close(); }
  });
  test("A Retry-After countdown writes nothing while the panel is closed or the tab hidden, and is right when seen again (GPT round 5)", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      let now = Date.now(), writes = 0;
      s.w.Date.now = () => now; // the panel's clock, so the time left is exact
      const hide = (hidden) => {
        Object.defineProperty(s.w.document, "hidden", { value: hidden, configurable: true });
        s.w.document.dispatchEvent(new s.w.Event("visibilitychange"));
      };
      // Every write anywhere in the panel's shadow root during `ms` of real time, with the panel's clock moved on first.
      const quiet = async (ms, advance) => {
        const seen = new s.w.MutationObserver((records) => { writes += records.length; });
        seen.observe(s.root, { subtree: true, childList: true, characterData: true, attributes: true });
        now += advance;
        await sleep(ms);
        seen.disconnect();
        return writes;
      };
      await s.open();
      s.click("best");
      s.events.message({ error: { code: "busy", detail: "Queue full", retryAfter: 3 } });
      const go = s.element("error-action");
      assert.equal(go.textContent, "Try again in 3 s");
      assert(go.disabled);
      // Closed panel in a hidden tab: 1.4 s pass, and the old one-second interval would have rewritten the button.
      s.element("close").click();
      await settle();
      hide(true);
      assert.equal(await quiet(1300, 1400), 0, "writes while closed and hidden");
      assert.equal(go.textContent, "Try again in 3 s");
      hide(false);
      await s.open();
      assert.equal(s.element("error-action"), go, "the same error is still there");
      assert.equal(go.textContent, "Try again in 2 s", "1.6 s left when reopened");
      assert(go.disabled);
      // Open panel, hidden tab: nothing either, and the right number the moment the tab is shown.
      hide(true);
      assert.equal(await quiet(1300, 800), 0, "writes while open and hidden");
      hide(false);
      assert.equal(go.textContent, "Try again in 1 s", "0.8 s left");
      // Closed past the expiry: reopening shows the plain retry, switched on.
      s.element("close").click();
      await settle();
      assert.equal(await quiet(1300, 1000), 0, "writes while closed");
      await s.open();
      assert.equal(go.textContent, "Try again");
      assert(!go.disabled);
      s.click("error-action");
      assert.equal(s.calls.length, 2);
    } finally { await s.close(); }
  });
  test("Open panel disconnects in-flight asks on puzzle, variant and in-progress route changes", async () => {
    for (const id of ["lichess-puzzle", "lichess-variant", "lichess-in-progress"]) {
      const s = await panelFixture("lichess-analysis");
      try {
        await s.open();
        s.click("best");
        s.w.history.pushState({}, "", F.SITES[id].url);
        s.w.document.body.innerHTML = F.SITES[id].html.match(/<body>([\s\S]*)<\/body>/)[1];
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(s.disconnected, 1);
        assert.equal(s.calls.length, 1);
        assert(s.element("gate"));
        assert(s.element("out").hidden);
        assert.deepEqual([...s.element("panel").querySelectorAll("button:not([hidden])")].map((b) =>
          b.getAttribute("aria-label") || b.textContent), ["Close"]); // one Close: the header's
      } finally { await s.close(); }
    }
  });
  test("Panel never shows 8 characters in a row of the token body through label, list or bold splits (GPT round 5)", async () => {
    const lower = "hf_" + "Abcd" + "Efgh" + "Ijkl" + "Mnop", upper = "hf_" + "ABCD" + "EFGH" + "IJKL" + "MNOP";
    const e = F.SITES["lichess-analysis"].expect;
    for (const [token, analysis] of [
      [lower, ["hf_", "Abcd:", "Efgh:", "Ijkl:", "Mnop:"].join("\n")], // the round-5 probe
      [lower, ["hf_", "ABCD:", "EFGH:", "IJKL:", "MNOP:"].join("\n")], // label headings were recased to "Abcd"
      [upper, ["hf_", "ABCD:", "EFGH:", "IJKL:", "MNOP:"].join("\n")],
      [lower, ["- Abcd", "- Efgh", "- Ijkl", "- Mnop"].join("\n")],
      [lower, "**Abcd**\n**Efgh**\n**Ijkl**\n**Mnop**"],
      [lower, "1. Abcd\n2. Efgh\n3. Ijkl\n4. Mnop"],
    ]) {
      const s = await panelFixture("lichess-analysis");
      try {
        await s.open();
        s.click("explain");
        s.events.message({ result: bg.normalized([{ fen: e.replyFen, analysis, best_move_san: null }], "boneyland", s.calls[0], "boneyland", 1, token) });
        assert(s.element("analysis"), "the result is shown");
        const shown = s.root.textContent.replace(/[^A-Za-z0-9]/g, ""), body = token.slice(3);
        for (let i = 0; i + 8 <= body.length; i++) assert(!shown.includes(body.slice(i, i + 8)), JSON.stringify(analysis) + " shows " + body.slice(i, i + 8));
      } finally { await s.close(); }
    }
  });
  test("An unchanged daily game board stays closed after an SPA move to /analysis; a new board opens (GPT round 5)", async () => {
    const s = await panelFixture("chesscom-daily");
    try {
      const tick = () => new Promise((resolve) => setTimeout(resolve, 1250));
      assert(s.element("launcher").hidden);
      s.w.history.pushState({}, "", "/analysis");
      await tick();
      assert(s.element("launcher").hidden, "same daily board under /analysis");
      s.w.document.dispatchEvent(new s.w.Event("pointerdown"));
      await tick();
      assert(s.element("launcher").hidden, "after a click");
      assert.equal(s.w.AQ.readPosition().gate, "in_progress");
      assert.equal(s.calls.length, 0);
      // Positive control: the standalone analysis page with its own new board.
      s.w.document.body.innerHTML = F.SITES["chesscom-analysis"].html.match(/<body>([\s\S]*)<\/body>/)[1];
      await tick();
      await s.open();
      s.click("best");
      assert.equal(s.calls.length, 1);
      assert.equal(s.calls[0].moves, F.SITES["chesscom-analysis"].expect.moves);
    } finally { await s.close(); }
  });

  // --- Post-round-5 fixes, logic ---
  test("A slow getPrefs (1.1 s, a waking worker) never re-shows the launcher while the panel opens (Fable round 5)", async () => {
    const s = await panelFixture("lichess-analysis", { prefsDelay: 1100 });
    try {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 60 && s.element("launcher").hidden; i++) await sleep(50);
      assert(!s.element("launcher").hidden, "the launcher shows once prefs arrive");
      s.element("launcher").click();
      for (let t = 0; t < 1600; t += 50) {
        assert(s.element("launcher").hidden, `launcher shown ${t} ms into the open`);
        await sleep(50);
      }
      assert(!s.element("panel").hidden, "the panel is open");
      assert(s.element("launcher").hidden);
    } finally { await s.close(); }
  });
}

module.exports = { runPanelTests, panelFixture, assertSafeAnalysis };
