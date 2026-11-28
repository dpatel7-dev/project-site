# Changelog

## 2.4.0

- Deuce's brain: diced sets up Ollama (from ollama.com, as a service listening only on 127.0.0.1, one model loaded at a time) with `bin/dice-brain`, picks a Qwen 3.5 model for the computer (2B to 35B, by memory, graphics card and whether it's a Pi), fetches it with progress, and keeps it loaded. `/api/brain` shows and changes it; `/api/brain/chat` passes Deuce's conversation and tools to the model and streams the answer back. Uninstalling DiceOS takes it away too.
- `/api/search` and `/api/read`, for Deuce's brain to look things up. Reading refuses addresses on this computer or your network.
- zstd is installed (Ollama's download is packed with it).
- DiceWeb 2.4.0: Deuce's brain, a desktop that looks like DiceTV with a Mac's way of working, and more Deuce knows without the brain.

## 2.3.0

- Shield: blocks ads and trackers for the whole computer through a block in /etc/hosts (a list of about 360 built in, and StevenBlack's list once a week), and inside SereneTab with its own extension (`shield/`, Manifest V3, declarativeNetRequest), which also cleans up YouTube's ads. `/api/shield` shows what it kept out and turns it on, off, or off for a site.
- SereneTab is the browser for everything: `dice-open` (and `x-www-browser`, `BROWSER`, mimeapps.list) opens every link in it, inside DiceOS when the desktop is running. Chromium windows get Shield and the SereneTab look, and the new tab page is SereneTab's.
- Deuce answers questions (`/api/ask`): it searches the web, reads the best pages and explains them, with its sources. An AI of your own can be added in Settings, Deuce (the key stays in a file only root can read).
- Traced mode's start-up splash: `plymouth/dice-traced/`, DiceWeb's hills painted by hand in pixels, made by `tools/make-splash.js` without a browser. It replaces the Heavenly one; a dice.json or settings saying `"looks": "heaven"` gets Traced mode, and the old theme is taken away.
- Restarting, shutting down and updating say so on the start-up splash.
- DiceWeb 2.3.0: Traced mode, a desktop more like a Mac, nine more widgets, Deuce on a PC, Modes and Routines, the Inputs guide, and a restart screen.

## 2.2.0

- Inputs on a PC: a screen's other inputs over DDC/CI (`ddcutil`, VCP 60), with what DiceOS was on remembered so it comes back. `/api/kvm` lists the TV's HDMI-CEC devices and the screens' inputs together; POST switches a screen or comes back. ddcutil and the i2c-dev driver are installed with DiceOS and by dice-update.
- This computer: `/api/device` shows and changes the computer's name, time zone, keyboard, Wi-Fi country, SSH and automatic updates, using dice-boot's own apply(), and takes a whole dice.json from Settings.
- `dice-boot --apply file.json` uses a dice.json any time, from Terminal.
- SSH can be turned on after install once a password of your own is set (DiceOS remembers that it was).
- dice.json keeps the new choices for DiceWeb: looks (Heavenly, now Traced mode), accent, text, clock, units, sounds, nightlight, motion, ambient, deuce, tv and desk.
- DiceWeb 2.2.0.

## 2.1.0

- Deuce's ears and voice: diced runs `dice-listen` (Vosk, offline, with a small English model, set up from Settings) while the remote's microphone button is held, and sends what it hears to DiceWeb. It says answers out loud with speech-dispatcher or espeak-ng, even with an app on top.
- The air mouse's Back, Home and microphone buttons, read straight from the remote; the microphone button can be taught in Settings for remotes that send something else.
- HDMI-CEC: the devices on the TV's other inputs (/api/cec/devices), switching the TV to one, passing the remote's buttons on to it, and coming back. The TV's own power changes are followed too.
- Standby: Turn off puts the screen (wlopm) and the TV to sleep, and the remote brings them back, so a Pi never needs its own button.
- Antenna channels: a tuner on your network (HDHomeRun) lists its channels (/api/tuner, local addresses only) and DiceOS plays them full screen with mpv (or VLC).
- Streaming services open as full-screen apps, each in its own profile, and Home closes them. libwidevinecdm0 is installed so the ones that protect their videos can play.
- `/api/lookup` fetches ESPN's public scoreboard for Deuce. Nothing else.
- Dice Cloud's folder: `/api/files/tree`, and writes that make their folders and keep a file's time.
- `dice-update` checks GitHub as well as the website and takes the newer, and installs the new helpers. The screen reloads itself after an update.
- cloudpc/: the Dice Cloud PC kit for a computer in the cloud: `dice-cloud-server` (keeps Dice Cloud's locked parts, with a key) and `install.sh` (HTTPS with Caddy at an sslip.io name, an optional Xfce desktop through noVNC behind a password, and Sunshine for games).
- DiceWeb 2.1.0.

## 2.0.0

- Real apps: diced installs Linux apps from Flathub with Flatpak (for everyone on the computer), shows their progress, opens them, and removes them. It reads Flatpak's own copy of Flathub's list, so searching works without asking a website each time. New installs get Flatpak, Flathub and Xwayland; older ones can get them from the Store with one button. `dice-update` updates the apps too.
- Apps (and websites opened from Dice) open on top of Dice. Home on a remote (the HDMI one or the air mouse) or Super + Esc on a keyboard closes the one on top, and Dice is back.
- DiceGaming: diced talks to Moonlight to pair with a gaming PC running Sunshine, list its games, start one (720p to 4K, 30 to 120 frames a second) and stop it.
- Files: a proper Trash (the standard Linux one, with notes of where things came from, so they can go back), moving, copying next to itself, emptying the Trash, and how much room is left.
- DiceWeb 2.0: Dice Cloud files, the new Files, the Store with real apps and web apps, and DiceGaming.

## 1.9.0

- diced can find files by name in your Home folder (/api/find), for the Dice Bar. It skips hidden folders and big ones like node_modules, and stops after a few thousand files so it's always quick.
- DiceWeb 1.9:
  - DiceTV's ground is a strip of your world's grass and soil under the apps, with the rows below it on frosted glass.
  - Apps open from their own block, with the icon kept its own size.
  - Small, quiet animations everywhere, all gone with Less motion.
  - Picture in picture for the news, Picture off (just the sound) and Last channel on the yellow button.
  - A lock screen with a PIN (Super + L), an emoji picker (Super + .) and files in the Dice Bar.

## 1.8.0

- DiceWeb 1.8:
  - DiceTV has its own look: your world full screen, a clock-first column, apps as blocks, and the rows on frosted glass, with a pixel-art frame on what's picked.
  - News channels (ABC, NBC, CBS, BBC, Sky, DW, France 24, Al Jazeera, Bloomberg), as their own live streams in YouTube's player.
  - Watch tiles with each site's own icon.
  - An on-screen keyboard that steps aside when you type on a real one.

## 1.7.0

- Air mice (like the iPazzPort remote with a keyboard on the back) and media keyboards. Their power button no longer switches the whole computer off:
  - logind is told to ignore a quick press (system/logind-dice.conf, put in /etc/systemd/logind.conf.d/). Holding it for 5 seconds still shuts down.
  - diced watches every keyboard-like device that has a power or sleep key (/dev/input) and passes the press to the desktop. There it sleeps DiceOS, asks first, or does nothing (Settings, Remotes).
  - The Raspberry Pi 5's own power button now sleeps DiceOS too.
  - Computers that get 1.7 as an update get the rule too: diced puts it in place when it starts.
- Chromium leaves the media keys (play, pause, next) to DiceOS instead of keeping them for itself, so they work everywhere.
- diced reports DiceOS's real version (it always said 1.0.0).
- DiceWeb 1.7:
  - Dice Cloud syncs item by item and never loses a change when two computers save at once. Its new app lists your computers, sends links to the TV (Dice Drop), adds a TV with a short code and goes back to older versions.
  - Air mouse support, and a pixelated fireplace.
  - Alarms that wake the TV through the HDMI cable.
  - A choice of what's behind the ambient clock.
  - Code, a code editor for your files.

## 1.6.0

- Your TV's own remote works, through the HDMI cable (HDMI-CEC). diced keeps cec-client (from libcec, what Kodi uses) running when there's a CEC port and passes each press to the desktop (/api/events, a stream only the desktop can open). DiceOS can turn the TV on and switch it to DiceOS when it starts, turn it off when DiceOS sleeps, and send the volume buttons to the TV (/api/remote; Settings, TV remote). cec-utils is installed with DiceOS. Remotes that plug in by USB or pair by Bluetooth work too.
- DiceWeb 1.6: TV remote buttons everywhere and an on-screen keyboard; clear numbers; Channels, Weather, Photos and Sketch; DiceTV's Live row; Axiom as a TV guide with study sessions; and on the desktop: snapping and layouts, four desktops, an overview, Alt + Tab, the Dice Bar (Ctrl + Space), widgets and clipboard history.
- Photos shows Pictures, Pictures/Screenshots and Pictures/Sketches; Sketch saves into Pictures/Sketches.

## 1.5.0

- Fixed the PC image stopping on "authentication error" instead of showing the desktop. The desktop borrowed the "login" sign-in rules, which also check the account, and that check failed for the live system's user. It now has its own small rules file (/etc/pam.d/dice-session) that only opens the session, keeps trying if it ever stops, and waits for the live system to make its user.
- If the emulator test still doesn't see the desktop, it signs in on the second text screen and copies the start-up log out through the serial port (serial.log, attached to the run), and prints the parts about the desktop.
- Bluetooth: pair controllers, headphones and speakers, connect, disconnect and forget them, in Settings, Bluetooth (and a row in Quick settings). diced does it with bluetoothctl (/api/bluetooth; only real device addresses are taken). bluez is installed with DiceOS.
- Screenshots: Print Screen, or Screenshot in Quick settings, saves the screen to Pictures/Screenshots (diced runs grim as you; /api/screenshot). grim is installed with DiceOS.
- DiceWeb 1.5: DiceTV gets Today (the time, the weather, Axiom, what's playing, a sleep timer), Watch (your streaming sites, opening in Chromium over DiceOS) and an ambient clock when it's left alone; Night light, Do not disturb, backups and a keyboard shortcuts sheet everywhere. Friends, the Performance tab and the Store are gone from DiceTV.
- The Tests workflow passes again: test_boot no longer tries to write to /var/log.

## 1.4.0

- It's called DiceOS everywhere now: the start-up splash, the installer, the helper's messages, the desktop's welcome and About.
- DiceWeb 1.4, with the Dice family: DiceTV (Big screen's new name), Dice Home (a wall screen with a clock, weather, Axiom's tasks and Home Assistant buttons), Dice Cloud (notes, Axiom and shortcuts the same on every computer, locked with your code) and the Dice Emulator. SereneTab gets suggestions, History, reopen closed tab and a focus timer. Games is gone.
- diced talks to Home Assistant for Dice Home (/api/ha: only states and services). The token you give it is kept in its own file (ha-token, beside the settings, readable only by the helper) and never goes back to the page.
- DiceOS can start straight into Dice Home: "start": "home" in dice.json.
- Fixed the PC image: Debian 13's live-build only copies config/includes.chroot_after_packages, so DiceOS's files now go there.

## 1.3.0

- DiceWeb 1.3: sharper backgrounds, and a new logo die drawn flat in the isometric view (the start-up splash now lands in the same pose). SereneTab replaces Web: a real browser with tabs and a calm new tab page (a city skyline under its real sky and weather, a glass clock, shortcuts and a note); sites that won't show inside it open in Chromium on top of Dice, as before. Axiom, the school planner, replaces Calendar and keeps what was on it. Games has the games from dpatel.dev.
- tools/sync-diceweb.sh copies DiceWeb's games/ folder too.

## 1.2.0

- DiceWeb 1.2: calm, detailed moving landscapes with no mascots behind the desktop, a cleaner desktop (just Home, a small dock of favourites, all apps in a grid), smaller clock corner, and new built-in apps: Calculator, Calendar, Clock and System Monitor (which shows this computer's real load, memory, storage and temperature).
- Try Dice before installing it: the emulator on the website (djp7.pythonanywhere.com/dice/try) starts Dice with your settings on a pretend Pi or PC, and shows what dice-boot did with them.
- A new workflow, Test the images in an emulator, starts the PC image in QEMU after each build and keeps pictures of the screen (image/test-pc.sh).
- On the Pi's 7 inch screen the dock no longer runs into the clock.

## 1.1.0

- Dice runs on PCs too. dice-amd64.iso is a Debian 13 live system with Dice in it: write it to a USB stick, start the PC from it, and pick Install to keep it. Or run the same one-line install on a PC with Debian or Ubuntu.
- The new Dice die (black, rounded edges, white dots) everywhere, from DiceWeb 1.1. The start-up splash is the die turning slowly with a loading bar, drawn by tools/make-splash.js from the same code DiceWeb uses.
- dice-boot only looks for dice.json on USB sticks and other removable drives, never the computer's own disks, opens them read-only until it finds one, and leaves alone the stick Dice started from. A dice.json that couldn't be tidied away (a read-only stick) is remembered so it's only used once.
- Wi-Fi from dice.json works with any Wi-Fi card (PCs don't call theirs wlan0).
- About shows a PC's maker and model.
- DiceWeb 1.1: opens on the Desktop, no games or achievements, Big screen instead of Gaming Mode.

## 1.0.0

- Dice: an operating system for the Raspberry Pi 5 and 4, built on Raspberry Pi OS Lite (64-bit), with DiceWeb as its desktop.
- Set it up on the website first (your name, password, Wi-Fi, time zone, keyboard, look, world, screen, apps, SSH and updates) and save it as dice.json. Drop that onto the card's bootfs drive, or onto a USB stick, and Dice sets itself up on the first start, then wipes the passwords out of the file.
- A ready-made image (dice-arm64.img.xz) to write onto a microSD card or an NVMe drive with Raspberry Pi Imager, built by GitHub Actions from the newest Raspberry Pi OS Lite.
- A one-line install for a Pi that already runs Raspberry Pi OS, with an optional setup code from the website.
- diced, the system helper: real Wi-Fi, speaker volume, screen brightness, files (your home folder and USB sticks), a real Terminal, the web browser, power and updates. It only answers the Pi itself, and only with the secret it gave the desktop.
- A boot splash: a pixel die whose dots light up as the Pi starts.
