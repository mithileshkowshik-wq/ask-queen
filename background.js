// Queen client: calls a community Hugging Face Space running princeton-nlp/queen_pawn-8.
const SEED = 20260823;
const PROMPT = "Analyze the position carefully and find the best move for player.";

const SPACES = {
  boneyland: {
    base: "https://boneyland-queen-pawn-8.hf.space",
    api: "analyse_position",
    data: (fen, moves) => [fen, moves, 2048, 0.6, SEED],
    parse: (out) => out[0],
  },
  "hugging-apps": {
    base: "https://hugging-apps-queen-pawn-8.hf.space",
    api: "analyze",
    data: (fen, moves) => [fen, moves, 2048, 0.6, SEED, PROMPT],
    parse: (out) => ({ analysis: out[2], ...out[3] }),
  },
};

async function callSpace(space, { fen, moves }, token, onStatus, signal) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${space.base}/gradio_api/call/${space.api}`;

  const start = await fetch(url, { method: "POST", headers, signal, body: JSON.stringify({ data: space.data(fen, moves) }) });
  if (!start.ok) throw new Error(`Space returned HTTP ${start.status}`);
  const { event_id } = await start.json();

  const res = await fetch(`${url}/${event_id}`, { headers, signal });
  if (!res.ok || !res.body) throw new Error(`Space returned HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", event = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        if (event === "heartbeat" || event === "generating") onStatus("thinking");
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        if (event === "complete") return space.parse(JSON.parse(raw));
        if (event === "error") {
          let msg = null;
          try { msg = JSON.parse(raw); } catch { msg = raw; }
          const err = new Error((msg && (msg.error || msg.message || (typeof msg === "string" && msg))) || "The Space reported an error (often the free GPU quota is used up).");
          err.fatal = /game is already over/i.test(err.message);
          throw err;
        }
      }
    }
  }
  throw new Error("The Space closed the connection without an answer.");
}

// When Queen's structured BEST_MOVE was missing, the Space guesses one from the text, and the guess can
// contradict the prose. Prefer the move the prose names ("The best move is 3...Be7").
function fixBestMove(r) {
  if (!r || r.move_source === "best_move" || r.move_source === "critical_line") return r;
  const m = /best move is\s+(?:\*\*)?(?:\d+\.+\s*)?([KQRBNa-hO][\w=+#-]*)/i.exec(r.analysis || "");
  return m ? { ...r, best_move_san: m[1], best_move_uci: null, move_source: "analysis_text" } : r;
}

async function askQueen(req, onStatus, signal) {
  const { token = "", primary = "boneyland" } = await chrome.storage.local.get(["token", "primary"]);
  const order = primary === "hugging-apps" ? ["hugging-apps", "boneyland"] : ["boneyland", "hugging-apps"];
  let lastErr;
  for (const name of order) {
    try {
      onStatus(`connecting:${name}`);
      return fixBestMove(await callSpace(SPACES[name], req, token, onStatus, signal));
    } catch (e) {
      lastErr = e;
      if (e.fatal || signal.aborted) break;
    }
  }
  throw lastErr;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "queen") return;
  const ctrl = new AbortController(); // cancel the Space call when the panel hangs up
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async (req) => {
    const send = (m) => { try { port.postMessage(m); } catch {} };
    try {
      const result = await askQueen(req, (status) => send({ status }), ctrl.signal);
      send({ result });
    } catch (e) {
      send({ error: e.message || String(e) });
    }
  });
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
chrome.runtime.onMessage.addListener((m) => { if (m?.openOptions) chrome.runtime.openOptionsPage(); });
