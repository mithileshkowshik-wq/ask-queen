// Settings page: values live in chrome.storage.local under `token` and `primary`.
const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["token", "primary"]).then(({ token = "", primary = "boneyland" }) => {
  $("token").value = token;
  $("primary").value = primary;
});

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({ token: $("token").value.trim(), primary: $("primary").value });
  $("status").textContent = "Settings saved";
  setTimeout(() => { $("status").textContent = ""; }, 2000);
});
