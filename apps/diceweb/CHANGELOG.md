# Changelog

## 2.1.0

- Deuce, Dice's voice assistant (two pips, like the deuce on a die):
  - Hold the microphone button on the air mouse and talk; let go and it does it. Or press the two dots at the top of DiceTV, or type to it in Search ("Ask Deuce").
  - "Put on the Knicks game": it finds the game on ESPN's scoreboard, which channel has it (MSG for the Knicks at home), the way you can watch that channel (DAZN for MSG, your antenna for ABC, your live TV service…), and opens it after 3 seconds. Back stops it. If it's later, it says when and can remind you 5 minutes before. "What's the score of the Rangers game?" just tells you.
  - Also: "put on MSG", "channel 7", "open Netflix", "play lofi on YouTube", "play Stranger Things on Netflix", "switch to the PlayStation", "turn it up", "mute", "pause", "set a timer for 10 minutes", "wake me up at 7 on weekdays", "turn off in 30 minutes", "what's the weather tomorrow", "find my history essay", "turn off the TV".
  - Understanding what you said happens on the TV (no cloud AI). It talks back (you can turn that off in Settings, Deuce).
- TV channels on DiceTV's Home: ABC, CBS, NBC, FOX, PBS, MSG, MSG Sportsnet, YES, SNY, ESPN, FS1, TNT, NBA TV, NFL Network, MLB Network and more, each opened the real way:
  - free from an antenna, with a tuner on your network like an HDHomeRun (its channels show up as their own tiles, and DiceOS plays them full screen);
  - with your live TV service (YouTube TV, Hulu + Live TV, Fubo, DirecTV Stream, Sling, Optimum, Fios, Xfinity or Spectrum);
  - or in the channel's own app (MSG and YES on DAZN, ESPN in the ESPN app, FOX and FS1 on FOX One, NBC on Peacock, CBS on Paramount+, TNT on HBO Max).
  - TV setup picks your live TV service, the apps you pay for (tried first) and the antenna tuner. X on a channel shows the other ways.
- Inputs: DiceOS as a switch for everything on the TV's HDMI (through HDMI-CEC). Your PlayStation, Xbox and cable box show up; pick one and the TV switches to it, the remote's buttons go on to it, and Home comes back to DiceOS.
- Streaming services are apps now: on DiceOS, Netflix, YouTube, DAZN and the rest open full screen on their own (each signed in once, inside it), not in a browser window. Web apps from the Store do too, on the TV.
- Dice Cloud, like Dropbox but locked:
  - Older versions: putting in a file with the same name keeps the one before (for 30 days, up to 10). Go back to one, or save a copy of it.
  - Deleted files: taking a file out of Dice Cloud puts it in Deleted files for 30 days. Put it back, or delete it for good. They're in the Trash in Files too.
  - Stars, and Recent, Starred and Deleted in the Dice Cloud app.
  - On DiceOS, a Dice Cloud folder in your home folder kept the same both ways, and Pictures backed up into Dice Cloud. It stops and asks if lots of files vanish at once.
  - Your own server: keep your files on a Dice Cloud PC (or any computer running the Dice Cloud server) for as much room as its disk has. Your files move across, still locked, and every computer follows.
- Dice Cloud PC (new): a computer of your own in the cloud. Rent one anywhere, run one line on it, and add it here: its desktop on the TV (in the browser, behind a password), all the room you want for Dice Cloud, and its games in DiceGaming.
- DiceGaming is for the desktop, and cloud first: Xbox Cloud Gaming, GeForce NOW, Amazon Luna and your Dice Cloud PC, with no gaming PC needed. Your own gaming PC is still there, folded away. It's off DiceTV's Home.
- The remote's Back, Home and microphone buttons work on DiceOS (Back held goes Home; Home held opens Quick access).
- Turn off is like a TV now: the screen and the TV go off, and the remote's power button brings DiceOS back. Shutting down completely says how to turn it back on.
- "Press any button to skip" works with the air mouse's OK, and Home starts at the top.
- When DiceOS updates underneath it, the screen picks up the new one by itself.

## 2.0.0

- Dice Cloud keeps your files now: photos, songs, videos and documents, on every computer and TV that shares your Dice Cloud.
  - Each file is cut into 4 MB parts, and each part is locked on your computer, with a key made just for that file, before it leaves. The website only has numbered, scrambled parts.
  - In Files, Dice Cloud is a place like any other: folders, renaming, dragging things in, saving them back to the computer.
  - The Dice Cloud app shows your newest files and how much room is left (100 MB each, to start).
  - Share one file with a link. The key is in the link, after the #, so the website still can't open it. The link works for a week, or until you stop sharing it.
  - On DiceTV: a Dice Cloud row on Home, your cloud photos in Photos, and "Photos in Dice Cloud" as a choice behind the clock.
  - A new Dice Cloud code takes your files with it.
- A real filesystem in the browser (the Dice disk). Photos, songs, videos and PDFs are kept as they are, in the browser's own database, and stay after you close the page. Small text files stay readable by Terminal, Notes and Code, as before.
- Files, rebuilt:
  - Icons or a list, with real thumbnails, a details panel and quick look (left and right go through the pictures).
  - Pick several, drag them onto a folder (or a place on the left) to move them; Alt copies.
  - Copy, cut and paste, rename in place (F2), Delete, Ctrl + A, search the folder or press Enter to look everywhere.
  - A right-click menu, and a Trash that puts things back where they were (on DiceOS too, the standard Linux Trash).
  - With a remote: A opens, X for more, B goes up.
- The Store has real apps:
  - On DiceOS, real Linux apps from Flathub: VLC, Kodi, GIMP, Krita, Blender, LibreOffice, Firefox, RetroArch, Minecraft's Prism Launcher, Steam and Discord on a PC, and thousands more. Search, categories, picks, install with a progress bar, open, remove.
  - They open on top of Dice; Home on the remote (or Super + Esc) closes them and Dice is back.
  - Web apps, everywhere: any website as an app, with its own icon and window. A few good ones to start.
  - Your apps show on DiceTV's Home and in the start menu.
- DiceGaming (new):
  - Play the games on your gaming PC on the TV, streamed over your home network. The PC runs Sunshine and DiceOS runs Moonlight (both free; DiceGaming installs Moonlight for you).
  - Add the PC, pair it with a 4-number PIN, pick a game, pick the picture (720p to 4K) and frames a second. Home on the remote ends it.
  - Xbox Cloud Gaming, GeForce NOW and Amazon Luna open in their own windows (each needs its own account).
  - A Play row on DiceTV's Home.
- The emulator on the website pretends all of this too: a few Flathub apps, a gaming PC with games.

## 1.9.0

- DiceTV's ground is back, as ground: a strip of your world's grass and soil (sand at the beach, snow in the snow, stone in the city) runs under the apps, and the rows start below it on their own frosted glass, so the rows never sit on dirt.
- Opening an app looks better: the app grows out of its own block, its icon stays its own size in the middle, and nothing stretches.
- Little animations, kept small and quick:
  - Buttons dip a little when pressed.
  - Home's blocks settle in one after another.
  - A card on the clock column fades when what it says really changes.
  - Channels dip like a TV changing channel.
  - The on-screen keyboard, the Dice Bar, the emoji picker and pictures in picture slide in.
  - Dice Cloud's sync button turns while it syncs.
  - A wrong PIN gives a little shake.
  None of them bounce up and down. All of them stop with Settings, Look, Less motion, or when the computer asks for less motion.
- New on DiceTV:
  - Picture in picture: go Home while a news channel plays, and it keeps playing in a corner. Pick it to go back to it full screen.
  - Picture off: a black screen while the sound goes on, for the news or the radio while you do something else. It's in Quick settings and search; any button brings the picture back.
  - Last channel: yellow on a remote (Y on a controller) jumps back to the channel you were just on.
  - The Live tile you're on plays, as a little preview of the channel.
  - Lock is in search and, on DiceOS, in Quick settings.
- New on the desktop:
  - A lock screen: Super + L, Lock in the power menu, or Lock in the Dice Bar. Give it a PIN in Settings, You (4 to 8 numbers; type it, or pick the numbers with a remote). Without a PIN, any key opens it. It can lock itself after sleep too.
  - Emoji and symbols: Super + . (or Ctrl + Alt + .) opens a picker that puts what you pick where you were typing. Search it by name. In the Dice Bar, type ":heart" or ":fire".
  - The Dice Bar finds your files by name, and opens them in the right app. On DiceOS it looks through your real Home folder.

## 1.8.0

- DiceTV has a look of its own now, instead of rows of tiles like every other TV:
  - Your world fills the whole screen.
  - The time and today (weather, what's due, music, the sleep timer, the next alarm) run down a glass column on the left.
  - Your apps stand in the world as solid little blocks.
  - Below them, on frosted glass over your world, are the rows: Live, News and Watch, each with its name on the left.
  - What's picked gets a pixel-art frame that moves to it, like a game's menu.
  - The Library uses the same blocks.
- News channels: ABC News Live, NBC News NOW, CBS News 24/7, BBC News, Sky News, DW News, France 24, Al Jazeera English and Bloomberg Television.
  - Each is that channel's own round-the-clock live stream, in YouTube's own player.
  - They're on a News row on Home and in Channels after the pictures, numbered 22 and up, so CH + and −, the numbers and the guide work as for any channel.
  - Play and pause on a remote pause the news. Add any other YouTube channel that streams live (your local news, say) by its channel ID, and Dice Cloud shares the ones you add.
- Watch tiles show each site's own icon on its colour, with a soft glow of it behind. The icons are fetched from the internet; with no internet, the tiles show letters. HBO Max, Hulu and Tubi are there too, and adding one offers Apple TV, Peacock, Paramount+, Crunchyroll, Pluto TV and YouTube Music before "Something else".
- The on-screen keyboard comes up on DiceTV whenever you pick a box to type in, with a remote, an air mouse or a controller. Start typing on a real keyboard (like the one on the back of an air mouse) and it gets out of the way, keeping what you typed, and stays away while you use the keyboard.

## 1.7.0

- Dice Cloud, much more of it:
  - It has its own app: your computers, Dice Drop, what's shared, how much room it takes, older versions, what happened lately and your code.
  - It syncs item by item now. Each note, each Axiom task and class, and each study day is its own item, so a change on the TV and a different change on the laptop both survive. Deleting is a change too.
  - It never loses a change when two computers save at once: the website only takes a save made on top of the version that computer saw, and otherwise it looks again first.
  - Dice Drop: send a link or a note to another computer. Use Dice Cloud, SereneTab's menu ("Send to…") or the Dice Bar ("send example.com"). On DiceTV it pops up as it arrives and opens in SereneTab.
  - Add a computer with a short code. The TV shows 8 letters, and you type them on a computer that already has Dice Cloud: no typing 20 letters with a remote.
  - Your computers are listed with when each was last seen. Rename this one, take one out, or make a new code so a lost computer can't get back in.
  - Older versions: the website keeps the last 5, and you can see what each had and go back to one.
  - It checks for news every 20 seconds (cheaply: "nothing new" is a tiny answer) and syncs a few seconds after anything changes.
  - It now also shares the Watch list, your desktop widgets and sticky notes, and your picture. Any part can be turned off.
- Air mice, like the iPazzPort remote with a keyboard on the back:
  - A big pointer on DiceTV that hides when it's still.
  - Resting the pointer near the end of a row (or the top or bottom of the screen) scrolls it, since air mice have no wheel.
  - The right button goes back on DiceTV, and so do a mouse's own back and forward buttons.
  - F3 and Search open search. The power button sleeps DiceOS, or asks first (Sleep, Turn the TV off, Restart, Shut down), or does nothing.
  - The zoom keys fit the picture to the TV for TVs that cut off the edges (also in Settings, Remotes). On DiceOS they no longer blow the screen up.
  - Settings, TV remote is now Remotes, with an Air mouse part. The keyboard shortcuts sheet lists the air mouse's buttons.
- The fireplace is properly pixelated: the flames are big blocks in a few flat colours, like an old game, moving at a steady 16 steps a second, with chunky logs, a glowing bed of embers and sparks.
- Alarms, in Clock and on DiceTV's Today row. Pick the time and the days, and what wakes you: a chime, Dice Radio, or the fireplace with Dice Radio. DiceOS wakes and turns the TV on through the HDMI cable. OK snoozes for 9 minutes and Back stops it.
- The ambient screen can show your world, a channel (fireplace, aquarium, northern lights, space) or just the clock on black, which is kindest to OLED TVs. Set it in Settings, Look, where "Try it now" shows it.
- Code: a code editor for your own files.
  - Your folders down the side and a tab for each file, with line numbers.
  - Colours for JavaScript, Python, HTML, CSS, JSON, shell and Markdown.
  - Auto-indent, Tab and Shift+Tab, Ctrl+/ to comment lines, and find with Ctrl+F.
  - Run shows web pages, JavaScript (with what it logs) and Markdown beside the code, sealed off from the rest of DiceOS.
  - It uses your real files on DiceOS, and opens ~/code first if there is one.

## 1.6.0

- Numbers read clearly everywhere: the digits (clocks, temperatures, channel numbers) come from a small plain font set in front of the pixel one, so 2, 5 and 6 no longer look like letters.
- TV remotes work. Back, Home, Info, Guide, the four colours (red Channels, green Axiom, yellow Weather, blue Quick settings), channel up and down, play and pause, volume and the numbers all do something, from TV remotes, media keyboards and air mice. Buttons can show as a TV remote's in Settings, TV remote. On DiceOS the TV's own remote works through the HDMI cable (HDMI-CEC), passed on by diced.
- An on-screen keyboard comes up when you type with a remote or a controller (OK on a box to type in; X deletes, Y is a space).
- A little bar shows the volume, the channel or the song when they change.
- Channels: live pictures to leave on, made as they play. A fireplace, an aquarium, rain on a window, the northern lights, deep space, every world and every city, 21 in all. Up and down or CH + and − change channel, the numbers jump straight to one, OK shows the guide.
- DiceTV's Home gets a Live row of channels playing in little tiles; the numbers on a remote tune them.
- Weather: now, the next 12 hours and 7 days, with rain or snow falling behind it.
- Photos: your pictures and screenshots big, with a slow slideshow; postcards from the worlds so it's never empty.
- Sketch: pixel art with a pencil, fill, eraser and picker, by mouse, finger, controller or remote.
- Axiom on DiceTV is a TV guide for school: this week's classes laid out like channels with a line for right now, what's due as big cards (OK ticks one off), tests coming up, and study sessions with a big timer over a fireplace, rain or the sea (with Dice Radio if you like). Classes can have times now (days, from, to, room), on the desktop too. A class starting in five minutes and what's due tomorrow come up as reminders. Adding a task is one question at a time, made for a remote.
- The desktop: drag a window to an edge or a corner to snap it, or hold the pointer on maximise for layouts (halves, thirds, quarters). Four desktops (Ctrl + Alt + ← → or 1 to 4). Overview of every window (Super, F3 or the top-left corner). Alt + Tab. The Dice Bar (Ctrl + Space): apps, settings, sums, "5 km in miles", "timer 10", "todo read chapter 7 friday" straight into Axiom, open windows and web searches. Widgets on the desktop: a clock, the weather, Axiom, music, sticky notes and the computer. Clipboard history (Super + V). Right-click a window's title (keep on top, move to another desktop) or the desktop (widgets, the next world).
- Settings has Desktop and TV remote sections; the keyboard shortcuts sheet lists the desktop's and the remote's buttons too.
- A remote's colour buttons switch DiceTV straight to their app, without asking first.

## 1.5.0

- DiceTV's Home has two new rows under your apps. Today: the time and date, the weather where you are, what's due in Axiom, what's playing (press to play or pause) and the sleep timer. Watch: YouTube, Netflix, Disney+, Prime Video, Twitch and Spotify as plain letters on a colour (nobody's logo), opening in the real browser; add your own site, or a media box at home like Plex or Jellyfin, and press X to take one off.
- The ambient screen: leave DiceTV alone on Home for 10 minutes (or 5 or 30, or never, in Settings, Look) and a big clock comes up over your world, with the date, the weather and what's playing. Any key, button or touch brings DiceTV back without doing anything else.
- A sleep timer (15, 30, 60 or 90 minutes; then the music stops and the screen sleeps), shown in the top bar while it counts down.
- Night light: a warmer screen in the evening, at night only or always, with how warm it is up to you.
- Do not disturb: notifications wait in the list without popping up or chiming. Timers still ring.
- Back up everything to one file, and put a backup back, in Settings, Storage. Your Dice Cloud code stays out.
- Keyboard shortcuts: Ctrl + / (or ?) shows them all, for the desktop, DiceTV, SereneTab and Terminal.
- On DiceOS: Bluetooth in Settings and Quick settings (pair controllers, headphones and speakers; connect, disconnect, forget), and screenshots (Print Screen, or the button in Quick settings) saved to Pictures/Screenshots.
- Taken off DiceTV because they didn't do much on a TV: Friends (the top bar button, the Quick access tab and their search results), the Performance tab (it's still in Settings), the Store and the "For your computer" row (the apps you install on another computer are on the desktop and the website). Library is one list, A to Z.
- Fixed: opening Settings at another section while Settings was already open stayed on the first one. The emulator's volume slider showed empty.

## 1.4.0

- The Dice family. DiceOS is the operating system; with it come DiceWeb (this, in a browser tab), DiceTV (Big screen's new name), Dice Home, Dice Cloud and the Dice Emulator, each with its own mark (the logo die inside a window, a TV, a house, a cloud, a screen).
- Dice Home, for a screen on the wall: a big clock and the date, the weather, the day's Axiom tasks, and buttons for Home Assistant lights, switches, fans and scenes (on DiceOS, through its helper, which keeps the token). It moves a few pixels each minute so the screen doesn't burn in. Open it from the app grid, the menu, or start in it.
- Dice Cloud: notes, Axiom, SereneTab's shortcuts and a few settings stay the same on every computer. Everything is locked with your Dice Cloud code (AES-GCM) on your computer before it goes to the website. Settings, Dice Cloud.
- On a computer running it, it calls itself DiceOS (the start-up word, the welcome, About, the menu); in a browser tab it's DiceWeb.
- SereneTab: suggestions under the address bar as you type (your shortcuts, sites you've been to, or a search), History (Ctrl+H, from the new ⋯ menu), reopen a closed tab (Ctrl+Shift+T), a focus timer on the glass clock (click it for 25 minutes; the ring fills as you go), and Axiom's tasks for today on the new tab page. The shortcut cubes, site tiles, buttons and menus are liquid glass now, like the rest.
- Games is gone.
- Links can open DiceWeb in a place: ?start=tv, ?start=home or ?open=settings:cloud.

## 1.3.0

- Sharper graphics. The backgrounds have about twice the detail, with smooth skies and a soft sun glow instead of dotted ones, and no fine speckle on the land. The covers on Big screen are plain, with no dot pattern.
- A new logo die: drawn flat in the classic isometric view, pixel by pixel, so it reads at 16 pixels (the tab icon, the dock, the Big screen button). The start-up die now lands in the same pose.
- SereneTab replaces Web. It's a proper browser now: tabs, back and forward, an address bar that searches with the engine you pick, and a new tab page in liquid glass over a pixel skyline (New York, London, Santorini or Dubai) under that city's real sun, moon and weather. A glass clock, the weather where you are (Open-Meteo), your shortcuts as a lattice of little cubes, and a note.
- Axiom replaces Calendar: classes, tasks by class, a Today page, a calendar with a dot per class, notes and reminders, in Axiom's Dawn and Calm looks. Anything you had on the Calendar moves across as tasks.
- Games: Algebra Dash, Ball and Wall, Neon Voids and Pixel Lander from dpatel.dev, each in its own window.
- Hovering no longer lifts things up; focus on Big screen grows a little instead.

## 1.2.0

- New backgrounds: each world is now a detailed, calm landscape with nobody in it (no mascots), drawn in layers with depth and light. Small things move: clouds drift, water reflects and shimmers, grass and reeds sway, a windmill turns, snow, leaves and petals fall, fireflies blink at night, and the ice world has an aurora. The same landscape is behind the desktop and Big screen (js/scape.js).
- Cleaner, like Ubuntu: lots comes built in but stays out of the way. The desktop has just your Home folder. The dock is smaller and holds your favourites, and every app is in a full-screen grid behind the button at its left. The clock corner is smaller and on one line. Nothing pops up by itself (friends' pop-ups are off).
- Clean flat icons for the built-in apps, and clean covers for them on Big screen.
- New built-in apps: Calculator, Calendar, Clock (world clocks, timer, stopwatch) and System Monitor (real numbers on Dice).
- Big screen's Home is shorter: your apps, then the apps for your computer.
- On small screens, like the Pi's 7 inch one, the dock moves left so it never runs into the clock.
- js/emu.js: a pretend computer for the Dice emulator on the website. It does nothing unless the emulator opens DiceWeb.

## 1.1.0

- The die is new: a black die with rounded edges and white dots, drawn in 3D and turned into pixel art. It's the logo, the tab icon, the start-up animation (it tumbles in and lands), the icons, and it floats over the worlds and bounces along the desktop.
- DiceWeb now opens on the Desktop. Gaming Mode is now called Big screen.
- Less like a games console: Roll and Bumble's Flight are gone, and so are achievements and levels. Controller buttons are shown by where they are, not as coloured letters. Focused covers get a plain ring instead of a coloured glow and shine.
- Saved settings from 1.0 move across: if DiceWeb used to open in Gaming Mode, it now opens on the Desktop.

## 1.0.0

- DiceWeb: a whole console in your browser. Gaming Mode feels like a Steam Deck: a living pixel world behind Home that changes with whatever you look at, big covers, a menu on the left (M) and Quick access on the right (Q), search (/), and it all works with the keyboard, a controller, the mouse or touch.
- Built-in apps: Roll (the dice game Pig, against any of the friends), Bumble's Flight, Music (Dice Radio writes little chiptune songs as it plays, and you can add your own), Terminal (with a pretend disk), Notes, Files, Web, Store and Settings.
- Desktop mode: windows you can drag, resize and stack, a glass shelf, a launcher, and the friends wandering across the wallpaper. Pick its world in Settings, Look.
- Achievements, friends (the mascots) who say hi and play Roll with you, notifications, a performance overlay, sleep and restart, and day and night that follow the sun.
- On a Raspberry Pi it becomes Dice: the Terminal, Files, Wi-Fi, sound, brightness and power are real.
