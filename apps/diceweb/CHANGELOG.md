# Changelog

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
