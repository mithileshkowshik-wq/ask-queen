// Lichess tree and round markup follow lila; chess.com uses the recorded review node structure.
const fs = require("node:fs");
const path = require("node:path");

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
const E5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2";
const NC6 = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
const ITALIAN = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3";
const OPENING = ["e4", "e5", "Nf3", "Nc6", "Bc4"];
const WHITE_CASTLE = [
  "4k3/8/8/8/8/8/8/R3K2R w KQ - 5 14",
  "4k3/8/8/8/8/8/8/R4RK1 b - - 6 14", "O-O", ["e1", "g1"],
];
const BLACK_CASTLE = [
  "r3k2r/8/8/8/8/8/8/4K3 b kq - 7 14",
  "2kr3r/8/8/8/8/8/8/4K3 w - - 8 15", "O-O-O", ["e8", "a8"],
];
const EN_PASSANT = [
  "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 18",
  "4k3/8/3P4/8/8/8/8/4K3 b - - 0 18", "exd6", ["e5", "d6"],
];
const PROMOTION = [
  "4k3/P7/8/8/8/8/8/4K3 w - - 3 40",
  "Q3k3/8/8/8/8/8/8/4K3 b - - 0 40", "a8=Q+", ["a7", "a8"],
];
const UNDERPROMOTION = [
  "4k2r/6P1/8/8/8/8/8/4K3 w - - 3 41",
  "4k2N/8/8/8/8/8/8/4K3 b - - 0 41", "gxh8=N", ["g7", "h8"],
];
// Standard-start games: [moves, FEN before the last move, FEN after it, label].
const GAME_CASTLE_WHITE = [["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"],
  "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4",
  "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4", "4.O-O", ["e1", "g1"]];
const GAME_CASTLE_BLACK = [["d4", "d5", "Nc3", "Nc6", "Bf4", "Bf5", "Qd2", "Qd7", "e3", "O-O-O"],
  "r3kbnr/pppqpppp/2n5/3p1b2/3P1B2/2N1P3/PPPQ1PPP/R3KBNR b KQkq - 0 5",
  "2kr1bnr/pppqpppp/2n5/3p1b2/3P1B2/2N1P3/PPPQ1PPP/R3KBNR w KQ - 1 6", "5...O-O-O", ["e8", "c8"]];
const GAME_EN_PASSANT = [["e4", "Nf6", "e5", "d5", "exd6"],
  "rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
  "rnbqkb1r/ppp1pppp/3P1n2/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3", "3.exd6", ["e5", "d6"]];
const PROMO_LINE = ["a4", "b5", "axb5", "a6", "bxa6", "Bb7", "axb7", "Nc6"];
const PROMO_BEFORE = "r2qkbnr/1Ppppppp/2n5/8/8/8/1PPPPPPP/RNBQKBNR w KQkq - 1 5";
const GAME_PROMOTION = [[...PROMO_LINE, "bxa8=Q"], PROMO_BEFORE,
  "Q2qkbnr/2pppppp/2n5/8/8/8/1PPPPPPP/RNBQKBNR b KQk - 0 5", "5.bxa8=Q", ["b7", "a8"]];
const GAME_UNDERPROMOTION = [[...PROMO_LINE, "bxa8=N"], PROMO_BEFORE,
  "N2qkbnr/2pppppp/2n5/8/8/8/1PPPPPPP/RNBQKBNR b KQk - 0 5", "5.bxa8=N", ["b7", "a8"]];
const ROOK_DANCE = [["h4", "h5", "Rh3", "Rh6", "Rh1", "Rh8"], "rnbqkbnr/ppppppp1/8/7p/7P/8/PPPPPPP1/RNBQKBNR w Qq - 4 4"];
const MATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";
const FEN_MISMATCH = "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/P4N2/1PPP1PPP/RNBQK2R b KQkq - 3 3";
const CUSTOM_CLOCKS = "4k3/8/8/8/8/8/8/4K2R b - - 17 42";
const GLYPH = { K: "♔", Q: "♕", R: "♖", B: "♗", N: "♘", P: "♙", k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const ROLE = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

function expand(fen) {
  const map = {};
  fen.split(" ")[0].split("/").forEach((row, r) => {
    let f = 0;
    for (const c of row) {
      if (/\d/.test(c)) f += +c;
      else map["abcdefgh"[f++] + (8 - r)] = c;
    }
  });
  return map;
}
function board(site, fen, { flipped, highlights = [], extra = "", size = 480, exact, animate } = {}) {
  const lichess = site === "lichess";
  const sqSize = size / 8;
  const square = (sq) => {
    const x = "abcdefgh".indexOf(sq[0]), y = +sq[1] - 1;
    const left = (flipped ? 7 - x : x) * sqSize;
    const top = (flipped ? y : 7 - y) * sqSize;
    return lichess ? `style="transform:translate(${left}px,${top}px)"` :
      `style="left:${left}px;top:${top}px"`;
  };
  const render = (tag, classes, sq, text, style = "") => `<${tag} class="${classes}${lichess ? "" : ` square-${"abcdefgh".indexOf(sq[0]) + 1}${sq[1]}`}" ${square(sq).slice(0, -1)};${style}">${text || ""}</${tag}>`;
  const pieces = Object.entries(expand(fen)).map(([sq, p]) => {
    const white = p === p.toUpperCase();
    const classes = (lichess ? `${white ? "white" : "black"} ${ROLE[p.toLowerCase()]}` :
      `piece ${white ? "w" : "b"}${p.toLowerCase()}`) + (sq === animate ? " anim" : "");
    return render(lichess ? "piece" : "div", classes, sq, GLYPH[p]);
  });
  // chess.com draws last-move and user marks as .highlight squares that differ only by colour.
  const markers = highlights.map(([sq, kind, color = "rgb(255, 255, 51)"]) => render(lichess ? "square" : "div",
    kind || (lichess ? "last-move" : "highlight"), sq, "", lichess ? "" : `background-color:${color};opacity:.5`));
  const tag = lichess ? "cg-board" : "wc-chess-board";
  return `<div class="fixture-board ${flipped ? "orientation-black" : "orientation-white"}" style="--size:${size}px;--square:${sqSize}px">
    <${tag} style="background:${lichess ? "#b58863" : "#769656"}"${exact ? ` data-fen="${exact}"` : ""}>
    ${markers.join("")}${pieces.join("")}${extra}</${tag}></div>`;
}

function tree(moves, selected) {
  return `<div class="tview2">${moves.map((san, i) =>
    `<move p="${"aa".repeat(i + 1)}" class="${i === selected ? "active" : ""}"><san>${san}</san></move>`).join("")}</div>`;
}
function review(moves, selected, figurines) {
  return `<wc-simple-move-list class="move-list">${moves.map((san, i) => {
    if (figurines) san = san.replace(/^[NBRQK]/, (piece) =>
      `<span class="icon-font-chess" data-figurine="${i % 2 ? piece.toLowerCase() : GLYPH[piece]}"></span><span aria-hidden="true" class="glyph">${GLYPH[piece]}</span>`);
    return `<div class="node ${i % 2 ? "black" : "white"}-move" data-node="0-${i}"><span class="node-highlight-content${i === selected ? " selected" : ""}">${san}</span></div>`;
  }).join("")}</wc-simple-move-list>`;
}

const SITES = {};
const REPLY_FENS = new Map();
const positionKey = (fen, moves) => JSON.stringify([fen, moves]);
const pgn = (fen, text = "") => `<div class="copyables"><textarea>[SetUp "1"]\n[FEN "${fen}"]\n\n${text}</textarea></div>`;

const css = `html{color-scheme:dark}body{margin:0;background:#201e1a;color:#eee;font:16px system-ui;display:flex;gap:24px;padding:24px}
  cg-board,wc-chess-board{display:block;position:relative;width:var(--size);height:var(--size);isolation:isolate}
  cg-board::before,wc-chess-board::before{content:"";position:absolute;inset:0;background:conic-gradient(#ece4c1 25%,transparent 0 50%,#ece4c1 0 75%,transparent 0) 0 0/calc(2 * var(--square)) calc(2 * var(--square));z-index:-1}
  piece,square,.piece,.highlight{position:absolute;left:0;top:0;width:var(--square);height:var(--square);text-align:center;line-height:var(--square)}
  piece,.piece{color:#161512;font-size:calc(var(--square) * .8);text-shadow:0 0 1px white}
  .last-move,.highlight{background:#edd83c88}
  .tview2, wc-simple-move-list, .move-list{display:block;padding:16px;background:#30302b;min-width:80px}
  move,.node{display:block;padding:3px 8px}
  .active,.selected{color:#ffec91}
  .mini-board{position:absolute;top:600px;left:24px}
  .site-controls{margin-top:12px}`;

function fixture(id, { site = id.startsWith("lichess") ? "lichess" : "chess.com", url, fen, moves, selected,
  expect, highlight = [], boardOptions = {}, extra = "", customTree, figurines = false, finished = true } = {}) {
  const lichess = site === "lichess";
  const host = lichess ? "lichess.org" : "www.chess.com";
  const list = customTree ?? (moves ? (lichess ? tree(moves, selected) : review(moves, selected, figurines)) : lichess ? tree([], -1) : "");
  const main = fen ? `<main aria-label="Chessboard">${board(site, fen, { highlights: highlight, ...boardOptions })}
    <nav class="site-controls" aria-label="Move navigation"><button id="site-previous">Previous move</button><button>Next move</button></nav></main>` : "";
  // chess.com game pages (Game Review included) open only with a result on screen, as the finished move list shows.
  const result = !lichess && finished ? '<div class="game-result">1-0</div>' : "";
  const html = `<!doctype html><html lang="en" data-fixture="${id}"><meta charset="utf-8"><title>${id}</title><style>${css}</style>
    <script>window.siteEarlyKeys = 0; addEventListener("keydown", () => window.siteEarlyKeys++, true);</script>
    <body>${main}${list}${result}${extra}</body></html>`;
  SITES[id] = { url: `https://${host}${url || (lichess ? "/analysis" : "/analysis/game/live/123456789?tab=review")}`,
    html, expect, fen };
  if (expect?.replyFen) REPLY_FENS.set(positionKey(expect.fen, expect.moves), expect.replyFen);
}

const send = (fen, moves, replyFen, rest) => ({ fen, moves, replyFen, ...rest });
const current = (fen, rest) => send(fen, "", fen, rest);
const fromStart = (moves, replyFen, rest) => send(START, moves.join(" "), replyFen, rest);
const blocked = (gate) => ({ gate });

for (const site of ["lichess", "chesscom"]) {
  const li = site === "lichess";
  const main = li ? "lichess-analysis" : "chesscom-review";
  const add = (id, options) => fixture(site + "-" + id, options);
  fixture(main, { fen: ITALIAN, moves: OPENING.concat("Be7"), selected: 4, highlight: [["f1"], ["c4"]],
    figurines: !li, expect: fromStart(OPENING.slice(0, -1), NC6, { explain: "3.Bc4" }) });
  REPLY_FENS.set(positionKey(START, OPENING.join(" ")), ITALIAN);
  add("start", { fen: START, moves: OPENING, selected: -1, expect: current(START) });
  add("final", { fen: ITALIAN, moves: OPENING, selected: 4, expect: fromStart(OPENING, ITALIAN) });
  add("flipped", { fen: E5, moves: OPENING, selected: 1, boardOptions: { flipped: true }, highlight: [["e7"], ["e5"]],
    expect: fromStart(OPENING.slice(0, 2), E5) });
  add("board-side", { fen: E4, highlight: [["e2"], ["e4"]], customTree: li ? '<div class="tview2"><move class="active"><san>e4</san></move></div>' : "",
    expect: current(E4, { sideSource: "lastmove" }) });
  add("board-unknown", { fen: NC6, customTree: li ? '<div class="tview2"><move class="active"></move></div>' : "",
    expect: current(NC6.replace("2 3", "0 1"), { sideSource: null, choose: "White" }) });
  add("mini", { fen: ITALIAN, moves: OPENING, selected: 4, expect: fromStart(OPENING, ITALIAN),
    extra: `<aside class="mini-board">${board(li ? site : "chess.com", START, { size: 112 })}</aside>` });
  // The e4 pawn itself is still moving: the scan would miss it, so the board stays unreadable until it lands.
  add("animation", { fen: E4, boardOptions: { animate: "e4" }, moves: OPENING, selected: 0,
    expect: { unreadable: true, moving: true } });
  add("user-marked", { fen: E4, customTree: li ? '<div class="tview2"><move class="active"></move></div>' : "",
    highlight: li ? [["e2"], ["e4"], ["h8", "selected"]] : [["e2"], ["e4"], ["h8", "highlight", "rgb(235, 97, 80)"], ["a1", "highlight", "rgb(82, 176, 220)"]],
    expect: current(E4, { sideSource: "lastmove" }) });
  add("impossible", { fen: START.replace("K", "P"), moves: OPENING, selected: -1, expect: { unreadable: true } });
  add("disagree", { fen: ITALIAN, moves: OPENING.slice(0, 4), selected: 3, highlight: [["f1"], ["c4"]],
    expect: current(ITALIAN.replace("3 3", "0 1"), { disagree: true, sideSource: "lastmove" }) });
  add("mate", { fen: MATE, moves: ["f3", "e5", "g4", "Qh4#"], selected: 3, highlight: [["d8"], ["h4"]],
    expect: { mate: true } });
  // The board alone would guess KQkq; the move list from the standard start keeps the lost rights.
  add("returned-rook", { fen: ROOK_DANCE[1], moves: ROOK_DANCE[0], selected: 5, highlight: [["h6"], ["h8"]],
    extra: li ? `<div class="copyables"><input value="${ROOK_DANCE[1]}"></div>` : "",
    expect: fromStart(ROOK_DANCE[0], ROOK_DANCE[1]) });
  add("in-progress", { url: li ? "/abcdefgh" : "/game/live/4815162342", fen: E4, customTree: "", finished: false,
    extra: li ? '<rm6><l4x><i5z>1</i5z><kwdb class="a1t">e4</kwdb></l4x></rm6><div class="rclock rclock-bottom running">4:30</div>'
      : review(["e4"], 0) + '<div class="clock-component clock-player-turn">4:30</div>', expect: blocked("in_progress") });
  add("daily", { url: li ? "/abcdefgh/white/analysis" : "/game/daily/4815162342", fen: E4, moves: ["e4"], selected: 0, finished: false,
    expect: blocked("in_progress") });
  add("puzzle", { url: li ? "/training/abcde" : "/puzzles/rated", fen: E4, expect: blocked("puzzle") });
  add("960", { url: li ? "/analysis/chess960" : "/variants/chess960", fen: START, expect: blocked("variant") });
  add("variant", { fen: START, extra: li ? '<div class="pgn"><textarea>[Variant "Atomic"]</textarea></div>' :
    '<div class="variant-badge">Atomic</div>', expect: blocked("variant") });
  add("unknown", { url: "/somewhere/unknown", fen: START, customTree: "", expect: blocked("unknown_context") });
  add("no-board", { url: "/forum", customTree: "", expect: { noBoard: true } });
  // lichess: a study or analysis from a [FEN] root. chess.com: the same moves played from the standard start.
  for (const [id, [root, after, san, last], game] of [
    ["castle-white", WHITE_CASTLE, GAME_CASTLE_WHITE], ["castle-black", BLACK_CASTLE, GAME_CASTLE_BLACK],
    ["en-passant", EN_PASSANT, GAME_EN_PASSANT], ["promotion", PROMOTION, GAME_PROMOTION],
    ["underpromotion", UNDERPROMOTION, GAME_UNDERPROMOTION],
  ]) {
    const [moves, before, played, label, squares] = game;
    add(id, li ? { fen: after, moves: [san], selected: 0, highlight: last.map((sq) => [sq]), extra: pgn(root),
      expect: send(root, "", root, { explain: (+root.split(" ").at(-1)) + (root.includes(" b ") ? "..." : ".") + san }) }
      : { fen: played, moves, selected: moves.length - 1, highlight: squares.map((sq) => [sq]), figurines: true,
        expect: send(START, moves.slice(0, -1).join(" "), before, { explain: label }) });
  }
}

const VARIATION = "rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3";
const variationTree = `<div class="tview2"><move p="aa"><san>e4</san></move><move p="aabb"><san>e5</san></move>
<move p="aabbcc"><san>Nf3</san></move><lines><line><move p="aabbdd"><san>Bc4</san></move><move p="aabbddff"><san>Nc6</san></move>
<lines><line><move p="aabbddee" class="active"><san>Nf6</san></move></line></lines></line></lines></div>`;
fixture("lichess-variation", { fen: VARIATION, customTree: variationTree, highlight: [["g8"], ["f6"]],
  expect: fromStart(["e4", "e5", "Bc4", "Nf6"], VARIATION) });
fixture("lichess-round", { url: "/abcdefgh", fen: E5,
  customTree: '<rm6><l4x><i5z>1</i5z><kwdb>e4</kwdb><kwdb class="a1t">e5</kwdb></l4x><div class="result-wrap"><p class="result">½-½</p><p class="status">Draw</p></div></rm6>',
  expect: fromStart(["e4", "e5"], E5) });
// Current lila tag names (replay.ts: rmovesTag i5d, movesTag aPp, indexTag qZM, moveTag Z7yx).
fixture("lichess-round-current", { url: "/abcdefgh", fen: E5,
  customTree: '<i5d><app><qzm>1</qzm><z7yx>e4</z7yx><z7yx class="a1t">e5</z7yx></app><div class="result-wrap"><p class="result">½-½</p><p class="status">Draw</p></div></i5d>',
  expect: fromStart(["e4", "e5"], E5) });
fixture("lichess-finished", { url: "/abcdefgh", fen: ITALIAN, highlight: [["f1"], ["c4"]],
  customTree: tree(OPENING, 4).replace("</div>", '<div class="result-wrap"><p class="result">1-0</p></div></div>'),
  expect: fromStart(OPENING, ITALIAN) });
fixture("lichess-study", { url: "/study/abcdEF12/abcdEF34", fen: BLACK_CASTLE[1], moves: ["O-O-O"], selected: 0,
  extra: pgn(BLACK_CASTLE[0]), expect: send(BLACK_CASTLE[0], "", BLACK_CASTLE[0], { explain: "14...O-O-O" }) });
fixture("lichess-custom-start", { fen: CUSTOM_CLOCKS, moves: ["Kd7"], selected: -1,
  extra: `<div class="copyables"><input value="${CUSTOM_CLOCKS}"></div>`,
  expect: current(CUSTOM_CLOCKS, { sideSource: "fen" }) });
fixture("lichess-fen-mismatch", { fen: ITALIAN, moves: OPENING, selected: 4, extra: `<div class="copyables"><input value="${FEN_MISMATCH}"></div>`,
  highlight: [["f1"], ["c4"]], expect: current(ITALIAN.replace("3 3", "0 1"), { disagree: true, sideSource: "lastmove" }) });
fixture("lichess-streak", { url: "/streak", fen: START, expect: blocked("puzzle") });
fixture("chesscom-analysis", { url: "/analysis", fen: ITALIAN, moves: OPENING, selected: 4, expect: fromStart(OPENING, ITALIAN) });
fixture("chesscom-finished", { url: "/game/live/123456789", fen: E5, moves: OPENING, selected: 1, finished: false,
  extra: '<div class="game-result">1–0</div>', expect: fromStart(["e4", "e5"], E5) });
fixture("chesscom-variation", { fen: VARIATION,
  customTree: `<div class="move-list"><div class="node" data-node="0-0">e4</div><div class="node" data-node="0-1">e5</div>
  <div class="node" data-node="0-2">Nf3</div><div class="variation"><div class="node" data-node="1-0">Bc4</div>
  <div class="node selected" data-node="1-1">Nf6</div></div></div>`,
  highlight: [["g8"], ["f6"]], expect: current(VARIATION.replace("2 3", "0 1"), { sideSource: "lastmove" }) });
fixture("chesscom-variation-ancestry", { fen: VARIATION,
  customTree: `<div class="move-list"><div class="node" data-node="0-0">e4</div><div class="node" data-node="0-1" data-parent-node="0-0">e5</div>
  <div class="node" data-node="0-2" data-parent-node="0-1">Nf3</div><div class="variation"><div class="node" data-node="1-0" data-parent-node="0-1">Bc4</div>
  <div class="node selected" data-node="1-1" data-parent-node="1-0">Nf6</div></div></div>`,
  highlight: [["g8"], ["f6"]], expect: fromStart(["e4", "e5", "Bc4", "Nf6"], VARIATION) });
fixture("chesscom-localized", { fen: NC6, moves: ["e4", "e5", "Sf3", "Nc6"], selected: 3,
  highlight: [["b8"], ["c6"]], expect: current(NC6.replace("2 3", "0 1"), { sideSource: "lastmove" }) });
fixture("chesscom-text-figurines", { url: "/analysis", fen: ITALIAN, highlight: [["f1"], ["c4"]],
  customTree: review(["e4", "e5", "♘f3", "♞c6", "♗c4"], 4), expect: fromStart(OPENING, ITALIAN) });
fixture("chesscom-hidden-result", { url: "/game/live/123456789", fen: E5, moves: OPENING, selected: 1, finished: false,
  extra: '<div hidden class="game-result">1–0</div>', expect: blocked("in_progress") });
// A game still being played, reached through Game Review or analysis links: hints never open the gate (§2).
// One of them also shows a "Draw offered" note, which is not a result.
const LIVE = review(OPENING.slice(0, 2), 1) + '<div class="clock-component clock-player-turn">4:30</div>';
for (const [id, url] of [["live-tab-review", "/game/live/4815162342?tab=review"], ["daily-tab-review", "/game/daily/4815162342?tab=review"],
  ["live-review", "/game/live/4815162342/review"], ["analysis-daily", "/analysis/game/daily/4815162342"],
  ["analysis-live", "/analysis/game/live/4815162342"]]) {
  fixture("chesscom-" + id, { url, fen: E5, customTree: LIVE, finished: false, highlight: [["e7"], ["e5"]],
    extra: id === "live-review" ? '<div class="board-layout-sidebar"><div class="result">Draw offered</div></div>' : "",
    expect: blocked("in_progress") });
}
// A custom root and the moves before the selected one (lichess [FEN] tag; chess.com share-panel PGN).
const AFTER_OOO = BLACK_CASTLE[1], AFTER_KE2 = "2kr3r/8/8/8/8/8/4K3/8 b - - 9 15";
fixture("lichess-custom-line", { fen: AFTER_KE2, moves: ["O-O-O", "Ke2"], selected: 1, highlight: [["e1"], ["e2"]],
  extra: pgn(BLACK_CASTLE[0], "14... O-O-O 15. Ke2"), expect: send(BLACK_CASTLE[0], "O-O-O", AFTER_OOO, { explain: "15.Ke2" }) });
fixture("chesscom-tagged-root", { fen: AFTER_KE2, moves: ["O-O-O", "Ke2"], selected: 1, highlight: [["e1"], ["e2"]],
  extra: `<textarea class="share-menu-tab-pgn-textarea">[SetUp "1"]\n[FEN "${BLACK_CASTLE[0]}"]\n\n14... O-O-O 15. Ke2</textarea>`,
  expect: send(BLACK_CASTLE[0], "O-O-O", AFTER_OOO, { explain: "15.Ke2" }) });
// chess.com numbers rows with data-whole-move-number; a first row other than 1 is a custom start with no root.
fixture("chesscom-row-number", { fen: WHITE_CASTLE[1], highlight: [["e1"], ["g1"]],
  customTree: '<wc-simple-move-list><div class="main-line-row" data-whole-move-number="14"><div class="node white-move" data-node="0-0">' +
    '<span class="node-highlight-content selected">O-O</span></div></div></wc-simple-move-list>',
  expect: current("4k3/8/8/8/8/8/8/R4RK1 b - - 0 1", { sideSource: "lastmove" }) });
// The page's exact FEN says only Black keeps queenside castling, but the move line implies White does too.
const RIGHTS_EXACT = ROOK_DANCE[1].replace(" Qq ", " q ");
fixture("lichess-rights-mismatch", { fen: ROOK_DANCE[1], moves: ROOK_DANCE[0], selected: 5, highlight: [["h6"], ["h8"]],
  extra: `<div class="copyables"><input value="${RIGHTS_EXACT}"></div>`,
  expect: fromStart(ROOK_DANCE[0], ROOK_DANCE[1], { mismatch: true, exact: RIGHTS_EXACT }) });
// Sibling lines 2.Nf3 and 2.Bc4, each selected in turn (the repeat-click test switches between them mid-ask).
const AFTER_E5 = E5;
for (const [id, fen, active, label] of [
  ["nf3", "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2", "aabbcc", "2.Nf3"],
  ["bc4", "rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2", "aabbdd", "2.Bc4"]]) {
  const move = (p, san) => `<move p="${p}"${p === active ? ' class="active"' : ""}><san>${san}</san></move>`;
  fixture("lichess-sibling-" + id, { fen, highlight: id === "nf3" ? [["g1"], ["f3"]] : [["f1"], ["c4"]],
    customTree: `<div class="tview2">${move("aa", "e4")}${move("aabb", "e5")}${move("aabbcc", "Nf3")}<lines><line>${move("aabbdd", "Bc4")}</line></lines></div>`,
    expect: send(START, "e4 e5", AFTER_E5, { explain: label }) });
}
// The real boneyland recording answers this position (Best move for White after 3...Nd4).
const RECORDED_MOVES = ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nd4"];
const RECORDED_FEN = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
fixture("lichess-recorded", { fen: RECORDED_FEN, moves: RECORDED_MOVES, selected: 5, highlight: [["c6"], ["d4"]],
  expect: fromStart(RECORDED_MOVES, RECORDED_FEN) });

function sse(name) {
  return fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
}
const completeData = (text) => JSON.parse(text.split("\n").find((line) => line.startsWith("data: [")).slice(6));
const hugging = completeData(sse("hugging-apps-success.sse"));
const truncated = completeData(sse("boneyland-truncated.sse"))[0];
const boneyland = completeData(sse("boneyland-success.sse"));
// A synthetic boneyland success uses the recorded schema and the verified move from the other recording.
const boneylandSuccess = { ...truncated, best_move_san: "Be7", best_move_uci: "f8e7",
  move_source: "best_move", critical_line_uci: ["f8e7", "e1g1"], critical_line_san: "3...Be7 4.O-O",
  evaluation: 0.3, finish_reason: "stop" };
const XSS = [
  '<img src="https://xss.invalid/image" onerror="window.aqExecuted=1">',
  '"><svg onload="window.aqExecuted=1"><text>DROP_SVG</text></svg>',
  "[click](javascript:window.aqExecuted=1)", "**<b>bold text</b>**",
  "&lt;img src=x onerror=window.aqExecuted=1&gt; &amp; &#x3c;", "<PIECE_MB><SQUARE_13>",
  hugging[0], '<script>window.aqExecuted=1</script>',
];

module.exports = { SITES, REPLY_FENS, positionKey, START, E4, E5, NC6, ITALIAN, OPENING, MATE, FEN_MISMATCH,
  WHITE_CASTLE, BLACK_CASTLE, EN_PASSANT, PROMOTION, UNDERPROMOTION, RECORDED_FEN, RECORDED_MOVES, expand, sse, hugging,
  truncated, boneyland, boneylandSuccess, XSS };
