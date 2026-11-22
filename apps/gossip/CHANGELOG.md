# What's new in gossip

See this any time with `gossip changelog`, or in the chat: Tab, then "What's new".


## 0.11.0
- **Light or dark, set once for every app:** press **L** in pca (or `pca look light`, `pca look dark`, `pca look auto`). When it's light, gossip uses Daylight; when it's dark, Arctic (Terminal and Mono stay as they are).

## 0.10.1
- No more emoji in gossip's own screens: files show ▤, reminders show ◷, and the dashboard and call window use small drawn icons. Call reactions (thumbs up, love, laugh, party, wave) are drawn icons too, and still understand reactions sent by older versions. Emoji you type yourself (like :fire:) still work.
## 0.10.0
- A YouTube player, built in. Inside a chat, type `/yt` and paste a YouTube link: it plays in gossip's own player window, and the bottom line of the chat shows what's playing. `/yt pause`, `/yt play`, `/yt +30` and `/yt -10` control it from the chat.
- YouTube links in messages get a `▶ YouTube video` line under them. `/yt` plays the newest one in the chat, `/videos` lists them all, and `/yt 2` plays the second.
- Watch together: open a chat (a friend or a server), type `/watch` and a link. When the others type `/watch` too, you're in sync: anyone presses play, pauses or skips, and it happens for everyone. `/watch stop` leaves. Play and pause travel end-to-end encrypted, only to the people watching, and are never saved.
- The player lists every video from your chats (with titles and pictures), lets you paste links, start watching together and send the video you're on to the chat. Keys: `k` or space, `j`/`l`, `f`, `m`.
- The dashboard's conversation box has a "▶ play" button next to YouTube links.
- Videos play in YouTube's own privacy-enhanced player. gossip never downloads them.

## 0.9.1
- The penguin keeps its look: on macOS Terminal, "auto" picks the blocky penguin once and keeps it. Before, it switched to the detailed one when you started typing (that's when macOS Terminal reports its colours) and never switched back. Choose the detailed one any time in settings (mascot.style smooth).

## 0.9.0
- Suggestions while you type in the chat screen: start with `/` for commands, `@` for people or `#` for servers. `↑` `↓` choose, `Tab` completes, `Enter` runs or opens it, `Esc` hides the list.
- Each chat keeps its own half-typed message. Switch to another chat and back, and it's still there - and it never gets sent to the wrong person.
- `Ctrl+N` jumps to the next chat with unread messages (the bottom line tells you when there are some).
- Scrolled up? The bottom line tells you when new messages arrive below.
- The dashboard has a Conversation box: click any chat - people or servers - to read it and reply right on the page. It updates live, shows when they're typing, and links are clickable.
- Search all your saved messages from the dashboard (press `/`), with the words highlighted. Click a result to open that chat.
- Check safety numbers on the dashboard: open someone's chat to see the number, and mark them verified once you've compared it.
- Servers show up in the dashboard's chat list too, with how many people are in each.

## 0.8.0
- The daylight theme really is light now: it paints your terminal light while gossip is open, even if your terminal is set to dark, and puts everything back when you leave. (`gossip config background terminal` keeps your terminal's own background; `background theme` lets every theme paint its own.)
- Calls no longer say the connection "hiccuped" when it's fine. Browsers report tiny blips that heal on their own; gossip now only says something if the connection really drops.
- Chat during a call: press `t` in the call window. What you type there is a normal gossip message, so it's in your terminal and your history too, and messages from them pop up in the call.
- Reactions in calls: press 1-5 (👍 ❤️ 😂 🎉 👋) and they float up on both screens.
- Pick your microphone, camera and speaker in the call (`d`), pop the call out into a small window that stays on top while you work (`p`, in Chrome and Edge), and go fullscreen (`f`).
- If you talk while you're muted, the call tells you.
- The dashboard has a People box: see who's online and what was said last, and message, call or video call anyone straight from the page. There's also Quick settings (theme, who can call you, pop-ups, sounds, do not disturb), a "Coming up" list, a round-trip graph and how much space gossip uses.
- Reminders: `/remind 10m stretch`, `/remind 5pm call mom`, `/remind tomorrow 9am gym`.
- Send a message later: `/later 8am happy birthday!` (or `/later @maya 30m see you soon`). If gossip is closed when it's due, it goes as soon as you open gossip again.
- Do not disturb: `/dnd 1h`, `/dnd 5pm`, or just `/dnd` until you turn it off. No sounds or pop-ups; messages and calls still arrive. It's in the Tab menu and on the dashboard too.

## 0.7.2
- gossip has its own call relay now: `gossip turn`. Run it on any always-on machine (one setup command, see docs/HOSTING.md) and your gossip website hands everyone a call login that works for a day. Calls then get through networks that block direct connections, with no outside service or signup.
- Hide your IP address from people you call: `gossip config call.hideip on` (uses your call relay).

## 0.7.1
- Much steadier calls. Your voice now gets top priority on the network, with error correction that fills in lost sound instead of leaving gaps; when the connection gets worse, video gives way first.
- Calls reconnect by themselves after a network hiccup instead of freezing.
- On a weak connection, your video pauses automatically so your voice stays clear, and comes back when things improve.
- Hardware video encoding on computers that have it: smoother video, less heat and battery.
- Signal bars in the call show how good the connection is, and hold space to talk while muted.
- A tip about headphones when both of you are on the same Wi-Fi (two computers in one room echo, which makes sound cut in and out).

## 0.7.0
- Send files and photos, up to 10 MB, end-to-end encrypted: drag a file into the gossip window and press Enter, or `/file ~/Desktop/photo.png`.
- Photos show up as real pictures right inside the terminal, for you and for them.
- `/files` lists everything sent in a chat, and `/open` opens the newest one (or `/open 2`). Received files go to Downloads/gossip (change it with `gossip config files ~/somewhere`).
- Big files and files sent while you're away arrive in full the next time you open gossip. Every file is checked before it's saved, and gossip warns you about files that can run programs.
- The dashboard and call pages have Pebble as their tab icon, with a dot that shows if everything's fine.
- A tidier dashboard: a clearer map, shorter activity lines, and no empty rows.

## 0.6.0
- Calls: `/call maya` for voice, `/video maya` for video, also in the menu under "This chat". The call opens in your browser in gossip's own look, with mute, camera and screen sharing. Sound and video go straight between your computers, end-to-end encrypted.
- Answer with Enter (or `/answer`), turn it down with Esc (or `/decline`), end it with `/hangup`. Only people in your contacts can call you (`gossip config calls everyone` or `off` to change that).
- `/dashboard` opens a live page in your browser: every connection gossip makes, who is signed in as you (with a button to sign the others out), who can read each chat, security checks, your activity and calls.
- Update without leaving: `/update`, then `/restart` brings you straight back on the new version. Typing a command the shell way inside the chat (like `gossip update`) now just works.
- Pebble types along while you type and dances when you stop.

## 0.5.1
- Fixed Pebble not reacting to what you do. Pebble now also stays in the pose afterwards (typing, phone or dance) until something else happens.

## 0.5.0
- Change your username: `gossip rename newname`. Your chats, servers and contacts come with you, the people you talk to are switched over automatically, and nobody else can take your old name.
- `gossip mini`: a tiny chat for the corner of your screen while you work. Messages from every chat scroll by, and replies go to whoever wrote last. Tab picks someone else. Also in the menu as "Shrink to the corner".
- `gossip security`: checks the connection, anyone whose security key changed, and whether your account is open somewhere else.
- A warning the moment your account is opened in another place, and `gossip signout` to close the others.
- `gossip config security strict` refuses any connection that isn't encrypted.
- Messages through a gossip website arrive faster (it now checks about twice as often while you're chatting).
- The detailed Pebble now draws cleanly in macOS Terminal when the terminal reports its background colour; gossip falls back to the blocky one when it doesn't.

## 0.4.2
- A new blocky Pebble, drawn only with whole coloured squares, so no terminal can stripe it. macOS Terminal gets it automatically; choose yourself with `gossip config mascot.style blocky` or `smooth`.
- Fixed black notches around Pebble that 0.4.1 introduced in macOS Terminal.

## 0.4.1
- Fixed the thin stripes across Pebble in macOS Terminal: the penguin is now drawn so line spacing can't show through.

## 0.4.0
- Pebble is always around: every start opens with Pebble saying hello (any key skips it), and Pebble now lives at the bottom of the left column.
- Pebble reacts: picks up the phone when a message arrives, types when you type, dances when you send.
- Desktop pop-ups for new messages when you're away from the window (macOS and Linux). `gossip config notify preview` adds the message text, `off` stops them.
- A "new" line shows where the unread messages start when you open a chat.
- Emoji words: type `:fire:` or `:thumbsup:` and it's sent as the emoji (`gossip config emoji off` to stop).
- Actions: `/me waves` shows as "* dhruv waves".
- Fixed: the welcome penguin was hidden whenever you already had a chat open, and in short windows.
- Fixed: "Show older messages" in the full chat screen repeated messages you could already see.

## 0.3.0
- `gossip uninstall` (or `gossip delete`) removes gossip from your computer. It asks first, and lets you keep your account and messages.
- Update notes: `gossip changelog` shows what changed in each version and when this computer updated.
- Your People list now only holds people you added. Someone who messages you shows under "Others" until you've read it; nobody is put on your list for you.
- A server's owner can remove anyone, online or not, including people who were invited but haven't joined yet (Tab, Servers, Remove someone, "Someone not listed").
- Hand a server to another member: `gossip give maya gamedev`.
- Mute a chat: `gossip mute maya` (same command to unmute).
- Search your saved messages: `gossip find pizza`.
- Save a chat to a text file: `gossip export maya`.
- Installing: the `gossip` command now works in the same window when it can, and the installer says exactly what to do when it can't.
- The penguin no longer shows thin gaps between its lines in macOS Terminal.

## 0.2.1
- The gossip website at djp7.pythonanywhere.com is the default place to chat.

## 0.2.0
- A full chat screen: chats on the left, the conversation on the right, arrow keys, mouse and a Tab menu.
- The same menu in the classic scrolling look.
- The install website can pass messages along, so friends don't need a relay address.
- `gossip nearby`: chat with people on the same Wi-Fi or cable, with no internet.
- gossip updates itself.

## 0.1.0
- First version: end-to-end encrypted direct messages and servers, contacts, themes, Pebble the penguin.
