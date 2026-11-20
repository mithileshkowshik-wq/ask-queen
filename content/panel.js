// Ask Queen UI: a launcher and a non-modal panel inside one shadow root, so site CSS can't reach it.
// Reads the page only through AQ.readPosition() and talks only to the background (docs/review/contract.md).
(() => {
  const C = globalThis.AQChess;
  const PRIVACY_URL = "https://github.com/ask-queen/ask-queen/blob/main/PRIVACY.md";
  const BOARD = "cg-board, wc-chess-board, chess-board";
  const CSS = `
:host { all: initial !important; }
* { box-sizing: border-box; margin: 0; }
[hidden] { display: none !important; }

.fab, .panel {
  --ink: #19141f; --raise: #251e2e; --line: #3b3148; --edge: #857a96; --ivory: #ede6d6; --dim: #a9a0b4;
  --gold: #d9b45f; --gold-ink: #2a1f06; --amber: #e3b88a;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --serif: ui-serif, "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  position: fixed; right: 16px; z-index: 2147483647;
  font: 14px/1.5 var(--sans); color: var(--ivory); background: var(--ink);
  border: 1px solid var(--edge); -webkit-font-smoothing: antialiased; text-align: left;
}
.left { right: auto; left: 16px; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }

.fab {
  bottom: 44px; display: flex; align-items: center; gap: 7px; height: 36px; padding: 0 14px 0 11px;
  border-radius: 18px; font-size: 13px; font-weight: 600;
  box-shadow: 0 6px 20px rgba(8, 4, 12, .45); transition: border-color .15s;
}
.fab:hover { border-color: var(--gold); }
.fab:focus-visible { box-shadow: 0 0 0 5px var(--ink); } /* keeps the focus ring at 3:1 on any site background */
.glyph { color: var(--gold); font: 18px/1 "Apple Symbols", "Segoe UI Symbol", "Noto Sans Symbols2", "DejaVu Sans", sans-serif; }

.panel {
  bottom: 16px; width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 32px);
  display: flex; flex-direction: column; border-radius: 14px; outline: none; color-scheme: dark;
  box-shadow: 0 18px 50px rgba(8, 4, 12, .6); animation: rise .16s ease-out;
}
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
.head { display: flex; align-items: center; gap: 6px; padding: 8px 8px 8px 16px; border-bottom: 1px solid var(--line); }
h2 { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 600; }
.icon { width: 30px; height: 30px; padding: 0; border: 1px solid transparent; border-radius: 7px; background: none; color: var(--dim); font-size: 18px; line-height: 1; }
.icon:hover { border-color: var(--edge); color: var(--ivory); }
.body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 16px; }
.foot { padding: 8px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 11.5px; }

.ask, .out { display: flex; flex-direction: column; gap: 12px; }
.out { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
h3 { font: 500 21px/1.25 var(--serif); overflow-wrap: anywhere; }
.sub { color: var(--dim); font-size: 13px; }
.disc { display: inline-block; width: 10px; height: 10px; margin-right: 7px; border: 1.5px solid var(--ivory); border-radius: 50%; }
.disc.w { background: var(--ivory); }

.row { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { flex: 1 1 auto; min-height: 36px; padding: 7px 12px; border: 1px solid var(--edge); border-radius: 9px; background: var(--raise); font-size: 13px; font-weight: 600; }
.btn:hover { border-color: var(--ivory); }
.btn.on { border: 2px solid var(--gold); padding: 6px 11px; }
.btn.primary { border-color: var(--gold); background: var(--gold); color: var(--gold-ink); }
.btn.primary:hover { filter: brightness(1.07); }
.btn:disabled { opacity: .5; cursor: default; filter: none; }
.link { align-self: flex-start; min-width: 24px; min-height: 24px; padding: 2px 0; border: 0; background: none; color: var(--ivory); font-size: 13px; text-decoration: underline; text-underline-offset: 3px; }
.link:hover { color: var(--gold); }
.link:disabled { opacity: .5; cursor: default; }

.rank { display: flex; gap: 3px; }
.rank i { --sq: var(--raise); width: 14px; height: 14px; border-radius: 2px; background: var(--sq); animation: step 1.6s infinite; }
.rank i:nth-child(even) { --sq: var(--line); }
@keyframes step { 12% { background: var(--gold); } 34% { background: var(--sq); } }
.clock { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.clock > span { color: var(--dim); font-variant-numeric: tabular-nums; white-space: nowrap; }
.lead { font-weight: 600; }

.caveat { display: flex; flex-direction: column; gap: 4px; padding-left: 10px; border-left: 3px solid var(--amber); color: var(--amber); font-size: 13px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; align-items: baseline; }
dt { color: var(--dim); font-size: 13px; }
dd { font: 15px/1.45 var(--serif); overflow-wrap: anywhere; }
.md { line-height: 1.6; overflow-wrap: anywhere; }
.md > * + * { margin-top: 10px; }
.md h4 { margin-top: 16px; color: var(--gold); font-size: 13px; font-weight: 600; }
.md h4:first-child { margin-top: 0; }
.md ul, .md ol { padding-left: 22px; }
.md li + li { margin-top: 4px; }
.md code { padding: 1px 5px; border-radius: 4px; background: var(--raise); font: inherit; }
summary { min-height: 24px; color: var(--dim); font-size: 13px; cursor: pointer; }
.raw { color: var(--dim); font-size: 12px; overflow-wrap: anywhere; }

@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
@media (forced-colors: active) {
  .fab, .panel, .btn, .icon { border: 1px solid ButtonText; }
  .btn.on, .btn.primary { border-width: 3px; }
  .disc, .rank { display: none; }
}
`;

  const NAME = { w: "White", b: "Black" };
  const SERVER = { boneyland: "boneyland/queen-pawn-8", "hugging-apps": "hugging-apps/queen-pawn-8", custom: "your custom server" };
  const SOURCE = { fen: "from the page's FEN", lastmove: "detected from the last move", moves: "from the move list" };
  const GATES = {
    in_progress: ["Available after the game ends", "Ask Queen stays off while a game is being played, whether you are playing or watching."],
    variant: ["Queen only knows standard chess", "Chess960 and other variants aren't supported."],
    puzzle: ["Queen isn't available on puzzles", "Puzzles are for solving on your own."],
    unknown_context: ["Queen isn't available on this page", "It works on finished games, Game Review, analysis boards and studies."],
    none: ["No board on this page", "Open a finished game, Game Review, an analysis board or a study."],
  };
  // code: [headline, one sentence, the one primary action, what the action does]
  const ERRORS = {
    quota: ["The free quota is used up", "Queen's free servers answer only a few questions per visitor, and a free Hugging Face token raises that limit.", "Add a free Hugging Face token", "settings"],
    token_rejected: ["Your token was rejected", "The server refused the Hugging Face token saved in Settings, so replace it or remove it.", "Open Settings", "settings"],
    unreachable: ["Can't reach Queen's server", "The connection failed before an answer arrived.", "Try again", "retry"],
    asleep: ["Queen's server is waking up", "Free servers sleep when nobody is asking and take a minute or two to start.", "Try again", "retry"],
    timeout: ["Queen took too long", "No answer arrived in time, which happens when the free servers are busy.", "Try again", "retry"],
    busy: ["Queen's servers are busy", "Too many questions are waiting right now, so give it a minute.", "Try again", "retry"],
    game_over: ["The game is over here", "This position is checkmate or stalemate, so there is no move to find.", "Back to the position", "dismiss"],
    bad_response: ["The server's format changed", "Check for an update to Ask Queen.", "Try the other server", "other"],
    cancelled: ["The question was stopped", "It ended before Queen answered.", "Ask again", "retry"],
    extension_reloaded: ["Ask Queen was updated", "Reload this page to keep using it.", "Reload this page", "reload"],
    all_unavailable: ["Both servers are unavailable", "Neither of Queen's free servers answered, so try again later or set up your own server.", "Try again", "retry"],
    unknown: ["Queen couldn't answer", "Something unexpected went wrong.", "Try again", "retry"],
  };
  const errorCopy = (code, fromMoves) =>
    code === "illegal_position" ? (fromMoves
      ? ["Queen can't use this position", "The server rejected the moves it was sent, so Queen can work from the pieces instead.", "Work from the pieces", "pieces"]
      : ["Queen can't use this position", "The server says the position on the board isn't legal, often because the side to move is wrong.", "Back to the position", "dismiss"])
    : code === "mismatch" ? ["Queen analysed a different position", "Its answer was for another position, so it isn't shown.", ...(fromMoves ? ["Work from the pieces", "pieces"] : ["Ask again", "fresh"])]
    : ERRORS[code] || ERRORS.unknown;

  const flip = (s) => (s === "w" ? "b" : "w");
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "tid") el.setAttribute("data-testid", v);
      else if (k === "role" || k.includes("-")) el.setAttribute(k, v);
      else el[k] = v;
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false && k !== ""));
    return el;
  };
  const deco = (className, textContent = "") => h("span", { className, "aria-hidden": "true", textContent });
  const disc = (s) => deco(s === "w" ? "disc w" : "disc");
  const row = (...kids) => h("div", { className: "row" }, ...kids);

  // Markdown subset (headings, lists, bold, italic, code; no links or images). Everything is HTML-escaped
  // before any tag is added, so the output holds only p, ul, ol, li[value], h4, strong, em and code.
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
    for (const raw of esc(String(text).replace(/<\/?(?:PIECE|SQUARE)_[^>\s]*>/g, "")).split(/\r?\n/)) {
      const line = raw.trim();
      let m;
      if (!line || /^([-*_])\1{2,}$/.test(line)) flush();
      else if ((m = /^#{1,6}\s+(.+)$/.exec(line))) { flush(); out.push(`<h4>${inline(m[1])}</h4>`); }
      else if ((m = /^(?:\*\*)?([A-Z][A-Z_ ]{2,24}):(?:\*\*)?\s*(.*)$/.exec(line))) {
        flush(); // "ANALYSIS:" -> a small heading; the rest of the line starts a paragraph
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
  const host = h("div", { tid: "aq-host" });
  const root = host.attachShadow({ mode: "open" });
  const fab = h("button", { tid: "aq-launcher", className: "fab", hidden: true, onclick: openPanel }, deco("glyph", "♛︎"), "Ask Queen");
  const askBox = h("section", { tid: "aq-ask", className: "ask" });
  const outBox = h("section", { tid: "aq-out", className: "out", hidden: true, tabIndex: -1 });
  const body = h("div", { className: "body" }, askBox, outBox);
  const dockBtn = h("button", { tid: "aq-dock", className: "icon", onclick: toggleDock }, deco("", "←"));
  const setBtn = h("button", { tid: "aq-settings", className: "link", textContent: "Settings", onclick: openSettings });
  const panel = h("div", { tid: "aq-panel", className: "panel", hidden: true, tabIndex: -1, role: "dialog", "aria-label": "Ask Queen" },
    h("div", { className: "head" }, h("h2", {}, deco("glyph", "♛︎"), "Ask Queen"), dockBtn, setBtn,
      h("button", { tid: "aq-close", className: "icon", "aria-label": "Close", onclick: closePanel }, deco("", "×"))),
    body,
    h("div", { tid: "aq-footer", className: "foot", textContent: "Queen is a language model on community servers. Explanations can be wrong." }));
  try { // a constructed sheet isn't subject to the site's style CSP
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch { root.append(h("style", { textContent: CSS })); }
  root.append(fab, panel);
  document.documentElement.append(host);
  // Keys typed in the panel must not reach the site's shortcuts. Only events from inside the shadow root get here.
  for (const type of ["keydown", "keyup", "keypress"]) host.addEventListener(type, (e) => {
    e.stopPropagation();
    if (type === "keydown" && e.key === "Escape" && !panel.hidden) closePanel();
  });

  // --- state ---
  let pos = null;       // the last AQ.readPosition()
  let side = null;      // side to move for the board fallback: "w" | "b" | null
  let useBoard = false; // the user chose to work from the pieces after a failed move-list ask
  let note = "";        // why the last click sent nothing
  let prefs = null;     // { firstUseSeen, dock }, kept by the background
  let shown = null;     // the result or error on screen: { ctx, error } or { ctx, banner, reask, lock }
  let prevFocus = null, path = location.pathname;
  let reqId = 0, port = null, timer = null, asking = null; // asking: the ctx of the ask in flight

  const dead = () => { try { return !chrome.runtime?.id; } catch { return true; } };
  const bg = async (msg) => { try { return await chrome.runtime.sendMessage(msg); } catch { return null; } };
  const read = () => { try { return AQ.readPosition(); } catch { return null; } };
  const key = (p) => (p ? p.snapshotKey || JSON.stringify(p) : "");
  const focusable = (el) => !!el && el !== document.body && el.isConnected && !el.disabled && !el.closest("[inert]") && el.getClientRects().length > 0;

  async function loadPrefs() {
    prefs = { firstUseSeen: false, dock: "right", ...(await bg({ type: "getPrefs" })) };
    applyDock();
  }
  function applyDock() {
    const left = prefs.dock === "left";
    for (const el of [fab, panel]) el.classList.toggle("left", left);
    dockBtn.firstChild.textContent = left ? "→" : "←";
    dockBtn.title = `Move the panel to the ${left ? "right" : "left"}`;
    dockBtn.setAttribute("aria-label", dockBtn.title);
  }
  const savePrefs = (change) => { Object.assign(prefs, change); bg({ type: "setPrefs", prefs }); };
  function toggleDock() {
    savePrefs({ dock: prefs.dock === "left" ? "right" : "left" });
    applyDock();
  }
  function openSettings() { bg({ type: "openOptions" }); }

  // --- following the page ---
  // Closed: each 1 s tick is one selector check and a string compare, never in a hidden tab. The page itself
  // is read only after an event: a navigation or the board appearing (then twice more while the page settles),
  // the tab coming back, or a click or key press (a game that just ended changes the gate without a navigation).
  let seen = "", age = 0, nudged = 0;
  const cheap = () => `${location.pathname}${location.search} ${!!document.querySelector(BOARD)}`;
  async function showLauncher() {
    seen = cheap();
    const p = seen.endsWith("true") ? read() : null;
    const ok = !!p && p.gate === null;
    if (ok && !prefs) await loadPrefs();
    fab.hidden = !ok || !panel.hidden;
  }
  function tick() {
    if (document.hidden || !panel.hidden) return;
    age = cheap() === seen ? age + 1 : 0;
    if (seen.endsWith("true") ? [0, 2, 5].includes(age) : !age) showLauncher();
  }
  function nudge() {
    if (nudged || !panel.hidden || !seen.endsWith("true")) return;
    nudged = setTimeout(() => { nudged = 0; if (!document.hidden && panel.hidden) showLauncher(); }, 1000);
  }
  // Open: a debounced MutationObserver, at most 4 reads a second, each within 250 ms of the change.
  let due = 0, lastRead = 0;
  const watcher = new MutationObserver(schedule);
  function schedule() {
    if (due || document.hidden || panel.hidden) return;
    due = setTimeout(() => { due = 0; lastRead = Date.now(); if (!panel.hidden) sync(); }, Math.max(100, 250 - (Date.now() - lastRead)));
  }
  function sync(p = read(), why = "") {
    if (location.pathname !== path) { path = location.pathname; if (port) cancel(); } // navigation aborts the ask
    const moved = key(p) !== key(pos);
    if (!moved && !why) return;
    if (moved) { side = p?.board?.side ?? null; useBoard = false; if (shown?.error) cancel(); } // an error about a position that is gone
    pos = p;
    note = why;
    render();
  }
  setInterval(tick, 1000);
  addEventListener("pointerdown", nudge, { capture: true, passive: true });
  addEventListener("keydown", nudge, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) panel.hidden ? showLauncher() : schedule(); });
  fab.addEventListener("focus", (e) => { prevFocus = e.relatedTarget; });
  tick();

  async function openPanel() {
    fab.hidden = true;
    if (!prefs) await loadPrefs();
    pos = read();
    side = pos?.board?.side ?? null;
    useBoard = false;
    note = "";
    panel.hidden = false;
    render();
    panel.focus();
    watcher.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  }
  async function closePanel() {
    watcher.disconnect();
    if (port) cancel(); // closing aborts an ask in flight; a finished answer stays for next time
    root.activeElement?.blur();
    panel.hidden = true;
    await showLauncher();
    // Focus order: the launcher, else what had focus before the panel opened, else the page body.
    if (!fab.hidden) fab.focus();
    else if (focusable(prevFocus)) prevFocus.focus();
  }

  // --- views ---
  function render() {
    if (panel.hidden) return;
    const focus = askBox.contains(root.activeElement) ? root.activeElement.dataset.testid || "" : null;
    const gate = !pos ? "none" : pos.gate === null ? null : pos.gate || "unknown_context"; // anything unexpected fails closed
    const view = dead() ? "reloaded" : gate ? "gated" : prefs.firstUseSeen ? "ask" : "notice";
    panel.dataset.view = view;
    setBtn.hidden = dockBtn.hidden = view === "gated"; // Close is the only action there
    if (view === "reloaded") { askBox.replaceChildren(); askBox.dataset.state = view; showError({ code: "extension_reloaded" }); }
    else if (view === "gated") {
      cancel(); // abort the ask and remove any answer
      const [title, sub] = GATES[gate] || GATES.unknown_context;
      askBox.dataset.state = `gated-${gate}`;
      askBox.replaceChildren(
        h("div", { role: "status" }, h("h3", { tid: "aq-gate", textContent: title }), h("p", { className: "sub", textContent: sub })),
        row(h("button", { tid: "aq-gate-close", className: "btn", textContent: "Close", onclick: closePanel })));
    }
    else if (view === "notice") {
      askBox.dataset.state = view;
      askBox.replaceChildren(
        h("h3", { textContent: "Before your first question" }),
        h("p", { tid: "aq-notice", textContent: "Ask Queen sends the position and the moves that led to it to free community servers on Hugging Face: boneyland/queen-pawn-8, with hugging-apps/queen-pawn-8 as the backup. They aren't run by Chess.com, Lichess, Princeton, Hugging Face or this extension's author, and the people who run them can see what is sent." }),
        h("p", { textContent: "Nothing else leaves your browser: no username, game link, clock or chat. If you add a Hugging Face token in Settings, it goes to those servers too." }),
        h("p", { textContent: "Queen is a language model, so its explanations can be wrong." }),
        h("a", { tid: "aq-privacy-link", className: "link", href: PRIVACY_URL, target: "_blank", rel: "noopener noreferrer", textContent: "Privacy policy (opens in a new tab)" }),
        row(h("button", { tid: "aq-notice-ok", className: "btn primary", textContent: "Got it", onclick: () => { savePrefs({ firstUseSeen: true }); render(); panel.focus(); } })));
    }
    else renderAsk();
    if (focus !== null) (askBox.querySelector(`[data-testid="${focus}"]:not(:disabled)`) || panel).focus();
    refreshStale();
  }

  // Board fallback FEN: the page's exact FEN when it has one, otherwise the scan with its disclosed guesses.
  const boardFen = (b, s) => {
    const f = b.fen6 ? b.fen6.split(" ") : [b.placement, b.side, b.castle || "-", b.ep || "-", "0", "1"];
    if (f[1] !== s) { f[1] = s; f[3] = "-"; } // the user's side: an en-passant square no longer applies
    return f.join(" ");
  };

  // The one place a request is built, so a button's label and what it sends can't drift apart.
  // Returns { label, msg, ctx } for the position on screen, or null when that ask isn't available.
  function build(mode) {
    const b = pos?.board;
    if (!pos || pos.gate !== null || !b?.valid) return null;
    const m = !useBoard && pos.root && pos.moves;
    if (m) {
      const fen = pos.root.fen, n = m.length, rootSide = fen.split(" ")[1], toMove = n % 2 ? flip(rootSide) : rootSide;
      if (mode === "explain" ? !n : n && m[n - 1].includes("#")) return null; // nothing to explain, or the game is over
      const before = mode === "explain" ? m.slice(0, -1) : m, played = mode === "explain" ? m[n - 1] : null;
      const lastLabel = n && C.moveLabel(m[n - 1], fen, n - 1);
      return {
        label: played ? `Explain ${lastLabel}` : `Best move for ${NAME[toMove]}`,
        msg: { mode, fen, moves: before.join(" "), played, snapshot: { placement: b.placement, side: toMove } },
        ctx: { mode, played, fromMoves: true, who: played ? flip(toMove) : toMove, lab: (san) => C.moveLabel(san, fen, before.length),
          what: played ? `Position before ${lastLabel}` : n ? `Position after ${lastLabel}` : startName() },
      };
    }
    if (mode !== "best" || !side) return null;
    const fen = boardFen(b, side);
    return {
      label: `Best move for ${NAME[side]}`,
      msg: { mode, fen, moves: "", played: null, snapshot: { placement: b.placement, side } },
      ctx: { mode, played: null, fromMoves: false, who: side, lab: (san) => (b.fen6 ? C.moveLabel(san, fen, 0) : san), what: "Position on the board" },
    };
  }
  const startName = () => (pos.root.source === "standard" ? "Starting position" : "Custom starting position");

  function renderAsk() {
    const b = pos.board, kids = [], explain = build("explain"), best = build("best");
    const head = (title, sub, s) => kids.push(h("div", {}, h("h3", {}, s && disc(s), title), sub && h("p", { className: "sub", textContent: sub })));
    const btn = (q, tid, primary) => q && h("button", { tid, className: primary ? "btn primary" : "btn", textContent: q.label, onclick: () => ask(q.msg.mode) });
    let state = "board";
    if (note) kids.push(h("p", { tid: "aq-changed", className: "caveat", role: "status", textContent: note }));
    if (!b?.valid) {
      state = "unreadable";
      head("Can't read this board", "The pieces don't make a legal position right now. Step to another move, or wait for the pieces to settle.");
    } else if (pos.root && pos.moves && !useBoard) {
      const m = pos.moves, n = m.length, rootSide = pos.root.fen.split(" ")[1], toMove = n % 2 ? flip(rootSide) : rootSide;
      if (n) {
        state = best ? "move" : "mate";
        head(C.moveLabel(m[n - 1], pos.root.fen, n - 1), `${NAME[flip(toMove)]} played this. ${best ? `${NAME[toMove]} is to move.` : "It is checkmate."}`, flip(toMove));
        kids.push(row(btn(explain, "aq-explain", true), btn(best, "aq-best")));
        if (!best) kids.push(h("p", { tid: "aq-game-over", textContent: "The game is over here, so there is no next move to find." }));
      } else {
        state = "start";
        head(startName(), `No moves yet. ${NAME[toMove]} is to move.`, toMove);
        kids.push(row(btn(best, "aq-best", true)));
      }
    } else {
      const pick = (s) => () => { side = s; render(); };
      head("Position on the board");
      kids.push(pos.crossCheck?.ok === false
        ? h("p", { tid: "aq-disagree", className: "caveat", textContent: "The move list and the board disagree, so Queen will work from the pieces." })
        : h("p", { className: "sub", textContent: useBoard ? "Queen will work from the pieces, not the move list." : "The move list can't be used here, so Queen works from the pieces." }));
      if (b.side) kids.push(h("p", { tid: "aq-side" }, disc(side), `${NAME[side]} to move `,
        h("span", { className: "sub", textContent: `(${side === b.side ? SOURCE[b.sideSource] || "detected" : "your choice"}) ` }),
        h("button", { tid: "aq-side-switch", className: "link", textContent: `Switch to ${NAME[flip(side)]}`, onclick: pick(flip(side)) })));
      else {
        state = "side-unknown";
        kids.push(h("p", { textContent: "Who is to move?" }), h("div", { className: "row", role: "group", "aria-label": "Side to move" }, ["w", "b"].map((s) =>
          h("button", { tid: `aq-side-${NAME[s].toLowerCase()}`, className: side === s ? "btn on" : "btn", "aria-pressed": String(side === s), onclick: pick(s) },
            side === s && deco("", "✓ "), `${NAME[s]} to move`))));
      }
      kids.push(row(btn(best, "aq-best", true) || h("button", { tid: "aq-best", className: "btn primary", textContent: "Best move", disabled: true })),
        h("p", { className: "sub", textContent: `Only Best move is offered without the move list.${b.castleGuessed ? " Castling rights are a guess from where the kings and rooks stand." : ""}` }));
    }
    askBox.dataset.state = state;
    askBox.replaceChildren(...kids, h("button", { tid: "aq-reread", className: "link", textContent: "Read the board again", onclick: () => { sync(); render(); } }));
  }

  // --- request ---
  function show(state, ...kids) {
    const focus = outBox.contains(root.activeElement);
    outBox.dataset.state = state;
    delete outBox.dataset.code;
    outBox.replaceChildren(...kids.flat().filter(Boolean));
    outBox.hidden = false;
    if (focus) outBox.focus();
  }
  function stop() {
    clearInterval(timer);
    try { port?.disconnect(); } catch {} // disconnecting is the cancel signal; the background aborts the fetch
    port = timer = asking = null;
  }
  function cancel() {
    reqId++;
    stop();
    shown = null;
    if (outBox.contains(root.activeElement)) panel.focus();
    outBox.hidden = true;
    outBox.replaceChildren();
  }

  // Click time: read the page again. If it no longer matches what the button was labelled from, show the new
  // position and send nothing.
  function ask(mode, { fresh = false, prefer, from = key(pos) } = {}) {
    const now = read();
    if (key(now) !== from || key(now) !== key(pos)) return sync(now, "The board changed, so nothing was sent. Check the buttons and ask again.");
    const q = build(mode);
    if (!q) return render();
    const { msg, ctx } = q;
    if (asking && !fresh && asking.mode === mode && asking.fen === msg.fen && asking.moves === msg.moves) return; // a repeat click on the same ask
    Object.assign(ctx, { key: from, side, useBoard, fen: msg.fen, moves: msg.moves });
    if (note) { note = ""; render(); }

    stop();
    shown = null;
    asking = ctx;
    const id = ++reqId, t0 = Date.now();
    const secs = h("span", { tid: "aq-timer", textContent: "0 s" });
    const hint = h("p", { tid: "aq-wait", className: "sub", textContent: "Usually 15 to 60 seconds." });
    const wait = (state, text) => { outBox.dataset.state = state; hint.textContent = text; };
    show("thinking",
      h("div", { className: "rank", "aria-hidden": "true" }, [...Array(8)].map((_, i) => h("i", { style: `animation-delay:${i * 0.2}s` }))),
      h("div", { className: "clock" }, // the timer sits outside the live region, so it isn't announced
        h("div", { role: "status" }, h("p", { className: "lead", textContent: "Queen is thinking…" }),
          h("p", { className: "sub", textContent: `${ctx.what}, ${NAME[ctx.who]} to move` }), hint),
        secs),
      h("button", { tid: "aq-cancel", className: "link", textContent: "Cancel", onclick: cancel }));
    timer = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      if (!document.hidden) secs.textContent = `${s} s`;
      if (s >= 60 && outBox.dataset.state === "thinking") wait("still_waiting", "Still waiting. Free servers queue requests.");
    }, 1000);

    const fail = (code, detail) => { stop(); showError({ code, detail }, ctx); };
    try {
      const p = port = chrome.runtime.connect({ name: "queen" });
      p.onMessage.addListener((m) => {
        if (id !== reqId) return; // a late reply to an ask that was cancelled or replaced
        if (m.status === "still_waiting") wait("still_waiting", "Still waiting. Free servers queue requests.");
        else if (m.status === "backup") wait("backup", "The first server didn't answer. Trying the backup server.");
        if (m.status) return;
        stop();
        m.result ? showResult(m.result, ctx) : showError(m.error, ctx);
      });
      p.onDisconnect.addListener(() => {
        void chrome.runtime?.lastError;
        if (id === reqId && port === p) fail(dead() ? "extension_reloaded" : "cancelled", "The connection to the extension closed.");
      });
      p.postMessage({ type: "ask", ...msg, fresh, ...(prefer && { prefer }) });
    } catch (e) {
      fail("extension_reloaded", String(e?.message || e));
    }
  }
  // Ask the same question again: put back the side and source it was asked with, then go through ask().
  function again(ctx, opts) {
    if (key(pos) === ctx.key) { side = ctx.side; useBoard = ctx.useBoard; }
    if (shown?.error) cancel(); // if the board has moved, ask() explains why nothing was sent
    ask(ctx.mode, { ...opts, from: ctx.key });
  }

  // --- result ---
  // The board moved after the ask: flag the answer, offer one re-ask for the position now on the board, and
  // switch off the actions that would repeat the old one.
  function refreshStale() {
    if (!shown?.banner) return;
    const stale = key(pos) !== shown.ctx.key;
    const q = stale && (build(shown.ctx.mode) || build("best"));
    shown.banner.hidden = !stale;
    shown.reask.hidden = !q;
    if (q) Object.assign(shown.reask, { textContent: q.label, onclick: () => ask(q.msg.mode) });
    for (const b of shown.lock) b.disabled = stale;
  }

  function showResult(r, ctx) {
    if (r.positionCheck === "mismatch") return showError({ code: "mismatch", detail: `Asked about ${ctx.fen} ${ctx.played || ""}. The answer was for ${r.fen}.` }, ctx);
    const best = r.best?.san, played = ctx.played;
    const agree = !!best && !!played && C.sameMove(best, played);
    const title = !best ? "Queen didn't name a clear move" // only a verified move may be the headline or the verdict
      : !played ? `Queen plays ${ctx.lab(best)}`
      : agree ? `Queen agrees with ${ctx.lab(played)}` : `${ctx.lab(played)} was played. Queen prefers ${ctx.lab(best)}.`;
    const verdict = best && played && (agree ? "Queen would play the same move. This is its explanation."
      : `This explains ${C.stripSan(best)}. Queen can't judge ${C.stripSan(played)} directly.`);
    const other = r.truncated && h("button", { tid: "aq-other-server", className: "link", textContent: "Try the other server", onclick: () => again(ctx, { fresh: true, prefer: "other" }) });
    const facts = [["aq-eval", "Evaluation", r.evaluationText], ["aq-line", "Critical line", r.criticalLine]].filter(([, , v]) => typeof v === "string" && v.trim());
    const analysis = h("div", { tid: "aq-analysis", className: "md" });
    analysis.innerHTML = md(r.analysis || "Queen didn't write an explanation this time."); // md() escapes first
    const copy = h("button", { tid: "aq-copy-fen", className: "btn", textContent: "Copy FEN", onclick: async () => {
      try { await navigator.clipboard.writeText(r.fen); copy.textContent = "Copied"; } catch { copy.textContent = "Couldn't copy"; }
      setTimeout(() => { copy.textContent = "Copy FEN"; }, 1500);
    } });
    const redo = h("button", { tid: "aq-ask-again", className: "btn", textContent: "Ask again", onclick: () => again(ctx, { fresh: true }) });
    const reask = h("button", { tid: "aq-stale-reask", className: "btn" });
    const banner = h("div", { tid: "aq-stale", className: "caveat", role: "status", hidden: true },
      h("p", { textContent: "The board has moved. This answer is for the earlier position." }), row(reask));

    show("result", banner,
      h("p", { tid: "aq-context", className: "sub" }, disc(ctx.who), `${ctx.what}, ${NAME[ctx.who]} to move`),
      h("div", { role: "status" }, h("h3", { tid: "aq-headline", textContent: title })),
      other && h("div", { tid: "aq-truncated", className: "caveat" }, h("p", { textContent: "The answer was cut off." }), other),
      verdict && h("p", { tid: "aq-verdict", className: "sub", textContent: verdict }),
      r.best?.source === "prose_verified" && h("p", { tid: "aq-from-text", className: "sub", textContent: "This move was taken from Queen's text." }),
      !best && r.suggestion?.san && h("p", { tid: "aq-suggestion", className: "caveat", textContent: `Queen's text suggests ${ctx.lab(r.suggestion.san)} (unverified)` }),
      facts.length && h("dl", {}, facts.flatMap(([tid, k, v]) => [h("dt", { textContent: k }), h("dd", { tid, textContent: v })])),
      analysis,
      row(copy, redo),
      h("p", { tid: "aq-result-footer", className: "raw", textContent: `Answered by ${SERVER[r.server] || "Queen's server"} in ${Math.round(r.seconds) || 0} s${r.cached ? " · cached" : ""}` }));
    shown = { ctx, banner, reask, lock: [redo, other].filter(Boolean) };
    body.scrollTop = 0;
    refreshStale();
  }

  function showError(error, ctx) {
    const code = error?.code || "unknown";
    const [title, sentence, label, action] = errorCopy(code, ctx?.fromMoves);
    const retry = () => again(ctx, {});
    const act = {
      retry,
      fresh: () => again(ctx, { fresh: true }),
      other: () => again(ctx, { fresh: true, prefer: "other" }),
      settings: () => { openSettings(); Object.assign(go, { textContent: "Try again", onclick: retry }); }, // back from Settings: retry without a reload
      pieces: () => { useBoard = true; cancel(); render(); (askBox.querySelector("button:not(:disabled)") || panel).focus(); },
      dismiss: () => { cancel(); panel.focus(); },
      reload: () => location.reload(),
    }[action];
    const go = h("button", { tid: "aq-error-action", className: "btn primary", textContent: label, onclick: act });
    show("error",
      ctx && h("p", { tid: "aq-context", className: "sub" }, disc(ctx.who), `${ctx.what}, ${NAME[ctx.who]} to move`),
      h("div", { tid: "aq-error", role: "alert" }, h("h3", { textContent: title }), h("p", { textContent: sentence })),
      row(go),
      code === "all_unavailable" && h("button", { tid: "aq-error-custom", className: "link", textContent: "Set up a custom server", onclick: openSettings }),
      h("details", { tid: "aq-error-details" }, h("summary", { textContent: "Details" }),
        h("p", { className: "raw", textContent: `${code}${error?.detail ? `: ${String(error.detail).slice(0, 500)}` : ""}` })));
    outBox.dataset.code = code;
    shown = ctx ? { ctx, error: true } : null;
    refreshStale();
  }
})();
