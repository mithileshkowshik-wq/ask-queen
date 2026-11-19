// Shared helpers. Site adapters register on AQ.adapters; panel.js calls AQ.readPosition().
//
// readPosition() returns null when there is no board on the page, otherwise:
//   { site, moves, board }
//   moves: SAN moves from the start position up to and including the selected move,
//          or null when the move list can't be read (custom position, variation, puzzle).
//   board: { placement, castle, ep, side } from scanning the board, or null.
//          side is "w", "b" or null when unknown; build a FEN with AQ.fenWithSide(board, side).
var AQ = globalThis.AQ || (globalThis.AQ = { adapters: [] });

AQ.START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// "Nf3!?" / "0-0" / "e8=Q+" -> clean SAN
AQ.cleanSan = (s) =>
  (s || "")
    .replace(/0/g, "O")
    .replace(/[^a-hKQRBNO1-8x=+#\-]/g, "")
    .replace(/[+#]+$/, "");

AQ.sameMove = (a, b) => !!a && !!b && AQ.cleanSan(a) === AQ.cleanSan(b);

// pieces: { e2: "P", e7: "p", ... }; lastMove: [fromSq, toSq] or null
AQ.boardFromPieces = (pieces, lastMove) => {
  const rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = "", empty = 0;
    for (const f of "abcdefgh") {
      const p = pieces[f + r];
      if (p) { if (empty) row += empty; row += p; empty = 0; } else empty++;
    }
    rows.push(row + (empty || ""));
  }
  const at = (sq, p) => pieces[sq] === p;
  let castle =
    (at("e1", "K") && at("h1", "R") ? "K" : "") + (at("e1", "K") && at("a1", "R") ? "Q" : "") +
    (at("e8", "k") && at("h8", "r") ? "k" : "") + (at("e8", "k") && at("a8", "r") ? "q" : "");

  // Side to move: whoever owns the piece on a last-move square just moved.
  let side = null, ep = "-";
  if (lastMove) {
    const mover = lastMove.map((sq) => pieces[sq]).find(Boolean);
    if (mover) side = mover === mover.toUpperCase() ? "b" : "w";
    // En passant square after a double pawn push (highlight order varies, so find the pawn).
    const [s1, s2] = lastMove;
    const to = pieces[s1] ? s1 : s2, from = to === s1 ? s2 : s1;
    const p = pieces[to];
    if (p && p.toLowerCase() === "p" && !pieces[from] && from[0] === to[0] && Math.abs(from[1] - to[1]) === 2)
      ep = to[0] + (+from[1] + +to[1]) / 2;
  }
  return { placement: rows.join("/"), castle: castle || "-", ep, side };
};

AQ.fenWithSide = (board, side) => `${board.placement} ${side} ${board.castle} ${board.ep} 0 1`;

AQ.readPosition = () => {
  for (const a of AQ.adapters) {
    if (!a.matches()) continue;
    const pos = a.read();
    if (pos) return { site: a.name, ...pos };
  }
  return null;
};
