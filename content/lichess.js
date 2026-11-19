// lichess.org adapter: analysis board, finished games, studies, live/round view.
AQ.adapters.push({
  name: "lichess",
  matches: () => location.hostname === "lichess.org" && !!document.querySelector("cg-board"),

  read() {
    return { moves: this.moves(), board: this.board() };
  },

  moves() {
    // Analysis tree: every <move> carries p = its path from the root (2 chars per ply),
    // so the moves leading to the active one are those whose path prefixes it (works in variations too).
    const tree = document.querySelector(".tview2");
    if (tree) {
      // A game from a custom start position has a [FEN] tag; then only the board is reliable.
      if (/\[FEN "/.test(document.querySelector(".copyables textarea, .pgn textarea")?.value || "")) return null;
      const active = tree.querySelector("move.active[p]");
      if (!active) return tree.querySelector("move[p]") ? [] : null; // at the start position
      const path = active.getAttribute("p");
      const line = [...tree.querySelectorAll("move[p]")]
        .filter((m) => path.startsWith(m.getAttribute("p")))
        .sort((a, b) => a.getAttribute("p").length - b.getAttribute("p").length)
        .map((m) => AQ.cleanSan(m.querySelector("san")?.textContent));
      return line.length * 2 === path.length && line.every(Boolean) ? line : null;
    }

    // Round view (game in progress or just finished). Tag names are obfuscated and change over
    // time, so find the active move by its class and take its same-tag siblings.
    const active = document.querySelector(".rmoves .a1t, .moves .a1t, .a1t");
    if (active) {
      const all = [...active.parentElement.children].filter((e) => e.tagName === active.tagName && e.textContent.trim() !== "…");
      return all.slice(0, all.indexOf(active) + 1).map((el) => AQ.cleanSan(el.childNodes[0]?.textContent));
    }
    return null;
  },

  board() {
    const board = document.querySelector("cg-board");
    if (!board) return null;
    const flipped = !!board.closest(".orientation-black");
    const size = board.getBoundingClientRect().width / 8;
    const sqOf = (el) => {
      const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px/.exec(el.style.transform || "");
      if (!m || !size) return null;
      let x = Math.round(+m[1] / size), y = Math.round(+m[2] / size);
      if (flipped) { x = 7 - x; y = 7 - y; }
      return "abcdefgh"[x] + (8 - y);
    };
    const letter = { pawn: "p", knight: "n", bishop: "b", rook: "r", queen: "q", king: "k" };
    const pieces = {};
    for (const el of board.querySelectorAll("piece")) {
      if (/ghost|fading|dragging/.test(el.className)) continue;
      const [color, role] = [/white|black/.exec(el.className)?.[0], el.className.split(" ").find((c) => letter[c])];
      const sq = sqOf(el);
      if (!color || !role || !sq) continue;
      pieces[sq] = color === "white" ? letter[role].toUpperCase() : letter[role];
    }
    const last = [...board.querySelectorAll("square.last-move")].map(sqOf).filter(Boolean);
    const b = AQ.boardFromPieces(pieces, last.length === 2 ? last : null);

    // The analysis page shows the exact FEN; prefer its side-to-move when present.
    const fenInput = [...document.querySelectorAll(".copyables input, input.copyable")]
      .map((i) => i.value.trim()).find((v) => /^[1-8pnbrqkPNBRQK/]+ [wb] /.test(v));
    if (fenInput) {
      const [placement, side, castle, ep] = fenInput.split(" ");
      return { placement, side, castle, ep };
    }
    return b;
  },
});
