const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const F = require("./fixtures");

const REPO = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(REPO, name), "utf8");
require("../content/chess.js");
const C = globalThis.AQChess;
const bg = require("../background.js");
const sources = ["chess", "common", "lichess", "chesscom"].map((s) => [s, read("content/" + s + ".js")]);

function fixtureDoc(name, mutate = (name, source) => source) {
  const f = F.SITES[name];
  const dom = new JSDOM(f.html, { url: f.url, runScripts: "outside-only" });
  const w = dom.window;
  w.Element.prototype.getBoundingClientRect = function () {
    if (!this.isConnected || this.closest("[hidden]") || this.style.display === "none") return { width: 0, height: 0 };
    const side = Number.parseInt(this.closest(".fixture-board")?.style.getPropertyValue("--size"), 10) || 1;
    return { width: side, height: side };
  };
  w.Element.prototype.getClientRects = function () {
    return this.getBoundingClientRect().width ? [this.getBoundingClientRect()] : [];
  };
  for (const [name, source] of sources) w.eval(mutate(name, source));
  return { w, f, close: () => w.close() };
}

function assertFixture(doc, id) {
  const { w, f } = doc;
  assert.equal(w.document.documentElement.dataset.fixture, id);
  const pos = w.AQ.readPosition(), e = f.expect;
  if (e.noBoard) { assert.equal(pos, null); return; }
  assert.equal(pos.gate, e.gate ?? null);
  assert.equal(pos.site, id.startsWith("lichess") ? "lichess" : "chess.com");
  assert.equal(typeof pos.snapshotKey, "string");
  assert.equal(w.AQ.readPosition().snapshotKey, pos.snapshotKey);
  if (e.gate) { assert.equal(pos.moves, null); return; }
  if (e.unreadable) {
    assert.equal(pos.board.valid, false);
    assert.notEqual(pos.root?.verified, true);
    if (e.moving) assert.equal(pos.board.reason, "The board is moving");
    return;
  }
  if (e.mate) { assert.match(pos.moves.at(-1), /#$/); return; }
  assert.equal(pos.board.placement, f.fen.split(" ")[0]);
  assert.equal(pos.board.valid, true);
  if (e.disagree) {
    assert.equal(pos.crossCheck.ok, false);
    assert.equal(pos.moves, null);
    assert.notEqual(pos.root?.verified, true);
  } else assert.equal(pos.crossCheck.ok, true, pos.crossCheck.reason);
  if (e.exact) assert.equal(pos.board.fen6, e.exact);
  if (Object.hasOwn(e, "sideSource")) {
    assert.equal(pos.board.sideSource, e.sideSource);
    assert.equal(pos.moves, null);
    const side = e.choose ? e.choose[0].toLowerCase() : pos.board.side;
    assert.equal(w.AQ.fenWithSide(pos.board, side), e.fen);
    if (e.sideSource === "fen") {
      assert.equal(pos.board.fen6, e.fen);
      assert.equal(pos.board.castleGuessed, false);
    }
  } else {
    assert.equal(pos.root.verified, true);
    assert.equal(pos.root.fen, e.fen);
    assert.equal(pos.moves.slice(0, e.explain ? -1 : undefined).join(" "), e.moves);
    if (e.explain) assert.equal(w.AQChess.moveLabel(pos.moves.at(-1), pos.root.fen, pos.moves.length - 1), e.explain);
  }
}

function makeRequest(mode, fen, moves, { played = null, position = fen, fresh = false, prefer } = {}) {
  const [placement, side] = position.split(" ");
  return { type: "ask", mode, fen, moves, played, snapshot: { placement, side }, fresh,
    ...(prefer && { prefer }) };
}

function runUnits(test) {
  test("FEN parser preserves all six fields and rejects malformed ranks and clocks", () => {
    assert.deepEqual(C.parseFen(F.START), { placement: F.expand(F.START), side: "w", castle: "KQkq", ep: "-", half: 0, full: 1 });
    for (const fen of [F.START.replace("/8/", "/9/"), F.START.replace("/8/", "/44/"),
      F.START.replace(" w ", " z "), F.START.replace(" KQkq ", "  "), F.START.slice(0, -1) + "0", F.START + "\n"])
      assert.equal(C.parseFen(fen), null);
    assert.equal(C.placementToString(F.expand(F.ITALIAN)), F.ITALIAN.split(" ")[0]);
  });
  test("Strict SAN strips annotations only and never repairs a localized or malformed move", () => {
    for (const san of ["Nf3", "Nbd2", "Nb1d2", "exd8=Q+", "Qh4#!?", "O-O-O⁉", "Nf3+\$1"]) assert(C.isStrictSan(san), san);
    for (const san of ["Sf3", "♞f3", "1.Nf3", "nf3", "N+f3", "Nf\n3", "e8Q", "0-0", "black", "Nf3\n", "e8=", "e8=+", "Q-h5"])
      assert.equal(C.isStrictSan(san), false, san);
    assert.equal(C.stripSan("Sf3!"), "Sf3");
    assert.equal(C.stripSan("exd8=Q+"), "exd8=Q");
    assert.equal(C.stripSan("N+f3"), "N+f3");
    assert(C.sameMove("0-0!?", "O-O+"));
    assert(C.sameMove("e8Q⁉", "e8=Q#"));
    assert.equal(C.sameMove("Sf3", "f3"), false);
  });
  test("Pre-send checks enforce root-relative capture count, side, footprint and zero-ply placement", () => {
    const [root, after, move] = F.UNDERPROMOTION;
    const arg = { rootFen: root, board: { placement: after.split(" ")[0] }, moves: [move], highlightSide: "b" };
    assert.equal(C.preSendCheck(arg).ok, true);
    assert.match(C.preSendCheck({ ...arg, highlightSide: "w" }).reason, /side/i);
    assert.match(C.preSendCheck({ ...arg, moves: ["g8=N"] }).reason, /count/i);
    assert.match(C.preSendCheck({ ...arg, moves: ["gxh8=Q"] }).reason, /last move/i);
    const start = { rootFen: F.START, moves: [], board: { placement: F.START.split(" ")[0] } };
    assert(C.preSendCheck(start).ok);
    assert.equal(C.preSendCheck({ ...start, board: { placement: F.E4.split(" ")[0] } }).ok, false);
    assert.equal(C.preSendCheck({ ...start, board: { ...start.board, side: "b" } }).ok, false);
  });
  test("Verify Best checks both placement and side", () => {
    const snap = makeRequest("best", F.ITALIAN, "").snapshot;
    assert(C.verifyBest(F.ITALIAN, snap));
    assert.equal(C.verifyBest(F.FEN_MISMATCH, snap), false);
    assert.equal(C.verifyBest(F.ITALIAN.replace(" b ", " w "), snap), false);
  });
  test("Verify Explain reproduces quiet moves, both castles, en passant, promotion and a capture", () => {
    assert(C.verifyExplain(F.NC6, F.expand(F.ITALIAN), "Bc4"));
    const examples = [F.WHITE_CASTLE, F.BLACK_CASTLE, F.EN_PASSANT, F.PROMOTION, F.UNDERPROMOTION,
      ["4k3/8/8/8/8/2p5/3B4/4K3 w - - 4 10", "4k3/8/8/8/8/2B5/8/4K3 b - - 0 10", "Bxc3"]];
    for (const [from, to, san] of examples) assert(C.verifyExplain(from, F.expand(to), san), san);
    assert.equal(C.verifyExplain(F.NC6.replace("PPPP1PPP", "1PPP1PPP").replace("/5N2/", "/P4N2/"), F.expand(F.ITALIAN), "Bc4"), false);
    assert.equal(C.verifyExplain(F.NC6.replace(" w ", " b "), F.expand(F.ITALIAN), "Bc4"), false);
    assert.equal(C.verifyExplain(F.NC6, F.expand(F.ITALIAN), "Bbc4"), false);
    assert.equal(C.verifyExplain(F.NC6, F.expand(F.ITALIAN), "Bxc4"), false);
    assert.equal(C.verifyExplain(F.EN_PASSANT[0].replace(" d6 ", " - "), F.expand(F.EN_PASSANT[1]), "exd6"), false);
  });
  test("SAN/UCI matching checks the piece, square, disambiguation and promotion", () => {
    const fen = "4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1";
    for (const san of ["Nbd2", "N1d2", "Nb1d2"]) assert(C.sanMatchesUci(san, "b1d2", fen));
    assert.equal(C.sanMatchesUci("Nbd2", "f3d2", fen), false);
    assert.equal(C.sanMatchesUci("Nfd2", "f3d2", fen), true);
    assert.equal(C.sanMatchesUci("gxh8=N", "g7h8q", F.UNDERPROMOTION[0]), false);
    assert(C.sanMatchesUci("gxh8=N", "g7h8n", F.UNDERPROMOTION[0]));
    assert(C.sanMatchesUci("O-O-O", "e8c8", F.BLACK_CASTLE[0]));
    assert.equal(C.moveLabel("Nf6", F.BLACK_CASTLE[0], 0), "14...Nf6");
    assert.equal(C.moveLabel("Nf3", F.BLACK_CASTLE[0], 1), "15.Nf3");
  });
  test("Board hygiene rejects impossible boards and ignores ambiguous highlights", () => {
    assert.equal(C.isPlausibleBoard({ ...F.expand(F.START), a3: "Q" }).ok, false);
    assert.equal(C.isPlausibleBoard({ ...F.expand(F.START), a1: "P" }).ok, false);
    assert.equal(C.isPlausibleBoard({ ...F.expand(F.START), d1: "K" }).ok, false);
    const doc = fixtureDoc("lichess-start");
    try {
      const { AQ } = doc.w;
      assert.equal(AQ.boardFromPieces(F.expand(F.START), ["d1", "e1"]).side, null);
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e2", "e4", "h8"]).side, null);
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e2", "e4"]).side, "b");
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e2", "e4"]).ep, "-", "no black pawn can take");
      assert.equal(AQ.boardFromPieces(F.expand(F.E4_EP), ["e2", "e4"]).ep, "e3", "the d4 pawn can take");
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e6", "e4"]).ep, "-");
    } finally { doc.close(); }
  });
  for (const id of Object.keys(F.SITES)) {
    test("Adapter fixture " + id, () => {
      const doc = fixtureDoc(id);
      try { assertFixture(doc, id); } finally { doc.close(); }
    });
  }
  test("AQ.gate() is layout-free and agrees with readPosition() on every fixture", () => {
    for (const id of Object.keys(F.SITES)) {
      const doc = fixtureDoc(id);
      try {
        const { w } = doc, full = w.AQ.readPosition();
        const layout = () => { throw new Error("layout read in AQ.gate()"); };
        w.Element.prototype.getBoundingClientRect = w.Element.prototype.getClientRects = layout;
        const style = w.getComputedStyle;
        w.getComputedStyle = layout;
        const cheap = w.AQ.gate();
        w.getComputedStyle = style; // AQ.confirm() may read style (checkVisibility in Chrome), never rects
        assert.equal(cheap.hasBoard, !!full, id);
        // The cheap gate may only be more open than the full read when CSS hides the evidence; AQ.confirm() (style,
        // not layout) then keeps the launcher closed.
        if (cheap.gate === null && full?.gate) assert.equal(w.AQ.confirm(), false, id + " confirm");
        else assert.equal(cheap.gate, full ? full.gate : null, id);
        if (full?.gate === null) assert.equal(w.AQ.confirm(), true, id + " confirm");
      } finally { doc.close(); }
    }
  });
  test("AQ.gate() caches: a quiet tick is one querySelector; URL, board or a click recomputes it", () => {
    const doc = fixtureDoc("chesscom-live-tab-review");
    try {
      const { w } = doc, { document } = w;
      assert.equal(w.AQ.gate().gate, "in_progress");
      let one = 0, all = 0;
      const q = w.Document.prototype.querySelector, qa = w.Document.prototype.querySelectorAll;
      w.Document.prototype.querySelector = function (...a) { one++; return q.apply(this, a); };
      w.Document.prototype.querySelectorAll = function (...a) { all++; return qa.apply(this, a); };
      for (let i = 0; i < 5; i++) w.AQ.gate();
      assert.deepEqual([one, all], [5, 0], "five quiet ticks");
      document.querySelector(".clock-player-turn").remove();
      document.querySelector("wc-simple-move-list").insertAdjacentHTML("beforeend", '<div class="game-result">1-0</div>');
      assert.equal(w.AQ.gate().gate, "in_progress", "no recompute without a trigger (fails closed)");
      document.dispatchEvent(new w.Event("pointerdown"));
      assert.equal(w.AQ.gate().gate, null, "a click marks it for a recompute");
      w.history.pushState({}, "", "/puzzles/rated");
      assert.equal(w.AQ.gate().gate, "puzzle", "a URL change recomputes");
      assert.equal(w.AQ.confirm(), false);
    } finally { doc.close(); }
  });
  test("A lichess FEN input a step behind the board gets one re-read 300 ms later, not a loop", async () => {
    const doc = fixtureDoc("lichess-fen-mismatch");
    try {
      const { AQ, document } = doc.w;
      const host = document.createElement("div");
      host.dataset.testid = "aq-host";
      document.documentElement.append(host);
      assert.equal(AQ.readPosition().crossCheck.reason, "The site FEN disagrees with the board");
      await new Promise((resolve) => setTimeout(resolve, 350));
      const first = host.getAttribute("data-aq-recheck");
      assert(first, "the open panel's observer is nudged");
      AQ.readPosition();
      await new Promise((resolve) => setTimeout(resolve, 350));
      assert.equal(host.getAttribute("data-aq-recheck"), first, "the same disagreement is not retried");
    } finally { doc.close(); }
  });
  test("Very long provider prose is capped at 20,000 characters before it is parsed", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const r = bg.normalized([{ ...F.boneylandSuccess, analysis: "**a** ".repeat(30000) }], "boneyland", req, "boneyland", 1);
    assert(r.analysis.length <= 20000);
  });
  test("A moving piece keeps the board unreadable until it lands", () => {
    for (const id of ["lichess-animation", "chesscom-animation"]) {
      const doc = fixtureDoc(id);
      try {
        const { AQ, document } = doc.w;
        assert.equal(AQ.readPosition().board.reason, "The board is moving");
        document.querySelector(".anim").classList.remove("anim");
        const pos = AQ.readPosition();
        assert.equal(pos.board.valid, true);
        assert.equal(pos.moves.join(" "), "e4");
      } finally { doc.close(); }
    }
  });
  test("With exact rights in the snapshot, Best needs equal rights and Explain may only lose rights", () => {
    const [placement, side] = F.ITALIAN.split(" ");
    assert(C.verifyBest(F.ITALIAN, { placement, side, castle: "KQkq", ep: "-" }));
    assert.equal(C.verifyBest(F.ITALIAN, { placement, side, castle: "kq", ep: "-" }), false);
    assert.equal(C.verifyBest(F.ITALIAN, { placement, side, castle: "KQkq", ep: "e3" }), false);
    const ask = (castle) => ({ ...makeRequest("explain", F.START, "e4 e5 Nf3 Nc6", { played: "Bc4", position: F.ITALIAN }),
      snapshot: { placement, side, castle, ep: "-" } });
    const explain = (castle) => bg.normalized([{ ...F.boneylandSuccess, fen: F.NC6 }], "boneyland", ask(castle), "boneyland", 1).positionCheck;
    assert.equal(explain("KQkq"), "ok");
    assert.equal(explain("kq"), "ok");
    const narrow = bg.normalized([{ ...F.boneylandSuccess, fen: F.NC6.replace("KQkq", "Kkq") }], "boneyland", ask("KQkq"), "boneyland", 1);
    assert.equal(narrow.positionCheck, "mismatch");
    const best = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    assert(bg.validAsk({ ...best, snapshot: { ...best.snapshot, castle: "KQkq", ep: "-" } }));
    for (const bad of [{ castle: "KQkq" }, { castle: "", ep: "-" }, { castle: "QK", ep: "-" }, { castle: "-", ep: "e4" }])
      assert.equal(bg.validAsk({ ...best, snapshot: { ...best.snapshot, ...bad } }), false, JSON.stringify(bad));
  });
  test("Prose is confirmed only by the answering provider's own legality field", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const prose = { ...F.truncated, move_source: "random_legal_fallback" };
    // boneyland shape carrying a hugging-apps style legal step: not boneyland's field, so unverified.
    const bony = bg.normalized([{ ...prose, critical_line_uci: [], critical_line: { legal_steps: [{ uci: "f8e7" }] } }],
      "boneyland", req, "boneyland", 1);
    assert.equal(bony.best, null);
    assert.equal(bony.suggestion.san, "Be7");
    // hugging-apps shape carrying boneyland's critical_line_uci: foreign, so unverified.
    const hug = (extra) => bg.normalized(["<svg/>", null, prose.analysis, { ...prose, ...extra }], "hugging-apps", req, "hugging-apps", 1);
    assert.equal(hug({ critical_line_uci: ["f8e7"] }).best, null);
    assert.equal(hug({ critical_line: "{'legal_steps': [{'uci': 'f8e7'}]}" }).best, null, "a repr string is not a legality field");
    assert.deepEqual(hug({ critical_line: { legal_steps: [{ uci: "f8e7" }] } }).best, { san: "Be7", uci: "f8e7", source: "prose_verified" });
  });
  test("The real boneyland recording normalizes with its evaluation sentence and a numbered line", () => {
    const req = makeRequest("best", F.START, F.RECORDED_MOVES.join(" "), { position: F.RECORDED_FEN });
    const r = bg.normalized(F.boneyland, "boneyland", req, "boneyland", 16);
    assert.deepEqual(r.best, { san: "Nxe5", uci: "f3e5", source: "structured" });
    assert.equal(r.evaluation, null);
    assert.equal(r.evaluationText, "White is better by approximately 1.51 pawns, retaining the extra pawn and a modest space advantage after the best play.");
    assert.equal(r.criticalLine, "4.Nxe5 Qf6 5.O-O Ne6 6.d4 d6");
    assert.equal(r.positionCheck, "ok");
    assert.match(r.analysis, /The best move is 4\.Nxe5,/);
    assert.doesNotMatch(r.analysis, /BEST_MOVE|CRITICAL_LINE|EVALUATION:/);
    assert.throws(() => bg.normalized([{ ...F.boneyland[0], evaluation: {} }], "boneyland", req, "boneyland", 1), { code: "bad_response" });
  });
  test("SSE parser handles arbitrary byte splits, CRLF, Unicode, multi-line data and no complete", () => {
    const input = Buffer.from(": ping\r\nevent: heartbeat\r\ndata: null\r\n\r\n" +
      "event: complete\r\ndata: [\r\ndata: \"é\"]\r\n\r\n");
    for (let i = 0; i <= input.length; i++) {
      const p = bg.createSseParser();
      const events = [...p.push(input.subarray(0, i)), ...p.push(input.subarray(i)), ...p.finish()];
      assert.deepEqual(events, [{ event: "heartbeat", data: "null" }, { event: "complete", data: '[\n"é"]' }], String(i));
    }
    const p = bg.createSseParser();
    assert.deepEqual([...p.push("event: heartbeat\ndata: null\n\n"), ...p.finish()].map((e) => e.event), ["heartbeat"]);
  });
  test("Best-move extraction handles positive and negative prose and never accepts lower-case pieces", () => {
    assert.equal(bg.proseMove("The best move is not obvious."), null);
    assert.equal(bg.proseMove("The move is clearly Nf3."), "Nf3");
    assert.equal(bg.proseMove("The best move is 3...black bishop."), null);
    assert.equal(bg.proseMove("The best move is **3...Be7**."), "Be7");
    assert.equal(bg.proseMove("The best move is nf3."), null);
  });
  test("Both recorded API shapes normalize with strict move-source precedence and no HTML outputs", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const hug = bg.normalized(F.hugging, "hugging-apps", req, "hugging-apps", 2);
    assert.equal(hug.positionCheck, "ok");
    assert.equal(hug.best.source, "structured");
    assert.equal(hug.criticalLine, "3...Be7 4.O-O Nf6 5.d3 O-O 6.Nc3 d6 7.Be3");
    assert.match(hug.analysis, /White holds/);
    assert.match(hug.analysis, /Black possesses/);
    assert.doesNotMatch(hug.analysis, /<svg|<PIECE_|raw_text/);
    const trunc = bg.normalized([F.truncated], "boneyland", req, "boneyland", 3);
    assert.equal(trunc.best, null);
    assert.deepEqual(trunc.suggestion, { san: "Be7", source: "prose_unverified" });
    assert(trunc.truncated);
    assert.equal(trunc.criticalLine, null);
    assert.equal(trunc.evaluationText, null);
    const verified = bg.normalized([{ ...F.truncated, move_source: "random_legal_fallback", critical_line_uci: ["f8e7"] }],
      "boneyland", req, "boneyland", 1);
    assert.deepEqual(verified.best, { san: "Be7", uci: "f8e7", source: "prose_verified" });
    const structured = bg.normalized([{ ...F.boneylandSuccess, best_move_san: "Nf6", best_move_uci: "g8f6", move_source: "critical_line" }],
      "boneyland", req, "boneyland", 1);
    assert.equal(structured.best.san, "Nf6");
    assert.equal(structured.evaluation, 0.3);
    assert.equal(structured.evaluationText, null, "a bare number has no sign convention, so no Evaluation row");
    assert.equal(bg.normalized([{ ...F.boneylandSuccess, fen: F.FEN_MISMATCH }], "boneyland", req, "boneyland", 1).positionCheck, "mismatch");
    for (const raw of [[], [{}], [{ ...F.boneylandSuccess, best_move_san: 1 }], [{ ...F.boneylandSuccess, analysis: {} }]])
      assert.throws(() => bg.normalized(raw, "boneyland", req, "boneyland", 1), { code: "bad_response" });
  });
  test("Provider text drops well-formed HTML, SVG and model tokens but keeps a lone '<'", () => {
    const clean = bg.plainAnalysis(F.XSS.join("\n"), "b");
    assert.doesNotMatch(clean, /<(?:svg|img|script|PIECE|SQUARE|b>)|DROP_SVG/i);
    assert.match(clean, /\*\*bold text\*\*/);
    assert.match(clean, /&lt;img/);
    assert.equal(bg.plainAnalysis("If a<b then the knight wins. Then 4. Nxe5 and (5... Qf6).", "w"),
      "If a<b then the knight wins. Then 4.Nxe5 and (5...Qf6).");
    assert.equal(bg.plainAnalysis("1. Develop\n\nBEST_MOVE: 4. Nxe5\nEVALUATION: x", "w"), "1. Develop");
    assert.equal(bg.plainAnalysis("The player's knight; a strong player beats the opponent.", "w"),
      "White's knight; a strong player beats Black.");
  });
  test("Full SAN replay: legal moves, disambiguation by pins, castling, en passant, promotion, rights and clocks", () => {
    const go = (moves, fen = F.START) => C.replay(fen, moves.split(" ").filter(Boolean));
    assert.equal(go("e4 e5 Nf3 Nc6 Bc4"), F.ITALIAN);
    assert.equal(go("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O"), "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4");
    assert.equal(go("d4 d5 Nc3 Nc6 Bf4 Bf5 Qd2 Qd7 e3 O-O-O"), "2kr1bnr/pppqpppp/2n5/3p1b2/3P1B2/2N1P3/PPPQ1PPP/R3KBNR w KQ - 1 6");
    assert.equal(go("e4 Nf6 e5 d5"), "rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3", "ep only when a capture is legal");
    assert.equal(go("e4"), "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    assert.equal(go("e4 Nf6 e5 d5 exd6"), "rnbqkb1r/ppp1pppp/3P1n2/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3");
    assert.equal(go("a4 b5 axb5 a6 bxa6 Bb7 axb7 Nc6 bxa8=N"), "N2qkbnr/2pppppp/2n5/8/8/8/1PPPPPPP/RNBQKBNR b KQk - 0 5", "rook capture drops q");
    assert.equal(go("h4 h5 Rh3 Rh6 Rh1 Rh8"), "rnbqkbnr/ppppppp1/8/7p/7P/8/PPPPPPP1/RNBQKBNR w Qq - 4 4", "a rook that went home keeps no right");
    assert.equal(go("Nf3", "4k3/8/8/8/1b6/8/3N4/4K1N1 w - - 0 1"), "4k3/8/8/8/1b6/5N2/3N4/4K3 b - - 1 1", "the pinned knight can't be meant");
    for (const bad of ["Qh5", "e5", "Nd2", "O-O", "e4 e5 Ke2 Ke7 O-O", "e4 d5 Bb5 Nd7 Nf3 Nb6", "e4 e5 Bxe5", "Nf3 Nf6 Nf6"])
      assert.equal(go(bad), null, bad);
    assert.equal(go("O-O", "4k3/8/8/8/8/8/4b3/R3K2R w KQ - 0 1"), null, "castling through check");
    assert.equal(go("O-O-O", "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1"), "4k3/8/8/8/8/8/8/2KR3R b - - 1 1");
    assert.equal(go("e8", "4k3/4P3/8/8/8/8/8/4K3 w - - 0 1"), null, "a pawn reaching the last rank must promote");
    assert.equal(go("f3 e5 g4 Qh4#"), F.MATE);
  });
  test("Adapters drop a move list whose replay doesn't match the exact FEN's castling or en passant", () => {
    const doc = fixtureDoc("lichess-rights-mismatch");
    try {
      const pos = doc.w.AQ.readPosition();
      assert.equal(pos.moves, null);
      assert.match(pos.crossCheck.reason, /castling/);
    } finally { doc.close(); }
  });
  test("Background checks the returned FEN against the replayed line, rights and en passant included", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const answer = (fen) => bg.normalized([{ ...F.boneylandSuccess, fen }], "boneyland", req, "boneyland", 1).positionCheck;
    assert.equal(answer(F.ITALIAN), "ok");
    assert.equal(answer(F.ITALIAN.replace("KQkq", "Kkq")), "mismatch");
    assert.equal(answer(F.ITALIAN.replace(" - 3 3", " e3 3 3")), "mismatch");
    const explain = makeRequest("explain", F.START, "e4 e5 Nf3 Nc6", { played: "Bc4", position: F.ITALIAN });
    assert.equal(bg.normalized([{ ...F.boneylandSuccess, fen: F.NC6 }], "boneyland", explain, "boneyland", 1).positionCheck, "ok");
    assert.equal(bg.normalized([{ ...F.boneylandSuccess, fen: F.NC6.replace("KQkq", "kq") }], "boneyland", explain, "boneyland", 1).positionCheck, "mismatch");
  });
  test("With no preceding moves the returned FEN must equal the request root (first-move capture, GPT round 4)", () => {
    const [root, after, san] = F.UNDERPROMOTION;
    const req = makeRequest("explain", root, "", { played: san, position: after });
    const reply = (fen) => bg.normalized([{ ...F.boneylandSuccess, fen }], "boneyland", req, "boneyland", 1).positionCheck;
    assert.equal(reply(root), "ok");
    assert.equal(reply(root.replace("4k2r", "4k2b")), "mismatch", "a bishop on h8 instead of the rook");
    assert.equal(reply(root.replace(" w - - ", " w k - ")), "mismatch", "other castling rights");
    const board = makeRequest("best", F.E4_EP, "", { position: F.E4_EP });
    const best = (fen) => bg.normalized([{ ...F.boneylandSuccess, fen }], "boneyland", board, "boneyland", 1).positionCheck;
    assert.equal(best(F.E4_EP), "ok");
    assert.equal(best(F.E4_EP.replace(" e3 ", " - ")), "mismatch", "the first four fields must match the board fallback FEN");
  });
  test("Token redaction also catches paragraph, cross-field and invisible-character splits", () => {
    const token = "hf_SavedToken1234567890";
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const run = (analysis, evaluation = "White is better.") =>
      bg.normalized([{ ...F.boneylandSuccess, analysis, evaluation }], "boneyland", req, "boneyland", 1, token);
    const leaked = (r) => (r.analysis + r.evaluationText + r.criticalLine).replace(/[^A-Za-z0-9]/g, "").includes("SavedToken1234567890");
    for (const analysis of ["Key hf_Saved\n\nToken1234567890 here.", "Key hf_Saved\nToken1234\n567890.",
      "Key hf_​Saved­Token⁠1234﻿567890.", "Key hf_Saved. Token-1234/567890."]) {
      const r = run(analysis);
      assert(!leaked(r), JSON.stringify(analysis));
      assert.match(r.analysis, /\[(?:token removed|redacted)\]/);
    }
    // Fable round 4: list markers the renderer removes, and an echo without the hf_ prefix.
    for (const analysis of ["1. hf_Sav\n2. edTok\n3. en123\n4. 4567890", "7) hf_Saved\n8) Token12\n9) 34567890",
      "Your key body is SavedToken1234567890.", "Part of it: oken1234 only.", "## hf_Saved\nNOTE: Token1234567890"]) {
      const r = run(analysis);
      assert.equal(r.analysis, "[redacted]", JSON.stringify(analysis));
    }
    const cross = run("The best move is Be7. hf_Saved", "Token1234567890: White is better");
    assert(!leaked(cross));
    assert.equal(cross.evaluationText, "[redacted]", "the field holding 8+ characters of the body");
    const short = run("Be7. hf_Save is a typo.", "White is better");
    assert.equal(short.analysis, "Be7. hf_Save is a typo.", "fewer than 8 characters of the body is not a leak");
    assert.equal(bg.normalized([{ ...F.boneylandSuccess, analysis: "Fine hf_ prose about the h-file and more words." }],
      "boneyland", req, "boneyland", 1, token).analysis, "Fine hf_ prose about the h-file and more words.");
  });
  test("Token guard compares letters and digits only: label, list, bold and number splits are caught (GPT round 5)", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const run = (analysis, token) => bg.normalized([{ ...F.boneylandSuccess, analysis }], "boneyland", req, "boneyland", 1, token).analysis;
    const lower = "hf_" + "Abcd" + "Efgh" + "Ijkl" + "Mnop", upper = "hf_" + "ABCD" + "EFGH" + "IJKL" + "MNOP";
    for (const [token, analysis] of [
      [lower, ["hf_", "Abcd:", "Efgh:", "Ijkl:", "Mnop:"].join("\n")],
      [upper, ["hf_", "ABCD:", "EFGH:", "IJKL:", "MNOP:"].join("\n")], // label headings the old guard dropped
      [upper, "**ABCD:**\nEF_GH: x\nIJKL:\nMNOP:"],
      [lower, ["- Abcd", "- Efgh", "* Ijkl", "+ Mnop"].join("\n")],
      [lower, "**Abcd**\n**Efgh**\n\n**Ijkl**\n**Mnop**"],
      [lower, "# Abcd\n## Efgh\n1. Ijkl\n2) Mnop"],
      [lower, "1. Abcd\n22. Efgh"],
      [lower, "Ab`cd`Ef~gh~ and more"],
    ]) assert.equal(run(analysis, token), "[redacted]", JSON.stringify(analysis));
    // A bare critical line drops its move numbers in the panel.
    assert.equal(bg.guard({ analysis: "Fine.", criticalLine: "12.Abcd 13.Efgh" }, lower).criticalLine, "[redacted]");
    // Case-sensitive, and ordinary prose and SAN keep their text.
    assert.equal(run("ABCDEFGH and abcdefgh", lower), "ABCDEFGH and abcdefgh");
    const real = "hf_" + "qWzRkTyLmNpXcVbDfGhJsAeUoI";
    for (const analysis of [F.boneyland[0].analysis, F.boneylandSuccess.analysis, F.hugging[2],
      "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7",
      "## Plan\n- Nxe5 Qf6\n- Qxd8+ Kxd8\n1. Rook to the open h-file, then Rh3-g3."]) {
      assert.notEqual(run(analysis, real), "[redacted]", analysis.slice(0, 40));
    }
  });
  test("Evaluation rows: both real recordings name a side, a sideless sentence is dropped, an equal one names both", () => {
    const hugReq = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const hug = bg.normalized(F.hugging, "hugging-apps", hugReq, "hugging-apps", 16);
    assert.equal(hug.evaluationText, "Black is slightly worse by approximately 0.21 pawns, conceding a modest space edge and slightly more active pieces to White in a strategically balanced Italian Game structure.");
    assert.doesNotMatch(hug.analysis, /EVALUATION:/);
    const bonyReq = makeRequest("best", F.START, F.RECORDED_MOVES.join(" "), { position: F.RECORDED_FEN });
    const bony = bg.normalized(F.boneyland, "boneyland", bonyReq, "boneyland", 16);
    for (const [r, best, line] of [[hug, "Be7", /^3\.\.\.Be7 4\.O-O Nf6/], [bony, "Nxe5", /^4\.Nxe5 Qf6 5\.O-O/]]) {
      assert.equal(r.best.san, best);
      assert.equal(r.best.source, "structured");
      assert.match(r.criticalLine, line);
      assert.match(r.evaluationText, /^(?:White|Black) is /);
      assert.equal(r.positionCheck, "ok");
      assert.equal(r.truncated, false);
    }
    const ev = (evaluation) => bg.normalized([{ ...F.boneylandSuccess, evaluation }], "boneyland", hugReq, "boneyland", 1).evaluationText;
    assert.equal(ev("The position is unclear."), null);
    assert.equal(ev("The position is balanced."), "Equal for White and Black: The position is balanced.");
    assert.equal(ev("the opponent is better"), "White is better");
  });
  test("hugging-apps prose is confirmed by its recorded critical_line.legal_steps object", () => {
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const [svg, html, , data] = F.hugging;
    assert.equal(typeof data.critical_line, "object");
    const r = bg.normalized([svg, html, "The best move is 3...Be7.", { ...data, move_source: "promising_or_analysis" }], "hugging-apps", req, "hugging-apps", 1);
    assert.deepEqual(r.best, { san: "Be7", uci: "f8e7", source: "prose_verified" });
  });
  test("Token redaction runs last and catches the saved token split by markup or Markdown", () => {
    const token = "hf_SavedToken1234567890";
    const echoes = [token, "hf_Saved<b></b>Token1234567890", "hf_**Saved**Token1234567890", "h_f_\x60Saved\x60Token1234567890",
      "hf_Saved<!-- x -->Token1234567890", "hf_otherLookingToken99"];
    const raw = [{ ...F.boneylandSuccess, analysis: echoes.join(" | "), evaluation: "Black is better, " + echoes[1] }];
    const req = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
    const r = bg.normalized(raw, "boneyland", req, "boneyland", 1, token);
    const flat = JSON.stringify(r).replace(/[*_\x60~]/g, "");
    assert.doesNotMatch(flat, /hfSaved|SavedToken1234567890|hfotherLooking/);
    assert.match(r.analysis, /\[token removed\]/);
    assert.equal(bg.scrub({ a: ["x hf_" + "A".repeat(8)] }, null).a[0], "x [token removed]");
  });
  test("All background codes have a fixture, with same/different/permanent fallback precedence", () => {
    const cases = {
      quota: [429, "You have exceeded your GPU quota"], token_rejected: [401, "", true],
      unreachable: [404, ""], asleep: [200, "<html>Building</html>"], busy: [0, "Queue is full"],
      illegal_position: [0, "Illegal move: e5"], game_over: [0, "The game is already over"],
      bad_response: [422, ""],
    };
    for (const [code, args] of Object.entries(cases)) assert.equal(bg.classify(...args), code);
    assert.equal(bg.classify(429, "rate limited"), "busy");
    for (const status of [401, 403]) assert.equal(bg.classify(status, "", false), "unreachable", "no token was sent");
    assert.equal(bg.retryAfter("30"), 30);
    assert.equal(bg.retryAfter(new Date(Date.now() + 61000).toUTCString()), 61);
    assert.equal(bg.retryAfter("soon"), undefined);
    assert.equal(bg.fallbackError("timeout", "timeout"), "timeout");
    assert.equal(bg.fallbackError("timeout", "asleep"), "all_unavailable");
    assert.equal(bg.fallbackError("asleep", "quota"), "quota");
    assert.deepEqual(Object.keys(bg.CODES).sort(), [...Object.keys(cases), "timeout", "all_unavailable", "cancelled", "extension_reloaded"].sort());
  });
  test("Ask payload and custom origin validation reject unknown fields, unsafe SAN, URLs and caps", () => {
    const req = makeRequest("best", F.START, "e4", { position: F.E4 });
    const explain = makeRequest("explain", F.START, F.OPENING.slice(0, -1).join(" "), { played: "Bc4", position: F.ITALIAN });
    assert(bg.validAsk(req));
    assert(bg.validAsk(explain));
    for (const change of [{ mode: "unknown" }, { moves: "Sf3" }, { moves: "e4  e5" }, { moves: "e4 ".repeat(600) + "e4" },
      { moves: "" }, { played: "e4" }, { fen: "x".repeat(101) }, { fresh: "true" }, { token: "hf_x" },
      { prefer: "other" }, { snapshot: { placement: req.snapshot.placement, side: "b", token: "x" } }])
      assert.equal(bg.validAsk({ ...req, ...change }), false, JSON.stringify(change).slice(0, 200));
    assert(bg.validAsk({ ...req, fresh: true, prefer: "other" }));
    assert.equal(bg.customOrigin("https://example-space.hf.space"), "https://example-space.hf.space");
    for (const bad of ["http://test.hf.space", "https://test.hf.space:412", "https://test.hf.space/a",
      "https://user@test.hf.space", "https://test.hf.space.evil.com", "https://test.hf.space\n"]) assert.equal(bg.customOrigin(bad), null);
  });
  test("Mutation sanity: flipped side parity fails the flipped fixture", () => {
    const doc = fixtureDoc("lichess-flipped", (name, source) => name === "chess"
      ? source.replace("moves.length % 2 ? opposite(root.side) : root.side", "moves.length % 2 ? root.side : opposite(root.side)") : source);
    try { assert.throws(() => assertFixture(doc, "lichess-flipped"), assert.AssertionError); } finally { doc.close(); }
  });
  test("Mutation sanity: unconditional standard-root replay fails the custom start fixture", () => {
    const doc = fixtureDoc("lichess-study", (name, source) => name === "common" ? source.replace(
      'if (C.parseFen(fen)) return { moves, root: { fen, verified: false, source } };', "").replace("if (custom) return null;", "") : source);
    try { assert.throws(() => assertFixture(doc, "lichess-study"), assert.AssertionError); } finally { doc.close(); }
  });
}

module.exports = { runUnits, fixtureDoc, makeRequest, read, vm };
