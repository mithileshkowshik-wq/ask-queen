// DOM fixtures for the site adapters. lichess markup mirrors lila (ui/analyse treeView, ui/round replay.ts);
// chess.com markup mirrors the live Game Review DOM the extension was confirmed against.
const fs = require("fs");
const path = require("path");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R"; // after 1.e4 e5 2.Nf3 Nc6 3.Bc4

const expand = (placement) => {
  const out = {};
  placement.split("/").forEach((row, r) => {
    let f = 0;
    for (const c of row) {
      if (/\d/.test(c)) f += +c;
      else out["abcdefgh"[f++] + (8 - r)] = c;
    }
  });
  return out;
};

const ROLE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
// Visible glyphs so screenshots are readable (adapters read classes/transforms only).
const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const PIECE_CSS = "position:absolute;left:0;top:0;width:60px;height:60px;font-size:46px;line-height:60px;text-align:center;color:#111";
const SQ = 60;

function lichessBoard(placement, { flipped = false, lastMove = [] } = {}) {
  const xy = (sq) => {
    let x = "abcdefgh".indexOf(sq[0]), y = 8 - +sq[1];
    if (flipped) { x = 7 - x; y = 7 - y; }
    return `transform: translate(${x * SQ}px, ${y * SQ}px)`;
  };
  const pieces = Object.entries(expand(placement)).map(([sq, p]) =>
    `<piece class="${p === p.toUpperCase() ? "white" : "black"} ${ROLE[p.toLowerCase()]}" style="${PIECE_CSS};${xy(sq)}">${GLYPH[p]}</piece>`);
  const last = lastMove.map((sq) => `<square class="last-move" style="position:absolute;left:0;top:0;width:60px;height:60px;background:rgba(155,199,0,.41);${xy(sq)}"></square>`);
  return `<div class="cg-wrap orientation-${flipped ? "black" : "white"}" style="width:480px;height:480px">
<cg-container style="width:480px;height:480px;display:block"><cg-board style="display:block;width:480px;height:480px;position:relative;background:#b58863">${last.join("")}${pieces.join("")}</cg-board></cg-container></div>`;
}

function chesscomBoard(placement, { lastMove = [] } = {}) {
  const cls = (sq) => `square-${"abcdefgh".indexOf(sq[0]) + 1}${sq[1]}`;
  const at = (sq) => `left:${"abcdefgh".indexOf(sq[0]) * SQ}px;top:${(8 - +sq[1]) * SQ}px`;
  const pieces = Object.entries(expand(placement)).map(([sq, p]) =>
    `<div class="piece ${p === p.toUpperCase() ? "w" : "b"}${p.toLowerCase()} ${cls(sq)}" style="${PIECE_CSS};${at(sq)}">${GLYPH[p]}</div>`);
  const hl = lastMove.map((sq) => `<div class="highlight ${cls(sq)}" style="position:absolute;width:60px;height:60px;background:rgba(255,255,51,.5);${at(sq)}"></div>`);
  return `<wc-chess-board class="board" style="display:block;position:relative;width:480px;height:480px;background:#769656">${hl.join("")}${pieces.join("")}</wc-chess-board>`;
}

const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>fixture</title></head>
<body style="margin:0;background:#161512;color:#bababa;font-family:sans-serif;display:flex;gap:24px;padding:24px">${body}</body></html>`;

const tview = (moves, activeIdx, variation) => {
  let p = "";
  const ids = "abcdefghijklmnopqrstuvwxyz";
  const nodes = moves.map((san, i) => {
    p += ids[i] + ids[i];
    return `<move p="${p}"${i === activeIdx ? ' class="active"' : ""}><san>${san}</san></move>`;
  });
  return `<div class="tview2 tview2-column">${nodes.join("")}${variation || ""}</div>`;
};

const SITES = {
  // Analysis board, mainline, 3.Bc4 selected.
  "lichess-analysis": {
    url: "https://lichess.org/analysis",
    html: page(lichessBoard(ITALIAN, { lastMove: ["f1", "c4"] }) + tview(["e4", "e5", "Nf3", "Nc6", "Bc4"], 4)),
    expect: { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  },
  // Selected move sits in a variation: 1.e4 e5 2.Bc4 (instead of 2.Nf3) Nf6.
  "lichess-variation": {
    url: "https://lichess.org/analysis",
    html: page(lichessBoard("rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR") + `<div class="tview2 tview2-column">
<move p="aa"><san>e4</san></move><move p="aabb"><san>e5</san></move><move p="aabbcc"><san>Nf3</san></move>
<interrupt><lines><line><move p="aabbdd"><san>Bc4</san></move><move p="aabbddee" class="active"><san>Nf6</san></move></line></lines></interrupt>
<move p="aabbccff"><san>Nc6</san></move></div>`),
    expect: { moves: ["e4", "e5", "Bc4", "Nf6"] },
  },
  // Round view (obfuscated tags; active move has .a1t).
  "lichess-round": {
    url: "https://lichess.org/abcdefgh",
    html: page(lichessBoard("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", { lastMove: ["e7", "e5"] }) +
      `<div class="rmoves"><div class="moves"><qZM>1</qZM><Z7yx>e4</Z7yx><Z7yx class="a1t">e5</Z7yx></div></div>`),
    expect: { moves: ["e4", "e5"] },
  },
  // Custom start position: PGN has a [FEN] tag, so moves must be ignored and the board/FEN used.
  "lichess-custom-fen": {
    url: "https://lichess.org/analysis",
    html: page(lichessBoard("4k3/8/8/8/8/8/4P3/4K3") + tview(["Kd1"], 0) +
      `<div class="copyables"><input class="copyable" value="4k3/8/8/8/8/8/4P3/3K4 b - - 1 1"><div class="pgn"><textarea>[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n1. Kd1</textarea></div></div>`),
    expect: { moves: null, side: "b" },
  },
  // Board only, no move list, no last-move highlight: side unknown -> picker.
  "lichess-board-only": {
    url: "https://lichess.org/editor",
    html: page(lichessBoard("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R")),
    expect: { moves: null, side: null },
  },
  // Board only, flipped, last move highlighted (black just played ...e5): side = w, ep = e6.
  "lichess-board-flipped": {
    url: "https://lichess.org/editor",
    html: page(lichessBoard("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR", { flipped: true, lastMove: ["e7", "e5"] })),
    expect: { moves: null, side: "w", fenPrefix: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6" },
  },
  // chess.com Game Review: figurine move list, 3.Bc4 selected.
  "chesscom-review": {
    url: "https://www.chess.com/analysis/game/live/123456789/review",
    html: page(chesscomBoard(ITALIAN, { lastMove: ["f1", "c4"] }) + `<wc-simple-move-list class="move-list">
<div class="main-line-row"><div class="node white-move" data-node="0-0"><span class="node-highlight-content">e4</span></div><div class="node black-move" data-node="0-1"><span class="node-highlight-content">e5</span></div></div>
<div class="main-line-row"><div class="node white-move" data-node="0-2"><span class="node-highlight-content"><span class="icon-font-chess knight-white" data-figurine="N"></span>f3</span></div><div class="node black-move" data-node="0-3"><span class="node-highlight-content"><span class="icon-font-chess knight-black" data-figurine="N"></span>c6</span></div></div>
<div class="main-line-row"><div class="node white-move" data-node="0-4"><span class="node-highlight-content selected"><span class="icon-font-chess bishop-white" data-figurine="B"></span>c4</span></div></div>
</wc-simple-move-list>`),
    expect: { moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  },
  // chess.com analysis with no move list; highlight says white just moved -> black to play.
  "chesscom-board-only": {
    url: "https://www.chess.com/analysis",
    html: page(chesscomBoard("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR", { lastMove: ["e2", "e4"] })),
    expect: { moves: null, side: "b", fenPrefix: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3" },
  },
  // Page without a board: no button.
  "lichess-no-board": {
    url: "https://lichess.org/forum",
    html: page("<p>Forum</p>"),
    expect: null,
  },
};

// Recorded real Space responses (test/fixtures/*.sse). The boneyland success is derived from the
// recorded hugging-apps success (same model output), reshaped to boneyland's /analyse_position dict.
const sse = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const completeData = (text) => JSON.parse(text.split("\n").find((l) => l.startsWith("data: [")).slice(6));
const hugging = completeData(sse("hugging-apps-success.sse"));
const boneylandSuccess = (() => {
  const { raw_text, critical_line, inference_settings, ...rest } = hugging[3];
  return { analysis: hugging[2], ...rest, evaluation: null, critical_line_uci: [] };
})();

module.exports = { SITES, START, sse, completeData, hugging, boneylandSuccess };
