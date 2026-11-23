# Changelog

## 1.0.0

- Dice: an operating system for the Raspberry Pi 5 and 4, built on Raspberry Pi OS Lite (64-bit), with DiceWeb as its desktop.
- Set it up on the website first (your name, password, Wi-Fi, time zone, keyboard, look, world, screen, apps, SSH and updates) and save it as dice.json. Drop that onto the card's bootfs drive, or onto a USB stick, and Dice sets itself up on the first start, then wipes the passwords out of the file.
- A ready-made image (dice-arm64.img.xz) to write onto a microSD card or an NVMe drive with Raspberry Pi Imager, built by GitHub Actions from the newest Raspberry Pi OS Lite.
- A one-line install for a Pi that already runs Raspberry Pi OS, with an optional setup code from the website.
- diced, the system helper: real Wi-Fi, speaker volume, screen brightness, files (your home folder and USB sticks), a real Terminal, the web browser, power and updates. It only answers the Pi itself, and only with the secret it gave the desktop.
- A boot splash: a pixel die whose dots light up as the Pi starts.
