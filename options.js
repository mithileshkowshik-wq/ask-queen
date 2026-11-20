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
$("origin").addEventListener("input", () => { say("custom-error"); say("custom-status"); });

$("custom-form").addEventListener("submit", (e) => {
  e.preventDefault();
  say("custom-status");
  const typed = $("origin").value.trim();
  let origin = "";
  try { origin = new URL(typed).origin; } catch {}
  if (!ORIGIN.test(origin)) {
    say("custom-error", /huggingface\.co/i.test(typed)
      ? "Use the Space's own address, like https://your-name-your-space.hf.space, not its huggingface.co page."
      : "Enter the address of a Hugging Face Space, like https://your-name-your-space.hf.space.");
    return $("origin").focus();
  }
  const api = $("api").value, consent = $("consent").checked;
  // Ask Chrome for this one origin only. The request must start inside the click, before any await.
  chrome.permissions.request(pattern(origin)).then(async (granted) => {
    if (!granted) return say("custom-error", `Chrome wasn't allowed to reach ${origin}, so nothing was saved.`);
    const { custom } = await store.get("custom");
    if (ORIGIN.test(custom?.origin) && custom.origin !== origin) await chrome.permissions.remove(pattern(custom.origin)).catch(() => {});
    await store.set({ custom: { origin, api }, tokenFor: consent ? [origin] : [] });
    $("origin").value = "";
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
  $("consent").checked = false;
  await render();
  say("custom-status", "Custom server removed, along with Chrome's access to it.");
  $("origin").focus();
});

render();
