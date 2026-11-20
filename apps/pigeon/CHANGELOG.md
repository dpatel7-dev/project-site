# Changelog



## 2.5.0
- **Anyone can make a nest on the website now.** New people click "Make a nest" on the sign-in page.
- The site's owner has a switch for it in **People and space** (your account menu): "Anyone can make a nest on this site". It's kept in pigeon itself, so it survives updates.

## 2.4.0
- **A new look for pigeon in the browser.** A calm dashboard: a soft grey sidebar (My nest, Recent, Starred, Devices, Shared links, Trash) with your storage as a row of coloured pixels, a white workspace with clean cards, and one colourful strip of pixel art with Coo flying through it. Light and dark.
- **More ways to open your nest, all with the same page.** "Other ways to open it" (in the sidebar and your account menu) lists them:
  - `pigeon app` opens your nest in a window of its own, like an app (uses Chrome or Edge if you have one).
  - `pigeon home` runs your own pigeon on this computer. Your drive lives here instead of on the website, so it works even when the website doesn't. `--wifi` lets pigeon on your other computers use it too.
  - The website and `pigeon dashboard` work as before.

## 2.3.0
- No more invite codes: anyone can make their own nest with a name and a password. Each nest still gets its own share of space, so nobody can fill the site for everyone, and nobody can see inside anyone else's nest.
- `pigeon invite` and "Invite someone" are gone. To stop new nests, set `"signups": "closed"`.

## 2.2.0
- Fair space: every invited nest gets its own share (100 MB unless the owner gives it more), so one person can't fill the site for everyone. The whole site still never goes past its total.
- People and space (owner only, in the browser under your name): how much each nest uses, more room for a nest, or remove one.
- When the site is nearly full, the trash empties after 3 days instead of 30, and the space line says so.
- Clearer messages: "your nest is full" and "this site is full" are told apart.

## 2.1.0
- A new look in the browser that matches gossip and Tree of Thought: the terminal's font, panels with their names in the border, airmail stripes, and postage stamps for files. Dark or light (it follows your computer, or the moon/sun button).
- Paste to upload: copy a screenshot or a file and press Ctrl/⌘+V in pigeon. Pasting text makes a note.
- New notes (New → New note): text you want on your other devices, like a link or some code.
- Press ? for every keyboard shortcut.
- The transfer tray tucks itself away once everything has landed, and sits above the bottom bar on phones.
- Devices show a phone, browser or terminal icon.

## 2.0.0
- pigeon is a drive now: folders, rename, move, stars, search, previews (photos, video, audio, PDF, text), shared links and a trash with undo. Names and folders stay locked; the website still can't read them.
- Send to a device: pick one of your signed-in devices and the file lands there by itself (terminal: `p`, `pigeon send --to`; browser: Send to a device).
- `pigeon dashboard` (or `w`): your nest in the browser, already signed in, saving straight into a folder on this computer.
- `pigeon sync`: keep a copy of your nest in ~/Pigeon, both ways.
- Faster: three pieces in flight each way.
- Sign-up fixed: pigeon's server no longer uses SQLite's write-ahead log, which fails on PythonAnywhere's network disk. Clear "Open my nest" / "Make a nest" choice, names can have dots, readable errors.
- Invites: the site's first nest is its owner, and can invite people (`pigeon invite`).
- Pixel art and QR codes no longer show seams in macOS Terminal.
- A new look in the browser: glassy, colourful, and laid out like a drive, with a phone layout.

## 1.0.0
- First release: a nest on your own website, and files that move between your devices locked end to end.
- Terminal app with Coo the pigeon: drop files or folders onto the window to send them, Enter to save, `l` for a share link with a QR code, `c` to catch the next thing from your phone.
- Phone-friendly web page: log in with the same nest name and password, send photos straight from the camera roll, save, preview, share.
- Share links work for 24 hours without an account; the key rides after the `#`, so the website can't open them.
- Folders are bundled for you and skip node_modules, .git and friends.
- Big files go in 4 MB pieces, retried if the connection blips.
- Everything from the shell too: `pigeon send`, `get`, `ls`, `link`, `catch`, `open`, `rm`.
