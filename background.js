if (typeof importScripts === "function") importScripts("content/chess.js");

const chess = globalThis.AQChess;
const DEFAULT_SEED = 20260823;
const BUILTINS = {
  boneyland: "https://boneyland-queen-pawn-8.hf.space",
  "hugging-apps": "https://hugging-apps-queen-pawn-8.hf.space",
};
const TRANSIENT = new Set(["unreachable", "asleep", "timeout"]);
const CODES = {
  quota: "The provider reported that its free GPU quota was exhausted.",
  token_rejected: "The provider rejected the Hugging Face credentials.",
  unreachable: "The server could not be reached or closed the response stream.",
  asleep: "The server is sleeping, building, or temporarily unavailable.",
  timeout: "The server did not respond within the time limit.",
  busy: "The server queue is full or rate limited.",
  illegal_position: "The position or move list could not be used.",
  game_over: "The position has no further moves.",
  bad_response: "The server's format changed. Check for an update.",
  cancelled: "The request was cancelled.",
  extension_reloaded: "The extension was reloaded.",
  all_unavailable: "The primary and backup servers were unavailable.",
};
const failure = (code) => Object.assign(new Error(CODES[code]), { code });

// A 401/403 only means our token was refused when we sent one; otherwise the Space itself is unusable (transient).
function classify(status, detail = "", sentToken = false) {
  if (/quota|zero.?gpu.*(?:exhaust|limit)/i.test(detail)) return "quota";
  const refused = status === 401 || status === 403;
  if (sentToken && (refused || /(?:invalid|reject|missing|expired).{0,25}(?:token|credential)|unauthori[sz]ed/i.test(detail)))
    return "token_rejected";
  if (refused) return "unreachable";
  if (/game (?:is (?:already )?)?over|no legal moves|checkmate|stalemate/i.test(detail)) return "game_over";
  if (/illegal (?:position|move|san|fen)|invalid (?:position|move|san|fen)|could not (?:parse|apply).*move/i.test(detail))
    return "illegal_position";
  if (status === 429 || /queue.{0,20}full|queue at capacity/i.test(detail)) return "busy";
  if (status === 503 || /<(?:!doctype\s+html|html\b)|space.{0,30}(?:sleep|build|start)/i.test(detail)) return "asleep";
  if (status === 404 || status >= 500 || !status) return "unreachable";
  return "bad_response";
}

function fallbackError(first, last) {
  return TRANSIENT.has(last) && first !== last ? "all_unavailable" : last;
}

// Decode incrementally, dispatching SSE records after the blank line (or at EOF).
function createSseParser() {
  const decoder = new TextDecoder();
  let buffer = "", event = "", data = [];
  function split(chunk, eof = false) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: !eof });
    if (buffer.length > 2_000_000) throw failure("bad_response");
    const records = [];
    function dispatch() {
      if (data.length) records.push({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
    }
    const lines = buffer.split(/\r\n|\n|\r(?!$)/);
    buffer = lines.pop();
    if (eof && buffer) lines.push(buffer.replace(/\r$/, ""));
    for (const line of lines) {
      if (!line) dispatch();
      else if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (eof) dispatch();
    return records;
  }
  return { push: split, finish: () => split(new Uint8Array(), true) };
}

// Provider prose to plain text: drop well-formed markup (a lone "a<b" stays), the model's section labels and the
// structured lines shown elsewhere, write "4. Nxe5" as "4.Nxe5" mid-sentence, and name the sides.
function plainAnalysis(text, side) {
  const player = side === "w" ? "White" : "Black";
  const opponent = side === "w" ? "Black" : "White";
  return text
    .replace(/<(svg|script|style|iframe)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
    .replace(/<!--[\s\S]*?-->|<\/?[a-z][^<>]*>/gi, "")
    .replace(/^\s*ANALYSIS:\s*/i, "")
    .replace(/^(?:BEST_MOVE|CRITICAL_LINE|PROMISING_MOVES|EVALUATION):.*$/gm, "")
    .replace(/(\S[ \t]+|\()(\d+\.(?:\.\.)?)[ \t]+(?=(?:O-O|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8])\b)/g, "$1$2")
    .replace(/\bthe (player|opponent)\b/gi, (_, role) => role.toLowerCase() === "player" ? player : opponent)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The last step before anything reaches a content script: remove the saved token and anything token-shaped from
// every string, also when Markdown marks (*, _, `, ~) are wedged between its characters.
const GAP = "[*_`~]*";
function scrub(value, token) {
  if (typeof value === "string") {
    if (token) value = value.replace(new RegExp(token.split("").join(GAP), "g"), "[token removed]");
    return value.replace(new RegExp(`h${GAP}f${GAP}_(?:${GAP}[A-Za-z0-9]){8,}`, "g"), "[token removed]");
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, token));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, token)]));
  return value;
}

function proseMove(text) {
  const anchors = /\bbest move\s*(?:is\s+|:\s*)|\bclearly\s+/gi;
  for (const match of text.matchAll(anchors)) {
    const tail = text.slice(match.index + match[0].length);
    const candidate = /^(?:[*_`"“]+\s*)?(?:\d+\.(?:\.\.)?\s*)?(?:[*_`"“]+\s*)?([^\s,.;:()\[\]*_`"”]+)/.exec(tail)?.[1];
    if (chess.isStrictSan(candidate)) return candidate;
  }
  return null;
}

function normalized(out, api, req, server, seconds, token) {
  const raw = Array.isArray(out) && (api === "boneyland" ? out[0] :
    out[3] && typeof out[3] === "object" && { ...out[3], analysis: out[2] });
  const pos = chess.parseFen(raw?.fen);
  const ev = raw?.evaluation;
  if (!raw || typeof raw.analysis !== "string" || !pos ||
      (raw.best_move_san !== null && typeof raw.best_move_san !== "string") ||
      !(ev == null || typeof ev === "string" || Number.isFinite(ev))) throw failure("bad_response");
  const analysis = plainAnalysis(raw.analysis, pos.side);
  // Only this provider's own legality-checked step may confirm a prose move (§4.5).
  const lineUci = api === "boneyland" ? (Array.isArray(raw.critical_line_uci) ? raw.critical_line_uci[0] : undefined)
    : raw.critical_line && typeof raw.critical_line === "object" ? raw.critical_line.legal_steps?.[0]?.uci : undefined;
  const moveSource = typeof raw.move_source === "string" && /^[a-z_]{1,40}$/.test(raw.move_source) ? raw.move_source : "";
  const prose = proseMove(analysis);
  let best = null, suggestion = null;
  if (["best_move", "critical_line"].includes(moveSource) && chess.isStrictSan(raw.best_move_san)) {
    const uci = [raw.best_move_uci, lineUci].find((u) => chess.sanMatchesUci(raw.best_move_san, u, raw.fen));
    best = { san: raw.best_move_san, uci: uci ?? null, source: "structured" };
  } else if (prose && chess.sanMatchesUci(prose, lineUci, raw.fen)) {
    best = { san: prose, uci: lineUci, source: "prose_verified" };
  } else if (prose) suggestion = { san: prose, source: "prose_unverified" };

  // boneyland sends the model's own EVALUATION sentence, which names the side. A bare number (no recording has
  // one) is read as relative to the side to move, as the model's player/opponent framing is.
  const evaluation = Number.isFinite(ev) ? ev : null;
  const advantaged = (evaluation >= 0) === (pos.side === "w") ? "White" : "Black";
  const value = (advantaged === "White" ? 1 : -1) * Math.abs(evaluation);
  const evaluationText = typeof ev === "string" ? plainAnalysis(ev, pos.side) || null :
    evaluation === null ? null : evaluation === 0 ? "White and Black are even (≈ 0)" :
    `${advantaged} is ${Math.abs(value) < 1 ? "slightly better" : "better"} (≈ ${value < 0 ? "−" : "+"}${Math.abs(value)})`;
  const suppliedLine = Array.isArray(raw.critical_line_san) ? raw.critical_line_san.join(" ") : raw.critical_line_san;
  const line = typeof suppliedLine === "string"
    ? suppliedLine.replace(/\d+\.(?:\.\.)?/g, " ").trim().split(/\s+/).filter(Boolean)
    : Array.isArray(raw.critical_line?.legal_steps) ? raw.critical_line.legal_steps.map((step) => step?.san) : [];
  const criticalLine = line.length && line.every(chess.isStrictSan)
    ? line.map((san, i) => i && (i + (pos.side === "b")) % 2 ? san : chess.moveLabel(san, raw.fen, i)).join(" ") : null;
  // With an exact site FEN the snapshot also carries its rights: a move line must not widen them.
  const { castle } = req.snapshot;
  const positionOk = req.mode === "best" ? chess.verifyBest(raw.fen, req.snapshot) :
    pos.side !== req.snapshot.side && chess.verifyExplain(raw.fen, req.snapshot.placement, req.played) &&
    (castle === undefined || [...castle.replace("-", "")].every((right) => pos.castle.includes(right)));
  return scrub({ server, seconds, cached: false, fen: raw.fen, analysis, best, suggestion, evaluation, evaluationText,
    criticalLine, truncated: raw.finish_reason === "length", moveSource, positionCheck: positionOk ? "ok" : "mismatch" }, token);
}

const ALLOWED_KEYS = new Set(["type", "mode", "fen", "moves", "played", "snapshot", "fresh", "prefer"]);
function validAsk(req) {
  if (!req || req.type !== "ask" || Object.keys(req).some((key) => !ALLOWED_KEYS.has(key)) ||
      !["explain", "best"].includes(req.mode) || typeof req.fresh !== "boolean" ||
      (req.prefer !== undefined && (req.prefer !== "other" || !req.fresh)) ||
      typeof req.moves !== "string" || req.moves.length > 12000) return false;
  if (req.mode === "best" ? req.played !== null : !chess.isStrictSan(req.played) || req.played.length > 20) return false;
  const root = chess.parseFen(req.fen);
  const snapshot = req.snapshot;
  const rights = snapshot && "castle" in snapshot;
  if (!root || !["w", "b"].includes(snapshot?.side) || typeof snapshot.placement !== "string" ||
      snapshot.placement.length > 80 || Object.keys(snapshot).length !== (rights ? 4 : 2) ||
      (rights && !(/^(?:-|K?Q?k?q?)$/.test(snapshot.castle) && snapshot.castle && /^(?:-|[a-h][36])$/.test(snapshot.ep))))
    return false;
  const placement = chess.parseFen(snapshot.placement + " w - - 0 1")?.placement;
  if (!chess.isPlausibleBoard(root.placement).ok || !chess.isPlausibleBoard(placement).ok) return false;
  const moves = req.moves ? req.moves.split(" ") : [];
  const plies = moves.length + Number(req.mode === "explain");
  return moves.length <= 600 && moves.every((m) => m.length <= 20 && chess.isStrictSan(m)) &&
    ((root.side === snapshot.side) === (plies % 2 === 0));
}

function customOrigin(value) {
  return typeof value === "string" && /^https:\/\/[a-z0-9-]+\.hf\.space$/.test(value) ? value : null;
}

async function getServers(req, lastServer, tokenState) {
  const { primary, custom, token, tokenFor } = tokenState;
  const origin = customOrigin(custom?.origin);
  const hasCustom = origin && Object.hasOwn(BUILTINS, custom?.api) &&
    await chrome.permissions.contains({ origins: [origin + "/*"] });
  const first = primary === "custom" && hasCustom ? "custom" : primary === "hugging-apps" ? primary : "boneyland";
  const second = first === "boneyland" ? "hugging-apps" : "boneyland";
  const order = req.prefer === "other" && (lastServer || first) === first ? [second, first] : [first, second];
  return order.map((name) => {
    const base = name === "custom" ? origin : BUILTINS[name];
    return { name, base, api: name === "custom" ? custom.api : name,
      token: typeof token === "string" && /^hf_[A-Za-z0-9]+$/.test(token) &&
        (name !== "custom" || (Array.isArray(tokenFor) && tokenFor.includes(base))) ? token : null };
  });
}

// Retry-After is delta seconds or an HTTP date; it is passed on so the panel can say when to try again.
function retryAfter(value) {
  const s = /^\s*\d+\s*$/.test(value || "") ? +value : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return s > 0 && s <= 86400 ? s : undefined;
}

async function requireResponse(res, sentToken) {
  const html = /(?:text\/html|application\/xhtml)/i.test(res.headers.get("content-type") || "");
  if (!res.ok) {
    const err = failure(classify(res.status, await res.text(), sentToken));
    if (res.status === 429 || res.status === 503) err.retryAfter = retryAfter(res.headers.get("retry-after"));
    throw err;
  }
  if (html) throw failure("asleep");
}

async function callSpace(space, req, seed, onWaiting, signal) {
  const ctrl = new AbortController();
  const cancel = () => ctrl.abort(signal.reason);
  if (signal.aborted) cancel();
  signal.addEventListener("abort", cancel, { once: true });
  let deadline;
  const arm = (ms) => {
    clearTimeout(deadline);
    deadline = setTimeout(() => ctrl.abort(failure("timeout")), ms);
  };
  const headers = { "Content-Type": "application/json" };
  if (space.token) headers.Authorization = "Bearer " + space.token;
  const init = { headers, signal: ctrl.signal, credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" };
  const api = space.api === "boneyland" ? "analyse_position" : "analyze";
  const url = space.base + "/gradio_api/call/" + api;
  const data = [req.fen, req.moves, 2048, 0.6, seed];
  if (space.api === "hugging-apps") data.push("Analyze the position carefully and find the best move for player.");
  try {
    arm(20000);
    const start = await fetch(url, { ...init, method: "POST", body: JSON.stringify({ data }) });
    await requireResponse(start, !!space.token);
    const text = await start.text();
    if (/^\s*<(?:!doctype\s+html|html\b)/i.test(text)) throw failure("asleep");
    let id;
    try { id = JSON.parse(text)?.event_id; } catch {}
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || /\s/.test(id)) throw failure("bad_response");
    onWaiting();
    arm(45000);
    const res = await fetch(url + "/" + id, init);
    await requireResponse(res, !!space.token);
    if (!res.body) throw failure("unreachable");
    const reader = res.body.getReader();
    const parser = createSseParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (value?.byteLength) arm(45000);
      for (const record of done ? parser.finish() : parser.push(value)) {
        if (record.event === "error") throw failure(classify(0, record.data, !!space.token));
        if (record.event === "complete") {
          try { return JSON.parse(record.data); } catch { throw failure("bad_response"); }
        }
      }
      if (done) throw failure("unreachable");
    }
  } catch (err) {
    throw ctrl.signal.aborted ? ctrl.signal.reason : err.code && Object.hasOwn(CODES, err.code) ? err : failure("unreachable");
  } finally {
    clearTimeout(deadline);
    signal.removeEventListener("abort", cancel);
    if (!ctrl.signal.aborted) ctrl.abort();
  }
}

function startExtension() {
  const protect = () => chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const protectedStorage = protect();
  chrome.runtime.onInstalled.addListener(protect);

  const cache = new Map();
  const lastServer = new Map();
  let settingsVersion = 0, active = null, lastStart = -Infinity, lastSeed = DEFAULT_SEED;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ["token", "primary", "custom", "tokenFor"].some((key) => key in changes)) {
      cache.clear();
      settingsVersion++;
    }
  });

  function senderAllowed(sender) {
    return sender?.id === chrome.runtime.id && sender.frameId === 0 &&
      /^https:\/\/(?:www\.chess\.com|lichess\.org)\//.test(sender.url || "");
  }
  function send(client, data) {
    try { client.port.postMessage(data); } catch {}
  }
  function report(job, status, server = job.server) {
    job.status = { status, server };
    for (const client of job.clients) send(client, job.status);
  }
  function keepResult(job, result) {
    for (const client of job.clients) {
      if (lastServer.size >= 64) lastServer.delete(lastServer.keys().next().value);
      lastServer.set(client.tab, result.server);
      send(client, { result });
    }
  }

  async function run(job) {
    const { req, ctrl, last } = job;
    const signal = ctrl.signal;
    const overall = setTimeout(() => ctrl.abort(failure("timeout")), 150000);
    const keepalive = setInterval(() => {
      for (const client of job.clients) send(client, { status: "keepalive", server: job.server });
    }, 20000);
    const waiting = setTimeout(() => report(job, "still_waiting"), 60000);
    const started = Date.now();
    try {
      await protectedStorage;
      const version = settingsVersion;
      const settings = await chrome.storage.local.get(["primary", "custom", "token", "tokenFor"]);
      const saved = /^hf_[A-Za-z0-9]+$/.test(settings.token) ? settings.token : null;
      const servers = await getServers(req, last, settings);
      job.server = servers[0].name;
      signal.throwIfAborted();
      const key = JSON.stringify([job.key, servers.map(({ name, base, api }) => [name, base, api]), version]);
      const hit = cache.get(key);
      if (!req.fresh && hit && Date.now() - hit.time < 900000) {
        cache.delete(key);
        cache.set(key, hit);
        keepResult(job, { ...hit.result, cached: true });
        return;
      }
      if (hit) cache.delete(key);
      const delay = 2000 - (Date.now() - lastStart);
      if (delay > 0) await new Promise((resolve) => {
        const timer = setTimeout(resolve, delay);
        signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
      });
      signal.throwIfAborted();
      lastStart = Date.now();
      let seed = DEFAULT_SEED;
      if (req.fresh) {
        do { seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff; }
        while (seed === lastSeed || seed === DEFAULT_SEED);
        lastSeed = seed;
      }
      let firstError;
      for (const [i, space] of servers.entries()) {
        job.server = space.name;
        report(job, i ? "backup" : "connecting");
        try {
          const out = await callSpace(space, req, seed, () => { if (!i) report(job, "waiting"); }, signal);
          signal.throwIfAborted();
          const result = normalized(out, space.api, req, space.name, (Date.now() - started) / 1000, saved);
          if (!req.fresh && result.positionCheck === "ok" && version === settingsVersion) {
            cache.set(key, { result, time: Date.now() });
            if (cache.size > 32) cache.delete(cache.keys().next().value);
          }
          keepResult(job, result);
          return;
        } catch (err) {
          signal.throwIfAborted();
          if (i) throw fallbackError(firstError, err.code) === err.code ? err : failure(fallbackError(firstError, err.code));
          if (!TRANSIENT.has(err.code)) throw err;
          firstError = err.code;
        }
      }
    } catch (err) {
      const code = Object.hasOwn(CODES, err?.code) ? err.code : "bad_response";
      const retry = err?.code === code && err.retryAfter ? { retryAfter: err.retryAfter } : {};
      for (const client of job.clients) send(client, { error: { code, detail: CODES[code], ...retry } });
    } finally {
      clearTimeout(overall);
      clearInterval(keepalive);
      clearTimeout(waiting);
      if (active === job) active = null;
    }
  }

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "queen" || !senderAllowed(port.sender)) { port.disconnect(); return; }
    const client = { port, tab: port.sender.tab?.id };
    let job, used = false;
    port.onDisconnect.addListener(() => {
      if (!job) return;
      job.clients.delete(client);
      if (!job.clients.size) job.ctrl.abort(failure("cancelled"));
    });
    port.onMessage.addListener((req) => {
      if (used) return;
      used = true;
      if (!validAsk(req)) { send(client, { error: { code: "illegal_position", detail: CODES.illegal_position } }); return; }
      // The panel passes SAN as the page shows it ("Qh4#"); the Space gets it without check and annotation marks.
      req = { ...req, moves: req.moves && req.moves.split(" ").map(chess.stripSan).join(" "),
        played: req.played && chess.stripSan(req.played) };
      const last = lastServer.get(client.tab);
      const key = JSON.stringify([req.mode, req.fen, req.moves, req.played, req.snapshot.placement, req.snapshot.side,
        req.prefer ? last ?? true : null]);
      if (active && !active.ctrl.signal.aborted) {
        if (active.key === key && active.req.fresh === req.fresh) {
          job = active;
          job.clients.add(client);
          if (job.status) send(client, job.status);
        } else send(client, { error: { code: "busy", detail: "Another tab is already asking Queen.", reason: "other_tab" } });
        return;
      }
      job = active = { req, key, last, ctrl: new AbortController(), clients: new Set([client]), server: "boneyland" };
      void run(job);
    });
  });

  chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    if (!senderAllowed(sender) || !["getPrefs", "setPrefs", "openOptions"].includes(msg?.type)) return;
    (async () => {
      await protectedStorage;
      if (msg.type === "openOptions") return chrome.runtime.openOptionsPage();
      if (msg.type === "getPrefs") {
        const { dock, firstUseSeen } = await chrome.storage.local.get(["dock", "firstUseSeen"]);
        return { dock: dock === "left" ? "left" : "right", firstUseSeen: firstUseSeen === true };
      }
      const prefs = {};
      if (["left", "right"].includes(msg.prefs?.dock)) prefs.dock = msg.prefs.dock;
      if (typeof msg.prefs?.firstUseSeen === "boolean") prefs.firstUseSeen = msg.prefs.firstUseSeen;
      await chrome.storage.local.set(prefs);
      return { ok: true };
    })().then((value) => respond(value), () => respond(null));
    return true;
  });
}

if (typeof chrome !== "undefined" && chrome.runtime) startExtension();
if (typeof module !== "undefined") module.exports = { createSseParser, classify, fallbackError, normalized, proseMove,
  plainAnalysis, scrub, retryAfter, validAsk, customOrigin, callSpace, CODES };
