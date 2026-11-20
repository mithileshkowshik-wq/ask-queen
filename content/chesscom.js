(() => {
  const BOARD = "wc-chess-board, chess-board";
  const C = globalThis.AQChess;
  // Live Game Review (2026-11-19): div.main-line-row.move-list-row[data-whole-move-number] > div.node[data-node="0-N"].
  const LIST = "wc-simple-move-list .node, .move-list .node, .move-list-row .node, vertical-move-list .node, .play-controller-moveList .node";
  const VARIATION = ".subline, .variation, [class*='subline']";
  const MOVE_LIST = "wc-simple-move-list, .move-list, .move-list-container, vertical-move-list, .play-controller-moveList";
  // Right-click mark colours (red, green, blue, orange), in rgb() or rgba() form.
  const USER_MARK = /rgba?\(\s*(?:235,\s*97,\s*80|172,\s*206,\s*89|82,\s*176,\s*220|255,\s*170,\s*0)\s*[,)]/;
  const FIGURINES = { n: "N", b: "B", r: "R", q: "Q", k: "K",
    "♘": "N", "♞": "N", "♗": "B", "♝": "B", "♖": "R", "♜": "R", "♕": "Q", "♛": "Q", "♔": "K", "♚": "K" };

  const RESULT = /^\s*(?:1\s*[-–]\s*0|0\s*[-–]\s*1|½\s*[-–]\s*½|1\/2\s*[-–]\s*1\/2)\s*$/;
  // PGN only from the share panel's read-only textarea or a data-pgn on the board or its layout, never from a box the
  // user can type in; only text that starts with a tag counts.
  const pgnText = () => [...document.querySelectorAll(`textarea.share-menu-tab-pgn-textarea[readonly],
      .share-menu-tab-pgn-section textarea[readonly], wc-chess-board[data-pgn], chess-board[data-pgn],
      .board-layout-main[data-pgn], .board-layout-chessboard[data-pgn]`)].map((el) => el.value ?? el.dataset.pgn)
    .filter((text) => /^\s*\[\w+\s+"/.test(text || "")).join("\n");

  // Fail closed. Puzzles and variants first. Any page tied to a game (/game/…, /analysis/game/…, Game Review) needs a
  // finished game on screen: a result token in the move list, a game-over element in the main board layout, or the
  // share PGN's [Result]. A running clock always means the game is on. "tab=review" and "/review" only label the page.
  // Only the standalone analysis board (no game id) is open without that evidence, and only with a board element never
  // seen gated: a daily game (no running clock) kept on screen across an SPA move to /analysis stays closed.
  const held = new WeakSet();
  function scope(visible, pgn) {
    const boards = [...document.querySelectorAll(BOARD)];
    const context = route(visible, pgn, boards);
    if (context.gate) for (const board of boards) held.add(board);
    return context;
  }
  function route(visible, pgn, boards) {
    const path = location.pathname;
    const analysis = /^\/analysis(?:\/|$)/i.test(path);
    const review = /\/review\/?$/i.test(path) || new URLSearchParams(location.search).get("tab") === "review";
    const game = /^\/(?:analysis\/)?(?:game|play|live|daily)(?:\/|$)/i.test(path);
    const page = review ? "review" : analysis ? "analysis" : game ? "game" : "unknown";
    if (/^\/(?:puzzles?|daily-chess-puzzle)(?:\/|$)/i.test(path)) return { page, gate: "puzzle" };
    const variant = AQ.tag(pgn, "Variant");
    if (/\/(?:variants?|chess960|crazyhouse|bughouse|atomic|three-check|king-of-the-hill|four-player-chess)(?:\/|$)/i.test(path) ||
        (variant && !/^(?:standard|chess)$/i.test(variant)) ||
        [...document.querySelectorAll(".variant-badge, .game-variant, [data-game-variant]")].some((el) => {
          const name = el.dataset.gameVariant || el.textContent.trim();
          return visible(el) && !/^(?:standard|standard chess|chess|rapid|blitz|bullet|daily)$/i.test(name);
        })) return { page, gate: "variant" };
    // A running clock is checked before any route, so a live board kept on screen across an SPA move to /analysis
    // stays closed.
    if ([...document.querySelectorAll(".clock-component.clock-player-turn, .clock-running")].some(visible)) return { page, gate: "in_progress" };
    if (nonStandardStart(pgn)) return { page, gate: "variant" };
    if (analysis && !game && !review) return { page, gate: boards.some((board) => held.has(board)) ? "in_progress" : null };
    if (!game) return { page, gate: "unknown_context" };
    const layout = ".board-layout-main, .board-layout-chessboard";
    const finished = [...document.querySelectorAll(`:is(${layout}) :is(.game-over-modal, .game-over-header, .game-over-modal-content)`)].some(visible) ||
      [...document.querySelectorAll(`:is(${MOVE_LIST}) :is(.game-result, [data-game-result])`)]
        .some((el) => visible(el) && RESULT.test(el.dataset.gameResult || el.textContent)) ||
      RESULT.test(AQ.tag(pgn, "Result") || "");
    return { page, gate: finished ? null : "in_progress" };
  }

  // Chess960 off /variants/ (Fable round 4): on a game page whose move list starts at White's move 1 with no custom-start
  // sign, a first move that can't be played from the standard start means the game didn't start there. Layout-free.
  function nonStandardStart(pgn) {
    if (!/\/game\//i.test(location.pathname) || /\[\s*(?:FEN|SetUp)\b/i.test(pgn) || new URLSearchParams(location.search).has("fen"))
      return false;
    const node = document.querySelector(LIST), row = node?.closest("[data-whole-move-number]");
    if (!node || node.matches(".black-move") || (row && row.dataset.wholeMoveNumber !== "1")) return false;
    const first = san(node);
    return !!first && !C.replay(C.START_FEN, [first]);
  }

  function san(el) {
    function walk(node) {
      // Each text node is trimmed (live markup pads the text around figurines: "<span data-figurine=B></span> f4 "),
      // but a space inside one node ("e 4") stays and fails strict SAN.
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim().replace(/[♔-♟]/gu, (c) => FIGURINES[c] || c);
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      const figurine = node.getAttribute("data-figurine");
      if (figurine !== null) return FIGURINES[figurine.toLowerCase()] || figurine || "�";
      if (node.matches(".move-info, .eval, .time, .clock, .glyph")) return "";
      return [...node.childNodes].map(walk).join("");
    }
    return AQ.readSan(walk(el.querySelector(".node-highlight-content") || el));
  }

  function moves() {
    const nodes = [...document.querySelectorAll(LIST)].filter(AQ.visible);
    const selected = nodes.filter((n) => n.matches(".selected") || n.querySelector(".selected"));
    if (!nodes.length || selected.length > 1) return null;
    const main = nodes.filter((n) => !n.closest(VARIATION) && (!n.dataset.node || n.dataset.node.startsWith("0-")));
    const active = selected[0];
    let line;
    if (active?.dataset.parentNode !== undefined) {
      const byId = new Map(nodes.map((node) => [node.dataset.node, node]));
      if (byId.size !== nodes.length) return null;
      line = [];
      for (let node = active; node; node = byId.get(node.dataset.parentNode)) {
        if (line.includes(node)) return null;
        line.unshift(node);
        if (!node.dataset.parentNode) {
          if (node !== main[0]) return null;
          break;
        }
        if (!byId.has(node.dataset.parentNode)) return null;
      }
    } else {
      if (active && !main.includes(active) || !active && document.querySelector(".node.selected, .node .selected")) return null;
      line = main.slice(0, main.indexOf(active) + 1);
      if (line.some((n, i) => n.dataset.node && n.dataset.node !== "0-" + i)) return null;
    }
    const first = line[0];
    const row = first?.closest("[data-whole-move-number], .main-line-row, .move-row");
    const number = row?.querySelector(".move-number, .move-index, [data-move-number]");
    const label = row?.dataset.wholeMoveNumber || number?.dataset.moveNumber || number?.textContent.trim();
    const custom = first?.matches(".black-move, [data-color='black']") || (!!label && !/^1\.?$/.test(label));
    return { moves: line.map(san), custom };
  }

  function readBoard(el) {
    const squareOf = (node) => {
      const m = [...node.classList].join(" ").match(/(?:^| )square-([1-8])([1-8])(?= |$)/);
      return m ? "abcdefgh"[+m[1] - 1] + m[2] : null;
    };
    const pieceOf = (node) => {
      const code = [...node.classList].find((c) => /^[wb][pnbrqk]$/.test(c));
      return code && (code[0] === "w" ? code[1].toUpperCase() : code[1]);
    };
    // Right-click marks are .highlight squares too, told apart only by their colour. After dropping the known mark
    // colours, only exactly two squares of one colour count as the last move; anything else leaves the side unknown.
    const marks = [...el.querySelectorAll(".highlight")].filter((h) => !USER_MARK.test(h.style.backgroundColor));
    const pair = new Set(marks.map(squareOf)).size === 2 && new Set(marks.map((h) => h.style.backgroundColor)).size === 1;
    return AQ.scan(el, squareOf, pieceOf, ".piece", pair ? marks : []);
  }

  AQ.adapters.push({
    name: "chess.com",
    host: "www.chess.com",
    board: BOARD,
    matches: () => location.hostname === "www.chess.com" && AQ.hasBoard(BOARD),
    gate: (visible = AQ.shown) => scope(visible, pgnText()).gate,
    read() {
      const el = AQ.mainBoard(BOARD, ".board-layout-main, .board-layout-chessboard, [data-main-board]");
      if (!el) return null;
      const board = readBoard(el);
      const raw = moves();
      const pgn = pgnText();
      const context = scope(AQ.visible, pgn);
      const exactFen = [el.getAttribute("data-fen"), el.getAttribute("fen")].find(C.parseFen);
      // A PGN [FEN] tag is the trusted custom root; [SetUp] without it, or any other custom sign, blocks replay.
      const custom = raw?.custom || /\[\s*(?:FEN|SetUp)\b/i.test(pgn) ||
        (raw?.moves.length === 0 && exactFen && exactFen !== C.START_FEN) || new URLSearchParams(location.search).has("fen");
      return AQ.position({ ...context, board, line: AQ.root(raw?.moves, { fen: AQ.tag(pgn, "FEN"), custom }), exactFen });
    },
  });
})();
