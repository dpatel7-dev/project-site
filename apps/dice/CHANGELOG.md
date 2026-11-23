# Changelog

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
