const assert = require("node:assert/strict");
const { makeRequest, read, vm } = require("./unit");
const F = require("./fixtures");
const { webcrypto } = require("node:crypto");

const scripts = { chess: read("content/chess.js"), background: read("background.js") };
const settle = () => new Promise(setImmediate);
const event = () => {
  const callbacks = [];
  return { addListener: (cb) => callbacks.push(cb), emit: (...args) => callbacks.map((cb) => cb(...args)) };
};

function virtualClock() {
  let time = 0, nextId = 0;
  const pending = new Map();
  function timer(cb, delay, repeat) {
    pending.set(++nextId, { cb, due: time + delay, repeat: repeat ? delay : 0 });
    return nextId;
  }
  return {
    globals: {
      Date: class extends Date { static now() { return time; } },
      setTimeout: (cb, ms) => timer(cb, ms, false),
      setInterval: (cb, ms) => timer(cb, ms, true),
      clearTimeout: (id) => pending.delete(id),
      clearInterval: (id) => pending.delete(id),
    },
    async advance(ms) {
      await settle();
      const end = time + ms;
      for (;;) {
        const entry = [...pending].sort((a, b) => a[1].due - b[1].due)[0];
        if (!entry || entry[1].due > end) break;
        const [id, task] = entry;
        time = task.due;
        if (task.repeat) task.due += task.repeat;
        else pending.delete(id);
        task.cb();
        await settle();
      }
      time = end;
    },
    get now() { return time; },
  };
}

function worker(plan, settings = {}, givePermission = false) {
  const clock = virtualClock(), output = [], accesses = [], grants = [], tabMessages = [];
  const runtime = { id: "test-extension", onInstalled: event(), onConnect: event(), onMessage: event(), openOptionsPage() {} };
  const storage = { setAccessLevel: async (level) => accesses.push(level.accessLevel),
    get: async () => ({ ...settings }), set: async (value) => Object.assign(settings, value) };
  const chrome = { runtime, storage: { local: storage, onChanged: event() }, action: { onClicked: event() },
    commands: { onCommand: event() }, tabs: { sendMessage: async (id, msg) => { tabMessages.push([id, msg]); } },
    permissions: { contains: async ({ origins }) => { grants.push(...origins); return givePermission; } } };
  const sender = { id: runtime.id, frameId: 0, url: "https://lichess.org/analysis", tab: { id: 1 } };
  const h = vm.createContext({ ...clock.globals, chrome, AbortController, TextDecoder, Uint8Array, crypto: webcrypto,
    importScripts: () => vm.runInContext(scripts.chess, h),
    fetch: async (url, init) => {
      init.signal.throwIfAborted();
      const record = { url, init, time: clock.now };
      output.push(record);
      return plan(record, clock);
    },
  });
  vm.runInContext(scripts.background, h);
  return { clock, output, accesses, grants, chrome, tabMessages,
    open(req, client = {}) {
      const responses = [];
      const port = { name: "queen", sender: { ...sender, ...client }, onMessage: event(), onDisconnect: event(),
        postMessage: (msg) => responses.push(JSON.parse(JSON.stringify(msg))), disconnect: () => port.onDisconnect.emit() };
      runtime.onConnect.emit(port);
      port.onMessage.emit(req);
      return { responses, disconnect: port.disconnect, get last() { return responses.at(-1); } };
    },
    message(req, client = {}) {
      return new Promise((resolve) => runtime.onMessage.emit(req, { ...sender, ...client }, resolve));
    },
  };
}

const best = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
const start = () => Response.json({ event_id: "test-event_1" });
const wire = (kind, data) => `event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;
const answer = (url, value = F.boneylandSuccess) => wire("complete",
  url.includes("/analyze/") ? ["<svg/>", null, value.analysis, value] : [value]);
const normal = ({ url, init }) => init.method === "POST" ? start() :
  new Response(answer(url), { headers: { "content-type": "text/event-stream" } });

function stream({ init }, clock, { at, chunks = [], aborted, header = "text/event-stream" }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      const timers = chunks.map(([delay, value]) => clock.globals.setTimeout(() => {
        if (value) controller.enqueue(encoder.encode(value));
        else controller.close();
      }, delay));
      init.signal.addEventListener("abort", () => {
        for (const timer of timers) clock.globals.clearTimeout(timer);
        if (aborted) aborted.push({ at: clock.now, code: init.signal.reason?.code });
        try { controller.error(init.signal.reason); } catch {}
      }, { once: true });
      if (at) at.push(clock.now);
    },
  });
  return new Response(body, { headers: { "content-type": header } });
}

function runWorkerTests(test) {
  test("Worker protects local storage on startup and install and limits prefs writes", async () => {
    const settings = { token: "hf_demoToken", firstUseSeen: false };
    const w = worker(normal, settings);
    w.chrome.runtime.onInstalled.emit();
    assert.deepEqual(w.accesses, ["TRUSTED_CONTEXTS", "TRUSTED_CONTEXTS"]);
    await w.message({ type: "setPrefs", prefs: { firstUseSeen: true, dock: "left", token: "hf_other" } });
    assert.equal(settings.token, "hf_demoToken");
    assert.deepEqual(JSON.parse(JSON.stringify(await w.message({ type: "getPrefs" }))), { firstUseSeen: true, dock: "left" });
  });
  test("Worker strips check and annotation marks before sending SAN to the Space", async () => {
    const w = worker(normal);
    const p = w.open({ ...best, moves: "e4 e5 Nf3 Nc6 Bc4+!?" });
    await w.clock.advance(0);
    assert(p.last.result);
    assert.equal(JSON.parse(w.output[0].init.body).data[1], F.OPENING.join(" "));
  });
  test("Worker opens the tab's panel on the Alt+Q command and ignores other commands", async () => {
    const w = worker(normal);
    w.chrome.commands.onCommand.emit("open-panel", { id: 7 });
    w.chrome.commands.onCommand.emit("something-else", { id: 7 });
    w.chrome.commands.onCommand.emit("open-panel", undefined);
    assert.deepEqual(JSON.parse(JSON.stringify(w.tabMessages)), [[7, { type: "openPanel" }]]);
  });
  test("Worker rejects malformed snapshots and lines that don't replay onto the snapshot, with no fetch", async () => {
    const w = worker(normal);
    const bad = [{ ...best, snapshot: "rnbqkbnr" }, { ...best, snapshot: 5 }, { ...best, snapshot: null }, { ...best, snapshot: [] },
      { ...best, snapshot: { ...best.snapshot, castle: "KQkq" } }, { ...best, snapshot: { ...best.snapshot, castle: 1, ep: "-" } },
      { ...best, snapshot: { ...best.snapshot, extra: 1 } }, "ask", null, [best],
      { ...best, moves: "e4 e5 Nf3 Nc6 Bb5" }, { ...best, moves: "e4 e5 Nf3 Nc6 Qh5" },
      makeRequest("explain", F.START, "e4 e5 Nf3 Nc6", { played: "Bb5", position: F.ITALIAN })];
    for (const req of bad) assert.equal(w.open(req).last?.error.code, "illegal_position", JSON.stringify(req).slice(0, 120));
    await w.clock.advance(3000);
    assert.equal(w.output.length, 0);
  });
  test("Worker keys the cache and coalescing on the snapshot's exact rights", async () => {
    const w = worker(normal);
    const exact = { ...best, snapshot: { ...best.snapshot, castle: "KQkq", ep: "-" } };
    const first = w.open(exact);
    const other = w.open({ ...exact, snapshot: { ...exact.snapshot, castle: "kq" } }, { tab: { id: 2 } });
    assert.equal(other.last.error.reason, "other_tab", "a different snapshot is not coalesced");
    await w.clock.advance(0);
    assert.equal(first.last.result.positionCheck, "ok");
    const narrower = w.open({ ...exact, snapshot: { ...exact.snapshot, castle: "kq" } });
    await w.clock.advance(2000);
    assert.equal(narrower.last.result.cached, false, "an answer checked against other rights is not reused");
    assert.equal(narrower.last.result.positionCheck, "mismatch");
  });
  test("Worker keeps a Retry-After cooldown for every ask and tab, then asks again", async () => {
    let posts = 0;
    const w = worker((r) => r.init.method !== "POST" ? normal(r) : ++posts === 1
      ? new Response("Queue full", { status: 429, headers: { "retry-after": "30" } }) : start());
    assert.equal((await (async () => { const p = w.open(best); await w.clock.advance(0); return p.last.error; })()).retryAfter, 30);
    const again = w.open(makeRequest("best", F.START, ""), { tab: { id: 2 } });
    await w.clock.advance(0);
    assert.equal(again.last.error.code, "busy");
    assert(again.last.error.retryAfter > 0 && again.last.error.retryAfter <= 30);
    assert.equal(posts, 1, "no request while the server rests");
    await w.clock.advance(31000);
    const later = w.open(makeRequest("best", F.START, ""));
    await w.clock.advance(0);
    assert(later.last.result);
    assert.equal(posts, 2);
  });
  test("Worker lifts a Retry-After cooldown when the settings change (a token for a quota)", async () => {
    let posts = 0;
    const w = worker((r) => r.init.method !== "POST" ? normal(r) : ++posts === 1
      ? new Response("GPU quota exceeded", { status: 429, headers: { "retry-after": "600" } }) : start());
    const first = w.open(best);
    await w.clock.advance(0);
    assert.equal(first.last.error.code, "quota");
    w.chrome.storage.onChanged.emit({ token: { newValue: "hf_newToken1234567890" } }, "local");
    const retry = w.open(best);
    await w.clock.advance(2000);
    assert(retry.last.result);
    assert.equal(posts, 2);
  });
  test("Worker validates the sender and disallows non-top-frame or invalid ask messages", async () => {
    const w = worker(normal);
    for (const client of [{ id: "foreign" }, { frameId: 1 }, { url: "https://evil.example/" }]) {
      assert.deepEqual(w.open(best, client).responses, []);
    }
    assert.equal(w.open({ ...best, moves: "Sf3" }).last.error.code, "illegal_position");
    await w.clock.advance(3000);
    assert.equal(w.output.length, 0);
  });
  test("Worker coalesces duplicate asks, splits cancellation, serves the cache, spaces asks and changes fresh seed", async () => {
    const w = worker(normal);
    const first = w.open(best);
    const joined = w.open(best, { tab: { id: 2 } });
    const unrelated = w.open(makeRequest("best", F.START, ""));
    assert.equal(unrelated.last.error.code, "busy");
    first.disconnect();
    await w.clock.advance(0);
    assert.equal(joined.last.result.cached, false);
    assert.equal(w.output.filter((r) => r.init.method === "POST").length, 1);
    const cached = w.open(best);
    await w.clock.advance(1);
    assert.equal(cached.last.result.cached, true);
    assert.equal(w.output.length, 2);
    const fresh = w.open({ ...best, fresh: true });
    await w.clock.advance(1998);
    assert.equal(fresh.responses.length, 0);
    await w.clock.advance(1);
    assert.equal(fresh.last.result.cached, false);
    const posts = w.output.filter((r) => r.init.method === "POST");
    assert.equal(posts[1].time - posts[0].time, 2000);
    assert.notEqual(JSON.parse(posts[0].init.body).data[4], JSON.parse(posts[1].init.body).data[4]);
    await w.clock.advance(900000);
    const expired = w.open(best);
    await w.clock.advance(0);
    assert.equal(expired.last.result.cached, false);
    assert.equal(w.output.filter((r) => r.init.method === "POST").length, 3);
  });
  test("Worker survives 90 s of bytes, including heartbeat and partial lines, with keepalives and 60 s status", async () => {
    const w = worker((request, clock) => request.init.method === "POST" ? start() : stream(request, clock, {
      chunks: [[10000, wire("heartbeat", null)], [40000, ": partial heartbeat"], [70000, "\n\n"],
        [90000, answer(request.url)]],
    }));
    const p = w.open(best);
    await w.clock.advance(90000);
    assert.equal(w.output.length, 2);
    assert.equal(p.responses.filter((m) => m.status === "keepalive").length, 4);
    assert(p.responses.some((m) => m.status === "still_waiting"));
    assert.equal(p.last.result.server, "boneyland");
    assert.equal(p.last.result.seconds, 90);
  });
  for (const backupAnswers of [false, true]) {
    test("Worker aborts at 45 s and " + (backupAnswers ? "gets a backup answer" : "reports two timeouts at 90 s"), async () => {
      const aborted = [];
      const w = worker((request, clock) => request.init.method === "POST" ? start() :
        backupAnswers && request.url.includes("hugging-apps") ? normal(request) : stream(request, clock, { aborted }));
      const p = w.open(best);
      await w.clock.advance(44999);
      assert.equal(aborted.length, 0);
      assert.equal(w.output.length, 2);
      await w.clock.advance(1);
      assert.deepEqual(aborted[0], { at: 45000, code: "timeout" });
      assert.equal(w.output.filter((r) => r.init.method === "POST").length, 2);
      assert(p.responses.some((m) => m.status === "backup"));
      if (backupAnswers) assert.equal(p.last.result.server, "hugging-apps");
      else {
        await w.clock.advance(45000);
        assert.deepEqual(aborted[1], { at: 90000, code: "timeout" });
        assert.equal(p.last.error.code, "timeout");
      }
    });
  }
  test("Worker aborts an unresponsive connect at 20 s and an active loop at 150 s overall", async () => {
    const aborted = [];
    const w = worker((request, clock) => {
      if (request.url.includes("boneyland")) return new Promise((_, reject) => {
        request.init.signal.addEventListener("abort", () => {
          aborted.push({ at: clock.now, code: request.init.signal.reason.code });
          reject(request.init.signal.reason);
        });
      });
      if (request.init.method === "POST") return start();
      return stream(request, clock, { aborted, chunks: Array.from({ length: 14 }, (_, i) =>
        [(i + 1) * 10000, wire("heartbeat", null)]) });
    });
    const p = w.open(best);
    await w.clock.advance(150000);
    assert.deepEqual(aborted, [{ at: 20000, code: "timeout" }, { at: 150000, code: "timeout" }]);
    assert.equal(p.last.error.code, "timeout");
  });
  test("Disconnecting the last client aborts immediately and late replies do not fall back", async () => {
    const aborted = [];
    const w = worker((request, clock) => request.init.method === "POST" ? start() :
      stream(request, clock, { aborted, chunks: [[10000, answer(request.url)]] }));
    const p = w.open(best);
    await w.clock.advance(100);
    p.disconnect();
    await w.clock.advance(150000);
    assert.deepEqual(aborted, [{ at: 100, code: "cancelled" }]);
    assert.equal(w.output.length, 2);
    assert.equal(p.responses.some((msg) => msg.result), false);
  });
  const cases = [
    ["quota", 429, "GPU quota exceeded"], ["token_rejected", 401, ""], ["busy", 429, ""],
    ["illegal_position", 200, wire("error", { error: "Illegal move" })],
    ["game_over", 200, wire("error", "The game is already over")],
    ["bad_response", 200, wire("complete", [{}])], ["unreachable", 404, ""],
    ["asleep", 503, "<html>Sleeping</html>"], ["all_unavailable", 503, "", 500],
    ["quota after fallback", 503, "", 429, "ZeroGPU quota exhausted"],
  ];
  for (const [name, status, body, second, secondBody] of cases) {
    test("Worker error path: " + name, async () => {
      const w = worker((r) => {
        const backup = r.url.includes("hugging-apps");
        const code = (backup && second) || status;
        if (code === 200 && r.init.method === "POST") return start();
        return new Response(backup && secondBody ? secondBody : body, { status: code });
      }, name === "token_rejected" ? { token: "hf_demoToken12345678" } : {});
      const p = w.open(best);
      await w.clock.advance(0);
      assert.equal(p.last.error.code, name.split(" ")[0]);
      assert.equal(w.output.filter((r) => r.init.method === "POST").length, status >= 500 || status === 404 ? 2 : 1);
    });
  }
  test("Worker treats 401 without a token as a dead server and tries the backup", async () => {
    const w = worker((r) => r.url.includes("boneyland") ? new Response("", { status: 401 }) : normal(r));
    const p = w.open(best);
    await w.clock.advance(0);
    assert.equal(p.last.result.server, "hugging-apps");
  });
  for (const header of ["30", "date"]) {
    test("Worker passes Retry-After (" + (header === "date" ? "HTTP date" : "seconds") + ") with the busy error", async () => {
      const w = worker(() => new Response("Queue full", { status: 429, headers: { "retry-after":
        header === "date" ? new Date(30000).toUTCString() : header } }));
      const p = w.open(best);
      await w.clock.advance(0);
      assert.equal(p.last.error.code, "busy");
      assert(Math.abs(p.last.error.retryAfter - 30) <= 1, String(p.last.error.retryAfter));
    });
  }
  test("Worker tells a second tab that another tab is already asking", async () => {
    const w = worker(normal);
    w.open(best);
    const other = w.open(makeRequest("best", F.START, ""), { tab: { id: 2 } });
    assert.deepEqual(other.last.error, { code: "busy", detail: "Another tab is already asking Queen.", reason: "other_tab" });
  });
  test("Worker echoing the saved token in its answer never reaches the panel", async () => {
    const token = "hf_SavedToken1234567890";
    const echo = { ...F.boneylandSuccess, analysis: "Your key is hf_Saved<b></b>Token1234567890 and **" + token + "**" };
    const w = worker(({ url, init }) => init.method === "POST" ? start() :
      new Response(answer(url, echo), { headers: { "content-type": "text/event-stream" } }), { token });
    const p = w.open(best);
    await w.clock.advance(0);
    assert.equal(w.output[0].init.headers.Authorization, "Bearer " + token);
    assert.doesNotMatch(JSON.stringify(p.responses).replace(/[*_\x60~]/g, ""), /SavedToken1234567890/);
  });
  test("Worker tries backup on a stream with no complete", async () => {
    const w = worker((r) => r.url.includes("boneyland") && r.init.method !== "POST"
      ? new Response(wire("heartbeat", null)) : normal(r));
    const p = w.open(best);
    await w.clock.advance(0);
    assert.equal(p.last.result.server, "hugging-apps");
    assert(p.responses.some((m) => m.status === "backup"));
  });
  test("Worker refuses malformed event IDs and redirects before issuing any follow-on request", async () => {
    const w = worker(() => Response.json({ event_id: "../a/path?skip=yes" }));
    const p = w.open(best);
    await w.clock.advance(0);
    assert.equal(p.last.error.code, "bad_response");
    assert.equal(w.output.length, 1);
    assert.equal(w.output[0].init.redirect, "error");
  });
  test("Custom origin grants and token consent are checked independently, and other uses the other server", async () => {
    const origin = "https://queentest.hf.space";
    const prefs = { primary: "custom", custom: { origin, api: "boneyland" }, token: "hf_fictionalToken" };
    const w = worker(normal, prefs, true);
    const p = w.open(best);
    await w.clock.advance(0);
    assert.equal(p.last.result.server, "custom");
    assert.deepEqual(w.grants, [origin + "/*"]);
    assert.equal(w.output[0].url.split("/gradio")[0], origin);
    assert.equal(w.output[0].init.headers.Authorization, undefined);
    const other = w.open({ ...best, fresh: true, prefer: "other" });
    await w.clock.advance(2000);
    assert.equal(other.last.result.server, "boneyland");
    assert.equal(w.output[2].init.headers.Authorization, "Bearer " + prefs.token);
    const permitted = worker(normal, { ...prefs, tokenFor: [origin] }, true);
    permitted.open(best);
    await permitted.clock.advance(0);
    assert.equal(permitted.output[0].init.headers.Authorization, "Bearer " + prefs.token);
    const absent = worker(normal, { ...prefs, tokenFor: [origin] }, false);
    const fallback = absent.open(best);
    await absent.clock.advance(0);
    assert.equal(fallback.last.result.server, "boneyland");
    assert(absent.output.every((r) => !r.url.startsWith(origin)));
  });
}

module.exports = { runWorkerTests };
