# project-site

The website for every project, in one place: **https://djp7.pythonanywhere.com**

| Address | What's there |
| --- | --- |
| `/` | the front door: every project, and the one command that installs them all |
| `/gossip` | [gossip](https://github.com/dpatel7-dev/gossip)'s page. Its chat hub keeps `/api`, `/install.sh`, `/install.ps1` and `/healthz`, so every gossip already installed keeps working |
| `/tot` | [Tree of Thought](https://github.com/dpatel7-dev/Tree-Of-Thought), plus `/tot/install.sh` and `/tot/install.ps1` |
| `/pigeon` | [pigeon](https://github.com/dpatel7-dev/pigeon)'s web app (open it on your phone), its file server and installers |
| `/pca` | [Project CLI Access](https://github.com/dpatel7-dev/Project-CLI-Access), plus `/pca/install.sh` and `/pca/install.ps1` |
| `/versions.json` | the newest version of each project: pca checks it to keep everything up to date |

A bar across the top of every page links them together.

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
cd ~/project-site && git pull
```

Then **Reload** on the Web tab.

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
Tree of Thought and pca installers. `pages/art.js` holds the mascots' pixel art.
With the projects cloned next to this folder, refresh all of it with:

```sh
python3 tools/sync.py
```

Python 3 standard library only. No packages to install.
