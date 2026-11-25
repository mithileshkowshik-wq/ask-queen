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
    // The answer is shown after AQ.tidy() resolves, so a reply waits for the panel to leave its waiting states.
    async reply(m) {
      events.message(m);
      for (let i = 0; i < 800 && /^(?:thinking|still_waiting|backup|tidying)$/.test(element("out").dataset.state); i++) await sleep(i < 5 ? 0 : 10);
    },
    // A stand-in for content/format.js: AQ.tidy() resolves with the reply plus `extra`, after `ms`.
    tidy(extra, ms = 0) { w.AQ.tidy = (r) => new Promise((resolve) => setTimeout(() => resolve({ ...r, ...extra }), ms)); },
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

// Fake cards shaped like the contract in docs/output-format.md (section 8), as the result carries them. BEST is the
// mockup's hand-written formatter text for the recorded answer (4.Nxe5) and RULES is what the rules give for it;
// EXPLAIN goes with a reply about the position before 3.Bc4.
const BEST = {
  promising: ["O-O", "c3"], estimate: { ahead: "w", words: "White is better", number: "+1.51" },
  card: { source: "nano", played: null,
    why: ["Captures the central pawn, giving White a material edge.", "Puts a dominant knight on e5 that attacks f7 and c6.",
      "White retains the extra pawn and a modest space advantage."],
    idea: "Castle, then play d4 for a central pawn duo on d4 and e4 that restricts Black's pieces.",
    others: [{ san: "O-O", tag: "Slightly worse", reason: "4...Nxf3+ eliminates White's active knight, so White's edge is slightly smaller." },
      { san: "c3", tag: "Weakest", reason: "After 4...Nxf3+ White retains only a modest space advantage and the bishop pair." }] },
};
const RULES = { ...BEST, card: { source: "rules", played: null,
  why: ["Capturing the central pawn and establishing a dominant white knight on e5.", "This gives White a material edge and a powerful centralized piece that attacks f7 and c6."],
  idea: "White retains the extra pawn and a modest space advantage, with the white knight on e5 continuing to exert pressure.",
  others: [{ san: "O-O", tag: "Slightly worse", reason: "Black can play 4...Nxf3+, eliminating White's active knight." },
    { san: "c3", tag: "Weakest", reason: "White retains only a modest space advantage and the bishop pair, as Black has a sound structure and can complete development comfortably." }] } };
const EXPLAIN = {
  promising: ["Bc4", "d4"], estimate: { ahead: "w", words: "White is slightly better", number: "+0.3" },
  card: { source: "rules", why: ["Pins the knight that defends e5."], idea: "",
    played: { san: "Bc4", tag: "Also good", reason: "Develops the bishop toward f7." }, // Queen's note on the played move
    others: [{ san: "d4", tag: null, reason: "Opens the center at once." }] },
};

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
          await s.reply({ result: answer });
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
        if (code === "mismatch") await s.reply({ result: { ...result, positionCheck: "mismatch" } });
        else await s.reply({ error: { code, detail: "<b>detail</b>" } });
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
      await s.reply({ result: { ...result, analysis: F.XSS.join("\n\n") + "\n\n14. Play \x60e4\x60" } });
      assertSafeAnalysis(s.element("analysis"));
    } finally { await s.close(); }
  });
  test("Mutation sanity: disabling escaping in the shipped renderer fails the hostile-result assertion", async () => {
    const s = await panelFixture("lichess-analysis", { mutate: (source) => source.replace("const text = (s) => document.createTextNode(s);",
      'const text = (s) => { const t = document.createElement("template"); t.innerHTML = s; return t.content; };') });
    try {
      await s.open();
      s.click("best");
      await s.reply({ result: { ...result, analysis: F.XSS.join("\n\n") } });
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
      await s.reply({ result: { ...result, analysis: "\x60a\x60".repeat(66666) + " *the* **end**" } });
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
      await s.reply({ result });
      s.w.document.createTextNode = createTextNode;
      assert.equal(s.element("out").dataset.state, "error");
      assert.equal(s.element("out").dataset.code, "bad_response");
      assert.equal(s.element("headline"), null, "no half-built result");
      assert.match(s.element("error-details").textContent, /could not be shown: Maximum call stack/);
      assert.equal(s.element("error-action").textContent, "Try the other server");
      s.click("error-action");
      assert.deepEqual(s.calls.map((c) => [c.fresh, c.prefer]), [[false, undefined], [true, "other"]]);
      await s.reply({ result });
      assert.match(s.element("headline").textContent, /Queen plays 3\.\.\.Be7/);
    } finally { await s.close(); }
  });
  test("Panel rejects clicks after the cursor changes, then flags earlier results stale", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      await s.reply({ result });
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
      await s.reply({ result });
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
      await s.reply({ result: { ...result, fen: F.START, best: { san: "e4", uci: "e2e4", source: "structured" } } });
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
      await s.reply({ result });
      assert.equal(s.element("status"), region, "and then the headline");
      assert(region.contains(s.element("headline")));
    } finally { await s.close(); }
  });
  test("A board-fallback answer has no move number in its headline, and its critical line is numbered from the asked position", async () => {
    const s = await panelFixture("lichess-board-side");
    try {
      const lineFor = async (best, criticalLine, fen = F.E4) => {
        s.click("best");
        await s.reply({ result: { ...result, fen, best: { san: best, source: "structured" }, criticalLine } });
        return [s.element("line").textContent, s.element("line-note")?.textContent ?? null];
      };
      await s.open();
      // Black to move: the line counts from this position and says so once.
      assert.deepEqual(await lineFor("e5", "1...e5 2.Nf3 Nc6"), ["1...e5 2.Nf3 Nc6", "Numbered from this position"]);
      // That is the line the background builds: it numbers a supplied line from the reply's FEN, which has the
      // placeholder clocks that were sent, whatever numbers the server wrote.
      const reply = { fen: F.E4, analysis: "Take the centre.", best_move_san: "e5", best_move_uci: "e7e5", move_source: "best_move", critical_line_san: "14...e5 15.Nf3 Nc6" };
      assert.equal(bg.normalized([reply], "boneyland", s.calls[0], "boneyland", 1).criticalLine, "1...e5 2.Nf3 Nc6");
      assert.match(s.element("headline").textContent, /\be5\b/);
      assert.doesNotMatch(s.element("headline").textContent, /\d+\.(?:\.\.)?e5/);
      assert.match(s.element("out").textContent, /Position on the board \(move numbers unknown\), Black to move/);
      assert.equal(s.root.querySelectorAll('[data-testid="aq-line-note"]').length, 1);
      // A reply whose FEN carries other clocks than the placeholders that were sent: those numbers are not shown.
      assert.deepEqual(await lineFor("e5", "14...e5 15.Nf3"), ["e5 Nf3", null]);
      // White to move.
      s.click("side-switch");
      assert.deepEqual(await lineFor("d4", "1.d4 d5 2.c4", F.E4.replace(" b ", " w ")), ["1.d4 d5 2.c4", "Numbered from this position"]);
      assert.equal(s.element("headline").textContent, "Queen plays d4");
    } finally { await s.close(); }
    // With the page's exact FEN the clocks are known: real move numbers, no note.
    const exact = await panelFixture("lichess-custom-start");
    try {
      await exact.open();
      exact.click("best");
      await exact.reply({ result: { ...result, fen: exact.calls[0].fen, best: { san: "Kd7", source: "structured" }, criticalLine: "42...Kd7 43.Rh7+" } });
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
      await s.reply({ error: { code: "extension_reloaded" } });
      assert.doesNotMatch(s.element("error").textContent, /reload/i);
      assert.equal(s.element("error-action").textContent, "Reload this page");
    } finally { await s.close(); }
  });
  test("Another tab's ask shows its own copy, not the busy-server copy", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      await s.reply({ error: { code: "busy", detail: "Another tab is already asking Queen.", reason: "other_tab" } });
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
      await s.reply({ error: { code: "busy", detail: "Queue full", retryAfter: 3 } });
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
        await s.reply({ result: bg.normalized([{ fen: e.replyFen, analysis, best_move_san: null }], "boneyland", s.calls[0], "boneyland", 1, token) });
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

  // --- The answer card (docs/output-format.md), UI half ---
  // Every card here is fake data shaped like the contract, handed over by a stand-in AQ.tidy(). The best-move text is
  // the hand-written formatter text of the mockup; Queen's reply under it is the real boneyland recording.
  const recording = (s) => bg.normalized(F.boneyland, "boneyland", s.calls[0], "boneyland", 16);
  const texts = (el, sel) => [...el.querySelectorAll(sel)].map((n) => n.textContent);
  const parts = (s) => [...s.element("card").children].map((el) => el.dataset.testid.slice(3));
  // Explain 3.Bc4 on the lichess-analysis fixture: Queen's reply is for the position before it.
  const before = { ...result, fen: F.NC6, analysis: "The best move is 3.Bb5, pinning the knight.\n\nThe alternative 3.Bc4 is also sound.",
    evaluationText: "White is slightly better by approximately 0.3 pawns.", criticalLine: "3.Bb5 a6 4.Ba4 Nf6" };
  async function carded(id, ask, base, extra) {
    const s = await panelFixture(id);
    await s.open();
    s.tidy(extra);
    s.click(ask);
    await s.reply({ result: typeof base === "function" ? base(s) : base });
    assert.equal(s.element("out").dataset.state, "result");
    return s;
  }

  test("Card, best move: verdict, estimate chip, why, main line, key idea, other moves, then Queen's full answer collapsed", async () => {
    const s = await carded("lichess-recorded", "best", recording, BEST);
    try {
      assert.equal(s.element("headline").textContent, "Queen plays 4.Nxe5");
      assert.equal(s.element("verdict"), null);
      assert.deepEqual(parts(s), ["estimate", "why", "main-line", "idea", "others", "full", "by"]);
      // The estimate: a chip for sighted readers, hidden from screen readers, which get it in words.
      const chip = s.element("estimate").querySelector(".chip");
      assert.deepEqual([chip.textContent, chip.className, chip.getAttribute("aria-hidden")], ["+1.51", "chip w", "true"]);
      assert.deepEqual(texts(s.element("estimate"), "p"), ["plus 1.51, White is better", "Queen's estimate after 4.Nxe5"]);
      assert.equal(s.element("estimate").querySelector("p .sr").textContent, "plus 1.51, ");
      // Headings and lists are real elements.
      assert.deepEqual(texts(s.element("card"), "h4").slice(0, 4), ["Why 4.Nxe5", "Main line", "Key idea", "Other moves"]);
      assert.deepEqual(texts(s.element("why"), "ul > li"), BEST.card.why);
      assert.equal(s.element("line").textContent, "4.Nxe5 Qf6 5.O-O Ne6 6.d4 d6");
      assert.deepEqual(texts(s.element("line"), "span"), ["4.Nxe5 Qf6", "5.O-O Ne6", "6.d4 d6"], "one unit per move number");
      assert.deepEqual(texts(s.element("line"), "b"), ["Nxe5"], "Queen's move is marked");
      assert.equal(s.element("line-note"), null);
      assert.equal(s.element("idea").querySelector("p").textContent, BEST.card.idea);
      assert.deepEqual(texts(s.element("others"), "ul > li .mv"), ["4.O-O", "4.c3"]);
      assert.deepEqual([...s.element("others").querySelectorAll(".tag")].map((t) => [t.textContent, t.className]), [["Slightly worse", "tag"], ["Weakest", "tag bad"]]);
      assert.deepEqual(texts(s.element("others"), "ul > li > p"), BEST.card.others.map((o) => o.reason));
      // Queen's full answer: collapsed, with the original rendering and the evaluation sentence, shown once.
      const full = s.element("full");
      assert.equal(full.localName, "details");
      assert.equal(full.open, false);
      assert.equal(full.querySelector("summary").textContent, "Queen's full answer");
      assert(full.contains(s.element("analysis")) && full.contains(s.element("eval")));
      assert.equal(s.element("analysis").querySelectorAll("p").length, 4, "Queen's four paragraphs");
      assert.match(s.element("analysis").textContent, /^The root position is a sharp[\s\S]*complete development comfortably\.$/);
      assert.equal(s.element("eval").textContent, "White is better by approximately 1.51 pawns, retaining the extra pawn and a modest space advantage after the best play.");
      assert.equal(s.root.querySelectorAll('[data-testid="aq-eval"]').length, 1);
      assert.equal(s.element("eval").previousElementSibling.textContent, "Evaluation");
      assert.equal(s.element("by").textContent, "The move, the estimate and the line are Queen's own. Chrome's built-in AI shortened the rest on this device.");
      assert.equal(s.element("no-card"), null);
      assert.equal(s.element("card").querySelector("dl, table, a, img"), null);
    } finally { await s.close(); }
  });
  test("Card: the who-wrote-what line follows card.source, and says nothing about Chrome's AI for rules", async () => {
    const line = async (source) => {
      const s = await carded("lichess-recorded", "best", recording, { ...BEST, card: { ...BEST.card, source } });
      try { return s.element("by")?.textContent ?? null; } finally { await s.close(); }
    };
    const rules = await line("rules");
    assert.equal(rules, "The move, the estimate and the line are Queen's own. The rest is picked from Queen's sentences.");
    assert.doesNotMatch(rules, /Chrome|\bAI\b|device/);
    assert.equal(await line("mixed"), "The move, the estimate and the line are Queen's own. Chrome's built-in AI shortened part of the rest on this device, and the other points are Queen's own sentences.");
    assert.match(await line("nano"), /Chrome's built-in AI shortened the rest on this device\.$/);
    // A card that doesn't say who wrote it is not shown at all.
    for (const source of ["gpt", undefined, "__proto__"]) assert.equal(await line(source), null, String(source));
  });
  test("Card, Explain and Queen agrees: no sub-line, and the reasons follow the verdict", async () => {
    const s = await carded("lichess-analysis", "explain", { ...before, best: { san: "Bc4", uci: "f1c4", source: "structured" }, criticalLine: "3.Bc4 Bc5" },
      { ...EXPLAIN, promising: ["Bb5", "d4"], card: { ...EXPLAIN.card, others: [{ san: "Bb5", tag: "Also good", reason: "Pins the knight." }] } }); // a stray played note is ignored
    try {
      assert.equal(s.element("headline").textContent, "Queen agrees with 3.Bc4");
      assert.equal(s.element("verdict"), null, "\"This is its explanation.\" is gone when Why follows");
      assert.equal(s.element("played"), null);
      assert.deepEqual(parts(s), ["estimate", "why", "main-line", "others", "full", "by"]); // no key idea: Queen stated none
      assert.equal(s.element("why").querySelector("h4").textContent, "Why 3.Bc4");
      assert.deepEqual(texts(s.element("others"), ".mv"), ["3.Bb5", "3.d4"]);
      assert.deepEqual(texts(s.element("others"), "li"), ["3.Bb5 Also goodPins the knight.", "3.d4 "], "a move with nothing said about it is listed bare");
    } finally { await s.close(); }
  });
  test("Card, Explain and Queen prefers another move: Queen's note on the played move comes first and leaves Other moves", async () => {
    const s = await carded("lichess-analysis", "explain", { ...before, best: { san: "Bb5", uci: "f1b5", source: "structured" } }, EXPLAIN);
    try {
      assert.equal(s.element("headline").textContent, "3.Bc4 was played. Queen prefers 3.Bb5.");
      assert.equal(s.element("verdict").textContent, "This explains Bb5. Queen's note on Bc4 comes first.");
      assert.deepEqual(parts(s), ["played", "estimate", "why", "main-line", "others", "full", "by"]);
      assert.equal(s.element("played").querySelector("h4").textContent, "Queen on 3.Bc4");
      assert.deepEqual([...s.element("played").querySelectorAll(".tag")].map((t) => [t.textContent, t.className]), [["Also good", "tag good"]]);
      assert.equal(s.element("played").querySelector("p").textContent, "Develops the bishop toward f7.");
      // Every heading names the move it is about.
      assert.equal(s.element("why").querySelector("h4").textContent, "Why 3.Bb5");
      assert.equal(s.element("estimate").querySelector("p.sub").textContent, "Queen's estimate after 3.Bb5");
      assert.deepEqual(texts(s.element("others"), ".mv"), ["3.d4"], "the played move is not listed twice");
      assert.deepEqual(texts(s.element("line"), "b"), ["Bb5"]);
    } finally { await s.close(); }
  });
  test("Card, Explain and Queen has no note on the played move: \"Queen can't judge\" stays and there is no note", async () => {
    const unlisted = { ...EXPLAIN, promising: ["d4"], card: { ...EXPLAIN.card, played: null } };
    // A note with neither a tag nor a reason says nothing, and a note about some other move is not about the played one.
    const silent = { ...EXPLAIN, card: { ...EXPLAIN.card, played: { san: "Bc4", tag: null, reason: "" } } };
    const other = { ...EXPLAIN, card: { ...EXPLAIN.card, played: { san: "d4", tag: "Also good", reason: "Opens the center." } } };
    for (const [extra, moves] of [[unlisted, ["3.d4"]], [silent, ["3.Bc4", "3.d4"]], [other, ["3.Bc4", "3.d4"]]]) {
      const s = await carded("lichess-analysis", "explain", { ...before, best: { san: "Bb5", uci: "f1b5", source: "structured" } }, extra);
      try {
        assert.equal(s.element("verdict").textContent, "This explains Bb5. Queen can't judge Bc4 directly.");
        assert.equal(s.element("played"), null);
        assert.deepEqual(parts(s), ["estimate", "why", "main-line", "others", "full", "by"]);
        assert.deepEqual(texts(s.element("others"), ".mv"), moves);
      } finally { await s.close(); }
    }
  });
  test("Card, board-only read: no move number in any label, and the card's sentences follow the main line's rule", async () => {
    const extra = { promising: ["c5", "e6"], estimate: { ahead: null, words: "About equal", number: null },
      card: { source: "nano", why: ["Meets 1.e4 in the center and frees the bishop.", "After 2.Nf3 Black defends with 2...Nc6."],
        idea: "Develop, then castle after 3.Bc4 Bc5; the estimate is 0.15 pawns.", others: [{ san: "c5", tag: "Also good", reason: "1...c5 fights for d4 from the side." }] } };
    const base = { ...result, fen: F.E4, best: { san: "e5", source: "structured" }, evaluationText: "Equal for White and Black: about 0.15 pawns either way." };
    // Numbers nobody can vouch for: dropped from the line and from the card's sentences. A decimal is not a move number.
    const s = await carded("lichess-board-side", "best", { ...base, criticalLine: "14...e5 15.Nf3 Nc6" }, extra);
    try {
      assert.equal(s.element("headline").textContent, "Queen plays e5");
      assert.equal(s.element("why").querySelector("h4").textContent, "Why e5");
      assert.deepEqual(texts(s.element("others"), ".mv"), ["c5", "e6"]);
      assert.equal(s.element("line").textContent, "e5 Nf3 Nc6");
      assert.deepEqual(texts(s.element("line"), "span"), ["e5", "Nf3", "Nc6"]);
      assert.equal(s.element("line-note"), null);
      assert.deepEqual(texts(s.element("why"), "li"), ["Meets e4 in the center and frees the bishop.", "After Nf3 Black defends with Nc6."]);
      assert.equal(s.element("idea").querySelector("p").textContent, "Develop, then castle after Bc4 Bc5; the estimate is 0.15 pawns.");
      assert.deepEqual(texts(s.element("others"), "li > p"), ["c5 fights for d4 from the side."]);
      // "About equal" has no number, so no chip.
      assert.equal(s.element("estimate").querySelector(".chip"), null);
      assert.deepEqual(texts(s.element("estimate"), "p"), ["About equal", "Queen's estimate after e5"]);
      for (const t of texts(s.element("card"), "h4, li, p, .mv, .moves").filter((t) => !s.element("full").textContent.includes(t)))
        assert.doesNotMatch(t, /\d+\.(?:\.\.)?[A-Za-z]/, "a move number the extension wrote");
    } finally { await s.close(); }
    // Numbered from the asked position: the line says so, and the sentences keep the numbers that match it.
    const counted = await carded("lichess-board-side", "best", { ...base, criticalLine: "1...e5 2.Nf3 Nc6" }, extra);
    try {
      assert.equal(counted.element("line").textContent, "1...e5 2.Nf3 Nc6");
      assert.deepEqual(texts(counted.element("line"), "span"), ["1...e5", "2.Nf3 Nc6"]);
      assert.equal(counted.element("line-note").textContent, "Numbered from this position");
      assert.deepEqual(texts(counted.element("why"), "li"), extra.card.why);
      assert.equal(counted.element("why").querySelector("h4").textContent, "Why e5");
    } finally { await counted.close(); }
  });
  test("Card null, no clear move: the caveats, one line saying why, and Queen's full answer open", async () => {
    const s = await carded("lichess-analysis", "best", { ...result, best: null, suggestion: { san: "Be7", source: "prose_unverified" }, truncated: true,
      analysis: "The best move is 3...Be7, developing.", evaluationText: "Black is slightly worse by approximately 0.21 pawns." },
      { card: null, estimate: { ahead: "w", words: "White is slightly better", number: "+0.21" }, promising: ["Nf6"] });
    try {
      assert.equal(s.element("headline").textContent, "Queen didn't name a clear move");
      assert(s.element("truncated") && s.element("other-server"));
      assert.equal(s.element("suggestion").textContent, "Queen's text suggests 3...Be7 (unverified)");
      assert.deepEqual(parts(s), ["no-card", "full"], "no estimate, reasons, idea or other moves");
      assert.equal(s.element("no-card").textContent, "There are no short points, because Queen's move couldn't be checked.");
      assert.equal(s.element("full").open, true);
      assert.equal(s.element("analysis").textContent, "The best move is 3...Be7, developing.");
      assert.equal(s.element("eval").textContent, "Black is slightly worse by approximately 0.21 pawns.", "the sentence is in the full answer");
      assert(s.element("full").contains(s.element("eval")));
      assert.equal(s.element("by"), null);
    } finally { await s.close(); }
  });
  test("Card null with a checked move, a missing AQ.tidy and a malformed card all show the checked sections with the full answer open", async () => {
    const base = { ...result, evaluationText: "White is better by approximately 1.2 pawns.", criticalLine: "3...Be7 4.O-O Nf6" };
    const est = { estimate: { ahead: "w", words: "White is better", number: "+1.2" } };
    for (const [name, extra] of [["card null", { card: null, ...est }], ["no AQ.tidy", undefined], ["tidy rejects", "reject"], ["tidy resolves with nothing", "nothing"],
      ["no why", { card: { source: "rules", why: [], idea: "x", others: [] }, ...est }], ["why of the wrong type", { card: { source: "nano", why: "Develops.", idea: "" }, ...est }],
      ["a card that is a string", { card: "<b>Develops</b>", ...est }]]) {
      const s = await panelFixture("lichess-analysis");
      try {
        await s.open();
        if (extra === "reject") s.w.AQ.tidy = () => Promise.reject(new Error("formatter failed"));
        else if (extra === "nothing") s.w.AQ.tidy = async () => undefined;
        else if (extra) s.tidy(extra);
        else delete s.w.AQ.tidy;
        s.click("best");
        await s.reply({ result: base });
        assert.equal(s.element("headline").textContent, "Queen plays 3...Be7", name);
        // With no estimate from the worker there is no estimate row. Queen's sentence is in the open answer either way.
        assert.deepEqual(parts(s), [...(extra?.estimate ? ["estimate"] : []), "main-line", "no-card", "full"], name);
        if (extra?.estimate) assert.equal(s.element("estimate").querySelector(".chip").textContent, "+1.2", name);
        assert.equal(s.element("no-card").textContent, "There are no short points for this answer.", name);
        assert.equal(s.element("full").open, true, name);
        assert.equal(s.element("analysis").textContent, "Develop the bishop.", name);
        assert.equal(s.element("line").textContent, "3...Be7 4.O-O Nf6", name);
        assert.deepEqual(texts(s.element("full"), '[data-testid="aq-eval"]'), [base.evaluationText], name);
        assert.equal(s.element("by"), null, name);
      } finally { await s.close(); }
    }
  });
  test("Card estimate: Black ahead is a dark chip with a true minus, and an estimate off the contract is not shown", async () => {
    const sentence = "Black is clearly better by approximately 2.4 pawns.";
    const shown = async (estimate, evaluationText = sentence) => {
      const s = await carded("lichess-recorded", "best", (s) => ({ ...recording(s), evaluationText }), { ...BEST, estimate });
      try {
        const est = s.element("estimate"), chip = est?.querySelector(".chip");
        assert.deepEqual(texts(s.element("full"), '[data-testid="aq-eval"]'), evaluationText ? [evaluationText] : [], "Queen's sentence stays in the full answer");
        return [chip ? [chip.textContent, chip.className, chip.getAttribute("aria-hidden")] : null, ...(est ? texts(est, "p") : [])];
      } finally { await s.close(); }
    };
    const black = [["−2.4", "chip b", "true"], "minus 2.4, Black is clearly better", "Queen's estimate after 4.Nxe5"];
    assert.deepEqual(await shown({ ahead: "b", words: "Black is clearly better", number: "−2.4" }), black);
    // A hyphen for the minus, or no sign at all: the panel writes the sign from the side that is ahead.
    assert.deepEqual(await shown({ ahead: "b", words: "Black is clearly better", number: "-2.4" }), black);
    assert.deepEqual(await shown({ ahead: "b", words: "Black is clearly better", number: "2.4" }), black);
    assert.deepEqual(await shown({ ahead: "b", words: "Black is clearly better", number: null }), [null, "Black is clearly better", "Queen's estimate after 4.Nxe5"]);
    assert.deepEqual(await shown({ ahead: null, words: "About equal", number: null }, "Equal for White and Black: balanced."), [null, "About equal", "Queen's estimate after 4.Nxe5"]);
    for (const [why, estimate] of Object.entries({
      "no estimate": null,
      "a number that is not in Queen's sentence": { ahead: "b", words: "Black is clearly better", number: "−9.9" },
      "a sign for the other side": { ahead: "b", words: "Black is clearly better", number: "+2.4" },
      "words outside the fixed wording": { ahead: "b", words: "Black is winning <b>easily</b>", number: "−2.4" },
      "the side and the words disagree": { ahead: "w", words: "Black is clearly better", number: "+2.4" },
      "a number with markup": { ahead: "b", words: "Black is clearly better", number: "−2.4<i>" },
      "a number that is not a string": { ahead: "b", words: "Black is clearly better", number: -2.4 },
      "an unknown side": { ahead: "x", words: "Black is clearly better", number: "−2.4" },
      "equal in other words": { ahead: null, words: "Dead level", number: null },
    })) assert.deepEqual(await shown(estimate), [null], why);
    // With no evaluation sentence there is no estimate at all.
    assert.deepEqual(await shown({ ahead: "b", words: "Black is clearly better", number: "−2.4" }, null), [null]);
  });
  test("Card: formatter strings with HTML or Markdown are shown as text, and only checked moves and the five fixed tags are shown", async () => {
    const evil = ['<img src=x onerror="window.aqExecuted=1">', "**bold** _em_ `code` [click](javascript:alert(1))", "<script>window.aqExecuted=1</script># Heading\n- item"];
    const s = await carded("lichess-recorded", "best", recording, {
      // Queen's list, as handed over: an illegal move, a repeat, the best move itself and junk are all dropped.
      promising: ["O-O", "Qh5", "O-O", "Nxe5", "<b>c3</b>", "c3", "d3", "d4"], estimate: BEST.estimate,
      card: { source: "nano", why: evil, idea: evil[0] + evil[1],
        others: [{ san: "O-O", tag: "<b>Winning</b>", reason: evil[0] }, { san: "c3", tag: "constructor", reason: evil[1] }, { san: "d3", tag: "Much worse", reason: evil[2] },
          { san: "Qxf7#", tag: "Also good", reason: "A move that is not on Queen's list." }] },
    });
    try {
      assert.deepEqual(texts(s.element("why"), "li"), evil.map((t) => t.trim()));
      assert.equal(s.element("idea").querySelector("p").textContent, evil[0] + evil[1]);
      assert.deepEqual(texts(s.element("others"), ".mv"), ["4.O-O", "4.c3", "4.d3"], "at most three, each legal here and on Queen's list");
      assert.deepEqual(texts(s.element("others"), ".tag"), ["Much worse"], "a tag outside the fixed five is not shown");
      assert.deepEqual(texts(s.element("others"), "li > p"), evil.map((t) => t.trim()));
      // Nothing in the card's short text became an element: only the card's own fixed structure is there.
      const card = s.element("card");
      const own = new Set(["SECTION", "DIV", "H4", "P", "UL", "LI", "SPAN", "B", "DETAILS", "SUMMARY"]);
      for (const el of card.querySelectorAll("*")) if (!s.element("analysis").contains(el)) assert(own.has(el.tagName), el.tagName);
      for (const el of card.querySelectorAll('[data-testid="aq-why"] li, [data-testid="aq-idea"] p, [data-testid="aq-others"] li > p'))
        assert.equal(el.children.length, 0, el.textContent);
      assert.equal(card.querySelector("img, script, a, strong, em, code, [onerror], [href], [src]"), null);
      assert.equal(s.w.aqExecuted, undefined);
      assert.doesNotMatch(read("content/panel.js"), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/, "the panel has no HTML-parsing sink");
    } finally { await s.close(); }
  });
  test("Tidying: the status is announced politely, Cancel still works, and the answer is then rendered once and never rewritten", async () => {
    const s = await panelFixture("lichess-recorded");
    try {
      await s.open();
      let release, tidied = 0;
      s.w.AQ.tidy = (r) => new Promise((resolve) => { tidied++; release = () => resolve({ ...r, ...BEST }); });
      const region = s.element("status");
      s.click("best");
      const base = recording(s);
      s.events.message({ result: base });
      await sleep(50);
      assert.equal(s.element("out").dataset.state, "thinking", "a formatter that answers at once never changes the status");
      await sleep(300);
      // Slow: the same polite live region says so, in short copy, and Cancel is still there.
      assert.equal(s.element("out").dataset.state, "tidying");
      assert.equal(s.element("status"), region);
      assert.equal(region.getAttribute("role"), "status");
      assert.deepEqual(texts(region, "p"), ["Queen has answered.", "Position after 3...Nd4, White to move", "Shortening it on this device."]);
      assert.equal(s.element("headline"), null, "nothing of the answer is shown yet");
      assert.equal(s.element("card"), null);
      assert(!s.element("cancel").hidden);
      // A second reply or a repeat click while tidying changes nothing.
      s.events.message({ result: { ...base, best: { san: "O-O", source: "structured" } } });
      s.click("best");
      assert.equal(s.calls.length, 1);
      assert.equal(tidied, 1);
      // Every write to the result from here on: the answer goes in once, complete.
      let headlines = 0, cards = 0, later = 0, done = false;
      const seen = new s.w.MutationObserver((records) => {
        for (const r of records) {
          if (done) later++;
          for (const n of r.addedNodes) {
            if (n.nodeType !== 1) continue;
            headlines += n.matches('[data-testid="aq-headline"]') + n.querySelectorAll('[data-testid="aq-headline"]').length;
            cards += n.matches('[data-testid="aq-card"]') + n.querySelectorAll('[data-testid="aq-card"]').length;
          }
        }
      });
      seen.observe(s.element("out"), { subtree: true, childList: true, characterData: true });
      release();
      await sleep(30);
      assert.equal(s.element("out").dataset.state, "result");
      assert.equal(s.element("headline").textContent, "Queen plays 4.Nxe5");
      assert.deepEqual(texts(s.element("why"), "li"), BEST.card.why);
      const html = s.element("out").textContent;
      done = true;
      await sleep(400);
      seen.disconnect();
      assert.deepEqual([headlines, cards, later], [1, 1, 0], "one render, and no write after it");
      assert.equal(s.element("out").textContent, html);

      // Cancel while tidying: the answer is dropped, also when the formatter resolves later.
      s.w.AQ.tidy = (r) => new Promise((resolve) => { release = () => resolve({ ...r, ...BEST }); });
      s.click("ask-again");
      s.events.message({ result: base });
      await sleep(320);
      assert.equal(s.element("out").dataset.state, "tidying");
      s.click("cancel");
      assert(s.element("out").hidden);
      release();
      await sleep(350);
      assert(s.element("out").hidden, "a late formatter result is not shown");
      assert.equal(s.element("headline"), null);
      // Closing the panel while tidying drops it too.
      s.click("best");
      s.events.message({ result: base });
      await sleep(20);
      s.click("close");
      await settle();
      release();
      await sleep(50);
      await s.open();
      assert(s.element("out").hidden, "nothing was rendered while the panel was closed");
    } finally { await s.close(); }
  });
  test("Tidying: the worker's \"tidying\" status shows the same copy after a quarter of a second, and never when the answer follows at once", async () => {
    const s = await panelFixture("lichess-recorded");
    try {
      await s.open();
      s.click("best");
      const withCard = { ...recording(s), ...BEST }; // the worker built the card: AQ.tidy has nothing to add
      s.events.message({ status: "tidying" });
      await sleep(100);
      assert.equal(s.element("out").dataset.state, "thinking");
      await sleep(250);
      assert.equal(s.element("out").dataset.state, "tidying");
      assert.deepEqual(texts(s.element("status"), "p"), ["Queen has answered.", "Position after 3...Nd4, White to move", "Shortening it on this device."]);
      assert(!s.element("cancel").hidden);
      await s.reply({ result: withCard });
      assert.equal(s.element("out").dataset.state, "result");
      assert.deepEqual(texts(s.element("why"), "li"), BEST.card.why);
      // The quick path: status and answer within 250 ms. The status never shows, and nothing is written after the answer.
      s.click("ask-again");
      s.events.message({ status: "tidying" });
      await s.reply({ result: withCard });
      assert.equal(s.element("out").dataset.state, "result");
      const shown = s.element("out").textContent;
      await sleep(400);
      assert.equal(s.element("out").dataset.state, "result", "the late timer leaves the answer alone");
      assert.equal(s.element("out").textContent, shown);
    } finally { await s.close(); }
  });
  test("Card with the existing states: cut off, taken from Queen's text, and stale all keep working around it", async () => {
    const s = await carded("lichess-recorded", "best", (s) => ({ ...recording(s), truncated: true, best: { san: "Nxe5", uci: "f3e5", source: "prose_verified" } }), BEST);
    try {
      const ids = [...s.element("out").querySelectorAll("[data-testid]")].map((el) => el.dataset.testid);
      const at = (id) => ids.indexOf("aq-" + id);
      for (const id of ["truncated", "stale", "from-text", "card"]) assert(at(id) > at("headline"), id);
      assert(at("truncated") < at("card") && at("stale") < at("card") && at("from-text") < at("card"), "caveats come before the card");
      assert(at("card") < ids.indexOf("aq-copy-fen") && ids.indexOf("aq-copy-fen") < at("result-footer"));
      assert.equal(s.element("from-text").textContent, "This move was taken from Queen's text.");
      assert(s.element("stale").hidden);
      s.w.document.body.innerHTML = bodyOf("lichess-start");
      await sleep(350);
      assert(!s.element("stale").hidden);
      assert.match(s.element("live").textContent, /board has moved/i);
      assert(s.element("ask-again").disabled && s.element("other-server").disabled);
      assert.deepEqual(texts(s.element("why"), "li"), BEST.card.why, "the stale card is still readable");
      s.click("stale-reask");
      assert.equal(s.calls.length, 2);
    } finally { await s.close(); }
  });
}

module.exports = { runPanelTests, panelFixture, assertSafeAnalysis, CARDS: { BEST, RULES, EXPLAIN } };
