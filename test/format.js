// The answer card: splitter, rules, validation and tidy() with a scripted stand-in for Chrome's LanguageModel.
const assert = require("node:assert/strict");
const { fixtureDoc, makeRequest } = require("./unit");
const F = require("./fixtures");
const bg = require("../background.js");
const A = globalThis.AQFormat;
const C = globalThis.AQChess;

// A scripted LanguageModel. `plan`: availability (default "available"), reply (string), delay (ms, honours the
// signal), hang (never answers, honours the signal), throws (message), extension (has params(), as extension
// contexts do). Self-contained so the browser tests can embed its source.
function fakeLanguageModel(plan) {
  const calls = [];
  const wait = (ms, signal) => new Promise((resolve, reject) => {
    const timer = ms === Infinity ? null : setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
  class Session {
    constructor(options) { this.options = options; this.contextUsage = 900; this.contextWindow = 6144; }
    async clone() { calls.push(["clone"]); return new Session(this.options); }
    async measureContextUsage(text) { return Math.ceil(text.length / 4); }
    async prompt(text, options) {
      calls.push(["prompt", text, JSON.parse(JSON.stringify({ ...options, signal: undefined })), options.signal instanceof AbortSignal]);
      if (plan.hang) await wait(Infinity, options.signal);
      if (plan.delay) await wait(plan.delay, options.signal);
      if (plan.throws) throw new Error(plan.throws);
      return plan.reply;
    }
    destroy() { calls.push(["destroy"]); }
  }
  const LM = {
    calls,
    async availability(options) { calls.push(["availability", JSON.parse(JSON.stringify(options))]); return plan.availability ?? "available"; },
    async create(options) { calls.push(["create", JSON.parse(JSON.stringify(options))]); return new Session(options); },
  };
  if (plan.extension) LM.params = async () => ({ defaultTopK: 3, maxTopK: 128, defaultTemperature: 1, maxTemperature: 2 });
  return LM;
}

const recorded = makeRequest("best", F.START, F.RECORDED_MOVES.join(" "), { position: F.RECORDED_FEN });
const italian = makeRequest("best", F.START, F.OPENING.join(" "), { position: F.ITALIAN });
const bony = bg.normalized(F.boneyland, "boneyland", recorded, "boneyland", 16);
const hug = bg.normalized(F.hugging, "hugging-apps", italian, "hugging-apps", 16);
// The truncated recording, with its prose move confirmed and Queen's candidates as its text names them.
const trunc = { ...bg.normalized([{ ...F.truncated, move_source: "random_legal_fallback", critical_line_uci: ["f8e7"] }],
  "boneyland", italian, "boneyland", 1), promising: ["Nf6", "d5"] };
const BONY_REPLY = {
  why: ["Captures the central pawn and centralizes the knight on e5.", "Gives White a material edge and attacks f7 and c6."],
  idea: "White keeps the extra pawn and a modest space advantage.",
  others: [{ move: "4.O-O", reason: "Black can answer 4...Nxf3+ and remove White's active knight." },
    { move: "4.c3", reason: "White keeps only a modest space advantage and the bishop pair." }],
};
const reply = (patch = {}) => JSON.stringify({ ...BONY_REPLY, ...patch });
const tidy = (result, plan, options = {}) => {
  const LM = plan && fakeLanguageModel(plan), reports = [];
  return A.tidy(result, { languageModel: LM, timeoutMs: 1000, onReport: (r) => reports.push(r), ...options })
    .then((r) => ({ r, card: r.card, LM, report: reports[0] }));
};
const creates = (LM) => LM.calls.filter(([name]) => name === "create").length;

function runFormatTests(test) {
  test("Card splitter: both boneyland recordings and the cut-off one give the best paragraph, the position and each candidate's paragraph", () => {
    assert.deepEqual(bony.promising, ["O-O", "c3"]);
    const p = A.prepare(bony);
    assert.equal(p.label, "4.Nxe5");
    assert.match(p.bestSentences[0], /^The best move is 4\.Nxe5, capturing/);
    assert.match(p.positionText, /^The root position is a sharp Sicilian-type structure/);
    assert.deepEqual(p.moves.map((m) => m.label), ["4.O-O", "4.c3"]);
    assert.match(p.moves[0].text, /^The alternative 4\.O-O is slightly inferior\./);
    // "4. Nxe5" (a bare move number) never ends a sentence; a paragraph's unfinished last sentence is dropped.
    assert.deepEqual(A.sentences("White plays 4. Nxe5. Black replies 4... Qf6! Then what?"), ["White plays 4. Nxe5.", "Black replies 4... Qf6!", "Then what?"]);
    const t = A.prepare(trunc);
    assert.deepEqual(t.moves.map((m) => m.label), ["3...Nf6", "3...d5"]);
    assert.match(t.moves[1].text, /attacks the black knight on c6\.$/);
    assert.doesNotMatch(t.moves[1].text, /Na5/, "the cut-off sentence is left out");
    // The rules' text on the recordings, as in docs/output-format.md.
    assert.deepEqual(A.rulesCard(p), { source: "rules",
      why: ["Capturing the central pawn and establishing a dominant white knight on e5.",
        "This gives White a material edge and a powerful centralized piece that attacks f7 and c6."],
      idea: "White retains the extra pawn and a modest space advantage, with the white knight on e5 continuing to exert pressure.",
      played: null,
      others: [{ san: "O-O", tag: "Slightly worse", reason: "Black can play 4...Nxf3+, eliminating White's active knight." },
        { san: "c3", tag: "Weakest", reason: "White retains only a modest space advantage and the bishop pair, as Black has a sound structure and can complete development comfortably." }] });
    const rt = A.rulesCard(t);
    assert.match(rt.idea, /^Black's strategic task is to complete development/);
    assert.deepEqual(rt.others.map(({ san, tag, reason }) => [san, tag, reason.slice(0, 40)]),
      [["Nf6", "Also good", "Developing the knight to control e4."], ["d5", "Much worse", "It immediately opens the center and allo"]]);
    // Without a verified move (the recording as it came) or a best-move paragraph there's nothing to split.
    assert.equal(A.prepare(bg.normalized([F.truncated], "boneyland", italian, "boneyland", 1)), null);
    assert.equal(A.prepare({ ...bony, analysis: "Knights before bishops." }), null);
    assert.equal(A.prepare({ ...bony, positionCheck: "mismatch" }), null);
  });

  test("Card: the backup server's long-hand moves become SAN only where they are legal in a known position", () => {
    assert.deepEqual(hug.promising, ["Nf6", "d5"]);
    const p = A.prepare(hug);
    assert.match(p.bestText, /^The best move is 3\.\.\.Be7, developing/);
    assert.match(p.bestText, /reply 4\.O-O, Black should develop with 4\.\.\.Nf6,.* 5\.d3,.* 5\.\.\.O-O, and White develops with 6\.Nc3/);
    assert.match(p.bestText, /10\.black bishop c8-e6/, "a numbered move whose side doesn't match keeps its wording");
    assert.deepEqual(p.moves.map((m) => m.label), ["3...Nf6", "3...d5"]);
    assert.match(p.moves[0].text, /After 4\.O-O Be7 5\.Re1 O-O 6\.d3 d6 7\.Nc3,/);
    assert.match(p.moves[1].text, /with 4\.exd5,/);
    assert.equal(A.fromLongHand("white bishop c1-h6 and black knight g8-f6", F.ITALIAN), "white bishop c1-h6 and Nf6", "an illegal move is left alone");
    assert.equal(A.rulesCard(p).others[1].tag, "Much worse");
  });

  test("Card validator rejects invented moves, squares, numbers, claim words and markup, and keeps clean strings", () => {
    const p = A.prepare(bony);
    const main = A.facts([p.bestText, p.positionText, p.evaluation].join("\n")), castle = A.facts(p.moves[0].text);
    const reasons = (text, f = main) => A.problems(text, f, 200);
    assert.deepEqual(reasons("Wins a pawn and threatens Qh5 with mate on f7."), ["move Qh5", "claim mate", "claim win"]);
    assert.deepEqual(reasons("White is winning by 3.2 pawns."), ["number 3.2", "claim win"]);
    assert.deepEqual(reasons("Black should reply 4...Qg5, hitting g2."), ["move 4...Qg5", "square g2"]);
    assert.deepEqual(reasons("After 5...Nxf3+ White is fine.", castle), ["move number 5...Nxf3+"]);
    assert.deepEqual(reasons("It forces a draw.", castle), ["claim forced", "claim draw"]);
    assert.deepEqual(reasons("The **knight** is strong."), ["markup"]);
    assert.deepEqual(reasons("See https://example.org now."), ["markup"]);
    for (const clean of ["Captures the central pawn and centralizes the knight on e5.", "White is better by about 1.51 pawns.",
      "After 6...d6 White keeps the extra pawn."]) assert.deepEqual(reasons(clean), [], clean);
    assert.deepEqual(reasons("Black can answer 4...Nxf3+ and remove White's active knight.", castle), []);
    assert.deepEqual(A.problems("Short.", main, 90, 12), ["under 12 characters"]);
  });

  test("Card candidates: Queen's list is the schema enum; illegal, repeated and best moves are dropped through AQChess.replay", () => {
    assert.deepEqual(A.candidates("4. Nxe5 4. O-O 4. Qxh7 4. O-O 4. Nf6 4. c3 4. d3 4. a3", F.RECORDED_FEN, "Nxe5"), ["O-O", "c3", "d3"]);
    assert.equal(C.replay(F.RECORDED_FEN, ["Qxh7"]), null);
    assert.deepEqual(A.candidates("black bishop f8-e7 black knight g8-f6 black pawn d7-d5", F.ITALIAN, "Be7"), ["Nf6", "d5"]);
    assert.deepEqual(A.candidates(undefined, F.ITALIAN, "Be7"), []);
    const p = A.prepare({ ...bony, promising: ["Qxh7", "c3", "e4"] });
    assert.deepEqual(p.moves.map((m) => m.label), ["4.c3"], "an illegal or unmentioned candidate gets no entry");
    assert.deepEqual(A.schema(A.prepare(bony)).properties.others.items.properties.move, { enum: ["4.O-O", "4.c3"] });
    assert.deepEqual(A.schema(A.prepare(bony)).required, ["why", "idea", "others"]);
    const none = A.schema(A.prepare({ ...bony, promising: [] }));
    assert.deepEqual(none.required, ["why", "idea"]);
    assert.equal("others" in none.properties, false);
    assert.match(A.userPrompt(A.prepare({ ...bony, promising: [] })), /\n\nOTHER MOVES: none$/);
  });

  test("Card estimate: signed number, the side ahead, 'About equal', and nothing for other wording", () => {
    assert.deepEqual(bony.estimate, { ahead: "w", words: "White is better", number: "+1.51" });
    assert.deepEqual(hug.estimate, { ahead: "w", words: "White is slightly better", number: "+0.21" });
    assert.deepEqual(A.estimate("Black is clearly better by 2 pawns."), { ahead: "b", words: "Black is clearly better", number: "−2" });
    assert.deepEqual(A.estimate("White is worse."), { ahead: "b", words: "Black is better", number: null });
    assert.deepEqual(A.estimate("Equal for White and Black: The position is balanced."), { ahead: null, words: "About equal", number: null });
    assert.equal(A.estimate("The position is unclear."), null);
    assert.equal(A.estimate(null), null);
  });

  test("tidy: a clean Gemini Nano reply is 'nano', one rejected reason makes it 'mixed', no model makes it 'rules'", async () => {
    const nano = await tidy(bony, { reply: reply() });
    assert.equal(nano.card.source, "nano");
    assert.deepEqual(nano.card.why, BONY_REPLY.why);
    assert.equal(nano.card.idea, BONY_REPLY.idea);
    assert.deepEqual(nano.card.others.map((o) => [o.san, o.tag, o.reason]), [["O-O", "Slightly worse", BONY_REPLY.others[0].reason],
      ["c3", "Weakest", BONY_REPLY.others[1].reason]], "tags are always the rules'");
    assert(nano.report.checks.every((c) => c.kept));
    const mixed = await tidy(bony, { reply: reply({ others: [BONY_REPLY.others[0], { move: "4.c3", reason: "Black plays 4...Qh4 and wins." }] }) });
    assert.equal(mixed.card.source, "mixed");
    assert.match(mixed.card.others[1].reason, /^White retains only a modest space advantage/);
    assert.deepEqual(mixed.report.checks.find((c) => !c.kept).reasons, ["move 4...Qh4", "claim win"]);
    const allBad = await tidy(bony, { reply: reply({ why: ["White wins by force with 4...Qh4 mate."] }) });
    assert.deepEqual(allBad.card.why, A.rulesCard(A.prepare(bony)).why, "every bullet rejected: the rules' bullets");
    assert.equal(allBad.card.source, "mixed");
    const rules = await tidy(bony, null);
    assert.equal(rules.card.source, "rules");
    assert.equal(rules.report.fallback, "no LanguageModel in this context");
    for (const bad of ["not json", JSON.stringify({ why: "one", idea: "", others: [] }), reply({ extra: 1 }), reply({ others: [{ move: "4.O-O" }] })]) {
      const r = await tidy(bony, { reply: bad });
      assert.equal(r.card.source, "rules", bad);
      assert.match(r.report.fallback, /^V1: /);
    }
    const twice = await tidy(bony, { reply: reply({ others: [BONY_REPLY.others[0], { ...BONY_REPLY.others[0] }] }) });
    assert.equal(twice.card.source, "mixed", "a move listed twice keeps only its first entry");
    assert.equal(twice.card.others[0].reason, BONY_REPLY.others[0].reason);
  });

  test("tidy: create() runs only when availability() is 'available'; options, clone and destroy are as designed", async () => {
    for (const availability of ["unavailable", "downloadable", "downloading"]) {
      const r = await tidy(bony, { availability, reply: reply() });
      assert.equal(creates(r.LM), 0, availability);
      assert.equal(r.card.source, "rules");
      assert.equal(r.report.fallback, "model " + availability);
    }
    const web = fakeLanguageModel({ reply: reply() });
    await A.tidy(bony, { languageModel: web, timeoutMs: 1000 });
    await A.tidy(hug, { languageModel: web, timeoutMs: 1000 });
    const [[, availability], [, created]] = web.calls;
    assert.deepEqual(availability.expectedInputs, [{ type: "text", languages: ["en"] }]);
    assert.deepEqual(availability.expectedOutputs, [{ type: "text", languages: ["en"] }]);
    assert.equal("topK" in created || "temperature" in created, false, "the web API takes no sampling numbers");
    assert.deepEqual(created.initialPrompts.map((m) => m.role), ["system", "user", "assistant"]);
    assert.equal(creates(web), 1, "one base session per context");
    assert.equal(web.calls.filter(([n]) => n === "clone").length, 2);
    assert.equal(web.calls.filter(([n]) => n === "destroy").length, 2, "every clone is destroyed");
    const [, text, options, signal] = web.calls.find(([n]) => n === "prompt");
    assert.match(text, /^BEST MOVE: 4\.Nxe5\n\nQUEEN ON THE BEST MOVE:\nThe best move is 4\.Nxe5/);
    assert.equal(options.omitResponseConstraintInput, true);
    assert.deepEqual(options.responseConstraint.properties.others.items.properties.move.enum, ["4.O-O", "4.c3"]);
    assert.equal(signal, true);
    const ext = fakeLanguageModel({ reply: reply(), extension: true });
    await A.tidy(bony, { languageModel: ext, timeoutMs: 1000 });
    const opts = ext.calls.find(([n]) => n === "create")[1];
    assert.deepEqual([opts.topK, opts.temperature], [1, 0.2], "extension contexts: topK and temperature together");
    const long = await tidy({ ...bony, analysis: bony.analysis.replace("The best move is 4.Nxe5,", "The best move is 4.Nxe5, " + "a long aside, ".repeat(500)) }, { reply: reply() });
    assert.equal(long.report.fallback, "input over 6,000 characters");
    assert.equal(creates(long.LM), 0);
  });

  test("tidy: a slow or failing model falls back to the rules within the time limit and never rejects", async () => {
    for (const plan of [{ delay: 5000, reply: reply() }, { hang: true }]) {
      const start = Date.now();
      const r = await tidy(bony, plan, { timeoutMs: 400 });
      assert(Date.now() - start < 600, "within the limit");
      assert.equal(r.card.source, "rules");
      assert.equal(r.report.fallback, "over the time limit");
    }
    const thrown = await tidy(bony, { throws: "NotSupportedError" });
    assert.equal(thrown.card.source, "rules");
    assert.match(thrown.report.fallback, /NotSupportedError/);
    const broken = { availability: () => { throw new Error("boom"); } };
    assert.equal((await A.tidy(bony, { languageModel: broken, timeoutMs: 400 })).card.source, "rules");
    // A guard that fails, or hangs past the limit, means no card rather than an unchecked one.
    assert.equal((await A.tidy(bony, { languageModel: null, guard: () => { throw new Error("gone"); } })).card, null);
    const start = Date.now();
    assert.equal((await A.tidy(bony, { timeoutMs: 300, guard: () => new Promise(() => {}) })).card, null);
    assert(Date.now() - start < 500);
    // An aborted ask stops the model at once.
    const ctrl = new AbortController();
    const pending = tidy(bony, { hang: true }, { timeoutMs: 5000, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(new Error("cancelled")), 20);
    const aborted = await pending;
    assert.equal(aborted.card.source, "rules");
    assert.match(aborted.report.fallback, /cancelled/);
    assert.equal(await A.tidy(null), null);
  });

  test("tidy: no clear move, or prose without a best-move paragraph, gives card null and never asks the model", async () => {
    const unverified = bg.normalized([F.truncated], "boneyland", italian, "boneyland", 1);
    assert.equal(unverified.best, null);
    for (const result of [unverified, { ...bony, analysis: "Queen has no plan here." }]) {
      const r = await tidy(result, { reply: reply() });
      assert.equal(r.card, null);
      assert.deepEqual(r.LM.calls, []);
    }
    const attached = { ...bony, card: null };
    const fake = fakeLanguageModel({ reply: reply() });
    assert.equal(await A.tidy(attached, { languageModel: fake }), attached, "a card the worker attached comes back as it is");
    assert.deepEqual(fake.calls, []);
  });

  test("tidy: token-like formatter text is rejected, and the token guard drops leaking card strings", async () => {
    const r = await tidy(bony, { reply: reply({ idea: "Your key is hf_AbCdEfGhIjKlMnOpQrSt for White." }) });
    assert.equal(r.card.idea, A.rulesCard(A.prepare(bony)).idea);
    assert(r.report.checks.find((c) => c.field === "idea").reasons.includes("token-like text"));
    const token = "hf_SavedToken1234567890";
    const card = { source: "nano", why: ["A fine reason for the move.", "Saved Token 1234 567890 is here."], idea: "Fine idea.", played: null,
      others: [{ san: "O-O", tag: null, reason: "Also SavedToken12 here." }] };
    const g = bg.guard({ ...bony, card }, token).card;
    assert.deepEqual(g.why, ["A fine reason for the move."]);
    assert.equal(g.others[0].reason, "");
    assert.equal(bg.guard({ ...bony, card: { ...card, why: [card.why[1]] } }, token).card, null, "no bullet left: no card");
    // Split across two card strings: every displayed field is cleared.
    const split = bg.guard({ ...bony, card: { ...card, why: ["Ends with SavedTo", "ken1234 starts this."],
      others: [{ san: "O-O", tag: null, reason: "Fine." }] } }, token);
    assert.equal(split.card, null);
    assert.equal(split.analysis, "[redacted]");
    // The worker path: tidy's guard is the worker's scrub + guard with the token.
    const leak = await tidy(bony, { reply: reply({ why: [BONY_REPLY.why[0], "White keeps SavedToken1234567890 now."] }) },
      { guard: (x) => bg.guard(bg.scrub(x, token), token) });
    assert.deepEqual(leak.card.why, [BONY_REPLY.why[0]]);
    // The content path's guard message accepts only the displayed fields and a well-formed card.
    assert.equal(bg.guardFields({ analysis: "x", token: "y" }, null), null);
    assert.equal(bg.guardFields({ card: { ...card, source: "gpt" } }, null), null);
    assert.equal(bg.guardFields({ analysis: "x".repeat(20001) }, null), null);
    assert.deepEqual(bg.guardFields({ analysis: "Fine.", card }, null).card, card);
  });

  test("Explain, Queen prefers another move: Queen's note on the played move is the card's 'played' entry, not an 'other move'", async () => {
    const r = await tidy({ ...bony, played: "O-O" }, { reply: reply() });
    assert.deepEqual(r.card.played, { san: "O-O", tag: "Slightly worse", reason: BONY_REPLY.others[0].reason });
    assert.deepEqual(r.card.others.map((o) => o.san), ["c3"]);
    assert.equal(r.card.source, "nano");
    const unlisted = await tidy({ ...bony, played: "d3" }, null);
    assert.equal(unlisted.card.played, null, "Queen never mentions d3");
    assert.deepEqual(unlisted.card.others.map((o) => o.san), ["O-O", "c3"]);
    const req = makeRequest("explain", F.START, F.RECORDED_MOVES.slice(0, -1).join(" "), { played: "Nd4", position: F.RECORDED_FEN });
    assert.equal(bg.normalized(F.boneyland, "boneyland", req, "boneyland", 1).played, "Nd4");
    assert.equal(bony.played, null);
  });

  test("Content path: AQ.tidy uses this window's LanguageModel and the worker's guard message, or the rules, or returns an attached card", async () => {
    const doc = fixtureDoc("lichess-recorded");
    const { w } = doc;
    try {
      const sent = [];
      w.chrome = { runtime: { sendMessage: async (m) => { sent.push(m.type); return m.type === "guard" ? bg.guardFields(m.result, null) : undefined; } } };
      const fake = fakeLanguageModel({ reply: reply() });
      w.LanguageModel = fake;
      const nano = await w.AQ.tidy(bony);
      assert.equal(nano.card.source, "nano");
      assert(sent.length >= 1 && sent.every((t) => t === "guard"));
      assert.equal(creates(fake), 1);
      const attached = { ...bony, card: { ...nano.card, source: "rules" } };
      assert.equal(await w.AQ.tidy(attached), attached);
      delete w.LanguageModel;
      assert.equal((await w.AQ.tidy(bony)).card.source, "rules");
      w.chrome.runtime.sendMessage = async () => { throw new Error("Extension context invalidated."); };
      assert.equal((await w.AQ.tidy(bony)).card, null, "no guard, no card");
    } finally { doc.close(); }
  });
}

module.exports = { runFormatTests, fakeLanguageModel, BONY_REPLY, bony };
