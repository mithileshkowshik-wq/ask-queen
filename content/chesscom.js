(() => {
  const BOARD = "wc-chess-board, chess-board";
  const C = globalThis.AQChess;
  const LIST = "wc-simple-move-list .node, .move-list .node, vertical-move-list .node, .play-controller-moveList .node";
  const VARIATION = ".subline, .variation, [class*='subline']";
  const USER_MARK = /rgb\((?:235, 97, 80|172, 206, 89|82, 176, 220|255, 170, 0)\)/;
  const FIGURINES = { n: "N", b: "B", r: "R", q: "Q", k: "K",
    "♘": "N", "♞": "N", "♗": "B", "♝": "B", "♖": "R", "♜": "R", "♕": "Q", "♛": "Q", "♔": "K", "♚": "K" };

  function scope() {
    const path = location.pathname;
    const analysis = /^\/analysis(?:\/|$)/i.test(path);
    const review = /\/review\/?$/i.test(path) || new URLSearchParams(location.search).get("tab") === "review";
    const game = /^\/(?:game|play|live|daily)(?:\/|$)/i.test(path);
    const page = review ? "review" : analysis ? "analysis" : game ? "game" : "unknown";
    if (/^\/(?:puzzles?|daily-chess-puzzle)(?:\/|$)/i.test(path)) return { page, gate: "puzzle" };
    if (/\/(?:variants?|chess960|crazyhouse|bughouse|atomic|three-check|king-of-the-hill|four-player-chess)(?:\/|$)/i.test(path) ||
        [...document.querySelectorAll(".variant-badge, .game-variant, [data-game-variant]")].some((el) => {
          const variant = el.dataset.gameVariant || el.textContent.trim();
          return AQ.visible(el) && !/^(?:standard|standard chess|chess|rapid|blitz|bullet|daily)$/i.test(variant);
        })) return { page, gate: "variant" };
    if (analysis || review) return { page, gate: null };
    const finished = [...document.querySelectorAll(
      ".game-over-modal, .game-over-header, [data-game-status='finished'], .game-result, .game-over, .board-layout-sidebar .result")].some((el) =>
      AQ.visible(el) && (el.matches(".game-over-modal, .game-over-header, [data-game-status='finished'], .game-over") ||
        /1\s*[-–]\s*0|0\s*[-–]\s*1|½\s*[-–]\s*½|1\/2\s*[-–]\s*1\/2|checkmate|resign|draw|timeout|abandoned/i.test(el.textContent)));
    return { page, gate: game ? (finished ? null : "in_progress") : "unknown_context" };
  }

  function san(el) {
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/[♔-♟]/gu, (c) => FIGURINES[c] || c);
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
    const row = first?.closest(".main-line-row, .move-row");
    const number = row?.querySelector(".move-number, .move-index, [data-move-number]");
    const label = number?.dataset.moveNumber || number?.textContent.trim();
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
    // Right-click marks are .highlight squares too, told apart only by their colour. Any extra square
    // that is left makes the pair ambiguous, so the side is then unknown.
    const highlights = [...el.querySelectorAll(".highlight")].filter((h) => !USER_MARK.test(h.style.backgroundColor));
    return AQ.scan(el, squareOf, pieceOf, ".piece", highlights);
  }

  AQ.adapters.push({
    name: "chess.com",
    matches: () => location.hostname === "www.chess.com" && AQ.hasBoard(BOARD),
    read() {
      const el = AQ.mainBoard(BOARD, ".board-layout-main, .board-layout-chessboard, [data-main-board]");
      if (!el) return null;
      const board = readBoard(el);
      const raw = moves();
      const context = scope();
      const exactFen = [el.getAttribute("data-fen"), el.getAttribute("fen")].find(C.parseFen);
      const custom = raw?.custom || (raw?.moves.length === 0 && exactFen && exactFen !== C.START_FEN) ||
        new URLSearchParams(location.search).has("fen");
      return AQ.position({ ...context, board, line: AQ.root(raw?.moves, { custom }), exactFen });
    },
  });
})();
