// chess.com adapter: Game Review, Analysis, finished games.
AQ.adapters.push({
  name: "chess.com",
  boardEl: () => document.querySelector("wc-chess-board, chess-board"),
  matches() { return location.hostname.endsWith("chess.com") && !!this.boardEl(); },

  read() {
    return { moves: this.moves(), board: this.board() };
  },

  // Rebuild SAN: chess.com renders piece letters as icon spans with data-figurine.
  san(el) {
    let s = "";
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === Node.TEXT_NODE) s += c.textContent;
        else if (c.dataset?.figurine) s += c.dataset.figurine;
        else if (!/move-info|eval|time|clock|glyph/i.test(c.className || "")) walk(c);
      }
    };
    walk(el.querySelector(".node-highlight-content") || el);
    return AQ.cleanSan(s);
  },

  moves() {
    const nodes = [...document.querySelectorAll("wc-simple-move-list .node, .move-list .node, vertical-move-list .node, .play-controller-moveList .node")]
      .filter((n) => !n.closest(".subline, .variation, [class*='subline']"))
      .filter((n) => !n.dataset.node || n.dataset.node.startsWith("0-"))
      .filter((n, i, a) => a.indexOf(n) === i);
    if (!nodes.length) return null;
    const selected = nodes.findIndex((n) => n.matches(".selected") || n.querySelector(".selected"));
    if (selected < 0) {
      // Nothing selected in the mainline: either a variation is selected or we're at the start.
      return document.querySelector(".node.selected, .node .selected") ? null : [];
    }
    const moves = nodes.slice(0, selected + 1).map((n) => this.san(n));
    return moves.every(Boolean) ? moves : null;
  },

  board() {
    const el = this.boardEl();
    if (!el) return null;
    const sqName = (cls) => {
      const m = /square-(\d)(\d)/.exec(cls);
      return m ? "abcdefgh"[+m[1] - 1] + m[2] : null;
    };
    const pieces = {};
    for (const p of el.querySelectorAll(".piece")) {
      const code = [...p.classList].find((c) => /^[wb][pnbrqk]$/.test(c));
      const sq = sqName(p.className);
      if (!code || !sq) continue;
      pieces[sq] = code[0] === "w" ? code[1].toUpperCase() : code[1];
    }
    const last = [...new Set([...el.querySelectorAll(".highlight")].map((h) => sqName(h.className)).filter(Boolean))];
    return AQ.boardFromPieces(pieces, last.length === 2 ? last : null);
  },
});
