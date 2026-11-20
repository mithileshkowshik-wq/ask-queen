// Streaming HTTPS mock. Chromium maps the real Space hostnames to loopback while retaining their origins.
const { execFileSync } = require("node:child_process");
const { X509Certificate, createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const F = require("./fixtures");

const HOSTS = new Map([
  ["boneyland-queen-pawn-8.hf.space", "boneyland"],
  ["hugging-apps-queen-pawn-8.hf.space", "hugging-apps"],
  ["queentest.hf.space", "custom"],
]);
const complete = (data) => "event: complete\r\ndata: " + JSON.stringify(data) + "\r\n\r\n";
const sseError = (message) => "event: error\r\ndata: " + JSON.stringify({ error: message }) + "\r\n\r\n";
const heartbeat = "event: heartbeat\r\ndata: null\r\n\r\n";

function payload(data, plan, api) {
  const [root, moves] = data;
  const fen = (!moves ? root : F.REPLY_FENS.get(F.positionKey(root, moves)));
  if (!fen) throw new Error("Fixture has no matching answer FEN for " + JSON.stringify([root, moves]));
  const italian = fen === F.ITALIAN, beforeItalian = fen === F.NC6;
  const answer = {
    ...F.boneylandSuccess, fen, best_move_san: italian ? "Be7" : beforeItalian ? "Bb5" : null,
    best_move_uci: italian ? "f8e7" : beforeItalian ? "f1b5" : null,
    analysis: italian ? F.boneylandSuccess.analysis : "Develop pieces and keep the center stable.",
    move_source: italian || beforeItalian ? "best_move" : "", critical_line_san: italian ? "3...Be7 4.O-O" : "",
    critical_line_uci: italian ? ["f8e7", "e1g1"] : [], evaluation: null,
  };
  if (plan === "agree") Object.assign(answer, { best_move_san: "Bc4", best_move_uci: "f1c4" });
  if (plan === "critical_line") answer.move_source = "critical_line";
  if (plan === "prose") answer.move_source = "random_legal_fallback";
  if (plan === "unclear") Object.assign(answer, { move_source: "random_legal_fallback", analysis: "The best move is not obvious." });
  if (plan === "truncated") Object.assign(answer, F.truncated, { fen });
  if (plan === "mismatch") answer.fen = F.FEN_MISMATCH;
  if (plan === "xss") answer.analysis = F.XSS.join("\n\n");
  if (plan === "bad_response") answer.best_move_san = 5;
  if (api === "analyze") {
    const recorded = fen === F.ITALIAN && ["ok", "survival", "timeout-backup", "backup"].includes(plan);
    return recorded ? F.hugging : [F.hugging[0], F.hugging[1], answer.analysis, answer];
  }
  return [answer];
}

async function createMock(dir) {
  const key = path.join(dir, "mock-key.pem"), cert = path.join(dir, "mock-cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=Ask Queen test mock", "-keyout", key, "-out", cert], { stdio: "ignore" });
  const pem = fs.readFileSync(cert);
  const spki = createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("base64");
  const calls = [], errors = [], sockets = new Set(), jobs = new Map();
  let plan = "ok", seq = 0;
  const server = https.createServer({ key: fs.readFileSync(key), cert: pem }, (req, res) => {
    void respond(req, res).catch((err) => { errors.push(err.message); res.destroy(); });
  });
  async function respond(req, res) {
    const serverName = HOSTS.get(req.headers.host);
    const route = /^\/gradio_api\/call\/(analyse_position|analyze)(?:\/(mock-\d+))?$/.exec(req.url);
    const call = { server: serverName, method: req.method, url: req.url, host: req.headers.host,
      started: Date.now(), auth: req.headers.authorization, cookie: req.headers.cookie, referrer: req.headers.referer };
    calls.push(call);
    const timers = [];
    res.on("close", () => {
      if (!res.writableFinished) call.aborted = Date.now();
      for (const id of timers) clearTimeout(id);
    });
    const send = (code, body, type = "text/plain") => { res.writeHead(code, { "Content-Type": type }); res.end(body); };
    if (!serverName || !route || !["POST", "GET"].includes(req.method)) {
      errors.push("Unexpected request " + req.method + " " + req.headers.host + req.url);
      return send(404, "Mock route unavailable");
    }
    if (req.method === "POST") {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      const parsed = JSON.parse(Buffer.concat(body).toString("utf8"));
      call.body = parsed;
      const primary = serverName === "boneyland";
      if (plan === "quota") return send(429, "GPU quota exceeded");
      if (plan === "token_rejected") return send(401, "Invalid token");
      if (plan === "busy") return send(429, "Queue full");
      if (plan === "unreachable") return send(404, "");
      if (plan === "asleep") return send(200, "<html>Space sleeping</html>", "text/html");
      if (plan === "all_unavailable" || (plan === "backup" && primary))
        return send(primary ? 503 : 500, primary ? "<html>Building</html>" : "Server error");
      const id = "mock-" + (++seq);
      jobs.set(id, { plan, data: parsed.data, serverName });
      return send(200, JSON.stringify({ event_id: id }), "application/json");
    }
    const saved = jobs.get(route[2]);
    if (!saved || saved.serverName !== serverName) throw new Error("Unexpected event ID on " + req.url);
    jobs.delete(route[2]);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.flushHeaders();
    const selected = saved.plan;
    if (selected === "illegal_position") return res.end(sseError("Illegal move in supplied position"));
    if (selected === "game_over") return res.end(sseError("The game is already over"));
    if (["cancel", "timeout"].includes(selected) || selected === "timeout-backup" && serverName === "boneyland") return;
    const answer = complete(payload(saved.data, selected, route[1]));
    if (selected === "survival") {
      for (let at = 1000; at < 90000; at += 10000) timers.push(setTimeout(() => res.write(heartbeat), at));
      timers.push(setTimeout(() => res.end(answer), 90000));
    } else {
      const pause = selected === "backup" || selected === "timeout-backup" ? 1200 : 250;
      timers.push(setTimeout(() => res.end(answer), pause));
    }
  }
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { calls, errors,
    args: ["--no-proxy-server", "--disable-quic", "--ignore-certificate-errors-spki-list=" + spki,
      `--host-resolver-rules=MAP *.hf.space 127.0.0.1:${server.address().port}, MAP * ^NOTFOUND`],
    setPlan: (next) => { plan = next; },
    close: () => { for (const socket of sockets) socket.destroy(); return new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { createMock, HOSTS, payload };
