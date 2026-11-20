// Shared, DOM-free chess position checks for the content scripts and service worker.
(() => {
  const FILES = "abcdefgh";
  const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const FEN = /^([prnbqkPRNBQK1-8]+(?:\/[prnbqkPRNBQK1-8]+){7}) ([wb]) (-|K?Q?k?q?) (-|[a-h][36]) (\d+) ([1-9]\d*)$/;
  const SAN = /^(?:O-O(?:-O)?|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)$/;
  const opposite = (side) => side === "w" ? "b" : "w";
  const colorOf = (piece) => piece === piece.toUpperCase() ? "w" : "b";
  const colored = (piece, side) => side === "w" ? piece : piece.toLowerCase();

  function parseFen(fen) {
    const m = typeof fen === "string" && fen.length <= 100 && FEN.exec(fen);
    if (!m || !m[3] || m[0] !== fen || ![+m[5], +m[6]].every(Number.isSafeInteger)) return null;
    const placement = {};
    for (const [rank, row] of m[1].split("/").entries()) {
      let file = 0;
      for (const c of row) {
        if (/\d/.test(c)) file += +c;
        else placement[FILES[file++] + (8 - rank)] = c;
        if (file > 8) return null;
      }
      if (file !== 8 || /\d\d/.test(row)) return null;
    }
    return { placement, side: m[2], castle: m[3], ep: m[4], half: +m[5], full: +m[6] };
  }

  function placementToString(map) {
    const rows = [];
    for (let rank = 8; rank >= 1; rank--) {
      let row = "", empty = 0;
      for (const file of FILES) {
        const piece = map[file + rank];
        if (!piece) empty++;
        else {
          row += (empty || "") + piece;
          empty = 0;
        }
      }
      rows.push(row + (empty || ""));
    }
    return rows.join("/");
  }

  const stripSan = (s) => typeof s === "string" ? s.replace(/(?:[+#?!‼⁇⁈⁉□∞⩲⩱±∓⩵⨀⇆⊕⊙]|\$\d+)+$/u, "") : "";
  const isStrictSan = (s) => typeof s === "string" && !/\s/.test(s) && SAN.test(stripSan(s));
  function normalizeSan(s) {
    return stripSan(s).replace(/^0-0(-0)?$/, (c) => c.replaceAll("0", "O"))
      .replace(/^([a-h](?:x[a-h])?[18])([QRBN])$/, "$1=$2");
  }
  const sameMove = (a, b) => isStrictSan(normalizeSan(a)) && normalizeSan(a) === normalizeSan(b);
  const ok = { ok: true, reason: null };
  const fail = (reason) => ({ ok: false, reason });

  function isPlausibleBoard(map) {
    if (!map || typeof map !== "object") return fail("No pieces");
    const pieces = Object.values(map);
    if (Object.entries(map).some(([sq, p]) => !/^[a-h][1-8]$/.test(sq) || typeof p !== "string" || !/^[KQRBNPkqrbnp]$/.test(p)))
      return fail("Invalid square or piece");
    for (const side of ["w", "b"]) {
      const own = pieces.filter((p) => colorOf(p) === side);
      if (own.filter((p) => p.toUpperCase() === "K").length !== 1) return fail("Expected one king per side");
      if (own.length > 16) return fail("Too many pieces for one side");
    }
    if (Object.entries(map).some(([sq, p]) => /[18]$/.test(sq) && p.toUpperCase() === "P"))
      return fail("Pawn on a back rank");
    return ok;
  }

  function sanParts(san, side) {
    if (!isStrictSan(san)) return null;
    const text = stripSan(san);
    if (text.startsWith("O-O")) {
      const rank = side === "w" ? "1" : "8";
      const short = text === "O-O";
      return { piece: "K", from: "e" + rank, to: (short ? "g" : "c") + rank,
        rookFrom: (short ? "h" : "a") + rank, rookTo: (short ? "f" : "d") + rank };
    }
    const [, prefix, to, promotion] = /^(.*)([a-h][1-8])(?:=([QRBN]))?$/.exec(text);
    return { piece: /^[KQRBN]/.test(prefix) ? prefix[0] : "P", to, promotion,
      file: /[a-h]/.exec(prefix)?.[0], rank: /[1-8]/.exec(prefix)?.[0], capture: prefix.includes("x") };
  }

  function preSendCheck({ rootFen, moves, board, highlightSide }) {
    const root = parseFen(rootFen);
    if (!root || !Array.isArray(moves) || !moves.every(isStrictSan) || board?.valid === false)
      return fail("Position or move list is unreadable");
    const placement = board?.placement ?? board;
    const map = typeof placement === "string" ? parseFen(placement + " w - - 0 1")?.placement : placement;
    if (!isPlausibleBoard(map).ok) return fail("Invalid board");
    const side = moves.length % 2 ? opposite(root.side) : root.side;
    if (highlightSide && highlightSide !== side) return fail("Side to move disagrees");
    if (Object.keys(map).length !== Object.keys(root.placement).length - moves.filter((m) => m.includes("x")).length)
      return fail("Piece count disagrees");
    if (!moves.length) {
      return placementToString(map) === placementToString(root.placement) && (!board?.side || board.side === side)
        ? ok : fail("Starting position disagrees");
    }
    const mover = opposite(side);
    const last = sanParts(moves.at(-1), mover);
    if (map[last.to] !== colored(last.promotion || last.piece, mover) ||
        (last.rookTo && map[last.rookTo] !== colored("R", mover))) return fail("Last move disagrees");
    return ok;
  }

  function sanMatchesUci(san, uci, fen) {
    const root = parseFen(fen);
    if (!root || typeof uci !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) || /\s/.test(uci)) return false;
    const move = sanParts(san, root.side);
    const from = uci.slice(0, 2);
    return !!move && uci.slice(2, 4) === move.to && (uci[4] || "") === (move.promotion || "").toLowerCase() &&
      (!move.from || move.from === from) && (!move.file || move.file === from[0]) &&
      (!move.rank || move.rank === from[1]) && root.placement[from] === colored(move.piece, root.side);
  }

  // snapshot.castle/ep are present only when the page exposed an exact FEN; then they must match too.
  function verifyBest(fen, snapshot) {
    const root = parseFen(fen);
    return !!root && root.side === snapshot?.side && placementToString(root.placement) === snapshot.placement &&
      (snapshot.castle === undefined || (root.castle === snapshot.castle && root.ep === snapshot.ep));
  }

  // Check one move's geometry and footprint. The server is responsible for check and mate legality.
  function reachable(piece, from, to, map, side, capture) {
    const x = FILES.indexOf(from[0]), y = +from[1];
    const dx = FILES.indexOf(to[0]) - x, dy = +to[1] - y;
    const a = Math.abs(dx), b = Math.abs(dy);
    if (!a && !b) return false;
    if (piece === "N") return a * b === 2;
    if (piece === "K") return Math.max(a, b) === 1;
    const dir = side === "w" ? 1 : -1;
    if (piece === "P") {
      if (capture) return a === 1 && dy === dir;
      return !a && (dy === dir || (dy === 2 * dir && y === (dir === 1 ? 2 : 7) && !map[from[0] + (y + dir)]));
    }
    const diagonal = a === b;
    if (!(diagonal ? piece !== "R" : piece !== "B" && (!a || !b))) return false;
    for (let i = 1; i < Math.max(a, b); i++) {
      if (map[FILES[x + Math.sign(dx) * i] + (y + Math.sign(dy) * i)]) return false;
    }
    return true;
  }

  function verifyExplain(fen, snapshotPlacement, san) {
    const root = parseFen(fen);
    if (!root) return false;
    const { placement, side, ep } = root;
    const move = sanParts(san, side);
    const after = typeof snapshotPlacement === "string"
      ? parseFen(snapshotPlacement + " w - - 0 1")?.placement : snapshotPlacement;
    if (!move || !isPlausibleBoard(after).ok || !isPlausibleBoard(placement).ok) return false;
    const { to, piece, promotion, rookFrom, rookTo, capture } = move;
    const beforeTarget = placement[to];
    if (piece === "P" && !!promotion !== (to[1] === (side === "w" ? "8" : "1"))) return false;
    const epCapture = capture && !beforeTarget && piece === "P" && to === ep;
    if (capture && !epCapture && (!beforeTarget || colorOf(beforeTarget) === side || beforeTarget.toUpperCase() === "K")) return false;
    if (!capture && beforeTarget) return false;
    if (rookFrom) {
      const right = colored(rookFrom[0] === "h" ? "K" : "Q", side);
      if (!root.castle.includes(right) || placement[rookFrom] !== colored("R", side) || placement[rookTo] ||
          (rookFrom[0] === "a" && placement["b" + to[1]])) return false;
    }
    return Object.keys(placement).some((from) => {
      if (placement[from] !== colored(piece, side) || after[from] ||
          (move.file && move.file !== from[0]) || (move.rank && move.rank !== from[1]) ||
          (rookFrom ? from !== move.from : !reachable(piece, from, to, placement, side, capture))) return false;
      const next = { ...placement, [to]: colored(promotion || piece, side) };
      delete next[from];
      if (epCapture) {
        const captured = to[0] + from[1];
        if (next[captured] !== colored("P", opposite(side))) return false;
        delete next[captured];
      }
      if (rookFrom) {
        next[rookTo] = next[rookFrom];
        delete next[rookFrom];
      }
      return placementToString(next) === placementToString(after);
    });
  }

  function moveLabel(san, rootFen, plyIndex) {
    const root = parseFen(rootFen);
    if (!root || !Number.isSafeInteger(plyIndex) || plyIndex < 0) return san;
    const ply = plyIndex + (root.side === "b" ? 1 : 0);
    return (root.full + Math.floor(ply / 2)) + (ply % 2 ? "..." : ".") + san;
  }

  globalThis.AQChess = { START_FEN, parseFen, placementToString, isStrictSan, stripSan, sameMove,
    isPlausibleBoard, preSendCheck, verifyBest, verifyExplain, sanMatchesUci, moveLabel };
})();
