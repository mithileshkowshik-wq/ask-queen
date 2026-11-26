#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { runUnits } = require("./unit");
const { runWorkerTests } = require("./worker");
const { runPanelTests } = require("./panel");
const { runFormatTests } = require("./format");
const { runBrowser } = require("./browser");
const { payload } = require("./mock");
const { SITES } = require("./fixtures");

const REPO = path.join(__dirname, "..");
const round = process.argv[2] || "dev";
if (!/^[a-z0-9-]+$/i.test(round)) throw new Error("Invalid round name");
const out = path.join(REPO, "docs", "review", "evidence", "round-" + round);
fs.mkdirSync(out, { recursive: true });

const results = [], log = [];
const say = (line) => { console.log(line); log.push(line); };
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); say("PASS " + name); }
  catch (err) {
    const detail = String(err.stderr?.toString().trim() || err.stack || err).slice(0, 4500);
    results.push({ name, ok: false, detail });
    say("FAIL " + name + "\n" + detail);
  }
}

async function staticTests(temp) {
  const manifest = require("../manifest.json");
  await test("Manifest is MV3 with exactly the two built-in HTTPS grants and optional Space origins", () => {
    assert.equal(manifest.manifest_version, 3);
    assert.equal(manifest.version, "1.0.0");
    assert.equal(manifest.homepage_url, "https://github.com/mithileshkowshik-wq/ask-queen");
    assert.match(manifest.minimum_chrome_version, /^\d+$/);
    assert.deepEqual(manifest.permissions, ["storage"]);
    assert.deepEqual(manifest.host_permissions, ["https://boneyland-queen-pawn-8.hf.space/*", "https://hugging-apps-queen-pawn-8.hf.space/*"]);
    assert.deepEqual(manifest.optional_host_permissions, ["https://*.hf.space/*"]);
    // A document_start key guard, then the main scripts at document_idle with chess.js first and panel.js last.
    const [guard, main] = manifest.content_scripts;
    assert.equal(manifest.content_scripts.length, 2);
    assert.deepEqual(guard, { matches: main.matches, js: ["content/keyguard.js"], run_at: "document_start" });
    assert.deepEqual(main.matches, ["https://www.chess.com/*", "https://lichess.org/*"]);
    assert.notEqual(main.all_frames, true);
    assert.equal(main.js[0], "content/chess.js");
    assert.equal(main.js.at(-1), "content/panel.js");
    assert.equal("web_accessible_resources" in manifest, false);
    assert.equal("externally_connectable" in manifest, false);
    assert.deepEqual(Object.keys(manifest.icons), ["16", "32", "48", "128"]);
    // Name and description come from _locales/en; the open-panel command needs no extra permission.
    const messages = require("../_locales/en/messages.json");
    assert.equal(manifest.default_locale, "en");
    assert.equal(manifest.name, "__MSG_extName__");
    assert.equal(messages.extName.message, "Ask Queen");
    assert.equal(manifest.description, "__MSG_extDescription__");
    assert(messages.extDescription.message.length <= 132);
    assert.doesNotMatch(messages.extDescription.message, /\b(?:best|official|#1|ultimate)\b/i);
    assert.deepEqual(manifest.commands, { "open-panel": { suggested_key: { default: "Alt+Q" }, description: "__MSG_openPanel__" } });
  });
  await test("Shipped JavaScript parses with no dynamic code execution", () => {
    for (const file of [manifest.background.service_worker, ...manifest.content_scripts.flatMap((c) => c.js), "options.js"]) {
      execFileSync(process.execPath, ["--check", path.join(REPO, file)]);
      assert.doesNotMatch(fs.readFileSync(path.join(REPO, file), "utf8"), /\beval\s*\(|\bnew Function\s*\(/, file);
    }
  });
  await test("Every sending fixture has a mock reply FEN for both API shapes", () => {
    for (const [id, { expect }] of Object.entries(SITES)) {
      if (!expect?.fen) continue;
      const data = [expect.fen, expect.moves];
      assert.equal(payload(data, "ok", "analyse_position")[0].fen, expect.replyFen, id);
      assert.equal(payload(data, "ok", "analyze")[3].fen, expect.replyFen, id);
    }
  });
  let unpacked;
  await test("Allowlist zip contains exactly the runtime files and preserves icon dimensions", () => {
    const archive = execFileSync("sh", ["scripts/package.sh"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    assert.equal(archive, "dist/ask-queen-" + manifest.version + ".zip");
    const members = execFileSync("unzip", ["-Z1", archive], { cwd: REPO, encoding: "utf8" }).trim().split("\n");
    const expected = ["manifest.json", "background.js", "options.html", "options.js", "LICENSE",
      ...manifest.content_scripts.flatMap((c) => c.js), ...Object.values(manifest.icons)];
    const locales = path.join(REPO, "_locales");
    if (fs.existsSync(locales)) expected.push(...fs.readdirSync(locales).map((locale) => "_locales/" + locale + "/messages.json"));
    assert.deepEqual(members.sort(), expected.sort());
    assert(members.every((f) => !/^(?:test|docs|store|\.git|node_modules)\/|(?:^|\/)package.*\.json$/.test(f)));
    const destination = path.join(temp, "zip-extension");
    execFileSync("unzip", ["-q", archive, "-d", destination], { cwd: REPO });
    for (const file of expected) assert(fs.readFileSync(path.join(destination, file)).equals(fs.readFileSync(path.join(REPO, file))), file);
    for (const [size, icon] of Object.entries(manifest.icons)) {
      const png = fs.readFileSync(path.join(destination, icon));
      assert.equal(png.subarray(1, 4).toString(), "PNG");
      assert.equal(png.readUInt32BE(16), +size);
      assert.equal(png.readUInt32BE(20), +size);
    }
    unpacked = destination;
  });
  return unpacked;
}

(async () => {
  const start = Date.now();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ask-queen-tests-"));
  try {
    const packaged = await staticTests(temp);
    const local = [];
    for (const suite of [runUnits, runFormatTests, runWorkerTests, runPanelTests]) suite((name, fn) => local.push([name, fn]));
    for (const [name, fn] of local) await test(name, fn);
    await test("Unpacked extension E2E harness on Chromium", () => runBrowser(REPO, temp, out, test, packaged));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  const failures = results.filter((r) => !r.ok);
  const passed = results.length - failures.length;
  say(`\n${passed}/${results.length} passed, ${failures.length} failed in ${((Date.now() - start) / 1000).toFixed(1)} s`);
  fs.writeFileSync(path.join(out, "report.json"), JSON.stringify({ round, date: new Date().toISOString(), passed, failed: failures.length, results }, null, 2));
  fs.writeFileSync(path.join(out, "log.txt"), log.join("\n") + "\n");
  process.exitCode = failures.length ? 1 : 0;
})().catch((err) => { console.error(err); process.exitCode = 1; });
