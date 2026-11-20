// Shared DOM adapter helpers. Only a matching site registers a position.
var AQ = globalThis.AQ = { adapters: [] };
(() => {
  const C = globalThis.AQChess;
  const MINI = ".mini-board, .mini-game, .cg-mini, [data-mini-board], [class*='mini-board'], [class*='hover-preview']";
  AQ.visible = (el) => {
    if (el.closest("[hidden], [aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && !!el.getClientRects().length;
  };

  AQ.mainBoard = (selector, primary) => {
    let best = null, max = 0, preferred = false;
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest(MINI) || !AQ.visible(el)) continue;
      const { width, height } = el.getBoundingClientRect();
      const main = !!el.closest(primary);
      const area = width * height;
      if (area && ((main && !preferred) || (main === preferred && area > max))) {
        best = el;
        max = area;
        preferred = main;
      }
    }
    return best;
  };

  AQ.hasBoard = (selector) => [...document.querySelectorAll(selector)].some((el) => !el.closest(MINI));
  AQ.transient = ".anim, .animating, .dragging, .ghost, .fading";
  AQ.readSan = (s) => {
    const san = s?.trim();
    return C.isStrictSan(san) ? san : null;
  };

  AQ.boardFromPieces = (pieces, lastMove, duplicate = false) => {
    const at = (sq, p) => pieces[sq] === p;
    const castle =
      (at("e1", "K") && at("h1", "R") ? "K" : "") + (at("e1", "K") && at("a1", "R") ? "Q" : "") +
      (at("e8", "k") && at("h8", "r") ? "k" : "") + (at("e8", "k") && at("a8", "r") ? "q" : "");
    let side = null, ep = "-";
    if (lastMove?.length === 2 && lastMove.every((sq) => /^[a-h][1-8]$/.test(sq)) &&
        lastMove.filter((sq) => pieces[sq]).length === 1) {
      const to = lastMove.find((sq) => pieces[sq]);
      const from = lastMove.find((sq) => !pieces[sq]);
      const piece = pieces[to];
      side = piece === piece.toUpperCase() ? "b" : "w";
      if (from[0] === to[0] && (piece === "P" && from[1] + to[1] === "24" || piece === "p" && from[1] + to[1] === "75"))
        ep = to[0] + (side === "b" ? "3" : "6");
    }
    const check = C.isPlausibleBoard(pieces);
    return { placement: C.placementToString(pieces), side, sideSource: side ? "lastmove" : null,
      castle: castle || "-", ep, fen6: null, castleGuessed: true,
      valid: check.ok && !duplicate, reason: duplicate ? "Overlapping pieces" : check.reason };
  };

  AQ.scan = (el, squareOf, pieceOf, pieceSelector, highlights) => {
    const pieces = {};
    let duplicate = false;
    for (const piece of el.querySelectorAll(pieceSelector)) {
      if (piece.matches(AQ.transient)) continue;
      const sq = squareOf(piece), role = pieceOf(piece);
      if (!sq || !role) continue;
      if (pieces[sq]) duplicate = true;
      pieces[sq] = role;
    }
    return AQ.boardFromPieces(pieces, [...new Set(highlights.map(squareOf))], duplicate);
  };

  AQ.fenWithSide = (board, side) => board.fen6 && side === board.side ? board.fen6 :
    [board.placement, side, board.castle, side === board.side ? board.ep : "-", 0, 1].join(" ");

  AQ.position = ({ page, gate, board, line, exactFen }) => {
    let root = line?.root ?? null;
    let moves = line?.moves ?? null;
    const highlightSide = board.side;
    const exact = C.parseFen(exactFen);
    let crossCheck = { ok: true, reason: null };
    if (exact && board.valid) {
      if (C.placementToString(exact.placement) !== board.placement || (highlightSide && highlightSide !== exact.side)) {
        crossCheck = { ok: false, reason: "The site FEN disagrees with the board" };
      } else {
        Object.assign(board, { side: exact.side, sideSource: "fen", castle: exact.castle, ep: exact.ep,
          fen6: exactFen, castleGuessed: false });
      }
    }
    if (root && moves && crossCheck.ok) {
      crossCheck = C.preSendCheck({ rootFen: root.fen, moves, board, highlightSide });
      const side = moves.length % 2 ? (C.parseFen(root.fen).side === "w" ? "b" : "w") : C.parseFen(root.fen).side;
      if (crossCheck.ok && board.fen6 && board.side !== side) crossCheck = { ok: false, reason: "Side to move disagrees" };
      if (crossCheck.ok) {
        root = { ...root, verified: true };
        if (!board.fen6) Object.assign(board, { side, sideSource: "moves" });
      }
    }
    if (!crossCheck.ok) {
      moves = null;
      if (root) root = { ...root, verified: false };
    }
    if (!root?.verified || gate) moves = null;
    return { page, gate, board, root, moves, crossCheck };
  };

  AQ.root = (moves, { fen, source = "pgn", custom = false } = {}) => {
    if (!moves || !moves.every(Boolean)) return null;
    if (C.parseFen(fen)) return { moves, root: { fen, verified: false, source } };
    if (custom) return null;
    return { moves, root: { fen: C.START_FEN, verified: false, source: "standard" } };
  };

  AQ.readPosition = () => {
    const adapter = AQ.adapters.find((a) => a.matches());
    const result = adapter?.read();
    if (!result) return null;
    const position = { site: adapter.name, ...result };
    return { ...position, snapshotKey: JSON.stringify([location.pathname, position]) };
  };
})();
