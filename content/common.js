// Shared DOM adapter helpers. Only a matching site registers a position.
var AQ = globalThis.AQ = { adapters: [] };
(() => {
  const C = globalThis.AQChess;
  const MINI = ".mini-board, .mini-game, .cg-mini, [data-mini-board], [class*='mini-board'], [class*='hover-preview']";
  AQ.visible = (el) => {
    if (el.closest("[hidden], [aria-hidden='true']")) return false;
    const style = getComputedStyle(el);
    return style.visibility !== "hidden" && style.display !== "none" && !!el.getClientRects().length;
  };

  AQ.mainBoard = (selector, primary) => {
    let best = null, max = 0, preferred = false;
    for (const el of document.querySelectorAll(selector)) {
      if (el.closest(MINI) || !AQ.visible(el)) continue;
      const { width, height } = el.getBoundingClientRect();
      const main = !!el.closest(primary);
      const area = width * height;
      if (area && ((main && !preferred) || (main === preferred && area > max))) {
        best = el;
        max = area;
        preferred = main;
      }
    }
    return best;
  };

  // Layout-free visibility for AQ.gate(): only the hidden attribute and aria-hidden.
  AQ.shown = (el) => !el.closest("[hidden], [aria-hidden='true']");
  // Style-only visibility for AQ.confirm(): checkVisibility() reads computed style (display, visibility,
  // content-visibility) of the element and its ancestors, never layout. Browsers without it fall back to the same
  // computed-style walk.
  AQ.styled = (el) => AQ.shown(el) && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : (() => {
    for (let node = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  })());
  AQ.tag = (pgn, name) => new RegExp('^\\s*\\[' + name + '\\s+"([^"]*)"\\s*\\]', "im").exec(pgn)?.[1];
  AQ.hasBoard = (selector) => [...document.querySelectorAll(selector)].some((el) => !el.closest(MINI));
  AQ.transient = ".anim, .animating, .dragging, .ghost, .fading";
  AQ.readSan = (s) => {
    const san = s?.trim();
    return C.isStrictSan(san) ? san : null;
  };

  AQ.boardFromPieces = (pieces, lastMove, duplicate = false) => {
    const at = (sq, p) => pieces[sq] === p;
    const castle =
      (at("e1", "K") && at("h1", "R") ? "K" : "") + (at("e1", "K") && at("a1", "R") ? "Q" : "") +
      (at("e8", "k") && at("h8", "r") ? "k" : "") + (at("e8", "k") && at("a8", "r") ? "q" : "");
    let side = null, ep = "-";
    if (lastMove?.length === 2 && lastMove.every((sq) => /^[a-h][1-8]$/.test(sq)) &&
        lastMove.filter((sq) => pieces[sq]).length === 1) {
      const to = lastMove.find((sq) => pieces[sq]);
      const from = lastMove.find((sq) => !pieces[sq]);
      const piece = pieces[to];
      side = piece === piece.toUpperCase() ? "b" : "w";
      // A double push sets en passant only when the side to move can legally take, as in the replay and the Spaces.
      const square = to[0] + (side === "b" ? "3" : "6");
      if (from[0] === to[0] && (piece === "P" && from[1] + to[1] === "24" || piece === "p" && from[1] + to[1] === "75") &&
          C.enPassant(pieces, side, square)) ep = square;
    }
    const check = C.isPlausibleBoard(pieces);
    return { placement: C.placementToString(pieces), side, sideSource: side ? "lastmove" : null,
      castle: castle || "-", ep, fen6: null, castleGuessed: true,
      valid: check.ok && !duplicate, reason: duplicate ? "Overlapping pieces" : check.reason };
  };

  // A moving, dragged or fading piece means the scan can't be complete, so the board is unreadable until it settles
  // (the open panel re-reads on the next mutation). A partial scan is never offered.
  AQ.scan = (el, squareOf, pieceOf, pieceSelector, highlights) => {
    const pieces = {};
    let duplicate = false, moving = false;
    for (const piece of el.querySelectorAll(pieceSelector)) {
      if (piece.matches(AQ.transient)) { moving = true; continue; }
      const sq = squareOf(piece), role = pieceOf(piece);
      if (!sq || !role) continue;
      if (pieces[sq]) duplicate = true;
      pieces[sq] = role;
    }
    const board = AQ.boardFromPieces(pieces, [...new Set(highlights.map(squareOf))], duplicate);
    return moving ? { ...board, valid: false, reason: "The board is moving" } : board;
  };

  AQ.fenWithSide = (board, side) => board.fen6 && side === board.side ? board.fen6 :
    [board.placement, side, board.castle, side === board.side ? board.ep : "-", 0, 1].join(" ");

  // lila writes its FEN input as a property, which no MutationObserver sees, so a read can catch it a step behind the
  // board. When that is the only problem, nudge the open panel once, 300 ms later, by touching our own host element
  // (never the site's DOM); the same disagreement is not retried again.
  let rechecked = "", recheckTimer = 0;
  AQ.recheck = (key) => {
    if (key === rechecked || recheckTimer) return;
    rechecked = key;
    recheckTimer = setTimeout(() => {
      recheckTimer = 0;
      document.querySelector('[data-testid="aq-host"]')?.setAttribute("data-aq-recheck", String(Date.now()));
    }, 300);
  };

  AQ.position = ({ page, gate, board, line, exactFen }) => {
    let root = line?.root ?? null;
    let moves = line?.moves ?? null;
    const highlightSide = board.side;
    const exact = C.parseFen(exactFen);
    let crossCheck = { ok: true, reason: null };
    if (exact && board.valid) {
      if (C.placementToString(exact.placement) !== board.placement || (highlightSide && highlightSide !== exact.side)) {
        crossCheck = { ok: false, reason: "The site FEN disagrees with the board" };
        AQ.recheck(exactFen + " " + board.placement);
      } else {
        Object.assign(board, { side: exact.side, sideSource: "fen", castle: exact.castle, ep: exact.ep,
          fen6: exactFen, castleGuessed: false });
      }
    }
    if (root && moves && crossCheck.ok) {
      crossCheck = C.preSendCheck({ rootFen: root.fen, moves, board, highlightSide });
      // The full replay must rebuild the scanned board exactly, and agree with an exact site FEN on the side to move,
      // castling and en passant. Otherwise the list is dropped and the panel shows the "disagree" state.
      const replayed = crossCheck.ok && C.replay(root.fen, moves)?.split(" ");
      if (crossCheck.ok && (!replayed || replayed[0] !== board.placement))
        crossCheck = { ok: false, reason: "The moves don't rebuild the board" };
      else if (crossCheck.ok && board.fen6 && replayed.slice(1, 4).join(" ") !== board.fen6.split(" ").slice(1, 4).join(" "))
        crossCheck = { ok: false, reason: "The moves and the page's FEN disagree on castling or en passant" };
      const side = moves.length % 2 ? (C.parseFen(root.fen).side === "w" ? "b" : "w") : C.parseFen(root.fen).side;
      if (crossCheck.ok && board.fen6 && board.side !== side) crossCheck = { ok: false, reason: "Side to move disagrees" };
      if (crossCheck.ok) {
        root = { ...root, verified: true };
        if (!board.fen6) Object.assign(board, { side, sideSource: "moves" });
      }
    }
    if (!crossCheck.ok) {
      moves = null;
      if (root) root = { ...root, verified: false };
    }
    if (!root?.verified || gate) moves = null;
    return { page, gate, board, root, moves, crossCheck };
  };

  AQ.root = (moves, { fen, source = "pgn", custom = false } = {}) => {
    if (!moves || !moves.every(Boolean)) return null;
    if (C.parseFen(fen)) return { moves, root: { fen, verified: false, source } };
    if (custom) return null;
    return { moves, root: { fen: C.START_FEN, verified: false, source: "standard" } };
  };

  // For the closed panel, called about once a second. The full (layout-free) evaluation is cached and redone only when
  // the URL or the board element changes, after a click or key press (a game can end by the user's own action), or
  // after a change in the page's evidence areas, so a quiet tick costs one querySelector. readPosition() still decides
  // when the panel opens and at click time; AQ.confirm() is that full read for the moment the gate opens.
  let cached = null, dirty = true;
  for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => { dirty = true; }, { capture: true, passive: true });
  // A result row or game-over element rendered after the board (a page still hydrating) marks it too. Only a change
  // inside the adapter's evidence areas (move list, result, game over), or one adding or removing such an area, counts,
  // so clock ticks and chat elsewhere stay quiet. Selector matching only, no layout.
  const touches = (node, area) => node.nodeType === Node.ELEMENT_NODE && (node.matches(area) || !!node.querySelector(area));
  new MutationObserver((records) => {
    const area = AQ.adapters.find((a) => a.host === location.hostname)?.evidence;
    if (dirty || !area) return;
    dirty = records.some((r) => !!(r.target.nodeType === Node.ELEMENT_NODE ? r.target : r.target.parentElement)?.closest(area) ||
      [...r.addedNodes, ...r.removedNodes].some((node) => touches(node, area)));
  }).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  AQ.gate = () => {
    const adapter = AQ.adapters.find((a) => a.host === location.hostname);
    const board = adapter ? document.querySelector(adapter.board) : null;
    if (cached && !dirty && cached.href === location.href && cached.board === board) return cached.value;
    dirty = false;
    const value = adapter?.matches() ? { hasBoard: true, gate: adapter.gate() } : { hasBoard: false, gate: null };
    cached = { href: location.href, board, value };
    return value;
  };
  // Before the launcher appears: the same gate evaluation with style visibility for the few evidence elements (a
  // result, a clock, a variant badge), so a finished-game marker hidden by CSS doesn't open it. No board scan and no
  // getBoundingClientRect/getClientRects; readPosition() still decides when the panel opens.
  AQ.confirm = () => {
    const adapter = AQ.adapters.find((a) => a.host === location.hostname);
    return !!adapter?.matches() && adapter.gate(AQ.styled) === null;
  };

  AQ.readPosition = () => {
    const adapter = AQ.adapters.find((a) => a.matches());
    const result = adapter?.read();
    if (!result) return null;
    const position = { site: adapter.name, ...result };
    return { ...position, snapshotKey: JSON.stringify([location.pathname, position]) };
  };

  // The answer card (content/format.js). Resolves within 6 s with result.card set, and never rejects: a card the
  // service worker already wrote comes back at once; otherwise this window's LanguageModel (the web Prompt API) writes
  // it when the model is ready, the rules otherwise, and the worker's token guard checks every string first. An
  // unreachable guard means no card (null).
  AQ.tidy = (result) => {
    if (!globalThis.AQFormat) return Promise.resolve(result && typeof result === "object" ? { ...result, card: result.card ?? null } : result);
    return AQFormat.tidy(result, {
      languageModel: typeof LanguageModel === "undefined" ? null : LanguageModel,
      timeoutMs: 6000,
      guard: async (r) => {
        const fields = await chrome.runtime.sendMessage({ type: "guard", result:
          { evaluationText: r.evaluationText ?? null, criticalLine: r.criticalLine ?? null, analysis: r.analysis ?? null, card: r.card } });
        if (!fields || typeof fields !== "object") throw new Error("The token guard didn't answer");
        return { ...r, ...fields };
      },
    });
  };
})();
