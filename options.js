// Settings page. chrome.storage.local holds token, tokenFor, primary and custom; the background reads them.
// A saved token is shown only as hf_…abcd and is never put back into the field.
const $ = (id) => document.getElementById(id);
const store = chrome.storage.local;
const TOKEN = /^hf_[A-Za-z0-9]{16,}$/;
const ORIGIN = /^https:\/\/[a-z0-9-]+\.hf\.space$/;
const say = (id, text = "") => { $(id).textContent = text; };
const pattern = (origin) => ({ origins: [origin + "/*"] });

async function render() {
  const { token, primary, custom, tokenFor } = await store.get(["token", "primary", "custom", "tokenFor"]);
  const saved = typeof token === "string" && token;
  $("saved").replaceChildren(saved ? "Saved token: " : "No token saved.");
  if (saved) $("saved").append(Object.assign(document.createElement("code"), { textContent: `hf_…${token.slice(-4)}` }));
  $("remove").hidden = !saved;

  const origin = ORIGIN.test(custom?.origin) ? custom.origin : "";
  const sendsToken = Array.isArray(tokenFor) && tokenFor.includes(origin);
  say("custom-saved", origin ? `Saved custom server: ${origin}. Your token ${sendsToken ? "is" : "is not"} sent to it.` : "No custom server saved.");
  $("custom-remove").hidden = !origin;
  $("primary-custom").hidden = $("primary-custom").disabled = !origin;
  $("primary").value = primary === "hugging-apps" || (primary === "custom" && origin) ? primary : "boneyland";
}

// --- token ---
const hideTyping = () => { $("show").checked = false; $("token").type = "password"; };
$("show").addEventListener("change", () => { $("token").type = $("show").checked ? "text" : "password"; });
$("token").addEventListener("input", () => { say("token-error"); say("token-status"); });

$("token-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const token = $("token").value.trim();
  say("token-status");
  if (!TOKEN.test(token)) {
    say("token-error", token ? "That doesn't look like a Hugging Face token. It starts with hf_ and has only letters and digits after it."
      : "Paste a token first.");
    return $("token").focus();
  }
  await store.set({ token });
  $("token").value = "";
  hideTyping();
  say("token-error");
  await render();
  say("token-status", "Token saved. Go back to your game and ask again.");
});

$("remove").addEventListener("click", async () => {
  await store.remove("token");
  $("token").value = "";
  hideTyping();
  say("token-error");
  await render();
  say("token-status", "Token removed from this browser.");
  $("token").focus();
});

// --- primary server ---
$("primary").addEventListener("change", async () => {
  await store.set({ primary: $("primary").value });
  say("primary-status", "Saved.");
});

// --- custom server ---
// Consent to send the token belongs to one origin: the one shown in the checkbox label when it was ticked.
// Typing a different address, saving, or removing the server clears it, so it can never carry over.
let consentFor = "";
const typedOrigin = () => {
  try {
    const origin = new URL($("origin").value.trim()).origin;
    return ORIGIN.test(origin) ? origin : "";
  } catch { return ""; }
};
function resetConsent() {
  const origin = typedOrigin();
  consentFor = "";
  $("consent").checked = false;
  $("consent").disabled = !origin;
  say("consent-label", origin ? `Send my Hugging Face token to ${origin}` : "Send my Hugging Face token to this server too");
}
$("origin").addEventListener("input", () => {
  say("custom-error");
  say("custom-status");
  if (!consentFor || typedOrigin() !== consentFor) resetConsent();
});
$("consent").addEventListener("change", () => { consentFor = $("consent").checked ? typedOrigin() : ""; });

$("custom-form").addEventListener("submit", (e) => {
  e.preventDefault();
  say("custom-status");
  const typed = $("origin").value.trim(), origin = typedOrigin();
  if (!origin) {
    say("custom-error", /huggingface\.co/i.test(typed)
      ? "Use the Space's own address, like https://your-name-your-space.hf.space, not its huggingface.co page."
      : "Enter the address of a Hugging Face Space, like https://your-name-your-space.hf.space.");
    return $("origin").focus();
  }
  const api = $("api").value, consent = $("consent").checked && consentFor === origin; // ticked for this exact origin
  // Ask Chrome for this one origin only. The request must start inside the click, before any await.
  chrome.permissions.request(pattern(origin)).then(async (granted) => {
    if (!granted) return say("custom-error", `Chrome wasn't allowed to reach ${origin}, so nothing was saved.`);
    const { custom } = await store.get("custom");
    if (ORIGIN.test(custom?.origin) && custom.origin !== origin) await chrome.permissions.remove(pattern(custom.origin)).catch(() => {});
    await store.set({ custom: { origin, api }, tokenFor: consent ? [origin] : [] }); // replaces any earlier approval
    $("origin").value = "";
    resetConsent();
    say("custom-error");
    await render();
    say("custom-status", "Saved. Choose it under Server to ask it first.");
  }, () => say("custom-error", `Chrome couldn't ask for access to ${origin}.`));
});

$("custom-remove").addEventListener("click", async () => {
  const { custom, primary } = await store.get(["custom", "primary"]);
  await store.remove(["custom", "tokenFor"]);
  if (primary === "custom") await store.set({ primary: "boneyland" });
  if (ORIGIN.test(custom?.origin)) await chrome.permissions.remove(pattern(custom.origin)).catch(() => {});
  resetConsent();
  await render();
  say("custom-status", "Custom server removed, along with Chrome's access to it.");
  $("origin").focus();
});

// --- Chrome's on-device AI ---
// Chrome's built-in model (the Prompt API's LanguageModel) shortens Queen's answers on this device. This page only
// shows whether Chrome has it and, on a click, asks Chrome to download it. Every use is guarded: older Chromes and
// other browsers have no LanguageModel at all.
const AI = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };
const RULES = "Ask Queen still shows short points, picked from Queen's own sentences.";
const AI_STATES = { // availability: [state line, detail]
  available: ["Ready on this device.", "Ask Queen uses it to shorten Queen's answers. There is nothing to set up."],
  downloadable: ["Not downloaded yet.", "The model is several GB. Chrome downloads it one time and shares it with every site and extension that uses it. It needs an unmetered connection."],
  downloading: ["Chrome is downloading the model.", "It is several GB, so this can take a while. You can keep using Chrome, and Ask Queen, in the meantime."],
  unavailable: ["Not available on this device.", `Chrome says its model can't run here. It needs Windows, macOS, Linux or a Chromebook Plus, at least 22 GB of free disk space, and either a graphics card with more than 4 GB of memory or 16 GB of RAM with 4 or more processor cores. ${RULES}`],
  unsupported: ["Not supported by this Chrome.", `This version of Chrome has no built-in AI model, or it is switched off. ${RULES}`],
  unknown: ["Chrome didn't say whether its model is ready.", `Reload this page to check again. ${RULES}`],
};
let downloading = false; // a download this page started: its progress is on screen
const percent = (loaded) => {
  const part = Math.min(1, Math.max(0, Number(loaded) || 0));
  $("ai-progress").value = part;
  say("ai-percent", `${Math.round(part * 100)}%`);
};
async function showAi() {
  let state = "unsupported";
  if (downloading) state = "downloading";
  else if (typeof LanguageModel !== "undefined") {
    try { state = await LanguageModel.availability(AI); } catch { state = "unknown"; }
  }
  if (downloading && state !== "downloading") return; // a download began while Chrome was answering
  const [line, detail] = AI_STATES[state] || AI_STATES.unknown;
  say("ai-state", line);
  say("ai-detail", detail);
  $("ai-state").dataset.state = AI_STATES[state] ? state : "unknown";
  $("ai-get").hidden = state !== "downloadable";
  $("ai-loading").hidden = !downloading;
}
$("ai-download").addEventListener("click", () => {
  if (typeof LanguageModel === "undefined") return showAi();
  say("ai-error");
  let session;
  try { // create() starts the download, and Chrome allows that only inside a click: nothing may be awaited before it
    session = LanguageModel.create({ ...AI, monitor(m) { m.addEventListener("downloadprogress", (e) => percent(e.loaded)); } });
  } catch (e) { session = Promise.reject(e); }
  downloading = true;
  percent(0);
  showAi();
  $("ai-state").focus(); // the button is gone, so focus goes to the line that says what is happening
  say("ai-status", "Download started.");
  Promise.resolve(session).then((made) => {
    try { made.destroy(); } catch {} // the session was only needed to fetch the model
    say("ai-status", "Downloaded. Ask Queen uses it from your next question.");
  }, (e) => {
    say("ai-status");
    say("ai-error", `Chrome couldn't download the model${e?.message ? `: ${String(e.message).slice(0, 200)}` : "."}`);
  }).finally(() => { downloading = false; showAi(); });
});
// The state can change while this page is in the background (a download finishing, a flag being set).
document.addEventListener("visibilitychange", () => { if (!document.hidden) showAi(); });

// --- keyboard shortcut ---
// This page can read the binding the user actually has, which the panel on a chess page cannot.
chrome.commands?.getAll().then((all) => {
  const command = all.find((c) => !c.name.startsWith("_"));
  if (!command) return;
  $("keys").hidden = false;
  $("shortcut").replaceChildren(...(command.shortcut
    ? [Object.assign(document.createElement("code"), { textContent: command.shortcut }), " opens the Ask Queen panel on a chess page, wherever its button is showing."]
    : ["No shortcut is set for opening the Ask Queen panel."]));
}, () => {});

resetConsent();
render();
showAi();
