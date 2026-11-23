# Changelog

## 1.12.0
- **Delete everything:** `pca delete-everything` (or **X** in pca) removes every app from here, everything they saved, and every trace they left on this computer, and then pca itself. First each app's own uninstall runs (so shoo's certificate, the menu-bar helpers and background services are undone properly), then pca sweeps their folders, commands, background services, Mac app wrappers, magpie's Quick Action, macOS's settings and caches for them, the lines the installers added to your shell's start-up files, the commands in your Terminal history that mention them, and their temporary files. It shows the whole list (with sizes, and a warning about locket's password vault) and only goes ahead when you type `delete everything`. Nothing that isn't theirs is touched.

## 1.11.0
- **Light or dark for every app**: press **L** to switch between light, dark and following your Mac. pca itself, every app's window and side panel, and the apps with their own colours (gossip, Tree of Thought, tidy, roomy, den) all follow it. Or: `pca look light`, `pca look dark`, `pca look auto`.
- locket's armadillo is now called Bastion.

## 1.10.0
- New: **hum** (Bumble the bumblebee): your music in a little panel at the side of the screen. Your own music files and YouTube links (played in YouTube's own player), playlists, a queue, shuffle, a sleep timer and an equalizer. Mac first.
- New: **usual** (Rocco the raccoon): order the usual. Keeps your details, who you're ordering for and your regular orders, prints each as a receipt with who owes what, and helps you order it online, by phone or by email.
- New: **locket** (Dilly the armadillo): a password manager that's easy to use. One master password, Touch ID, a password maker, 2-step codes, and a check-up for weak, reused and leaked passwords.

## 1.9.1
- When an app stops with a problem, or finishes so fast you couldn't read it, pca now keeps it on screen until you press Enter, instead of jumping straight back with "Back from …".

## 1.9.0
- New: **magpie** (Pica the magpie): remembers everything you copy. Press ⌃⌥V in any app, type a word, and something you copied earlier is back on your clipboard. Skips passwords. Mac only.
- New: **medic** (Lotl the axolotl): a checkup for your Mac. Why it's slow, hot or low on battery, in plain words, with safe fixes, and a battery diary that finds what drains it. Mac only.
- New: **flash** (Blink the firefly): study cards that come back just before you'd forget them. Give it your test date and it plans your days. Flip, pick one of four, type it, or the match game; cards pasted from anywhere or made by AI from your notes.

## 1.8.0
- New: **shoo** (Bramble the hedgehog): blocks ads on your whole Mac. Google's full-page ads, banners, pop-ups and trackers in every browser and app, and the ads on YouTube. It asks an administrator first and won't change a Mac a school manages.

## 1.7.0
- New: **morph** (Luma the jellyfish): convert any file to any other, right on your computer: about 2,000 conversions between 127 formats, plus PDF tools. It opens in its own window. morph needs Python 3; the first start sets it up and takes a few minutes.

## 1.6.0
- Three new projects, each with its own mascot:
  - **scout** (Pip the owl): ask anything; it searches the web, reads the best pages and explains what it found, with links to every source.
  - **roomy** (Shelly the hermit crab): makes room on your disk, safely: old installers, caches and build leftovers go to the Trash, and u puts them back.
  - **hey** (Biscuit the dog): say what you want to do in plain words and get the terminal command, explained, with how risky it is. Enter runs it.

## 1.5.0
- Fixed: keys sometimes went missing in an app opened from pca (Enter in tidy did nothing). When pca updated itself in the background while an app was open, the new pca started reading the keyboard too. Now pca waits until you leave the app before restarting, and never updates an app while you're using it.

## 1.4.0
- pca updates itself first: when there's a newer pca, it installs it and starts the new one before the menu opens. It now checks GitHub as well as the website and takes whichever is newer, so it keeps up even when the website is behind or blocked.
- Clean pictures in macOS Terminal: the mascots are drawn with whole cells there (no more thin stripes), smaller and tidier, and the names under them line up. `TUI_PIXELS=smooth` brings back the detailed ones.

## 1.3.0
- den joins the family: a cozy code editor that opens in your browser, with Ember the fox explaining things (her card is the orange one). Enter installs and opens it in the folder you're in.
- Cards wrap into rows when the window is narrow, and the mascots only show when there's room, so every card is always on screen.

## 1.2.1
- Installing and updating fall back to GitHub when the website doesn't answer (blocked at school, offline, or not updated yet: that was the 404 when installing tidy). The installer is downloaded in full before it runs.

## 1.2.0
- tidy joins the family: an AI that tidies a folder for you (Hazel the squirrel's card). Enter installs and opens it.
- w shows what's new in the chosen project.

## 1.1.0
- pca keeps everything up to date by itself: when it starts it checks the website's /versions.json (at most once an hour) and quietly updates whatever is behind, itself included. Cards show ↻ while updating and ↑ when an update is waiting.
- `pca tot` (and the others) update that project before opening it.
- `pca auto on|off` and `pca auto daily` (a daily update even when pca isn't open: launchd on Mac, cron on Linux, a scheduled task on Windows).
- Pixel art no longer shows seams in macOS Terminal.

## 1.0.0

- First release: a picker for gossip, Tree of Thought and pigeon, each with its mascot.
- Enter opens a project, and installs it first if it isn't on this computer yet.
- `u` updates the chosen project, `U` updates everything installed, `x x` uninstalls one.
- `pca gossip`, `pca tot` and `pca pigeon` jump straight in; anything after the name is passed along.
- `pca list`, `pca install`, `pca update`, `pca remove`, `pca uninstall`.
- Installs come from the same website pca came from, so a self-hosted site keeps working.
