#!/usr/bin/env node
// Gemini Nano lab (dev only, never packaged). Serves the lab page, content/chess.js, content/format.js and recorded
// Queen answers, normalized by background.js exactly as the extension does, on http://localhost:8787 (PORT to change).
// Open it in Chrome 148+ with Gemini Nano downloaded: the page runs format.js's tidy() with the page's real
// LanguageModel (the web Prompt API) and shows what Nano wrote and what validation kept.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
require(path.join(REPO, "content/chess.js"));
require(path.join(REPO, "content/format.js"));
const bg = require(path.join(REPO, "background.js"));
const F = require(path.join(__dirname, "..", "fixtures.js"));

const ask = (fen, moves, position, mode = "best", played = null) => ({ type: "ask", mode, fen, moves: moves.join(" "), played,
  fresh: false, snapshot: { placement: position.split(" ")[0], side: position.split(" ")[1] } });
const recorded = ask(F.START, F.RECORDED_MOVES, F.RECORDED_FEN), italian = ask(F.START, F.OPENING, F.ITALIAN);
const bony = bg.normalized(F.boneyland, "boneyland", recorded, "boneyland", 16);

// A Queen text built from the recordings' own sentences: Black to move in the Italian, a different best move, an
// "equal" evaluation and a short cut-down alternative.
const knights = { ...F.boneyland[0], fen: F.ITALIAN, best_move_san: "Nf6", best_move_uci: "g8f6", move_source: "best_move",
  critical_line_san: "3... Nf6 4. d3 Be7 5. O-O O-O 6. Re1 d6", critical_line_uci: ["g8f6", "d2d3", "f8e7", "e1g1", "e8g8", "f1e1", "d7d6"],
  evaluation: "Equal for both sides, with balanced chances after normal development.", finish_reason: "stop",
  analysis: `ANALYSIS:
The position is a quiet Italian Game structure with equal material. White holds a modest space advantage from the white pawn on e4 and the active white bishop on c4 pointing toward f7. Black's plan is to develop quickly and castle before opening the center.

The best move is 3... Nf6, developing the knight to control e4 and attacking the white pawn on e4. It also prepares to castle on the next move. After 4. d3 Be7 5. O-O O-O 6. Re1 d6, Black has a solid position with equal chances.

The alternative 3... Be7 is also sound, developing the king's bishop to a natural square. After 4. O-O Nf6 5. d3 O-O, the position transposes to a quiet structure.

The move 3... d5 is sharply inferior. It immediately opens the center and allows White to win a central pawn with 4. exd5.

BEST_MOVE: 3... Nf6
CRITICAL_LINE: 3... Nf6 4. d3 Be7 5. O-O O-O 6. Re1 d6
PROMISING_MOVES: 3... Nf6 3... Be7 3... d5
EVALUATION: Equal for both sides, with balanced chances after normal development.` };

const ANSWERS = [
  { name: "boneyland-success.sse: Best move 4.Nxe5", result: bony },
  { name: "boneyland-success.sse as Explain: 4.O-O was played, Queen prefers 4.Nxe5", result: { ...bony, played: "O-O" } },
  { name: "boneyland-truncated.sse: cut off, 3...Be7 confirmed by its line", result: { ...bg.normalized([{ ...F.truncated,
    move_source: "random_legal_fallback", critical_line_uci: ["f8e7"] }], "boneyland", italian, "boneyland", 15), promising: ["Nf6", "d5"] } },
  { name: "hugging-apps-success.sse: long-hand moves, 3...Be7", result: bg.normalized(F.hugging, "hugging-apps", italian, "hugging-apps", 16) },
  { name: "Built from the recordings: 3...Nf6, an equal position", result: bg.normalized([knights], "boneyland", italian, "boneyland", 14) },
];

const FILES = {
  "/": [path.join(__dirname, "index.html"), "text/html; charset=utf-8"],
  "/content/chess.js": [path.join(REPO, "content/chess.js"), "text/javascript; charset=utf-8"],
  "/content/format.js": [path.join(REPO, "content/format.js"), "text/javascript; charset=utf-8"],
};
const port = Number(process.env.PORT) || 8787;
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost").pathname;
  if (url === "/answers.json") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify(ANSWERS));
  }
  const file = FILES[url];
  if (!file) { res.writeHead(404); return res.end("Not found"); }
  res.writeHead(200, { "content-type": file[1], "cache-control": "no-store" });
  res.end(fs.readFileSync(file[0])); // read on every request, so an edited format.js needs only a reload
}).listen(port, "127.0.0.1", () => console.log(`Nano lab: http://localhost:${port}/  (Ctrl+C to stop)`));
