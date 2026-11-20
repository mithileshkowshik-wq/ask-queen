# Data use answers

For the "Data usage" section of the dashboard's Privacy practices tab. These answers match `PRIVACY.md`. If one
changes, change the other.

## What user data does the extension collect or use?

| Dashboard category | Answer | Why |
|---|---|---|
| Personally identifiable information | No | No name, email, address or ID is read or sent. |
| Health information | No | |
| Financial and payment information | No | |
| **Authentication information** | **Yes** | An optional Hugging Face access token the user pastes into Settings. It is stored on the device and sent as an `Authorization` header to the QUEEN server that answers a question, so the user gets a larger free quota. |
| Personal communications | No | Chat on the chess sites is not read. |
| Location | No | The extension does not read or send location. As with any web request, the QUEEN server sees the user's IP address. |
| Web history | No | Page addresses are not collected or sent. |
| User activity | No | No clicks, keystrokes or browsing behaviour are logged or sent. |
| **Website content** | **Yes** | The chess position and move list shown on chess.com or lichess.org. They are read inside the browser to label the buttons, and sent to a QUEEN server only when the user clicks an ask button. |

## Who receives it

The position, the moves and the token (if set) go to the QUEEN server the user asked: one of two community-run
Hugging Face Spaces (`boneyland-queen-pawn-8.hf.space`, `hugging-apps-queen-pawn-8.hf.space`), or a custom Space the
user configured and approved. This transfer is the extension's single purpose and is disclosed in the first-use
notice, in Settings and in the privacy policy. The token goes to a custom server only with a separate opt-in.

The developer receives nothing. There is no developer server, no analytics and no advertising.

## Certifications

Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Basis for the first: sending the position and token to the QUEEN server is necessary to provide the user-facing
feature, is initiated by the user's click, and is disclosed before first use.

## Privacy policy URL

The public URL where `PRIVACY.md` is hosted. See `OWNER-TODO.md`.

## Remote code

"No, I am not using remote code."
