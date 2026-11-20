# Permission justifications

For the "Permission justification" fields on the dashboard's Privacy practices tab. The text in each code block is
written to be pasted as it is.

## `storage`

```
Stores the user's settings in chrome.storage.local on this device: an optional Hugging Face token, the chosen QUEEN server, an optional custom server address, whether the first-use notice was seen, and which side the panel is docked on. Nothing is synced. Access is restricted to the extension's own pages (TRUSTED_CONTEXTS), so the scripts that run in chess.com and lichess.org cannot read the token.
```

## Host permission: `https://boneyland-queen-pawn-8.hf.space/*`

```
This is the default QUEEN server, a Hugging Face Space that hosts the model. When the user clicks an ask button, the extension's background service worker sends the chess position and moves to this exact origin and reads the answer.
```

## Host permission: `https://hugging-apps-queen-pawn-8.hf.space/*`

```
This is the backup QUEEN server, a second Hugging Face Space hosting the same model. It is contacted only when the user chooses it, or once per question when the default server fails with a temporary error. The request is the same: the chess position and moves.
```

## Optional host permission: `https://*.hf.space/*`

```
Not granted at install. It exists so a user can point the extension at their own copy of the QUEEN Space, whose hostname cannot be known in advance; every Hugging Face Space is served from its own subdomain of hf.space. When the user saves a custom server in Settings, the extension calls chrome.permissions.request for that one exact origin only (for example https://name-space.hf.space/*), and Chrome shows the user a prompt for it. The wildcard itself is never requested. Removing the custom server calls chrome.permissions.remove for that origin.
```

## Site access (content scripts): `https://www.chess.com/*` and `https://lichess.org/*`

```
The extension's single purpose is to explain the chess position the user is viewing on these two sites. A content script reads the board and the move list from the page to build that position, and adds one button and one panel inside a shadow root. It runs in the top frame only and does not change the sites' own content or styles. The match covers the whole host because board pages on these sites share no common path prefix (games, reviews, analysis boards and studies all live at different paths) and chess.com moves between them without a page load. On pages with no board, and on games in progress, puzzles and variants, the script shows nothing and sends nothing.
```

## Remote code

```
No. All JavaScript is in the package. The extension does not load or evaluate remote code, and uses no eval or new Function. Text returned by the QUEEN servers is treated as untrusted data: it is HTML-escaped before a small Markdown subset is applied, and any HTML it contains is discarded.
```

## Permissions not requested

`tabs`, `activeTab`, `scripting`, `webRequest`, `cookies`, `identity`, `externally_connectable` and
`web_accessible_resources` are not used.
