// The Store, and the apps you put on this computer from it.
//
//   Apps:          real Linux apps from Flathub (VLC, Kodi, GIMP, LibreOffice, Steam on a PC…),
//                  installed with Flatpak by DiceOS's helper. They open on top of Dice; Home on
//                  the remote (or Super + Esc) closes them and Dice is back.
//   Web apps:      any website, as an app of its own: its own icon, its own window.
//   Dhruv's apps:  the terminal apps, each installed with one line.
//
// In a browser (not DiceOS), real apps can't be installed, so the Apps part says how to get
// DiceOS; web apps work everywhere.
(function () {
  'use strict';
  const D = window.Dice, esc = D.esc, h = D.h;
  const enc = encodeURIComponent;
  const PAL = ['#ff707a', '#f5a623', '#8fd16a', '#3fb6a8', '#4b9bec', '#7c6cf0', '#d27adf', '#ef6a8a', '#5fb0e6', '#e0753a'];
  const colorOf = (s) => { let x = 0; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return PAL[x % PAL.length]; };
  const letters = (name) => { const w = String(name).replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase(); };

  // ---- your apps: real ones (from diced) and web ones ------------------------------------------------
  const M = D.myApps = {};
  const st = () => D.state.myapps || (D.state.myapps = { web: [], real: [] });
  M.status = null;
  M.list = () => st().real.map((a) => Object.assign({ kind: 'real' }, a)).concat(st().web.map((a) => Object.assign({ kind: 'web' }, a)));
  M.find = (id) => M.list().find((a) => a.id === id) || null;
  M.refresh = async function () {
    if (!D.sys) return null;
    const s = await D.sys.get('/api/apps');
    if (!s || s.ok === false) return null;
    M.status = s;
    const real = (s.installed || []).map((a) => ({ id: 'fp:' + a.id, app: a.id, name: a.name, version: a.version }));
    if (JSON.stringify(real) !== JSON.stringify(st().real)) { st().real = real; D.save(); D.emit('myapps'); }
    return s;
  };
  const icons = new Map();
  M.icon = function (a) {
    if (a.kind === 'web') return Promise.resolve(D.tv && D.tv.icon ? D.tv.icon({ url: a.url }) : null);
    if (!D.sys || D.sys.info.emulated) return Promise.resolve(null);
    const id = a.app || a.id.replace(/^fp:/, '');
    if (!icons.has(id)) icons.set(id, fetch('/api/apps/icon?id=' + enc(id), { headers: { 'X-Dice': D.sys.info.token } }).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
    return icons.get(id);
  };
  // its icon: letters on its own colour, with the real icon on top when there is one
  M.el = function (a, size) {
    const el = h('<span class="myico" style="--mc:' + colorOf(a.app || a.id) + ';--ms:' + (size || 56) + 'px" aria-hidden="true"><b>' + esc(letters(a.name)) + '</b></span>');
    M.icon(a).then((u) => {
      if (!u) return;
      const img = new Image();
      img.alt = ''; img.referrerPolicy = 'no-referrer'; img.decoding = 'async';
      img.onload = () => { if (img.naturalWidth >= 32) el.classList.add('has-img'); else img.remove(); };
      img.onerror = () => img.remove();
      img.src = u;
      el.appendChild(img);
    });
    return el;
  };
  M.open = function (a) {
    D.touch && D.touch(a.id);
    if (a.kind === 'web') {
      // on the TV, full screen like a TV app; on the desktop, in its own window
      if (D.sys) return D.sys.open(a.url, { app: true, full: !(D.desk && D.desk.on), name: a.name });
      const w = window.open(a.url, '_blank', 'noopener,popup,width=1280,height=820');
      if (!w) location.href = a.url; // pop-ups blocked: just go there
      return;
    }
    if (!D.sys) return;
    D.sys.post('/api/apps', { action: 'open', id: a.app }).then((r) => {
      if (r && r.ok) D.toast({ icon: 'store', c: '#2bc4b2', title: 'Opening ' + a.name, text: 'Press Home on the remote (or Super + Esc) to come back to DiceOS.' });
      else D.toast({ icon: 'store', c: '#96969f', title: 'Couldn\'t open ' + a.name, text: (r && r.error) || '' });
    });
  };
  M.addWeb = function (name, url) {
    url = String(url || '').trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    let u;
    try { u = new URL(url); } catch (e) { throw new Error('That isn\'t a web address.'); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('That isn\'t a web address.');
    name = String(name || '').trim().slice(0, 40) || u.hostname.replace(/^www\./, '').split('.')[0].replace(/^./, (c) => c.toUpperCase());
    const id = 'wa:' + u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : '');
    st().web = st().web.filter((a) => a.id !== id).concat([{ id, name, url: u.href, at: Date.now() }]);
    D.save(); D.emit('myapps');
    return M.find(id);
  };
  M.removeWeb = function (id) { st().web = st().web.filter((a) => a.id !== id); D.save(); D.emit('myapps'); };
  if (D.sys) setTimeout(() => M.refresh().catch(() => {}), 2500);

  // ---- what the Store suggests -------------------------------------------------------------------------
  // (Flathub app ids; ones Flathub doesn't have for this computer, like Steam on a Pi, don't show up)
  const PICKS = [
    ['Watch and listen', [['org.videolan.VLC', 'VLC', 'Plays almost any video or song file'], ['tv.kodi.Kodi', 'Kodi', 'A whole media centre for your films, shows and music'], ['com.spotify.Client', 'Spotify', 'Music and podcasts']]],
    ['Play', [['com.moonlight_stream.Moonlight', 'Moonlight', 'Play the games on your gaming PC, here (DiceGaming uses it)'], ['com.valvesoftware.Steam', 'Steam', 'Your Steam games'], ['org.libretro.RetroArch', 'RetroArch', 'Old consoles\' games, with a controller'], ['org.prismlauncher.PrismLauncher', 'Prism Launcher', 'Minecraft: Java Edition, with mods'], ['net.supertuxkart.SuperTuxKart', 'SuperTuxKart', 'A free kart racer']]],
    ['Make things', [['org.gimp.GIMP', 'GIMP', 'Edit photos and pictures'], ['org.kde.krita', 'Krita', 'Paint and draw'], ['org.inkscape.Inkscape', 'Inkscape', 'Drawings that scale to any size'], ['org.blender.Blender', 'Blender', '3D models and animation'], ['org.audacityteam.Audacity', 'Audacity', 'Record and edit sound'], ['com.obsproject.Studio', 'OBS Studio', 'Record and stream your screen']]],
    ['Work and school', [['org.libreoffice.LibreOffice', 'LibreOffice', 'Documents, spreadsheets and slides'], ['org.mozilla.firefox', 'Firefox', 'A web browser'], ['com.visualstudio.code', 'Visual Studio Code', 'A code editor'], ['com.discordapp.Discord', 'Discord', 'Talk with friends']]],
  ];
  const CATS = [['', 'Everything'], ['Game', 'Games'], ['AudioVideo', 'Watch and listen'], ['Graphics', 'Draw and photos'], ['Office', 'Work'], ['Education', 'Learn'], ['Development', 'Code'], ['Network', 'Internet'], ['Utility', 'Tools']];
  const WEB = [['Photopea', 'https://www.photopea.com/', 'Edit photos, in the browser'], ['Excalidraw', 'https://excalidraw.com/', 'A whiteboard to sketch on'], ['Desmos', 'https://www.desmos.com/calculator', 'A graphing calculator'],
    ['Scratch', 'https://scratch.mit.edu/', 'Make games with blocks'], ['Khan Academy', 'https://www.khanacademy.org/', 'Lessons for every subject'], ['Duolingo', 'https://www.duolingo.com/', 'Learn a language'],
    ['Google Docs', 'https://docs.google.com/', 'Documents'], ['Canva', 'https://www.canva.com/', 'Posters and slides'], ['Spotify', 'https://open.spotify.com/', 'Music, in the browser'], ['Discord', 'https://discord.com/app', 'Talk with friends']];

  // ---- the Store itself (a window on the desktop, a page on DiceTV) --------------------------------------
  const S = D.store = {};
  S.page = function (mode, startTab) {
    const tv = mode === 'tv';
    const root = h('<div class="sto' + (tv ? ' sto-tv' : '') + '"><header class="sto-head"><div><h1>Store</h1><p class="muted">Real apps for DiceOS, websites as apps, and Dhruv\'s own apps.</p></div>' +
      '<div class="seg sto-tabs" role="tablist" data-row><button data-nav data-key="sto:t:apps" role="tab">Apps</button><button data-nav data-key="sto:t:web" role="tab">Web apps</button><button data-nav data-key="sto:t:suite" role="tab">Dhruv\'s apps</button></div></header><div class="sto-body"></div></div>');
    const body = root.querySelector('.sto-body');
    let tab = startTab || (D.sys && !D.sys.info.emulated ? 'apps' : D.sys ? 'apps' : 'web'), poll = 0, q = '', cat = '', alive = true;
    root.querySelectorAll('.sto-tabs button').forEach((b) => { b.onclick = () => show(b.dataset.key.slice(6)); });
    function show(t) {
      tab = t;
      root.querySelectorAll('.sto-tabs button').forEach((b) => b.setAttribute('aria-selected', b.dataset.key === 'sto:t:' + t));
      clearTimeout(poll);
      ({ apps: appsTab, web: webTab, suite: suiteTab })[t]();
    }
    const keepFocus = (f) => { const k = D.nav.el && root.contains(D.nav.el) && D.nav.el.dataset.key; f(); const el = k && root.querySelector('[data-key="' + CSS.escape(k) + '"]'); if (el) D.nav.focus(el, { scroll: false }); };

    // a card for one app: its icon, a line about it, and what you can do
    function card(a, acts, job) {
      const c = h('<div class="sto-app" data-id="' + esc(a.id) + '"><div class="sto-app-top"></div><div class="sto-app-txt"><b>' + esc(a.name) + '</b><span>' + esc(a.summary || a.blurb || '') + '</span></div><div class="sto-app-acts"></div></div>');
      c.querySelector('.sto-app-top').appendChild(M.el(a, tv ? 72 : 56));
      const box = c.querySelector('.sto-app-acts');
      if (job && job.state === 'working') box.innerHTML = '<div class="sto-prog"><i style="width:' + Math.max(4, job.pct || 0) + '%"></i></div><small>' + esc(job.title) + '… ' + (job.pct || 0) + '%</small>';
      else {
        if (job && job.state === 'failed') box.appendChild(h('<small class="sto-err">' + esc(job.error || 'That didn\'t work.') + '</small>'));
        acts.forEach(([label, cls, fn, key]) => { const b = h('<button class="b small ' + (cls || '') + '" data-nav data-key="' + esc(key) + '">' + esc(label) + '</button>'); b.onclick = fn; box.appendChild(b); });
      }
      return c;
    }
    const grid = (cards) => { const g = h('<div class="sto-grid" data-row></div>'); cards.forEach((c) => g.appendChild(c)); return g; };
    const section = (title, sub, content) => { const s = h('<section class="sto-sec"><h2>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</h2></section>'); s.appendChild(content); return s; };

    // ---- Apps: Flathub, on DiceOS --------------------------------------------------------------------
    let cache = { picks: null, results: null, rq: null };
    async function appsTab() {
      if (!D.sys) {
        body.innerHTML = '';
        body.appendChild(h('<div class="sto-hero glass"><div><h2>Real apps live on DiceOS</h2><p>On a computer running DiceOS (a Raspberry Pi, a PC, your TV), the Store installs real apps from Flathub: VLC, Kodi, GIMP, LibreOffice, Minecraft\'s launcher, Steam on a PC, and thousands more. Here in the browser, add any website as an app instead.</p></div>' +
          '<div class="sto-hero-acts"><a class="b go" data-nav data-key="sto:getos" href="' + esc(D.origin) + '/dice" target="_blank" rel="noopener">Get DiceOS</a><button class="b" data-nav data-key="sto:toweb">Web apps</button></div></div>'));
        body.querySelector('[data-key="sto:toweb"]').onclick = () => show('web');
        PICKS.forEach(([title, list]) => body.appendChild(section(title, '', grid(list.map(([id, name, summary]) => card({ id: 'fp:' + id, app: id, name, summary, kind: 'real' }, []))))));
        return;
      }
      if (!M.status) body.innerHTML = '<p class="muted sto-wait">Looking at what\'s here…</p>';
      const s = await M.refresh().catch(() => null) || M.status;
      if (!alive || tab !== 'apps') return;
      if (!s) { body.innerHTML = '<p class="muted sto-wait">DiceOS\'s helper isn\'t answering. Try again in a moment.</p>'; return; }
      const jobs = Object.fromEntries((s.jobs || []).map((j) => [j.key, j]));
      const working = (s.jobs || []).some((j) => j.state === 'working');
      if (!s.flatpak || !s.flathub || !s.catalog) {
        const j = jobs.setup;
        keepFocus(() => {
          body.innerHTML = '';
          const hero = h('<div class="sto-hero glass"><div><h2>Get real apps</h2><p>DiceOS installs apps from Flathub, the big free shelf of Linux apps. Getting it ready takes a few minutes the first time and needs the internet.</p></div><div class="sto-hero-acts"></div></div>');
          const acts = hero.querySelector('.sto-hero-acts');
          if (j && j.state === 'working') acts.innerHTML = '<div class="sto-prog wide"><i style="width:' + Math.max(4, j.pct) + '%"></i></div><small>Getting ready… ' + j.pct + '%</small>';
          else {
            if (j && j.state === 'failed') acts.appendChild(h('<small class="sto-err">' + esc(j.error) + '</small>'));
            const b = h('<button class="b go" data-nav data-key="sto:setup">' + D.glyph('store', 2) + 'Get apps ready</button>');
            b.onclick = () => D.sys.post('/api/apps', { action: 'setup' }).then(() => appsTab());
            acts.appendChild(b);
          }
          body.appendChild(hero);
        });
        if (working || (j && j.state === 'working')) poll = setTimeout(() => { if (root.isConnected) appsTab(); }, 1500);
        return;
      }
      const installed = s.installed || [];
      const have = new Set(installed.map((a) => a.id));
      if (!cache.picks) {
        const ids = PICKS.flatMap(([, l]) => l.map(([id]) => id));
        const r = await D.sys.get('/api/apps/search?ids=' + enc(ids.join(',')));
        cache.picks = new Map(((r && r.items) || []).map((a) => [a.id, a]));
      }
      const want = q + '|' + cat;
      if ((q || cat) && cache.rq !== want) {
        const r = await D.sys.get('/api/apps/search?q=' + enc(q) + '&cat=' + enc(cat) + '&n=60');
        cache.results = (r && r.items) || [];
        cache.rq = want;
      }
      if (!alive || tab !== 'apps') return;
      const appCard = (a) => {
        const id = a.id, job = jobs[id], inst = have.has(id);
        const acts = inst ? [['Open', 'go', () => M.open({ kind: 'real', id: 'fp:' + id, app: id, name: a.name }), 'sto:open:' + id], ['Remove', '', () => remove(a), 'sto:rm:' + id]]
          : [['Install', 'go', () => install(a), 'sto:in:' + id]];
        return card({ id: 'fp:' + id, app: id, name: a.name, summary: a.summary, kind: 'real' }, acts, job);
      };
      keepFocus(() => {
        body.innerHTML = '';
        const bar = h('<div class="sto-bar"><label class="sto-find">' + D.glyph('search', 2) + '<input type="search" placeholder="Search ' + s.catalog + ' apps" aria-label="Search apps" data-nav data-key="sto:q"></label><div class="sto-cats" data-row></div></div>');
        const inp = bar.querySelector('input');
        inp.value = q;
        let t = 0;
        inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = inp.value.trim(); appsTab().then(() => { const i = body.querySelector('.sto-find input'); if (i && document.activeElement !== i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }); }, 300); });
        CATS.forEach(([c, n]) => { const b = h('<button class="sto-chip' + (c === cat ? ' on' : '') + '" data-nav data-key="sto:c:' + c + '">' + esc(n) + '</button>'); b.onclick = () => { cat = c; appsTab(); }; bar.querySelector('.sto-cats').appendChild(b); });
        body.appendChild(bar);
        if (s.front) body.appendChild(h('<p class="sto-front">' + esc(s.front.name) + ' is open. Press Home on the remote (or Super + Esc) to close it.</p>'));
        if (q || cat) {
          body.appendChild(section(q ? 'Apps for “' + q + '”' : CATS.find(([c]) => c === cat)[1], cache.results.length ? '' : 'nothing found', grid(cache.results.map(appCard))));
        } else {
          if (installed.length) body.appendChild(section('On this computer', installed.length + (installed.length === 1 ? ' app' : ' apps'), grid(installed.map((a) => appCard(Object.assign({ summary: a.version ? 'Version ' + a.version : '' }, (cache.picks && cache.picks.get(a.id)) || {}, { id: a.id, name: a.name }))))));
          const busy = (s.jobs || []).filter((j) => j.state === 'working' && !have.has(j.key) && j.key.includes('.'));
          if (busy.length) body.appendChild(section('Installing', '', grid(busy.map((j) => card({ id: 'fp:' + j.key, app: j.key, name: j.key.split('.').pop(), kind: 'real' }, [], j)))));
          PICKS.forEach(([title, list]) => {
            const there = list.filter(([id]) => cache.picks.has(id) && !have.has(id));
            if (there.length) body.appendChild(section(title, '', grid(there.map(([id, name, summary]) => appCard(Object.assign({}, cache.picks.get(id), { name: cache.picks.get(id).name || name, summary }))))));
          });
          body.appendChild(h('<p class="muted sto-note">Apps come from Flathub, and DiceOS keeps them up to date with its own updates. They open on top of Dice: press Home on the remote, or Super + Esc on a keyboard, to come back.</p>'));
        }
      });
      if (working) poll = setTimeout(() => { if (root.isConnected) appsTab(); }, 1200);
    }
    function install(a) { D.sys.post('/api/apps', { action: 'install', id: a.id }).then(() => { M.status = null; appsTab(); }); }
    async function remove(a) {
      const ok = await D.ask({ title: 'Remove ' + a.name + '?', text: 'It comes off this computer. Your files stay.', buttons: [{ label: 'Remove', value: true, danger: true }, { label: 'Cancel', value: false, go: true }] });
      if (ok) D.sys.post('/api/apps', { action: 'remove', id: a.id }).then(() => appsTab());
    }

    // ---- Web apps: any website, as an app --------------------------------------------------------------
    function webTab() {
      const mine = st().web;
      keepFocus(() => {
        body.innerHTML = '';
        const add = h('<div class="sto-hero glass sto-add"><div><h2>Add a website as an app</h2><p>It gets its own icon, in your apps and on DiceTV, and opens in a window of its own.</p></div>' +
          '<form class="sto-form"><input name="url" placeholder="Web address, like photopea.com" aria-label="Web address" data-nav data-key="sto:url" autocomplete="off" spellcheck="false"><input name="name" placeholder="Its name (if you like)" aria-label="Name" data-nav data-key="sto:name" autocomplete="off"><button class="b go" data-nav data-key="sto:addweb">Add it</button></form></div>');
        add.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          try { const a = M.addWeb(add.querySelector('[name=name]').value, add.querySelector('[name=url]').value); D.toast({ icon: 'store', c: '#2bc4b2', title: 'Added ' + a.name, text: 'It\'s in your apps now.' }); webTab(); } catch (er) { D.toast({ icon: 'help', c: '#ff4d5e', title: 'Couldn\'t add it', text: er.message }); }
        };
        body.appendChild(add);
        if (mine.length) body.appendChild(section('Your web apps', '', grid(mine.map((a) => card(Object.assign({ kind: 'web', summary: new URL(a.url).hostname.replace(/^www\./, '') }, a),
          [['Open', 'go', () => M.open(Object.assign({ kind: 'web' }, a)), 'sto:wo:' + a.id], ['Remove', '', () => { M.removeWeb(a.id); webTab(); }, 'sto:wr:' + a.id]])))));
        const left = WEB.filter(([, url]) => !mine.some((m) => m.url === url));
        if (left.length) body.appendChild(section('Good ones to add', '', grid(left.map(([name, url, summary]) => card({ id: 'wa:' + url, name, url, summary, kind: 'web' },
          [['Add', 'go', () => { M.addWeb(name, url); D.toast({ icon: 'store', c: '#2bc4b2', title: 'Added ' + name, text: 'It\'s in your apps now.' }); webTab(); }, 'sto:wa:' + url]])))));
      });
    }

    // ---- Dhruv's apps: one line in Terminal each -----------------------------------------------------
    function suiteTab() {
      keepFocus(() => {
        body.innerHTML = '';
        const pca = CATALOG.suite.find((a) => a.id === 'pca');
        if (pca) {
          const cmd = 'curl -fsSL ' + D.origin + '/pca/install.sh | sh';
          const f = h('<div class="sto-hero glass"><div><h2>Get them all with pca</h2><p>' + esc(pca.line || pca.blurb) + ' Paste the line into Terminal on your computer.</p></div><div class="cmd"><code>' + esc(cmd) + '</code><button class="b small" data-nav data-key="sto:pca">Copy</button></div></div>');
          f.querySelector('button').onclick = (e) => D.copy(cmd, e.currentTarget);
          body.appendChild(f);
        }
        CATALOG.groups.forEach(([g, title]) => {
          const apps = CATALOG.suite.filter((a) => a.group === g && a.id !== 'pca');
          if (!apps.length) return;
          body.appendChild(section(title, '', grid(apps.map((a) => {
            const cmd = 'curl -fsSL ' + D.origin + '/' + a.id + '/install.sh | sh';
            const c = h('<div class="sto-app"><div class="sto-app-top"></div><div class="sto-app-txt"><b>' + esc(a.name) + '</b><span>' + esc(a.blurb) + '</span></div><div class="sto-app-acts"></div></div>');
            c.querySelector('.sto-app-top').appendChild(D.appIconEl ? D.appIconEl(D.app(a.id), tv ? 72 : 56) : h('<span></span>'));
            const b = h('<button class="b small" data-nav data-key="sto:s:' + a.id + '">Copy its line</button>');
            b.onclick = (e) => D.copy(cmd, e.currentTarget);
            c.querySelector('.sto-app-acts').appendChild(b);
            if (a.web) { const w = h('<button class="b small" data-nav data-key="sto:sw:' + a.id + '">Open it</button>'); w.onclick = () => D.launch('web:' + a.id); c.querySelector('.sto-app-acts').appendChild(w); }
            return c;
          }))));
        });
      });
    }

    const offs = [D.on('myapps', () => { if (!root.isConnected && root._shown) return root._stop(); if (tab === 'web') webTab(); })];
    setTimeout(() => { root._shown = true; }, 0);
    root._stop = () => { alive = false; clearTimeout(poll); offs.forEach((f) => f && f()); };
    show(tab);
    return root;
  };

  // a window on the desktop
  D.register({ id: 'store', mount(rootEl, ctx) {
    rootEl.classList.add('dstore');
    const page = S.page(ctx && ctx.mode === 'run' ? 'tv' : 'desk', ctx && ctx.arg);
    rootEl.appendChild(page);
    return { unmount() { page._stop(); } };
  } });
})();
