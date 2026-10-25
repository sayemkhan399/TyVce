# TyVce Chrome extension

OmniVoice listens in a Chrome side panel and inserts each finalized phrase into
the focused text field or editable area on the active webpage. The side panel
stays open while you move focus between the page and the extension.

## Build and load in Chrome

1. Run `npm install`.
2. Run `npm run build:extension`.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Select **Load unpacked** and choose this project's `dist` directory.
5. Click the OmniVoice toolbar button to open the side panel.
6. Focus a text field on a webpage, select the insertion point, and return to
   the side panel to start voice typing. Allow microphone access when prompted.

If speech recognition is blocked, check `chrome://settings/content/microphone`
for a blocked TyVce extension entry and change it to **Allow**. On macOS, also
allow Google Chrome under **System Settings → Privacy & Security → Microphone**.
Then reload TyVce from `chrome://extensions`. Chrome's microphone toggle alone
does not guarantee its speech recognition service is allowed.

If TyVce says the microphone permission prompt was dismissed, click the
microphone button again and choose **Allow** in Chrome's prompt. Closing or
dismissing the prompt leaves microphone access ungranted.

The extension requires Chrome 116 or newer for the side panel. It requests
`activeTab` and `scripting` access so it can insert text into the tab where you
use it; it does not request permanent access to every website. Pages Chrome
restricts extensions from modifying (such as `chrome://` pages and the Chrome
Web Store) cannot accept dictated text.
