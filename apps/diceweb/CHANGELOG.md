# Changelog

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
