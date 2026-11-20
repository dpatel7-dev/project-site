# Changelog

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
