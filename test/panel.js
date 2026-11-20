const assert = require("node:assert/strict");
const { fixtureDoc, read } = require("./unit");
const { selectors, rootFor, nodeFor } = require("./ui");
const F = require("./fixtures");
const bg = require("../background.js");
const source = () => read("content/panel.js");
const settle = () => new Promise(setImmediate);

async function panelFixture(id, { firstUseSeen = true, mutate = (source) => source } = {}) {
  const s = fixtureDoc(id);
  const { w } = s;
  const calls = [], events = {};
  const prefs = { firstUseSeen, dock: "right" };
  let disconnected = 0;
  Object.defineProperty(w.document, "hidden", { value: false, configurable: true });
  w.chrome = { runtime: {
    id: "test-extension",
    sendMessage: async (m) => {
      if (m.type === "getPrefs") return { ...prefs };
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
  test("Another tab's ask shows its own copy, not the busy-server copy", async () => {
    const s = await panelFixture("lichess-analysis");
    try {
      await s.open();
      s.click("best");
      s.events.message({ error: { code: "busy", detail: "Another tab is already asking Queen.", reason: "other_tab" } });
      assert.match(s.element("error").textContent, /Another tab is already asking Queen/);
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
          b.getAttribute("aria-label") || b.textContent), ["Close", "Close"]);
      } finally { await s.close(); }
    }
  });
}

module.exports = { runPanelTests, panelFixture, assertSafeAnalysis };
