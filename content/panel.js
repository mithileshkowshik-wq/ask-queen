// Ask Queen UI: a floating button and a side panel, inside one shadow root so site CSS can't reach it.
(() => {
  const CSS = `
:host { all: initial !important; }
* { box-sizing: border-box; margin: 0; }
[hidden] { display: none !important; }

.fab, .panel {
  --ink: #19141f; --raise: #251e2e; --line: #3b3148; --ivory: #ede6d6; --dim: #a9a0b4;
  --gold: #d9b45f; --gold-ink: #2a1f06; --amber: #e3b88a;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  position: fixed; right: 16px; z-index: 2147483647;
  font: 14px/1.5 var(--sans); color: var(--ivory); background: var(--ink);
  border: 1px solid var(--line); -webkit-font-smoothing: antialiased; text-align: left;
}
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.fab {
  bottom: 44px; display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 11px;
  border-radius: 18px; font-size: 13px; font-weight: 600; opacity: .92;
  box-shadow: 0 6px 20px rgba(8, 4, 12, .45); transition: opacity .15s, border-color .15s;
}
.fab:hover { opacity: 1; border-color: var(--gold); }
.glyph { color: var(--gold); font: 18px/1 "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif; }

.panel {
  bottom: 16px; width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; border-radius: 14px; outline: none; color-scheme: dark;
  box-shadow: 0 18px 50px rgba(8, 4, 12, .6); animation: rise .16s ease-out;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
header { display: flex; align-items: center; gap: 14px; padding: 10px 10px 10px 16px; border-bottom: 1px solid var(--line); }
h1 { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
.x { width: 28px; height: 28px; border: 0; border-radius: 7px; background: none; color: var(--dim); font-size: 20px; line-height: 1; }
.x:hover { background: var(--raise); color: var(--ivory); }
.body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px; }
footer { padding: 9px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 11.5px; }

.ask, .out { display: flex; flex-direction: column; gap: 12px; }
.out { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
h2, h3 { font: 500 22px/1.25 var(--serif); }
h3 { font-size: 20px; }
.sub { color: var(--dim); font-size: 13px; }
.disc { display: inline-block; width: 9px; height: 9px; margin-right: 6px; border: 1.5px solid var(--ivory); border-radius: 50%; }
h2 .disc { width: 12px; height: 12px; margin-right: 9px; vertical-align: 1px; }
.disc.w { background: var(--ivory); }

.row { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { flex: 1; min-height: 36px; padding: 7px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--raise); font-size: 13px; font-weight: 600; }
.btn:hover { border-color: var(--dim); }
.btn.on { border-color: var(--gold); color: var(--gold); }
.btn.primary { border-color: var(--gold); background: var(--gold); color: var(--gold-ink); }
.btn.primary:hover { filter: brightness(1.07); }
.btn:disabled { opacity: .45; cursor: default; filter: none; }
.link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--dim); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
.link:hover { color: var(--ivory); }

.rank { display: flex; gap: 3px; }
.rank i { --sq: var(--raise); width: 14px; height: 14px; border-radius: 2px; background: var(--sq); animation: step 1.6s infinite; }
.rank i:nth-child(even) { --sq: var(--line); }
@keyframes step { 12% { background: var(--gold); } 34% { background: var(--sq); } }
.clock { display: flex; justify-content: space-between; align-items: baseline; font-weight: 600; }
.clock span { color: var(--dim); font-weight: 400; font-variant-numeric: tabular-nums; }

.caveat { padding-left: 10px; border-left: 2px solid var(--amber); color: var(--amber); font-size: 13px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; align-items: baseline; }
dt { color: var(--dim); font-size: 13px; }
dd { font: 15px/1.45 var(--serif); }
.md { line-height: 1.6; overflow-wrap: anywhere; }
.md > * + * { margin-top: 10px; }
.md h4 { margin-top: 16px; color: var(--gold); font-size: 13px; font-weight: 600; }
.md h4:first-child { margin-top: 0; }
.md ul, .md ol { padding-left: 22px; }
.md li + li { margin-top: 4px; }
.md code { padding: 1px 5px; border-radius: 4px; background: var(--raise); font: inherit; }
.raw { color: var(--dim); font-size: 12px; overflow-wrap: anywhere; }

@media (prefers-reduced-motion: reduce) { .panel, .rank i { animation: none; } }
`;

  const NAME = { w: "White", b: "Black" };
  const sideOf = (ply) => (ply % 2 ? "Black" : "White");
  const moveNo = (ply) => (ply >> 1) + 1;
  const label = (san, ply) => (ply == null ? san : `${moveNo(ply)}${ply % 2 ? "..." : "."}${san}`);

  const h = (tag, props, ...kids) => {
    const el = Object.assign(document.createElement(tag), props);
    el.append(...kids.flat().filter((k) => k != null && k !== false && k !== ""));
    return el;
  };
  const disc = (white) => h("i", { className: white ? "disc w" : "disc" });

  // Tiny markdown renderer. Everything is HTML-escaped before any tag is added.
  const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const inline = (s) => s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)([^*]+?)\*(?!\w)/g, "$1<em>$2</em>");
  const md = (text) => {
    const out = [];
    let block = null; // { tag: "p" | "ul" | "ol", items }
    const flush = () => {
      if (!block) return;
      out.push(block.tag === "p"
        ? `<p>${inline(block.items.join(" "))}</p>`
        : `<${block.tag}>${block.items.map(([n, t]) => `<li${n ? ` value="${n}"` : ""}>${inline(t)}</li>`).join("")}</${block.tag}>`);
      block = null;
    };
    const add = (tag, item) => {
      if (block?.tag !== tag) { flush(); block = { tag, items: [] }; }
      block.items.push(item);
    };
    for (const raw of esc(String(text)).split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if (!line || /^([-*_])\1{2,}$/.test(line)) flush();
      else if ((m = /^#{1,6}\s+(.+)$/.exec(line))) { flush(); out.push(`<h4>${inline(m[1])}</h4>`); }
      else if ((m = /^(?:\*\*)?([A-Z][A-Z_ ]{2,24}):(?:\*\*)?\s*(.*)$/.exec(line))) {
        // "ANALYSIS:" / "BEST_MOVE: Nf3" -> small heading, rest of the line starts a paragraph
        flush();
        const t = m[1].replace(/_/g, " ").toLowerCase();
        out.push(`<h4>${t[0].toUpperCase() + t.slice(1)}</h4>`);
        if (m[2]) add("p", m[2]);
      }
      else if ((m = /^[-*•]\s+(.+)$/.exec(line))) add("ul", [0, m[1]]);
      else if ((m = /^(\d+)[.)]\s+(.+)$/.exec(line))) add("ol", [m[1], m[2]]); // keeps the number: "14. Bg5" stays 14
      else add("p", line);
    }
    flush();
    return out.join("");
  };

  // --- shell ---
  const host = h("div");
  const root = host.attachShadow({ mode: "closed" });
  const fab = h("button", { className: "fab", hidden: true, onclick: openPanel },
    h("span", { className: "glyph", textContent: "♛︎" }), "Ask Queen");
  const askBox = h("section", { className: "ask" });
  const outBox = h("section", { className: "out", hidden: true });
  const body = h("div", { className: "body" }, askBox, outBox);
  const panel = h("aside", { className: "panel", hidden: true, tabIndex: -1, role: "dialog", ariaLabel: "Ask Queen" },
    h("header", {},
      h("h1", {}, h("span", { className: "glyph", textContent: "♛︎" }), "Ask Queen"),
      h("button", { className: "link", textContent: "Settings", onclick: openSettings }),
      h("button", { className: "x", textContent: "×", ariaLabel: "Close", onclick: closePanel })),
    body,
    h("footer", { textContent: "QUEEN · princeton-nlp/queen_pawn-8 · explanations can be wrong" }));
  root.append(h("style", { textContent: CSS }), fab, panel);
  document.documentElement.append(host);

  // --- state ---
  let pos = null;   // last AQ.readPosition()
  let side = null;  // side to move for the board fallback: "w" | "b" | null
  let last = null;  // mode of the last request, for "Ask again"
  let reqId = 0, port = null, timer = null;

  const read = () => { try { return AQ.readPosition(); } catch { return null; } };
  const setPos = (p) => { pos = p; side = p?.board?.side ?? null; renderAsk(); };
  const sync = () => { const p = read(); if (JSON.stringify(p) !== JSON.stringify(pos)) setPos(p); };

  function openPanel() {
    setPos(read());
    panel.hidden = false;
    fab.hidden = true;
    panel.focus();
  }
  function closePanel() {
    panel.hidden = true;
    tick();
  }
  function openSettings() {
    try { chrome.runtime.sendMessage({ openOptions: true }).catch(() => {}); } catch {}
  }
  function tick() {
    if (document.hidden) return;
    let board = false;
    try { board = AQ.adapters.some((a) => a.matches()); } catch {}
    fab.hidden = !board || !panel.hidden;
    if (!panel.hidden) sync(); // follow the user as they step through moves
  }
  tick();
  setInterval(tick, 1500);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) closePanel(); }, true);

  // --- ask view ---
  function renderAsk() {
    const m = pos?.moves, kids = [];
    const intro = (title, sub, white) => kids.push(h("div", {},
      h("h2", {}, white != null && disc(white), title), h("p", { className: "sub", textContent: sub })));
    const btn = (text, mode, cls = "btn primary") => h("button", { className: cls, textContent: text, onclick: () => ask(mode) });

    if (m?.length) {
      const i = m.length - 1, move = label(m[i], i);
      intro(move, `${sideOf(i)} played this. ${sideOf(i + 1)} is to move.`, i % 2 === 0);
      kids.push(h("div", { className: "row" }, btn(`Explain ${move}`, "explain"), btn(`Best move for ${sideOf(i + 1)}`, "best", "btn")));
    } else if (m) {
      intro("Starting position", "No moves yet. White is to move.");
      kids.push(h("div", { className: "row" }, btn("Best move for White", "best")));
    } else if (pos?.board) {
      const det = pos.board.side, pick = (s) => () => { side = s; renderAsk(); };
      intro("Position on the board", "The move list can't be read here (a variation, puzzle or custom position), so Queen works from the pieces. Castling rights are a guess.");
      kids.push(det
        ? h("p", {}, disc(side === "w"), `${NAME[side]} to play${side === det ? " (detected) " : " "}`,
            h("button", { className: "link", textContent: side === det ? "Switch side" : "Switch back", onclick: pick(side === "w" ? "b" : "w") }))
        : [h("p", { textContent: "Who is to move?" }),
           h("div", { className: "row" }, ["w", "b"].map((s) =>
             h("button", { className: side === s ? "btn on" : "btn", ariaPressed: String(side === s), textContent: `${NAME[s]} to play`, onclick: pick(s) })))]);
      const go = btn(side ? `Best move for ${NAME[side]}` : "Best move here", "best");
      go.disabled = !side;
      kids.push(h("div", { className: "row" }, go));
    } else {
      intro("No board here", "Open a game, a review or the analysis board, then refresh.");
    }
    askBox.replaceChildren(...kids.flat(), h("button", { className: "link", textContent: "Refresh position", onclick: () => setPos(read()) }));
  }

  // --- request ---
  const show = (...kids) => { outBox.replaceChildren(...kids.flat().filter(Boolean)); outBox.hidden = false; };
  function stop() {
    clearInterval(timer);
    try { port?.disconnect(); } catch {}
    port = timer = null;
  }
  function cancel() {
    reqId++;
    stop();
    outBox.hidden = true;
  }
  function again() {
    sync();
    ask(last);
  }

  function ask(mode) {
    const m = pos?.moves;
    let req, ctx; // ctx.ply: index of the ply Queen is asked to play (null for the board fallback)
    if (m && (mode === "best" || m.length)) {
      const before = mode === "explain" ? m.slice(0, -1) : m, ply = before.length;
      req = { fen: AQ.START_FEN, moves: before.join(" ") };
      ctx = { ply, who: sideOf(ply), played: mode === "explain" ? m.at(-1) : null };
      ctx.what = ctx.played ? `Explaining ${label(ctx.played, ply)}`
        : ply ? `Best move for ${ctx.who} after ${label(m.at(-1), ply - 1)}` : "Best move from the starting position";
    } else if (!m && mode === "best" && pos?.board && side) {
      req = { fen: AQ.fenWithSide(pos.board, side), moves: "" };
      ctx = { ply: null, who: NAME[side], played: null, what: `Best move, ${NAME[side]} to play` };
    } else return cancel(); // position changed under "Ask again": let the user choose above
    last = mode;

    stop();
    const id = ++reqId, t0 = Date.now();
    const secs = h("span", { textContent: "0 s" });
    const hint = h("p", { className: "sub", textContent: "Usually 15–60 s." });
    show(
      h("div", { className: "rank" }, [...Array(8)].map((_, i) => h("i", { style: `animation-delay:${i * 0.2}s` }))),
      h("div", {}, h("p", { className: "clock" }, "Queen is thinking…", secs), h("p", { className: "sub", textContent: ctx.what })),
      hint,
      h("button", { className: "link", textContent: "Cancel", onclick: cancel }));
    timer = setInterval(() => { secs.textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);

    let tries = 0;
    try {
      const p = port = chrome.runtime.connect({ name: "queen" });
      p.onMessage.addListener((msg) => {
        if (id !== reqId) return; // stale answer
        if (msg.status) {
          // the second server tried is the backup, whichever one is set as primary
          if (msg.status.startsWith("connecting:") && ++tries > 1) hint.textContent = "The first server didn't answer, trying the backup server. Usually 15–60 s.";
          return;
        }
        stop();
        msg.result ? showResult(msg.result, ctx, req) : showError(msg.error);
      });
      p.onDisconnect.addListener(() => {
        if (id !== reqId || port !== p) return;
        stop();
        showError("Connection to the extension was lost.");
      });
      p.postMessage(req);
    } catch (e) {
      stop();
      showError(e?.message);
    }
  }

  // --- result ---
  function showResult(r, ctx, req) {
    const best = r.best_move_san && label(r.best_move_san, ctx.ply);
    const played = ctx.played && label(ctx.played, ctx.ply);
    const agree = AQ.sameMove(r.best_move_san, ctx.played);
    const title = !best ? "Queen didn't name a move"
      : !played ? `Queen plays ${best}`
      : agree ? `Queen agrees with ${played}` : `${played} was played — Queen prefers ${best}`;
    const note = best && played && (agree
      ? "Queen would have played the same move. Here is why."
      : "The explanation is for Queen's move, not the one played.");
    const caveat = {
      random_legal_fallback: "Queen's answer didn't contain a clear best move, so the server picked a legal move at random. Don't rely on this one.",
      promising_or_analysis: "Queen's answer didn't contain a clear best move. This one was picked out of the analysis text and may not match it.",
    }[r.move_source];
    const cut = r.finish_reason === "length" && "Queen hit the length limit, so the explanation stops early.";
    const facts = [["Evaluation", r.evaluation], ["Critical line", r.critical_line_san]]
      .filter(([, v]) => (typeof v === "number" || typeof v === "string") && v !== "");
    const analysis = h("div", { className: "md" });
    analysis.innerHTML = md(r.analysis || "Queen didn't write an explanation this time."); // md() escapes first

    const fen = r.fen || (!req.moves && req.fen);
    const copy = fen && h("button", { className: "btn", textContent: "Copy FEN", onclick: async () => {
      try { await navigator.clipboard.writeText(fen); copy.textContent = "Copied"; } catch { copy.textContent = "Couldn't copy"; }
      setTimeout(() => { copy.textContent = "Copy FEN"; }, 1500);
    } });

    show(
      h("div", {},
        h("p", { className: "sub" }, disc(ctx.who === "White"), ctx.ply == null ? `${ctx.who} to play` : `${ctx.who}, move ${moveNo(ctx.ply)}`),
        h("h3", { textContent: title }),
        note && h("p", { className: "sub", textContent: note })),
      caveat && h("p", { className: "caveat", textContent: caveat }),
      facts.length && h("dl", {}, facts.flatMap(([k, v]) => [h("dt", { textContent: k }), h("dd", { textContent: String(v) })])),
      analysis,
      cut && h("p", { className: "sub", textContent: cut }),
      h("div", { className: "row" }, copy, h("button", { className: "btn", textContent: "Ask again", onclick: again })),
      r.seconds > 0 && h("p", { className: "raw", textContent: `Answered in ${Math.round(r.seconds)} s` }));
    body.scrollTop = 0;
  }

  function showError(raw) {
    const msg = String(raw || "Unknown error");
    const quota = /quota|gpu|429|exceeded/i.test(msg);
    const dead = /context invalidated/i.test(msg);
    const text = dead ? "Ask Queen was updated or reloaded. Reload this page to keep using it."
      : quota ? "The free GPU quota is used up for now. Add a free Hugging Face token in Settings to get a bigger one, or try again later."
      : /already over/i.test(msg) ? "The game is already over in this position, so there is no move to find."
      : /HTTP|fetch|network|connection/i.test(msg) ? "Couldn't reach Queen's servers. They may be busy or waking up. Try again in a minute."
      : "Queen couldn't answer this time. Try again in a minute.";
    show(
      h("div", {}, h("h3", { textContent: "No answer" }), h("p", { textContent: text })),
      h("p", { className: "raw", textContent: `Details: ${msg}` }),
      !dead && h("div", { className: "row" },
        quota && h("button", { className: "btn primary", textContent: "Open Settings", onclick: openSettings }),
        h("button", { className: "btn", textContent: "Try again", onclick: again })));
  }
})();
