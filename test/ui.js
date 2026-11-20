// Shared UI hooks for the real browser and JSDOM. Button labels are still asserted in the flows.
const selectors = Object.fromEntries([
  "host", "launcher", "panel", "notice", "notice-ok", "ask", "out", "dock", "close", "gate", "best",
  "explain", "side", "side-white", "side-black", "side-switch", "disagree", "game-over", "changed", "cancel",
  "wait", "headline", "analysis", "verdict", "from-text", "truncated", "suggestion", "other-server", "eval", "line", "line-note",
  "result-footer", "stale", "stale-reask", "error", "error-details", "error-action", "ask-again", "status", "live", "reading", "shortcut",
].map((name) => [name, `[data-testid="aq-${name}"]`]));

const rootFor = (document) => document.querySelector(selectors.host)?.shadowRoot;
const nodeFor = (document, name) => rootFor(document)?.querySelector(selectors[name]);
const uiFor = (page) => (name) => page.locator(selectors[name]);
module.exports = { selectors, rootFor, nodeFor, uiFor };
