# project-site

The website for every project, in one place: **https://djp7.pythonanywhere.com**

| Address | What's there |
| --- | --- |
| `/` | the front door: two doors, Dice or the Terminal apps. "Made by Dhruv" goes to `/me` |
| `/dice/try` | the Dice Emulator: DiceOS with your settings on a pretend Pi or PC, in the browser |
| `/me` | Dhruv's own page: what he's made, the animals, and his GitHub |
| `/apps` | every Terminal app, and the one command that installs them all |
| `/dice` | [Dice](https://github.com/dpatel7-dev/DiceOS): set it up first, then put it on a Raspberry Pi (microSD card or NVMe drive) or a PC (USB stick) |
| `/diceweb/` | [DiceWeb](https://github.com/dpatel7-dev/DiceWeb), the same desktop, in your browser |
| `/dice/install.sh`, `/dice/dice.tar.gz` | Dice's installer, and Dice itself (with DiceWeb inside) for the installer and the updater |
| `/dice/setup` | where the DiceOS page saves a setup code (never a password); `/dice/setup/CODE.json` gets it back, for 30 days |
| `/dice/cloud/ID` | Dice Cloud's locked boxes (GET, PUT, DELETE). DiceOS and DiceWeb lock everything with the person's code before sending it, so this only ever keeps `{v, iv, ct}` it can't read. GET gives an ETag (and a tiny 304 when nothing changed); PUT with If-Match is turned back (412) if another computer saved first. Boxes nobody opens for a year are tidied away |
| `/dice/cloud/ID/history` | The last 5 versions of a box (at most one every 10 minutes), and `/history/N` for one of them |
| `/dice/cloud/pair/ID` | A tiny locked box for adding a computer with a short code; gone after 10 minutes |
| `/gossip` | [gossip](https://github.com/dpatel7-dev/gossip)'s page. Its chat hub keeps `/api`, `/install.sh`, `/install.ps1` and `/healthz`, so every gossip already installed keeps working |
| `/tot` | [Tree of Thought](https://github.com/dpatel7-dev/Tree-Of-Thought), plus `/tot/install.sh` and `/tot/install.ps1` |
| `/pigeon` | [pigeon](https://github.com/dpatel7-dev/pigeon)'s web app (open it on your phone), its file server and installers |
| `/tidy` | [tidy](https://github.com/dpatel7-dev/tidy), the AI that tidies folders, plus `/tidy/install.sh` and `/tidy/install.ps1` |
| `/den` | [den](https://github.com/dpatel7-dev/Den), the beginner-friendly code editor, plus `/den/install.sh` and `/den/install.ps1` |
| `/pca` | [Project CLI Access](https://github.com/dpatel7-dev/Project-CLI-Access), plus `/pca/install.sh` and `/pca/install.ps1` |
| `/versions.json` | the newest version of each project: pca checks it to keep everything up to date |

A dock along the bottom of every page links them together: each app's mascot
with its name under it, plus Home, All apps, Dice, Start here and What's new.
The front door and the Dice page have no dock: they're the way in. **All
apps** opens a sheet of every app that you can search by typing what you want
to do ("music", "passwords"). On this site's own pages you can just start
typing, and on the apps page the typing goes into the Terminal in the sky.
Day or night follows the time of day: night from sunset, day from sunrise
(the front page's world changes with it, and so do the mascots out in it). Or
pick **Day** or **Night** at the bottom of All apps.

## The "checking you're a person" screen

The first time someone opens a page in a browser, they see a short loading
screen (about a second): a black background with the section's mascot doing
something, while their browser solves a small puzzle. When it's solved, the
page they asked for opens, and they won't see the screen again for 30 days.

- Nobody signs in, and nothing is saved about them except one small cookie
  that says "passed".
- Installers (`curl ... | sh`), `/versions.json`, the chat hub and pigeon's
  apps never see it, so pca, gossip and pigeon keep working exactly as before.
- The secret that signs the cookie is made by itself in `~/site-data/check-secret`.
- To turn it off, put these two lines in the WSGI file just above
  `from site_app import application`, then Reload:

  ```python
  import os
  os.environ['SITE_CHECK'] = 'off'
  ```

It stops simple bots that scrape pages. It doesn't change what a school or
office web filter thinks of the site.

## Your data is not in this folder

gossip keeps its accounts and messages in `~/gossip-data`, and pigeon keeps its
locked files in `~/pigeon-data`. Both live **next to** this folder, not inside it,
so you can delete this folder (or the whole web app) and set it up again
without losing anything. Don't delete those two folders unless you mean to.

Settings go in those folders too:

- `~/gossip-data/config.json`: gossip's name, signups and TURN servers for calls (see gossip's docs/HOSTING.md)
- `~/pigeon-data/config.json`: for example `{"quota_mb": 300, "signups": "first"}`.
  With `"first"` (the default), the first nest made on the site is its owner, and only
  people the owner invites (`pigeon invite`, or Invite someone in the browser) can make more.

## Put it on PythonAnywhere (step by step)

You need a free PythonAnywhere account. Free accounts get one website, which is
why everything lives on this one.

**1. Remove the old website (only if you have one).**
Open the **Web** tab. Scroll to the bottom and click **Delete djp7.pythonanywhere.com**.
This only removes the website setting. Your files, including `gossip-data`, stay.

**2. Get this code.** Open the **Consoles** tab, start a **Bash** console, and paste:

```sh
cd ~
git clone https://github.com/dpatel7-dev/project-site.git
```

**3. Make the website.** Back on the **Web** tab:

1. Click **Add a new web app**, then **Next**.
2. Choose **Manual configuration** (not Flask, not Django).
3. Choose the newest **Python 3** version on the list, then **Next**.

**4. Point it at this code.** On the Web tab, find **Code**, and click the link
next to **WSGI configuration file**. Delete everything in that file, paste in
everything from [`pythonanywhere_wsgi.py`](pythonanywhere_wsgi.py), and click **Save**.

**5. Start it.** Back on the Web tab, click the big green **Reload** button.
Open https://djp7.pythonanywhere.com and you should see the three mascots.

**Free accounts expire after a month without a visit to the Web tab.**
Once a month, open the Web tab and click **Run until 1 month from today**.

## Update it

When any project changes, its copy here gets refreshed. To put the newest
version online, in a Bash console:

```sh
cd ~/project-site && git pull && touch /var/www/djp7_pythonanywhere_com_wsgi.py
```

The `touch` part does the same as the green **Reload** button on the Web tab:
PythonAnywhere keeps running the old program until the website is reloaded,
even after `git pull` has changed the files. (The site also notices by itself:
the first visit after a pull shows "This website was just updated and is
restarting" and reloads it. If that note stays for more than a minute, click
**Reload** on the Web tab.)

To check it worked, open `/versions.json` on the site: it should list the same
versions as the apps' GitHub pages. If `git pull` stops with *"Your local
changes would be overwritten"*, the copy on PythonAnywhere was changed by hand.
Throw those changes away and take GitHub's version (gossip's and pigeon's data
live outside this folder, so nothing of yours is lost):

```sh
cd ~/project-site && git fetch && git reset --hard origin/main && touch /var/www/djp7_pythonanywhere_com_wsgi.py
```

## Start over

Delete the web app on the Web tab, then in a Bash console:

```sh
rm -rf ~/project-site
```

and follow the steps from step 2. `~/gossip-data` and `~/pigeon-data` are untouched.

## Try it on your own computer

```sh
python3 site_app.py --port 8080 --data ./test-data
```

Then open http://localhost:8080. (`--data` keeps the test accounts and files in
`./test-data` instead of your home folder.)

```sh
python3 -m unittest discover tests
```

## For whoever changes the projects

`apps/` holds copies of the parts of each project the site serves: gossip's
hub, page and installers; pigeon's server, web app and installers; and the
Tree of Thought, tidy, den and pca installers. `pages/art.js` holds the mascots' pixel art.
`site_shell.py` and `pages/shell/` are the parts every page shares: the dock,
the All apps sheet, day and night, and the shared look of the site's own pages.
With the projects cloned next to this folder, refresh all of it with:

```sh
python3 tools/sync.py
```

Python 3 standard library only. No packages to install.
