# Ask Queen threat model

One page on what Ask Queen protects, from whom, and what it can't protect. It describes version 1.0.0. The code
references are to files in this repository.

## What is worth protecting

| Asset | Why it matters |
|---|---|
| The user's Hugging Face token | A credential. With it, someone can act as the user on Hugging Face within the token's scope. |
| The page the user is on | Ask Queen adds UI to chess.com and lichess.org. It must not become a way to run script or show forged content there. |
| The position and moves | They say what the user is studying. They should go only where the user was told they go. |
| Fair play | The extension must not help anyone during a game in progress. |
| The community servers | Free GPUs run by volunteers. The extension must not flood them. |

## Who and what is not trusted

1. **Server text.** Everything a QUEEN server returns, including a custom server the user configured.
2. **The site's DOM.** Move lists, FEN fields and class names on chess.com and lichess, some of them written by other
   users (study text, usernames, chat).
3. **Scripts in the page.** The sites' own JavaScript and other extensions, which share the page's DOM.
4. **The user as a player**, who may want help during a game.

## Token

**Threat: a web page or the extension's own page scripts read the token.**
The token lives in `chrome.storage.local` with access set to `TRUSTED_CONTEXTS` on install and on every start of the
background worker (`background.js`), so content scripts cannot read it. Only the background and the Settings page
touch it. It is never sent to a content script, never logged and never synced. Settings shows only its last four
characters and never puts it back in the field (`options.js`). A test reads the key from a content script and
expects failure.

**Threat: the token goes to a server the user did not approve.**
It is sent only as an `Authorization` header over HTTPS, to the two built-in origins or to one custom origin. A custom
origin gets it only if the user ticked the consent box for that exact origin; changing the origin clears the consent.
Requests use `credentials: "omit"`, `redirect: "error"` and `referrerPolicy: "no-referrer"`, so a redirect cannot
carry the header elsewhere. The custom origin must match `https://<name>.hf.space`, and Chrome grants access to that
one origin only.

**Threat: a server echoes the token back so it appears in the page.**
The background removes the saved token, and any text shaped like a Hugging Face token, from every string in a result
or error before posting it to the panel, including when Markdown characters are wedged between its characters.

**Residual risks.**
- **A hostile configured server already holds the token.** Any server that is sent the token can keep or misuse it;
  nothing in the extension can prevent that. This is why the token is optional, why Settings and the privacy policy
  say to use a read-only token made only for Ask Queen, and why sending it to a custom server needs separate consent.
  The remedy after the fact is to revoke the token on Hugging Face.
- **Echo scrubbing is pattern matching.** A server that deliberately disguises the token (for example, spelled out or
  split in ways the scrubber does not join) could get parts of it into the answer text. The page could then read
  that text. Such a server already holds the whole token, so this adds little to the risk above.
- **Local access.** Chrome stores extension data unencrypted in the profile. Someone with access to the user's files
  can read the token.

## Server text

**Threat: an answer injects script or markup into chess.com or lichess.**
The panel builds its Markdown subset as DOM nodes: model text enters only through `createTextNode`, and the output can
contain only `p`, `ul`, `ol`, `li`, `h4`, `strong`, `em` and `code`, with a numeric `li[value]` as the only attribute.
There are no links or images and there is no HTML-parsing sink in `content/panel.js`. Every other string from the
server is set with `textContent`. The extension loads no remote code and uses no `eval`.

**Threat: a malformed or hostile reply breaks the panel or the worker.**
The background validates the reply's shape and reports anything else as `bad_response`. Streams are capped in size
and time (20 s to connect, 45 s idle, 150 s overall).

**Threat: a wrong or unverified move is presented as Queen's choice.**
Only a move the server checked for legality becomes the headline or the verdict. A move found only in prose is shown
as "unverified". The returned position is checked against the click-time snapshot, and a mismatch replaces the answer.

**Residual risk.** The explanation itself can be wrong or misleading, from a faulty model or a dishonest server. The
panel says "Explanations can be wrong" on every screen. Legality is checked; quality is not.

## Site DOM

**Threat: page content makes the extension send a position the user is not looking at.**
Moves must pass a strict SAN pattern or the whole list is dropped. The list is checked against the scanned board
before sending, the board is re-read at click time, and the reply is checked against that snapshot. Boards that are
mid-move or impossible are refused. When the checks fail, the panel says so and works from the pieces.

**Threat: page content reaches the background as a crafted message.**
The background accepts requests only from this extension's content script in the top frame of the two sites, and
validates every field (FEN, SAN, lengths, snapshot) before any network call. There is no `externally_connectable`
and no `web_accessible_resources`.

**Residual risks.**
- **Page scripts can read and click the panel.** The panel's shadow root is open, and a shadow root is not a security
  boundary either way. A script in the page can read an answer or click "Explain". It cannot read the token, and a
  click sends only what the user's own click would send.
- **Site redesigns.** If a site changes its markup, reading fails closed: "Can't read this board", or no launcher.

## Fair play

**Threat: the extension answers during a game in progress, on a puzzle or on a variant.**
The launcher needs positive evidence of a finished game, Game Review, an analysis board or a study. Anything else,
including an unrecognised page, shows nothing. A cheap gate decides whether the launcher may show and a full read
confirms it; the full read runs again when the panel opens and at every click. If a gated page is reached with the
panel open, the request is aborted and the answer removed. The keyboard shortcut goes through the same gate.

**Residual risks.**
- **Copying the position elsewhere.** Nothing stops a player typing the position into an analysis board, where the
  extension is allowed to work. Ask Queen is not an anti-cheating tool.
- **Tampering.** A user who edits the page with developer tools, or modifies the unpacked extension, can defeat the
  gate. The gate is there so that honest use cannot drift into help during a game.
- **Evidence is read from the page.** The background cannot see the game's real state; it trusts the content
  script's reading of the site.

## Community servers

One question in flight per browser, a two-second gap between questions, a 15-minute memory of recent answers, and no
request without a click (the single automatic retry on the backup server is the one exception). There is no
prefetching, polling or health check.

## Out of scope

A compromised browser or operating system, a malicious Chrome update channel, and attacks on Hugging Face itself.
