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
  if (e.unreadable) { assert.equal(pos.board.valid, false); assert.notEqual(pos.root?.verified, true); return; }
  if (e.mate) { assert.match(pos.moves.at(-1), /#$/); return; }
  assert.equal(pos.board.placement, f.fen.split(" ")[0]);
  assert.equal(pos.board.valid, true);
  if (e.disagree) {
    assert.equal(pos.crossCheck.ok, false);
    assert.equal(pos.moves, null);
    assert.notEqual(pos.root?.verified, true);
  }
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
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e2", "e4"]).ep, "e3");
      assert.equal(AQ.boardFromPieces(F.expand(F.E4), ["e6", "e4"]).ep, "-");
    } finally { doc.close(); }
  });
  for (const id of Object.keys(F.SITES)) {
    test("Adapter fixture " + id, () => {
      const doc = fixtureDoc(id);
      try { assertFixture(doc, id); } finally { doc.close(); }
    });
  }
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
    assert.equal(structured.evaluationText, "Black is slightly better (≈ −0.3)");
    assert.equal(bg.normalized([{ ...F.boneylandSuccess, fen: F.FEN_MISMATCH }], "boneyland", req, "boneyland", 1).positionCheck, "mismatch");
    for (const raw of [[], [{}], [{ ...F.boneylandSuccess, best_move_san: 1 }], [{ ...F.boneylandSuccess, analysis: {} }]])
      assert.throws(() => bg.normalized(raw, "boneyland", req, "boneyland", 1), { code: "bad_response" });
  });
  test("Provider text drops HTML, SVG, model tokens and known token material", () => {
    const clean = bg.plainAnalysis(F.XSS.join("\n") + "\nhf_exampleToken42 secret-test-token", "b", "secret-test-token");
    assert.doesNotMatch(clean, /<(?:svg|img|script|PIECE|SQUARE|b>)|DROP_SVG|hf_example|secret-test-token/i);
    assert.match(clean, /\*\*bold text\*\*/);
    assert.match(clean, /&lt;img/);
    assert.equal(bg.plainAnalysis("The player's knight; a strong player beats the opponent.", "w"),
      "White's knight; a strong player beats Black.");
  });
  test("All background codes have a fixture, with same/different/permanent fallback precedence", () => {
    const cases = {
      quota: [429, "You have exceeded your GPU quota"], token_rejected: [401, ""],
      unreachable: [404, ""], asleep: [200, "<html>Building</html>"], busy: [0, "Queue is full"],
      illegal_position: [0, "Illegal move: e5"], game_over: [0, "The game is already over"],
      bad_response: [422, ""],
    };
    for (const [code, args] of Object.entries(cases)) assert.equal(bg.classify(...args), code);
    assert.equal(bg.classify(429, "rate limited"), "busy");
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
