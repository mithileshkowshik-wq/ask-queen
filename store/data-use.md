# Data use answers

For the "Data usage" section of the dashboard's Privacy practices tab. These answers match `PRIVACY.md`. If one
changes, change the other.

## What user data does the extension collect or use?

| Dashboard category | Answer | Why |
|---|---|---|
| Personally identifiable information | No | No name, email, address or ID is read or sent. |
| Health information | No | |
| Financial and payment information | No | |
| **Authentication information** | **Yes** | An optional Hugging Face access token the user pastes into Settings. It is stored on the device and sent as an `Authorization` header to each QUEEN server a question is sent to (the server tried first and, if that attempt fails, the backup), so the user gets a larger free quota. It goes to a custom server only with a separate opt-in for that exact address. |
| Personal communications | No | Chat on the chess sites is not read. |
| Location | No | The extension does not read or send location. As with any web request, the QUEEN server sees the user's IP address. |
| Web history | No | Page addresses are not collected or sent. |
| User activity | No | No clicks, keystrokes or browsing behaviour are logged or sent. |
| **Website content** | **Yes** | The chess position and move list shown on chess.com or lichess.org. They are read inside the browser to label the buttons, and sent only when the user clicks an ask button: to the QUEEN server tried first and, if that attempt fails with a temporary error, once to the backup server. |

## Who receives it

Every server a question is sent to receives the position, the moves and the generation settings, whether or not it
answers. That is the server tried first and, only if that attempt fails with a temporary error (unreachable, asleep
or timed out), one backup server. Both always come from this list:

- `boneyland-queen-pawn-8.hf.space` and `hugging-apps-queen-pawn-8.hf.space`, two community-run Hugging Face Spaces
- a custom Space the user configured and approved in Chrome, if any

The token (if set) goes to a built-in server whenever it is tried, first or as backup. It goes to a custom server
only with a separate opt-in for that exact address, and saving a different address clears the opt-in.

These transfers are the extension's single purpose and are disclosed in the first-use notice, in Settings and in the
privacy policy.

The developer receives nothing. There is no developer server, no analytics and no advertising.

## Certifications

Tick all three:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

Basis for the first: sending the position and token to the QUEEN servers is necessary to provide the user-facing
feature, is initiated by the user's click, and is disclosed before first use.

## Privacy policy URL

The public URL where `PRIVACY.md` is hosted. See `OWNER-TODO.md`.

## Remote code

"No, I am not using remote code."
