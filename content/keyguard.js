// Runs at document_start, before any site script, so its window capture listener is first in line: keys typed in
// the Ask Queen panel stop here and never reach the site's shortcut handlers, in either phase. Default actions (Tab
// focus, Enter/Space on a button) still happen; Escape inside the open panel presses its Close button.
(() => {
  for (const type of ["keydown", "keyup", "keypress"]) {
    addEventListener(type, (e) => {
      const host = e.composedPath().find((node) => node?.dataset?.testid === "aq-host");
      if (!host) return;
      e.stopImmediatePropagation();
      const panel = host.shadowRoot?.querySelector('[data-testid="aq-panel"]');
      if (type === "keydown" && e.key === "Escape" && panel && !panel.hidden) panel.querySelector('[data-testid="aq-close"]')?.click();
    }, true);
  }
})();
