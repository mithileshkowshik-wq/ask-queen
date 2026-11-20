(() => {
  const C = globalThis.AQChess;
  const ROUTE_VARIANT = /^\/(?:analysis\/)?(?:chess960|crazyhouse|antichess|atomic|horde|racingkings|kingofthehill|threecheck|3check)(?:\/|$)/i;
  const ROUND = /^\/[\w]{8}(?:[\w]{4})?(?:\/(?:white|black))?\/?$/;
  const GAME_ANALYSIS = /^\/\w{8}(?:\/(?:white|black))?\/analysis\/?$/;
  const VARIANT_NAME = /chess\s*960|crazyhouse|antichess|atomic|horde|racing\s*kings|king\s*of\s*the\s*hill|three.?check|3.?check/i;
  const TREE = ".tview2";
  const resultText = (s) => /^(?:1-0|0-1|1\/2-1\/2|½-½)$/.test(s?.trim() || "");
  const tag = AQ.tag;
  // lila's underboard shows the PGN as text in div.pgn (older builds and the editor use a textarea).
  const pgnText = () => [...document.querySelectorAll(".copyables .pgn, .analyse__underboard .pgn, .pgn textarea, textarea[name='pgn']")]
    .map((node) => node.value ?? node.textContent).join("\n");
  // lila tags the analysis and round roots with variant-<key>: fromPosition is a custom start, anything else but
  // standard is a variant.
  const variantKey = () => [...(document.querySelector("main.analyse, .round__app")?.classList || [])]
    .find((c) => c.startsWith("variant-"))?.slice(8);

  function scope(tree, pgn, visible) {
    const path = location.pathname;
    const study = /^\/study\//.test(path);
    const round = ROUND.test(path) && !/^\/(?:analysis|training|broadcast)\/?$/.test(path);
    const gameAnalysis = GAME_ANALYSIS.test(path);
    const page = study ? "study" : round && !tree ? "game" : tree ? "analysis" : "unknown";
    if (/^\/(?:training|streak|storm|racer)(?:\/|$)/.test(path) || document.querySelector(".puzzle__board")) return { page, gate: "puzzle" };
    const variant = tag(pgn, "Variant"), key = variantKey();
    const meta = [...document.querySelectorAll(".game__meta a, .game__meta .variant, .study__chapter [data-variant], [data-game-variant]")]
      .some((el) => VARIANT_NAME.test(el.dataset.variant || el.dataset.gameVariant ||
        (el.matches("a") ? el.pathname : el.textContent)));
    if (ROUTE_VARIANT.test(path) || meta || (variant && !/^(?:standard|chess|from position)$/i.test(variant)) ||
        (key && !["standard", "fromPosition"].includes(key)))
      return { page, gate: "variant" };
    const running = document.querySelector(".rclock.running, .clock.running, .rclock-correspondence.running, .forecast");
    // Results: the round view's result-wrap and the analysis view's renderResult (div.analyse__moves > div > div.result).
    // Only lila's own result slots count, and [Result] only from the exported PGN text (div.pgn), never a textarea.
    const result = [...document.querySelectorAll(".result-wrap .result, .analyse__moves .result")]
      .some((el) => resultText(el.textContent) && visible(el));
    const exported = [...document.querySelectorAll("div.pgn")].map((el) => el.textContent).join("\n");
    if (running || (round || gameAnalysis) && !result && !(tree && resultText(tag(exported, "Result"))))
      return { page, gate: "in_progress" };
    if (tree && (study || /^\/analysis(?:\/|$)/.test(path) || round || gameAnalysis)) return { page, gate: null };
    if (round && result) return { page: "game", gate: null };
    return { page, gate: "unknown_context" };
  }

  function analyseLine(tree) {
    const active = tree.querySelector("move.active[p]");
    if (!active) return tree.querySelector("move.active") ? null : { moves: [], custom: treeCustom(tree) };
    const path = active.getAttribute("p");
    if (!path || path.length % 2) return null;
    const byPath = new Map();
    for (const el of tree.querySelectorAll("move[p]")) {
      const key = el.getAttribute("p");
      byPath.set(key, byPath.has(key) ? null : el);
    }
    const line = [];
    for (let i = 2; i <= path.length; i += 2) {
      const el = byPath.get(path.slice(0, i));
      if (!el) return null;
      line.push(el);
    }
    return { moves: line.map((el) => AQ.readSan((el.querySelector("san") || el).textContent)), custom: treeCustom(tree) };
  }

  // A tree that doesn't start with White's move 1: the column view opens Black-first games with
  // <index>1</index><move class="empty">, the inline view puts the number inside the move (<index>3.</index>).
  function treeCustom(tree) {
    const first = tree.querySelector("move");
    const index = (first?.querySelector("index") || tree.querySelector("index"))?.textContent.trim();
    return !!first && (first.matches(".empty, .black, [data-color='black']") || (!!index && !/^1\.?$/.test(index)));
  }

  // Round view (lila ui/round/src/view/replay.ts). lila obfuscates and periodically renames these tags
  // (current: i5d > app with qzm numbers and z7yx moves; older: rm6 > l4x with i5z and kwdb), so key on
  // the stable active-move class .a1t and take its same-tag siblings; numbers are the all-digit siblings.
  function roundLine() {
    const active = document.querySelector(".round__app .a1t, i5d .a1t, rm6 .a1t, .rmoves .a1t");
    const list = active?.parentElement || document.querySelector("i5d app, rm6 l4x, .rmoves l4x");
    if (!list) return null;
    const kids = [...list.children];
    const tag = active?.localName || ["z7yx", "kwdb"].find((t) => kids.some((el) => el.localName === t));
    const all = kids.filter((el) => el.localName === tag);
    const first = kids.find((el) => el.localName !== tag && /^\d+$/.test(el.textContent.trim()));
    return { moves: all.slice(0, all.indexOf(active) + 1).map((el) => AQ.readSan(el.firstChild?.textContent)),
      custom: all[0]?.textContent.trim() === "…" || (!!first && first.textContent.trim() !== "1") };
  }

  function readBoard(el) {
    const flipped = !!el.closest(".orientation-black");
    const size = el.getBoundingClientRect().width / 8;
    const squareOf = (node) => {
      const m = /^translate(?:3d)?\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(node.style.transform);
      if (!m || !size) return null;
      const x = Math.round(+m[1] / size), y = Math.round(+m[2] / size);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return "abcdefgh"[flipped ? 7 - x : x] + (flipped ? y + 1 : 8 - y);
    };
    const roles = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
    const pieceOf = (node) => {
      const role = roles[[...node.classList].find((c) => Object.hasOwn(roles, c))];
      if (node.matches(".white")) return role?.toUpperCase();
      if (node.matches(".black")) return role;
      return null;
    };
    return AQ.scan(el, squareOf, pieceOf, "piece", [...el.querySelectorAll("square.last-move")]);
  }

  AQ.adapters.push({
    name: "lichess",
    host: "lichess.org",
    board: "cg-board",
    evidence: ".result-wrap, .analyse__moves, div.pgn",
    matches: () => location.hostname === "lichess.org" && AQ.hasBoard("cg-board"),
    gate: (visible = AQ.shown) => scope(document.querySelector(TREE), pgnText(), visible).gate,
    read() {
      const el = AQ.mainBoard("cg-board", ".main-board, .round__app, .analyse__board");
      if (!el) return null;
      const tree = document.querySelector(TREE);
      const pgn = pgnText();
      const context = scope(tree, pgn, AQ.visible);
      const board = readBoard(el);
      const exactFen = [...document.querySelectorAll(".copyables input, input.copyable, .copyables [data-fen]")]
        .map((node) => (node.dataset.fen || node.value || "").trim()).find(C.parseFen);
      const raw = tree ? analyseLine(tree) : roundLine();
      const pgnFen = tag(pgn, "FEN");
      // A FEN in the URL marks a custom start, but only the PGN [FEN] tag is trusted as its root.
      const routeCustom = /^\/analysis\/(?:standard\/)?[^/]*\//.test(location.pathname) || new URLSearchParams(location.search).has("fen");
      const moveNumber = /^\s*(\d+)\s*(\.{1,3})/m.exec(pgn.replace(/^\s*\[.*\]\s*$/gm, ""));
      const fromPosition = variantKey() === "fromPosition" ||
        [...document.querySelectorAll(".game__meta")].some((el) => /from position/i.test(el.textContent));
      const custom = raw?.custom || fromPosition || /\[\s*(?:FEN|SetUp)\b/i.test(pgn) || routeCustom ||
        (moveNumber && (moveNumber[1] !== "1" || moveNumber[2] === "...")) ||
        (raw?.moves.length === 0 && exactFen && exactFen !== C.START_FEN);
      const line = AQ.root(raw?.moves, { fen: pgnFen, custom });
      return AQ.position({ ...context, board, line, exactFen });
    },
  });
})();
