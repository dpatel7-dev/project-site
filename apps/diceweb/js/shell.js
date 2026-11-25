// The shell: DiceTV (it used to be called Big screen). The boot screen, the top bar, Home (with
// the Now column and the Live, News and Watch rows from tv.js), Library, each app's own page, the menu on the left,
// Quick access on the right, search, and running apps full screen.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S, M = D.M, L = D.L, Nav = D.nav;
  const $ = D.$, $$ = D.$$, esc = D.esc, h = D.h;


  // ---- The world behind everything ----------------------------------------------
  const Hero = D.hero = { app: null, world: null, last: 0, paused: false };
  const cv = $('#hero'), hg = cv.getContext('2d');
  // how many screen pixels make one pixel of the landscapes (smaller numbers, more detail)
  D.scapeCell = () => Math.max(2, Math.round(Math.max(innerWidth, innerHeight * 1.6) / 640));
  // Behind Big screen: the world you picked, as a calm landscape across the top of the screen.
  // It stays the same as you move between apps; only the accent colour follows what's focused.
  Hero.size = function () {
    const cell = D.scapeCell(), vh = Math.round(innerHeight * (Hero.tall ? 1 : 0.66));
    const W = Math.ceil(innerWidth / cell), H = Math.ceil(vh / cell);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    cv.style.width = W * cell + 'px'; cv.style.height = H * cell + 'px';
    return { W, H };
  };
  Hero.set = function (app, force) {
    if (app) { Hero.app = app; document.documentElement.style.setProperty('--c', app.c); }
    const { W, H } = Hero.size();
    const world = D.WORLDS && D.WORLDS[D.state.world] ? D.state.world : 'hills';
    if (force || !Hero.world || Hero.world.W !== W || Hero.world.H !== H || Hero.world.night !== D.night() || Hero.world.world !== world) {
      Hero.world = new G.Scape({ world, night: D.night(), W, H, seed: 'big' });
      Hero.draw(performance.now(), true);
    }
  };
  Hero.draw = function (now, force) {
    if (!Hero.world || (Hero.paused && !force)) return;
    const still = D.reduced();
    if (!force && (still || now - Hero.last < 1000 / Math.min(20, D.state.fps || 60) - 2)) return;
    Hero.last = now;
    Hero.world.draw(hg, now / 1000, still);
  };
  addEventListener('resize', () => { clearTimeout(Hero.rt); Hero.rt = setTimeout(() => Hero.set(null), 120); });
  D.on('look', () => { Hero.set(null, true); if (Shell.view) Shell.render(true); Shell.chrome(); });
  D.on('state', (k) => { if (k === 'world') { Hero.set(null, true); if (D.desk) D.desk.world = null; } });

  // ---- The top bar -------------------------------------------------------------------
  const Shell = D.shell = { stack: [], view: null };
  const top = $('#top');
  top.innerHTML =
    '<div class="where"><button class="diebtn" id="diebtn" aria-label="Menu (M)">' + D.icon('die', null, 3) + '</button><span id="where">Home</span></div>' +
    '<div class="tray glass" id="tray">' +
      '<button class="tb nowplay" id="tb-music" hidden aria-label="Now playing"><span class="eqmini"><i></i><i></i><i></i></span><span id="np-name"></span></button>' +
      '<button class="tb" id="tb-search" aria-label="Search (/)">' + D.glyph('search', 2) + '</button>' +
      '<button class="tb" id="tb-bell" aria-label="Notifications">' + D.glyph('bell', 2) + '<span class="badge" id="badge" hidden></span></button>' +
      '<button class="tb chip" id="tb-sleep" hidden aria-label="Sleep timer"></button>' +
      '<span class="tb" id="tb-dnd" hidden title="Do not disturb is on">' + D.glyph('quiet', 2) + '</span>' +
      '<span class="tb" id="tb-wifi" title="Online">' + D.glyph('wifi', 2) + '</span>' +
      '<span class="tb batt" id="tb-batt" hidden><span id="batt-pc"></span><span class="battery"><i></i></span></span>' +
      '<span class="clock" id="clock"></span>' +
    '</div>';
  $('#diebtn').onclick = () => Menu.toggle();
  $('#tb-search').onclick = () => Search.open();
  $('#tb-bell').onclick = () => Qam.open('notifs');
  $('#tb-sleep').onclick = () => Qam.open('quick');
  function chips() {
    const left = D.tools.sleepLeft(), sl = $('#tb-sleep');
    sl.hidden = !left;
    if (left) { sl.innerHTML = D.glyph('moon', 2) + '<span>' + left + ' min</span>'; sl.title = 'Going to sleep in ' + left + ' minutes'; }
    $('#tb-dnd').hidden = !D.tools.quiet();
  }
  D.on('sleeptimer', chips); D.on('dnd', chips);
  $('#tb-music').onclick = () => D.launch('music');
  function clock() {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '');
    $('#clock').title = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }
  setInterval(clock, 5000); clock();
  D.on('sys', (st) => {
    if (!st) return;
    const el = $('#tb-wifi');
    if (st.wifi) { el.innerHTML = D.glyph(st.wifi.ssid ? 'wifi' : 'nowifi', 2); el.title = st.wifi.ssid ? st.wifi.ssid + (st.wifi.signal ? ', ' + st.wifi.signal + '%' : '') : 'Wi-Fi isn\'t connected'; }
  });
  function wifi() {
    if (D.sys && D.sys.status) return D.emit('sys', D.sys.status);
    const on = navigator.onLine;
    $('#tb-wifi').innerHTML = D.glyph(on ? 'wifi' : 'nowifi', 2);
    $('#tb-wifi').title = on ? 'Online' + (navigator.connection && navigator.connection.effectiveType ? ' (' + navigator.connection.effectiveType + ')' : '') : 'Offline';
  }
  addEventListener('online', () => { wifi(); D.toast({ icon: 'wifi', c: '#4fc16b', title: 'Back online', text: 'The internet is back.' }); });
  addEventListener('offline', () => { wifi(); D.toast({ icon: 'wifi', c: '#96969f', title: 'Offline', text: 'Everything in ' + D.brand + ' still works.' }); });
  wifi();
  D.battery = null;
  if (navigator.getBattery) navigator.getBattery().then((b) => {
    D.battery = b;
    const show = () => {
      const el = $('#tb-batt'); el.hidden = false;
      const pc = Math.round(b.level * 100);
      $('#batt-pc').textContent = pc + '%';
      const bat = el.querySelector('.battery');
      bat.querySelector('i').style.width = Math.max(8, pc) + '%';
      bat.classList.toggle('low', pc <= 20 && !b.charging); bat.classList.toggle('charging', b.charging);
      el.title = pc + '%' + (b.charging ? ', charging' : '');
    };
    show(); b.addEventListener('levelchange', show); b.addEventListener('chargingchange', show);
  }).catch(() => {});
  function badge() { const n = D.unread(); const b = $('#badge'); b.hidden = !n; b.textContent = n > 9 ? '9+' : n; }
  D.on('notifs', badge);
  function nowPlaying(now) {
    const el = $('#tb-music');
    el.hidden = !now;
    if (now) { $('#np-name').textContent = now.name; el.classList.toggle('playing', !!now.playing); el.style.setProperty('--c', now.c); }
    if (Qam.tab === 'music' && Qam.isOpen()) Qam.show('music', true);
  }
  M.on(nowPlaying);
  Shell.chrome = function () {
    badge(); wifi(); chips();
    $('#diebtn').innerHTML = D.icon('die', null, 3);
  };

  // ---- Pages ---------------------------------------------------------------------------
  const TITLES = { home: 'Home', library: 'Library', store: 'Store', page: '', settings: 'Settings' };
  // DiceTV is for the apps on this screen: the apps you install on another computer live on the desktop and the website
  const tvApps = () => D.all().filter((a) => !a.suite && a.id !== 'store');
  Shell.go = function (v, arg, opts) {
    opts = opts || {};
    if (Shell.view) {
      Shell.view.focusKey = Nav.el && Nav.el.dataset.key;
      Shell.view.scroll = ($('#view .page') || {}).scrollTop || 0;
    }
    if (opts.replace || (Shell.view && Shell.view.v === v && Shell.view.arg === arg)) Shell.stack.pop();
    if (opts.root) Shell.stack = [];
    Shell.stack.push({ v, arg });
    Shell.view = Shell.stack[Shell.stack.length - 1];
    Shell.render();
    if (!opts.quiet) S.play('open');
  };
  Shell.back = function () {
    if (Shell.stack.length <= 1) { if (Shell.view.v !== 'home') Shell.go('home', null, { root: true }); return false; }
    if (Shell.view && Shell.view.unmount) Shell.view.unmount();
    Shell.stack.pop();
    Shell.view = Shell.stack[Shell.stack.length - 1];
    Shell.render(true);
    S.play('back');
    return true;
  };
  Shell.render = function (restore) {
    const view = Shell.view;
    if (view.unmount) { view.unmount(); view.unmount = null; }
    const page = Views[view.v](view.arg, view);
    page.classList.add('page');
    if (!restore) page.classList.add('enter');
    page.setAttribute('data-scroll', '96');
    const host = $('#view');
    host.replaceChildren(page);
    $('#app').classList.remove('scrolled');
    page.addEventListener('scroll', () => $('#app').classList.toggle('scrolled', page.scrollTop > 24), { passive: true });
    $('#app').dataset.view = view.v;
    if (Hero.tall !== (view.v === 'home')) { Hero.tall = view.v === 'home'; Hero.set(null); }
    $('#where').textContent = view.v === 'page' ? (D.app(view.arg) || {}).name || '' : TITLES[view.v];
    if (restore && view.scroll) page.scrollTop = view.scroll;
    const want = restore && view.focusKey ? page.querySelector('[data-key="' + CSS.escape(view.focusKey) + '"]') : null;
    if (want) Nav.focus(want, { scroll: false }); else Nav.first(page);
    if (!Nav.el || !page.contains(Nav.el)) { const fallback = D.app(view.v === 'page' ? view.arg : (D.state.recent[0] || 'music')); if (fallback) Hero.set(fallback); }
    Legend.update();
  };

  // A portrait cover tile (or a wide one).
  function tile(app, opts) {
    opts = opts || {};
    const el = h('<button class="tile ' + (opts.size || '') + '" data-nav data-key="' + esc((opts.key || 't') + ':' + app.id) + '" data-hero="' + app.id + '" data-a="' + esc(opts.a || 'Open') + '" style="--tc:' + app.c + '" aria-label="' + esc(app.name) + '">' +
      '<span class="name">' + esc(app.name) + (opts.sub ? '<span class="sub">' + esc(opts.sub) + '</span>' : '') + '</span>' + (opts.flag ? '<span class="flag ' + (opts.live ? 'live' : '') + '">' + esc(opts.flag) + '</span>' : '') + '</button>');
    el.prepend(D.coverEl(app, opts.size === 'wide' ? 'wide' : 'cover'));
    el.onclick = opts.onclick || (() => Shell.go('page', app.id));
    if (opts.x) el.dataset.x = opts.x;
    return el;
  }
  Shell.tile = tile;
  function face(who, size) {
    const c = G.face(who, size, G.hexA(G.colourOf(who), D.night() ? 0.3 : 0.22));
    c.className = 'pic';
    return c;
  }
  Shell.face = face;
  function statusClass(s) { return /^Playing|^Listening|^In |^Writing/.test(s) ? 'play' : s === 'Away' ? 'away' : s === 'Snoozing' ? 'zz' : ''; }
  Shell.statusClass = statusClass;

  const Views = Shell.views = {};
  // DiceTV's Home, laid out like a table top: a clock-first column of what's happening
  // today down the left, your apps as solid little blocks in the middle of the world,
  // and below, on frosted glass over the world, the rows: Live, News and Watch.
  function block(app, opts) {
    opts = opts || {};
    const el = h('<button class="dblock" data-nav data-key="' + esc((opts.key || 'r') + ':' + app.id) + '" data-hero="' + app.id + '" data-a="' + esc(opts.a || 'Open') + '" style="--tc:' + app.c + '" aria-label="' + esc(app.name) + '">' +
      '<span class="bk"></span><span class="bn">' + esc(app.name) + '</span>' + (opts.flag ? '<span class="bflag">' + esc(opts.flag) + '</span>' : '') + '</button>');
    el.querySelector('.bk').appendChild(G.appIconEl(app.id, 160));
    el.onclick = opts.onclick || (() => D.launch(app.id, { from: el }));
    if (opts.x) el.dataset.x = opts.x;
    return el;
  }
  Shell.block = block;
  Views.home = function () {
    const page = h('<div class="home tvb"><section class="tvb-top"><aside class="tvb-now glass" aria-label="Today" data-nav-down=".tvb-ground"></aside>' +
      '<div class="tvb-main"><div class="tvb-board" id="recent" data-nav-down=".tvb-ground"></div>' +
      '<div class="spot tvb-cap" aria-live="polite"><div class="kicker"><span class="dot"></span><span id="sp-k"></span></div><h1 id="sp-name"></h1><p id="sp-line"></p><div class="facts" id="sp-facts"></div></div></div></section>' +
      '<div class="tvb-strip" aria-hidden="true"></div><section class="tvb-ground" data-nav-up=".tvb-board"></section></div>');
    const board = page.querySelector('#recent');
    const run = D.running();
    const ids = [];
    if (run) ids.push(run.id);
    D.state.recent.forEach((id) => { if (!ids.includes(id) && D.app(id) && !D.app(id).suite) ids.push(id); });
    ['music', 'channels', 'browser', 'calendar', 'weather', 'files', 'notes', 'photos'].forEach((id) => { if (ids.length < 7 && D.app(id) && !ids.includes(id)) ids.push(id); });
    ids.slice(0, 7).forEach((id, i) => {
      const app = D.app(id), live = run && run.id === id;
      const t = block(app, { flag: live ? 'Running' : '', a: live ? 'Resume' : 'Open', x: live ? 'Close' : '' });
      t.style.setProperty('--i', i);
      if (i === 0) t.setAttribute('data-first', '');
      board.appendChild(t);
    });
    const all = h('<button class="dblock" data-nav data-key="r:all" data-a="Open" style="--tc:#3a3f4b" aria-label="Library"><span class="bk"></span><span class="bn">Library</span></button>');
    const lib = G.canvas(16, 16), lg = lib.getContext('2d');
    lg.fillStyle = '#2b2f38'; lg.fillRect(0, 0, 16, 16);
    tvApps().slice(0, 9).forEach((a, i) => { lg.fillStyle = a.c; lg.fillRect(2 + (i % 3) * 4.5, 2 + Math.floor(i / 3) * 4.5, 3, 3); });
    lib.className = 'appicon libicon';
    all.querySelector('.bk').appendChild(lib);
    all.onclick = () => Shell.go('library');
    all.style.setProperty('--i', 7);
    board.appendChild(all);
    D.tv.now(page.querySelector('.tvb-now'));
    D.tv.strip(page.querySelector('.tvb-strip'));
    D.tv.rows(page.querySelector('.tvb-ground'));
    return page;
  };
  // the big words over the world follow what's focused
  function spotlight(el) {
    const k = $('#sp-k'); if (!k) return;
    const key = el.dataset.key || '';
    let app = D.app(el.dataset.hero), kick = '', name = '', line = '', facts = [];
    if (key.startsWith('td:') || key.startsWith('w:') || key.startsWith('lv:') || key.startsWith('nw:')) {
      const s = D.tv.spot(key) || {};
      kick = s.kick || ''; name = s.name || ''; line = s.line || '';
      if (s.c) document.documentElement.style.setProperty('--c', s.c);
    } else if (key === 'r:all') {
      kick = 'Library'; name = 'Everything'; line = 'All ' + tvApps().length + ' apps on this screen, from A to Z.';
    } else if (app) {
      const run = D.running();
      kick = run && run.id === app.id ? 'Running now' : app.suite ? 'App for your computer' : 'Built into ' + D.brand;
      name = app.name; line = app.line;
      if (!app.suite) {
        const p = D.state.played[app.id];
        facts.push(p ? 'Used for <b>' + D.mins(p) + '</b>' : 'Not opened yet');
        if (D.state.last[app.id]) facts.push('Last opened <b>' + D.ago(D.state.last[app.id]) + '</b>');
      } else {
        facts.push('Get it with <b>one line</b> in Terminal');
        if (D.versions && D.versions[app.id]) facts.push('Version <b>' + esc(D.versions[app.id]) + '</b>');
      }
    }
    k.textContent = kick; $('#sp-name').textContent = name; $('#sp-line').textContent = line; $('#sp-facts').innerHTML = facts.map((f) => '<span>' + f + '</span>').join('');
  }
  D.on('focus', (el) => {
    if (el.dataset.hero && !D.desk.on) { const app = D.app(el.dataset.hero) || (ART.mascots[el.dataset.hero] ? { id: el.dataset.hero, land: (D.app(el.dataset.hero) || {}).land || 'hills', c: G.colourOf(el.dataset.hero) } : null); if (app) Hero.set(app); }
    if (Shell.view && Shell.view.v === 'home' && $('#view').contains(el)) spotlight(el);
    Legend.update();
  });

  // Library: every app on this screen, from A to Z
  Views.library = function () {
    const page = h('<div class="tvb-lib"><div class="lib-head"><h1 class="title">Library</h1></div><div class="lib-blocks" id="lib"></div></div>');
    const grid = page.querySelector('#lib');
    tvApps().sort((a, b) => a.name.localeCompare(b.name)).forEach((a, i) => { const t = block(a, { key: 'l', flag: D.running() && D.running().id === a.id ? 'Running' : '' }); if (i === 0) t.setAttribute('data-first', ''); grid.appendChild(t); });
    return page;
  };

  // Store: the suite, with the line to get each one
  Views.store = function () { // the Store (js/store.js): real apps, web apps and Dhruv's apps
    return D.store.page('tv');
  };
  function copy(text, btn) {
    const done = () => { if (btn) { const t = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = t; }, 1400); } D.toast({ icon: 'copy', c: '#4fc16b', title: 'Copied', text: 'Paste it into Terminal on your computer.' }); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ } ta.remove(); }
  }
  D.copy = copy;

  // An app's own page
  Views.page = function (id, view) {
    const app = D.app(id);
    D.state.seen[id] = Date.now(); D.save();
    Hero.set(app);
    const run = D.running();
    const live = run && run.id === id;
    const page = h('<div class="apage"><section class="apage-head"><h1>' + esc(app.name) + '</h1><p>' + esc(app.line) + '</p><div class="actions" id="acts" data-block></div></section><section class="apage-body" id="body"></section></div>');
    const acts = page.querySelector('#acts');
    const btn = (label, cls, fn, key, icon) => { const b = h('<button class="b ' + (cls || '') + '" data-nav data-key="' + key + '">' + (icon ? D.glyph(icon, 2) : '') + esc(label) + '</button>'); b.onclick = fn; acts.appendChild(b); return b; };
    if (!app.suite) {
      if (app.kind === 'system') btn('Open', 'go', () => D.launch(id), 'p:go', 'play').setAttribute('data-first', '');
      else btn(live ? 'Resume' : app.kind === 'game' ? 'Play' : 'Open', 'go', (e) => D.launch(id, { from: e.currentTarget }), 'p:go', 'play').setAttribute('data-first', '');
      if (live) btn('Close it', '', () => D.closeApp(), 'p:close', 'close');
    } else {
      btn('Get it', 'go', () => { const c = $('#getcopy'); Nav.focus(c); }, 'p:get', 'copy').setAttribute('data-first', '');
      if (app.web) btn('Open its web page', '', () => D.launch('web:' + id), 'p:web', 'link');
      const link = h('<a class="b" data-nav data-key="p:site" href="' + esc(D.origin + '/' + id) + '" target="_blank" rel="noopener">' + D.glyph('link', 2) + 'Its page on the website</a>');
      acts.appendChild(link);
    }
    const body = page.querySelector('#body');
    const left = h('<div style="display:grid;gap:18px;align-content:start"></div>');
    if (app.suite) {
      const os = view.os || (/Win/.test(navigator.platform) ? 'win' : 'mac');
      const cmd = os === 'win' ? 'irm ' + D.origin + '/' + id + '/install.ps1 | iex' : 'curl -fsSL ' + D.origin + '/' + id + '/install.sh | sh';
      const get = h('<div class="panel" data-block><h3>Get it</h3><p>' + (os === 'win' ? 'Open PowerShell' : 'Open Terminal') + ' on your computer, paste this line, and press ' + (os === 'win' ? 'Enter' : 'Return') + '.</p>' +
        '<div class="seg" role="group"><button data-nav data-key="os:mac" aria-pressed="' + (os === 'mac') + '">Mac and Linux</button><button data-nav data-key="os:win" aria-pressed="' + (os === 'win') + '">Windows</button></div>' +
        '<div class="cmd"><code>' + esc(cmd) + '</code><button class="b small" id="getcopy" data-nav data-key="p:copy" data-a="Copy">Copy</button></div>' +
        '<p style="margin:0;font-size:.9rem">Already have pca? Open it and pick ' + esc(app.name) + ' from the list.</p></div>');
      get.querySelectorAll('.seg button').forEach((b) => { b.onclick = () => { view.os = b.dataset.key.slice(3); Shell.render(true); Nav.focus($('[data-key="' + b.dataset.key + '"]')); }; });
      get.querySelector('#getcopy').onclick = (e) => copy(cmd, e.currentTarget);
      left.appendChild(get);
    } else {
      const how = { files: 'Your files, in folders. On Dice they\'re the real files on the computer.', browser: 'Tabs, an address bar that searches, and a new tab page with a city under its real sky.',
        music: 'Pick a Dice Radio station, or add songs from your computer. They stay here for next time.', terminal: 'Type help and press Enter. Try neofetch, roll 2d6, or say pebble hi.',
        notes: 'Notes save as you type. They\'re files too: ls ~/notes in Terminal.', store: 'Every app for your computer, with the line to get it.', settings: 'Look, sound, controllers and more.' }[id];
      if (how) left.appendChild(h('<div class="panel"><h3>How it works</h3><p>' + how + '</p></div>'));
    }
    const right = h('<div style="display:grid;gap:18px;align-content:start"></div>');
    if (!app.suite) {
      right.appendChild(h('<div class="panel stats"><div><b>' + (D.state.played[id] ? D.mins(D.state.played[id]) : 'None yet') + '</b><span>Time spent</span></div><div><b>' + (D.state.last[id] ? D.ago(D.state.last[id]) : 'Never') + '</b><span>Last opened</span></div>' + '</div>'));
    } else {
      right.appendChild(h('<div class="panel"><h3>' + esc((ART.mascots[id] || { name: 'pca' }).name) + '</h3><p>' + esc(app.blurb) + '.</p>' + (D.versions && D.versions[id] ? '<p style="margin:0">Version ' + esc(D.versions[id]) + '</p>' : '') + '</div>'));
    }
    body.append(left, right);
    return page;
  };
  // Settings, as a page (the same thing opens in a window on the desktop)
  Views.settings = function (arg, view) {
    const page = h('<div><div class="lib-head"><h1 class="title">Settings</h1></div><div id="sethost"></div></div>');
    const inst = D.apps.settings.mount(page.querySelector('#sethost'), D.ctx('settings', 'page', { arg: arg || view.section }));
    view.unmount = () => inst.unmount && inst.unmount();
    view.inst = inst;
    Hero.set(D.app('settings'));
    return page;
  };

  // ---- The legend along the bottom ----------------------------------------------------
  const Legend = D.legend = {};
  Legend.update = function () {
    const el = $('#legend');
    if (!el) return;
    const f = Nav.el && Nav.el.isConnected ? Nav.el : null;
    const items = [];
    const layer = Nav.root();
    const a = f && f.dataset.a ? f.dataset.a : 'Select';
    items.push(['a', a]);
    if (f && f.dataset.x) items.push(['x', f.dataset.x]);
    if (layer.id !== 'view' || Shell.stack.length > 1) items.push(['b', layer.id === 'view' ? 'Back' : 'Close']);
    if (layer.id === 'view') { items.push(['menu', 'Menu']); items.push(['quick', 'Quick access']); }
    if (Shell.view && Shell.view.tabs && layer.id === 'view') items.splice(1, 0, ['rb', 'Next tab']);
    el.innerHTML = items.map(([b, t]) => '<button class="lg" data-act="' + b + '">' + D.btn(b) + '<span>' + esc(t) + '</span></button>').join('');
    el.querySelectorAll('button').forEach((b) => { b.onclick = () => D.input.fire(b.dataset.act, 'mouse'); });
  };
  D.on('source', () => { Legend.update(); if (Shell.view && Shell.view.v === 'library') $$('.hint').forEach((x, i) => { x.innerHTML = D.btn(i ? 'rb' : 'lb'); }); });

  // ---- Dialogs ---------------------------------------------------------------------------
  const Dialog = D.dialog = { prev: null };
  D.ask = function (o) {
    return new Promise((done) => {
      const box = $('#dialog');
      Dialog.prev = Nav.el;
      box.innerHTML = '<div class="box glass" role="dialog" aria-modal="true">' + (o.who ? '<div class="pic"></div>' : '') + '<h2>' + esc(o.title) + '</h2>' + (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
        (o.input ? '<input class="ask-in" data-nav data-first aria-label="' + esc(o.input.label || o.title) + '" type="' + (o.input.type || 'text') + '" autocomplete="off" spellcheck="false">' : '') + '<div class="actions"></div></div>';
      const field = box.querySelector('.ask-in');
      if (field) { field.value = o.input.value || ''; field.placeholder = o.input.placeholder || ''; }
      const answer = (v) => (o.input ? (v ? { value: field.value, ok: v } : null) : v);
      if (o.who) { const c = face(o.who, 96); c.style.cssText = 'width:96px;height:96px;border-radius:24px'; box.querySelector('.pic').appendChild(c); }
      const acts = box.querySelector('.actions');
      (o.buttons || [{ label: 'OK', value: true, go: true }]).forEach((b, i) => {
        const el = h('<button class="b ' + (b.go ? 'go' : '') + (b.danger ? ' danger' : '') + '" data-nav ' + (b.go ? 'data-first' : '') + '>' + esc(b.label) + '</button>');
        if (b.c) el.style.setProperty('--c', b.c);
        el.onclick = () => { Dialog.close(); done(answer(b.value)); };
        if (b.go && field) field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); el.click(); } });
        if (field) el.removeAttribute('data-first');
        acts.appendChild(el);
      });
      Dialog.cancel = () => { Dialog.close(); done(o.cancel === undefined ? null : o.cancel); };
      box.classList.add('open');
      S.play('open');
      Nav.first(box);
      if (field) setTimeout(() => { field.focus(); field.select(); }, 30);
      Legend.update();
    });
  };
  Dialog.close = function () {
    const box = $('#dialog');
    box.classList.remove('open');
    setTimeout(() => { if (!box.classList.contains('open')) box.innerHTML = ''; }, 250);
    if (Dialog.prev && Dialog.prev.isConnected) Nav.focus(Dialog.prev, { scroll: false });
    Legend.update();
  };
  D.friendCard = function (id) {
    const f = D.friends.find((x) => x.id === id);
    D.ask({ who: id, title: f.name, text: f.name + ' ' + f.kind + ' from ' + D.app(id).name + '. ' + f.status + '.', buttons: [{ label: 'Say hi', value: 'hi', go: true, c: G.colourOf(id) }, { label: 'Close', value: null }] })
      .then((v) => { if (v === 'hi') D.sayHi(id); });
  };

  // ---- The menu on the left ----------------------------------------------------------
  const Menu = D.menu = {};
  const menuEl = $('#menu'), scrim = $('#scrim');
  Menu.isOpen = () => menuEl.classList.contains('open');
  Menu.open = function () {
    Qam.close(true); Search.close(true);
    Menu.prev = Nav.el;
    const v = Shell.view ? Shell.view.v : 'home';
    const items = [['home', 'Home', 'home', '#ff707a'], ['library', 'Library', 'library', '#7cc4ff'], ['music', 'Music', 'music', '#d39cf5'], ['settings', 'Settings', 'gear', '#7c9cff']];
    const run = D.running();
    menuEl.innerHTML = '<button class="me" data-nav data-key="m:me"><canvas width="58" height="58"></canvas><span><b>' + esc(D.state.name) + '</b><span>Your name and picture</span></span></button>' +
      '<div class="menu-list">' + (run ? '<button class="mi" data-nav data-key="m:resume" data-first>' + D.icon('play', run.app.c, 2) + 'Resume ' + esc(run.app.name) + '</button><button class="mi" data-nav data-key="m:exit">' + D.icon('close', '#ff4d5e', 3) + 'Close ' + esc(run.app.name) + '</button>' : '') +
      items.map(([id, n, ic, c]) => '<button class="mi ' + (v === id ? 'here' : '') + '" data-nav data-key="m:' + id + '" ' + (!run && v === id ? 'data-first' : '') + '>' + D.icon(ic, c, 2) + n + '</button>').join('') +
      '<button class="mi" data-nav data-key="m:power" aria-expanded="false">' + D.icon('power', '#ff4d5e', 2) + 'Power</button><div class="power" hidden></div></div>' +
      '<div class="menu-foot"><span>' + D.brand + ' ' + (D.sys ? D.sys.info.version : D.version) + '</span><span>' + D.glyph(D.night() ? 'moon' : 'sun', 1) + ' ' + (D.night() ? 'Night' : 'Day') + '</span></div>';
    menuEl.querySelector('canvas').getContext('2d').drawImage(G.face(D.state.avatar, 58, G.hexA(G.colourOf(D.state.avatar), 0.25)), 0, 0);
    const pick = (k) => menuEl.querySelector('[data-key="m:' + k + '"]');
    pick('me').onclick = () => { Menu.close(true); D.launch('settings', { arg: 'you' }); };
    items.forEach(([id]) => { pick(id).onclick = () => { Menu.close(true); if (id === 'music') return D.launch('music'); if (id === 'settings') return D.launch('settings'); D.suspendIfRunning(); Shell.go(id, null, { root: id === 'home' }); if (id !== 'home') Shell.stack.unshift({ v: 'home' }); }; });
    if (run) { pick('resume').onclick = () => { Menu.close(true); D.launch(run.id); }; pick('exit').onclick = () => { Menu.close(true); D.closeApp(); }; }
    pick('power').onclick = () => {
      const p = menuEl.querySelector('.power'), b = pick('power');
      if (!p.hidden) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); return; }
      p.hidden = false; b.setAttribute('aria-expanded', 'true');
      p.innerHTML = '<button class="mi" data-nav data-key="pw:sleep">' + D.icon('moon', '#a487dd', 2) + 'Sleep</button><button class="mi" data-nav data-key="pw:restart">' + D.icon('restart', '#7cc4ff', 2) + 'Restart</button>' +
        (D.sys ? '<button class="mi" data-nav data-key="pw:off">' + D.icon('power', '#ff4d5e', 2) + 'Shut down</button>' : '') +
        '<button class="mi" data-nav data-key="pw:desk">' + D.icon('desktop', '#8fd16a', 2) + 'Switch to Desktop</button><button class="mi" data-nav data-key="pw:wall">' + D.icon('home', '#3f9e6e', 2) + 'Dice Home</button>' + (D.onSite ? '<button class="mi" data-nav data-key="pw:leave">' + D.icon('exit', '#ef6a1f', 2) + 'Back to the website</button>' : '');
      p.querySelector('[data-key="pw:sleep"]').onclick = () => { Menu.close(true); D.sleep(); };
      p.querySelector('[data-key="pw:restart"]').onclick = () => { Menu.close(true); if (D.sys) D.sys.power('reboot'); else D.restart(); };
      const off = p.querySelector('[data-key="pw:off"]'); if (off) off.onclick = () => { Menu.close(true); D.sys.power('shutdown'); };
      p.querySelector('[data-key="pw:desk"]').onclick = () => { Menu.close(true); D.desk.enter(); };
      p.querySelector('[data-key="pw:wall"]').onclick = () => { Menu.close(true); D.wall.enter(); };
      const lv = p.querySelector('[data-key="pw:leave"]'); if (lv) lv.onclick = () => { location.href = '/'; };
      Nav.focus(p.querySelector('[data-nav]'));
    };
    menuEl.classList.add('open'); scrim.classList.add('on');
    menuEl.setAttribute('aria-hidden', 'false');
    S.play('open');
    Nav.first(menuEl);
    Legend.update();
  };
  Menu.close = function (quiet) {
    if (!Menu.isOpen()) return;
    menuEl.classList.remove('open'); menuEl.setAttribute('aria-hidden', 'true');
    if (!Qam.isOpen()) scrim.classList.remove('on');
    if (!quiet) S.play('close');
    if (Menu.prev && Menu.prev.isConnected && !quiet) Nav.focus(Menu.prev, { scroll: false });
    else if (!D.running() || !$('#app').classList.contains('running')) { if (!Nav.el || !Nav.el.isConnected || menuEl.contains(Nav.el)) Nav.first(); }
    Legend.update();
  };
  Menu.toggle = () => (Menu.isOpen() ? Menu.close() : Menu.open());
  scrim.onclick = () => { Menu.close(); Qam.close(); };

  // ---- Quick access on the right ------------------------------------------------------
  const Qam = D.qam = { tab: 'notifs' };
  const qamEl = $('#qam');
  const QTABS = [['notifs', 'bell', 'Notifications'], ['quick', 'bright', 'Quick settings'], ['music', 'music', 'Now playing'], ['help', 'help', 'Help']];
  Qam.isOpen = () => qamEl.classList.contains('open');
  Qam.open = function (tab) {
    Menu.close(true); Search.close(true);
    if (!Qam.isOpen()) Qam.prev = Nav.el;
    qamEl.innerHTML = '<div class="qtabs" role="tablist">' + QTABS.map(([id, ic, n]) => '<button class="qtab" role="tab" data-nav data-key="q:' + id + '" data-tab="' + id + '" title="' + n + '" aria-label="' + n + '" data-sound="tab">' + D.glyph(ic, 2) + (id === 'notifs' && D.unread() ? '<span class="badge"></span>' : '') + '</button>').join('') + '</div><div class="qbody" id="qbody" data-scroll="20"></div>';
    qamEl.querySelectorAll('.qtab').forEach((b) => { b.onclick = () => Qam.show(b.dataset.tab); });
    qamEl.classList.add('open'); scrim.classList.add('on');
    S.play('open');
    Qam.show(tab || Qam.tab);
  };
  Qam.close = function (quiet) {
    if (!Qam.isOpen()) return;
    qamEl.classList.remove('open');
    if (!Menu.isOpen()) scrim.classList.remove('on');
    if (!quiet) S.play('close');
    if (Qam.prev && Qam.prev.isConnected && !quiet) Nav.focus(Qam.prev, { scroll: false });
    Legend.update();
  };
  Qam.toggle = () => (Qam.isOpen() ? Qam.close() : Qam.open());
  Qam.show = function (tab, keepFocus) {
    Qam.tab = tab;
    qamEl.querySelectorAll('.qtab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    const body = $('#qbody');
    const focusKey = keepFocus && Nav.el && body.contains(Nav.el) ? Nav.el.dataset.key : null;
    body.innerHTML = '';
    const title = QTABS.find((t) => t[0] === tab)[2];
    body.appendChild(h('<h2>' + esc(title) + '</h2>'));
    QPANES[tab](body);
    const again = focusKey && body.querySelector('[data-key="' + CSS.escape(focusKey) + '"]');
    if (again) Nav.focus(again, { scroll: false });
    else if (!keepFocus) Nav.focus(qamEl.querySelector('[data-tab="' + tab + '"]'));
    Legend.update();
  };
  const QPANES = {
    notifs(body) {
      const list = D.state.notifs;
      if (!list.length) { body.appendChild(h('<p class="qhint">Nothing yet. Controllers, Dice Cloud and other news show up here.' + (D.tools.quiet() ? ' Do not disturb is on, so they won\'t pop up.' : '') + '</p>')); return; }
      const clear = h('<button class="b small" data-nav data-key="q:clear" style="margin:0 0 12px 6px">' + D.glyph('trash', 2) + 'Clear all</button>');
      clear.onclick = () => { D.state.notifs = []; D.save(); D.emit('notifs'); Qam.show('notifs'); };
      body.appendChild(clear);
      list.slice(0, 30).forEach((n, i) => {
        const r = h('<button class="qrow ' + (n.read ? '' : 'unread') + '" data-nav data-key="q:n' + i + '"><span><b>' + esc(n.title) + '</b><span>' + esc(n.text || '') + '</span></span><small class="muted">' + D.ago(n.t) + '</small></button>');
        r.prepend(n.who ? face(n.who, 40) : h('<span class="pic" style="display:grid;place-items:center;background:color-mix(in srgb,' + (n.c || '#7c9cff') + ' 22%,var(--bg))">' + D.icon(n.icon || 'bell', n.c || '#7c9cff', 2) + '</span>'));
        r.onclick = () => { if (n.who) D.friendCard(n.who); };
        body.appendChild(r);
      });
      setTimeout(() => { D.state.notifs.forEach((n) => { n.read = true; }); D.save(); D.emit('notifs'); }, 1500);
    },
    quick(body) {
      const s = D.state;
      const g = h('<div class="qgroup"></div>');
      g.appendChild(segRow('Look', [['auto', 'Clock'], ['day', 'Day'], ['night', 'Night']], s.look, (v) => { D.set('look', v); D.applyLook(true); }, 'q:look'));
      const st = D.sys && D.sys.status;
      if (st && st.wifi !== null) {
        const w = h('<button class="toggle-row" data-nav data-key="q:wifi"><span>Wi-Fi<small>' + esc(st.wifi && st.wifi.ssid ? 'Connected to ' + st.wifi.ssid : 'Not connected') + '</small></span>' + D.glyph('wifi', 2) + '</button>');
        w.onclick = () => { Qam.close(true); D.launch('settings', { arg: 'wifi' }); };
        g.appendChild(w);
      }
      if (st && st.brightness !== null) g.appendChild(sliderRow('Screen brightness', st.brightness, 0.05, 1, (v) => { clearTimeout(QPANES.bt); QPANES.bt = setTimeout(() => D.sys.post('/api/brightness', { level: v }), 120); }, 'q:bright', 'bright'));
      else g.appendChild(sliderRow('Brightness', s.bright, 0.3, 1, (v) => { D.set('bright', v); D.applyBright(); }, 'q:bright', 'bright'));
      if (st && st.volume) g.appendChild(sliderRow('Volume', st.volume.level, 0, 1, (v) => { clearTimeout(QPANES.vt); QPANES.vt = setTimeout(() => D.sys.post('/api/volume', { level: v, muted: false }), 120); }, 'q:vol', 'volume'));
      else g.appendChild(sliderRow('Volume', s.volume, 0, 1, (v) => { D.set('volume', v); S.setVolume(v); }, 'q:vol', 'volume'));
      g.appendChild(toggleRow('Interface sounds', 'Clicks and chimes as you move around', s.ui, (v) => { D.set('ui', v); S.setUi(v); }, 'q:ui'));
      g.appendChild(toggleRow('Less motion', 'Calmer screens, no dissolves', s.motion === 'less', (v) => { D.set('motion', v ? 'less' : 'full'); document.documentElement.dataset.motion = v ? 'less' : 'full'; }, 'q:motion'));
      if (!D.sys) g.appendChild(toggleRow('Full screen', 'Hide the browser around ' + D.brand, !!document.fullscreenElement, (v) => { if (v) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen && document.exitFullscreen().catch(() => {}); }, 'q:full'));
      body.appendChild(g);
      // for the evening: a warmer screen, no pop-ups, and falling asleep to something
      const ev = h('<div class="qgroup"></div>');
      ev.appendChild(toggleRow('Night light', D.state.warm === 'night' ? 'Comes on by itself at sunset' : 'A warmer screen, easier on your eyes', D.tools.warmOn(), (v) => D.tools.setWarm(v ? 'on' : 'off'), 'q:warm'));
      ev.appendChild(toggleRow('Do not disturb', 'Notifications wait in the list, without popping up', D.tools.quiet(), (v) => D.tools.setQuiet(v), 'q:dnd'));
      ev.appendChild(segRow('Sleep timer', [[0, 'Off'], [15, '15 min'], [30, '30'], [60, '60'], [90, '90']], D.tools.sleepMins(), (v) => D.tools.setSleep(v), 'q:sleep'));
      const po = h('<button class="toggle-row" data-nav data-key="q:picoff"><span>Picture off<small>A black screen, and the sound keeps going</small></span>' + D.glyph('tv', 2) + '</button>');
      po.onclick = () => D.tools.pictureOff();
      ev.appendChild(po);
      body.appendChild(ev);
      if (D.sys) {
        const bt = h('<button class="toggle-row" data-nav data-key="q:bt"><span>Bluetooth<small>Controllers, headphones and speakers</small></span>' + D.glyph('bt', 2) + '</button>');
        bt.onclick = () => { Qam.close(true); D.launch('settings', { arg: 'bt' }); };
        body.appendChild(bt);
        D.tools.bt.list().then((r) => { if (!bt.isConnected || !r || !r.ok) return; const on = (r.devices || []).filter((d) => d.connected); bt.querySelector('small').textContent = !r.adapter ? 'This computer has no Bluetooth' : !r.powered ? 'Off' : on.length ? 'Connected: ' + on.map((d) => d.name).join(', ') : 'On, nothing connected'; });
        const row = h('<div style="display:flex;gap:8px;padding:10px 8px 4px;flex-wrap:wrap"></div>');
        const shot = h('<button class="b small" data-nav data-key="q:shot">' + D.glyph('camera', 2) + 'Screenshot</button>');
        shot.onclick = () => { Qam.close(true); D.tools.screenshot(); };
        row.appendChild(shot);
        const lk = h('<button class="b small" data-nav data-key="q:lock">' + D.glyph('lock', 2) + 'Lock</button>');
        lk.onclick = () => { Qam.close(true); D.lock(); };
        row.appendChild(lk);
        [['restart', 'Restart', 'reboot'], ['power', 'Shut down', 'shutdown']].forEach(([ic, n, a]) => { const b = h('<button class="b small" data-nav data-key="q:' + a + '">' + D.glyph(ic, 2) + n + '</button>'); b.onclick = () => { Qam.close(true); D.sys.power(a); }; row.appendChild(b); });
        body.appendChild(row);
      }
    },
    music(body) {
      const now = M.now;
      const card = h('<div class="qset" style="padding:4px 10px 12px"><div class="lab" style="font:500 1.3rem var(--pixel)">' + esc(now ? now.name : 'Nothing playing') + '</div><span class="muted">' + esc(now ? now.by : 'Start Dice Radio, or add your own songs in Music.') + '</span></div>');
      body.appendChild(card);
      const row = h('<div style="display:flex;gap:8px;padding:0 8px 14px"></div>');
      const btn = (ic, key, fn, label) => { const b = h('<button class="b small" data-nav data-key="' + key + '" aria-label="' + label + '">' + D.glyph(ic, 2) + '</button>'); b.onclick = fn; row.appendChild(b); };
      btn('prev', 'q:prev', () => M.prev(), 'Previous');
      btn(now && now.playing ? 'pause' : 'play', 'q:play', () => M.toggle(), 'Play or pause');
      btn('next', 'q:next', () => M.next(), 'Next');
      const open = h('<button class="b small" data-nav data-key="q:openmusic">Open Music</button>'); open.onclick = () => { Qam.close(true); D.launch('music'); }; row.appendChild(open);
      body.appendChild(row);
      body.appendChild(sliderRow('Music volume', D.state.musicVol, 0, 1, (v) => { D.set('musicVol', v); S.setMusic(v); }, 'q:mvol', 'volume'));
      body.appendChild(h('<h2 style="font-size:1.05rem;margin-top:18px">Dice Radio</h2>'));
      M.RADIO.forEach((tr, i) => {
        const r = h('<button class="qrow" data-nav data-key="q:r' + i + '"><span class="pic" style="background:' + tr.c + '"></span><span><b>' + esc(tr.name) + '</b><span>' + tr.bpm + ' beats a minute</span></span>' + (now && now.kind === 'radio' && now.i === i ? '<small>' + (now.playing ? 'Playing' : 'Paused') + '</small>' : '') + '</button>');
        r.onclick = () => M.play('radio', i);
        body.appendChild(r);
      });
    },
    help(body) {
      const k = (b, t) => '<span>' + D.btn(b) + '</span><span>' + t + '</span>';
      body.appendChild(h('<div class="keys">' + k('a', 'Select') + k('b', 'Back') + k('menu', 'The menu (or Ctrl+1)') + k('quick', 'Quick access (or Ctrl+2)') + k('search', 'Search') + k('x', 'More things to do, like taking a site off Watch') + k('lb', 'Previous tab') + k('rb', 'Next tab') + '<span>' + D.btn('a').replace(/>[^<]*</, '>↑↓←→<') + '</span><span>Move around</span></div>'));
      body.appendChild(h('<p class="qhint" style="margin-top:16px">Controllers work too: plug one in' + (D.sys ? ' or pair it in Bluetooth,' : '') + ' then press any button. The mouse and touch work everywhere as well.</p>'));
      body.appendChild(h('<p class="qhint">Home has Today (the time, the weather, what\'s due and what\'s playing), Live (channels to leave on) and Watch, your streaming sites. Leave DiceTV alone for a while and a big clock comes up over your world; any key brings it back.</p>'));
      body.appendChild(h('<p class="qhint">With a TV remote: OK, Back and Home do what they say. Red is Channels, green Axiom, yellow the weather, blue Quick settings. The numbers tune Live channels; Guide opens Axiom\'s guide. On DiceOS your TV\'s own remote works through the HDMI cable.</p>'));
      const row = h('<div style="display:flex;gap:8px;padding:0 8px;flex-wrap:wrap"></div>');
      const ks = h('<button class="b small" data-nav data-key="q:keys">' + D.glyph('keys', 2) + 'All keyboard shortcuts</button>'); ks.onclick = () => { Qam.close(true); D.tools.shortcuts(); };
      const b = h('<button class="b small" data-nav data-key="q:tour">Show the welcome again</button>'); b.onclick = () => { Qam.close(true); welcome(true); };
      row.append(ks, b);
      body.appendChild(row);
    },
  };
  D.on('notifs', () => { if (Qam.isOpen() && Qam.tab === 'notifs') { const b = qamEl.querySelector('[data-tab=notifs] .badge'); if (b && !D.unread()) b.remove(); } });
  D.on('dnd', () => { if (Qam.isOpen() && Qam.tab === 'quick') Qam.show('quick', true); });

  // little controls, shared with Settings
  function segRow(label, opts, cur, set, key) {
    const el = h('<div class="qset"><div class="lab">' + esc(label) + '</div><div class="seg" role="group"></div></div>');
    const seg = el.querySelector('.seg');
    opts.forEach(([v, n]) => {
      const b = h('<button data-nav data-key="' + key + ':' + v + '" aria-pressed="' + (v === cur) + '">' + esc(n) + '</button>');
      b.onclick = () => { seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); set(v); };
      seg.appendChild(b);
    });
    return el;
  }
  function slider(val, min, max, set, key, label) {
    const el = h('<div class="slider" data-nav data-key="' + key + '" role="slider" aria-label="' + esc(label || '') + '" aria-valuemin="' + min + '" aria-valuemax="' + max + '"><div class="track"><div class="fill"></div></div><div class="knob"></div></div>');
    const draw = () => { const k = (val - min) / (max - min); el.querySelector('.fill').style.width = k * 100 + '%'; el.querySelector('.knob').style.left = k * 100 + '%'; el.setAttribute('aria-valuenow', Math.round(val * 100) / 100); };
    const put = (v) => { val = Math.max(min, Math.min(max, Math.round(v * 20) / 20)); draw(); set(val); };
    el._lr = (d) => { put(val + d * (max - min) / 10); S.play('move'); return true; };
    const drag = (e) => { const r = el.getBoundingClientRect(); put(min + (max - min) * Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))); };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); drag(e); el.onpointermove = drag; });
    el.addEventListener('pointerup', () => { el.onpointermove = null; });
    el.onclick = () => {};
    el.dataset.a = 'Adjust with ←→';
    draw();
    return el;
  }
  function sliderRow(label, val, min, max, set, key, icon) {
    const el = h('<div class="qset"><div class="lab">' + (icon ? D.glyph(icon, 2) : '') + esc(label) + '</div></div>');
    el.appendChild(slider(val, min, max, set, key, label));
    return el;
  }
  function toggleRow(label, sub, on, set, key) {
    const el = h('<button class="toggle-row" data-nav data-key="' + key + '" role="switch" aria-checked="' + !!on + '"><span>' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="switch ' + (on ? 'on' : '') + '"></span></button>');
    el.onclick = () => { on = !on; el.setAttribute('aria-checked', on); el.querySelector('.switch').classList.toggle('on', on); set(on); };
    return el;
  }
  D.ui = { segRow, slider, sliderRow, toggleRow };

  // ---- Search ------------------------------------------------------------------------
  const Search = D.search = {};
  const searchEl = $('#search');
  Search.isOpen = () => searchEl.classList.contains('open');
  const ACTIONS = [
    { name: 'Day look', words: 'light theme white', icon: 'sun', run: () => { D.set('look', 'day'); D.applyLook(true); } },
    { name: 'Night look', words: 'dark theme black', icon: 'moon', run: () => { D.set('look', 'night'); D.applyLook(true); } },
    { name: 'Follow the clock', words: 'auto look theme time', icon: 'sun', run: () => { D.set('look', 'auto'); D.applyLook(true); } },
    { name: 'Sleep', words: 'power off screen', icon: 'moon', run: () => D.sleep() },
    { name: 'Lock', words: 'pin password lock screen away', icon: 'lock', run: () => D.lock() },
    { name: 'Restart', words: 'reboot power', icon: 'restart', run: () => D.restart() },
    { name: 'Switch to Desktop', words: 'windows desktop mode', icon: 'desktop', run: () => D.desk.enter() },
    { name: 'Dice Home', words: 'wall clock weather home assistant lights', icon: 'home', run: () => D.wall.enter() },
    { name: 'Controller test', words: 'gamepad joystick buttons', icon: 'pad', run: () => D.launch('settings', { arg: 'pads' }) },
    { name: 'Library', words: 'all apps', icon: 'library', run: () => { D.suspendIfRunning(); Shell.go('library'); } },
    { name: 'Night light', words: 'warm screen eyes evening blue light', icon: 'warm', run: () => D.tools.setWarm(D.tools.warmOn() ? 'off' : 'on') },
    { name: 'Do not disturb', words: 'quiet silence notifications focus', icon: 'quiet', run: () => { D.tools.setQuiet(!D.tools.quiet()); D.toast({ icon: 'quiet', title: D.tools.quiet() ? 'Do not disturb is on' : 'Do not disturb is off', text: D.tools.quiet() ? 'Notifications will wait in the list.' : 'Notifications pop up again.' }); } },
    { name: 'Sleep timer', words: 'sleep timer bed night music stop', icon: 'moon', run: () => Qam.open('quick') },
    { name: 'Picture off', words: 'screen off black listen sound only audio', icon: 'tv', run: () => D.tools.pictureOff() },
    { name: 'Your town', words: 'weather town city place', icon: 'sun', run: () => D.tv.askTown() },
    { name: 'Keyboard shortcuts', words: 'keys keyboard shortcuts help', icon: 'keys', run: () => D.tools.shortcuts() },
    { name: 'Back up', words: 'backup save export restore', icon: 'box', run: () => D.launch('settings', { arg: 'storage' }) },
  ];
  if (D.sys) ACTIONS.push(
    { name: 'Bluetooth', words: 'bluetooth pair controller headphones speaker', icon: 'bt', run: () => D.launch('settings', { arg: 'bt' }) },
    { name: 'Take a screenshot', words: 'screenshot screen capture picture print', icon: 'camera', run: () => D.tools.screenshot() });
  Search.open = function () {
    Menu.close(true); Qam.close(true);
    Search.prev = Nav.el;
    searchEl.innerHTML = '<div class="sbox glass">' + D.glyph('search', 3) + '<input id="sq" data-nav data-key="s:q" placeholder="Search apps and settings" autocomplete="off" spellcheck="false" aria-label="Search"></div><div class="sres" id="sres"></div>';
    searchEl.classList.add('open');
    const q = $('#sq');
    q.oninput = () => Search.run(q.value);
    q.onkeydown = (e) => { if (e.key === 'Enter') { const first = $('#sres [data-nav]'); if (first) { e.preventDefault(); e.stopPropagation(); first.click(); } } };
    Search.run('');
    S.play('open');
    Nav.focus(q); q.focus();
    Legend.update();
  };
  Search.close = function (quiet) {
    if (!Search.isOpen()) return;
    searchEl.classList.remove('open');
    if (!quiet) S.play('close');
    if (Search.prev && Search.prev.isConnected) Nav.focus(Search.prev, { scroll: false });
    Legend.update();
  };
  Search.run = function (q) {
    const out = $('#sres');
    out.innerHTML = '';
    const items = [];
    tvApps().forEach((a) => items.push({ kind: 'App', name: a.name, words: (a.words || '') + ' ' + a.blurb, app: a }));
    (Array.isArray(D.state.watch) ? D.state.watch : D.tv.WATCH).forEach((w) => items.push({ kind: 'Watch', name: w.name, words: 'watch stream video tv ' + D.tv.host(w.url), icon: 'tv', run: () => D.tv.open(w.url) }));
    ACTIONS.forEach((a) => items.push(Object.assign({ kind: 'Do it' }, a)));
    const hits = q.trim() ? items.map((it) => [L.score(q, it), it]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).map((x) => x[1]) : items.filter((it) => it.app).concat(items.filter((it) => it.kind === 'Do it').slice(0, 3));
    if (!hits.length) { out.appendChild(h('<p class="qhint">Nothing called "' + esc(q) + '". Try a word like music, weather or night.</p>')); return; }
    hits.slice(0, 12).forEach((it, i) => {
      const r = h('<button class="qrow glass" data-nav data-key="s:' + i + '"><span><b>' + esc(it.name) + '</b><span class="kind">' + esc(it.kind) + (it.app ? ': ' + esc(it.app.blurb) : '') + '</span></span></button>');
      if (it.app) { const c = D.coverEl(it.app, 'square'); c.className = 'pic art'; r.prepend(c); }
      else if (it.who) r.prepend(face(it.who, 48));
      else r.prepend(h('<span class="pic" style="display:grid;place-items:center;width:48px;height:48px">' + D.glyph(it.icon, 3) + '</span>'));
      r.onclick = () => {
        Search.close(true);
        if (it.app) { D.suspendIfRunning(); Shell.go('page', it.app.id); }
        else if (it.who) D.friendCard(it.who);
        else it.run();
      };
      out.appendChild(r);
    });
  };

  // ---- Running apps ------------------------------------------------------------------------
  const Run = { cur: null };
  D.running = () => Run.cur;
  D.ctx = function (id, mode, extra) {
    extra = extra || {};
    const ctx = {
      id, mode, arg: extra.arg, night: D.night, sound: S, music: M, state: D.state, save: D.save, toast: D.toast, notify: D.notify,
      close: () => (mode === 'desk' ? extra.win && extra.win.close() : mode === 'page' ? Shell.back() : D.closeApp()),
      setTitle: (t) => { if (extra.win) extra.win.setTitle(t); },
      open: (aid, arg) => D.launch(aid, { arg }),
      legend: (items) => { if (mode === 'run') RunLegend.set(items); },
      ui: D.ui, gfx: G, logic: L,
    };
    return ctx;
  };
  const RunLegend = { set(items) {
    const el = $('#runlegend'); if (!el) return;
    el.innerHTML = (items || []).map(([b, t]) => '<span class="lg">' + D.btn(b) + '<span>' + esc(t) + '</span></span>').join('');
  } };
  D.launch = function (id, opts) {
    opts = opts || {};
    const isWeb = id.startsWith('web:');
    const app = isWeb ? D.app(id.slice(4)) : D.app(id);
    if (!app) return;
    if (!isWeb && D.desk.on) return D.desk.open(id, opts);
    if (isWeb) { // its own web page, in its own tab (pigeon won't be shown inside another page, to keep your drive safe)
      const url = (/^https?:/.test(app.web) ? '' : D.origin) + app.web;
      if (D.sys) D.sys.open(url); else window.open(url, '_blank', 'noopener');
      D.touch(app.id);
      return;
    }
    if (app.suite && !isWeb) { Shell.go('page', id); return; }
    if (app.kind === 'system' && !isWeb) {
      D.suspendIfRunning();
      D.touch(id);
      if (id === 'store') Shell.go('store');
      else { if (Shell.view && Shell.view.v === 'settings') { Shell.view.section = Shell.view.arg = opts.arg; Shell.render(); } else Shell.go('settings', opts.arg); }
      return;
    }
    if (Run.cur && Run.cur.id === id) { resume(); return; }
    if (Run.cur && opts.swap) { D.closeApp(true); return D.launch(id, Object.assign({}, opts, { swap: false })); } // a remote's colour buttons switch straight away
    if (Run.cur) {
      return D.ask({ title: 'Close ' + Run.cur.app.name + '?', text: 'Only one thing runs at a time. ' + Run.cur.app.name + ' will close so ' + app.name + ' can open.', buttons: [{ label: 'Close it and open ' + app.name, value: true, go: true, c: app.c }, { label: 'Cancel', value: false }] })
        .then((ok) => { if (ok) { D.closeApp(true); D.launch(id, opts); } });
    }
    const def = isWeb ? webApp(app) : D.apps[id];
    if (!def) return;
    Menu.close(true); Qam.close(true); Search.close(true);
    const host = $('#run');
    pipOn(false);
    host.innerHTML = '<div class="runbody" style="position:absolute;inset:0"></div><button class="pip-hit" aria-label="Back to full screen"><span class="pip-name"></span></button><button class="runhome glass" aria-label="Home">' + D.icon('die', null, 2) + '</button><div class="runhint glass">' + D.btn('b') + ' Home &nbsp; ' + D.btn('menu') + ' Menu</div><div id="runlegend" class="glass" style="position:absolute;right:var(--gut);bottom:18px;z-index:3;display:flex;gap:6px;padding:7px 10px;border-radius:999px;font:700 .88rem/1 var(--read)"></div>';
    host.querySelector('.runhome').onclick = () => D.suspend();
    host.querySelector('.pip-hit').onclick = () => resume();
    const start = () => {
      $('#app').classList.add('running');
      Hero.paused = true;
      const inst = def.mount(host.querySelector('.runbody'), D.ctx(id, 'run', { arg: opts.arg })) || {};
      Run.cur = { id, app, inst, since: performance.now() };
      D.touch(isWeb ? app.id : id);
      document.documentElement.style.setProperty('--c', app.c);
      if (!$('#runlegend').innerHTML) $('#runlegend').hidden = true;
    };
    const from = opts.from && opts.from.getBoundingClientRect ? opts.from : null;
    if (from && !D.reduced()) launchAnim(app, from, start); else { S.play('select'); start(); }
  };
  // Opening an app: its colour opens out from the block you picked, while the icon (kept at its
  // own size, never stretched) drifts to the middle and fades, then the app is there.
  function launchAnim(app, from, done) {
    const box = from.querySelector('.bk') || from, r = box.getBoundingClientRect();
    const el = $('#launch'), W = innerWidth, H = innerHeight;
    const rad = Math.round(Math.min(r.width, r.height) * 0.24), size = Math.round(Math.max(48, Math.min(r.width, r.height, 160)));
    const clip = (t, rt, bt, l, rr) => 'inset(' + Math.round(t) + 'px ' + Math.round(rt) + 'px ' + Math.round(bt) + 'px ' + Math.round(l) + 'px round ' + rr + 'px)';
    el.className = 'opening';
    el.innerHTML = '';
    const icon = G.appIconEl(app.id, size);
    el.appendChild(icon);
    el.style.cssText = 'left:0;top:0;width:100%;height:100%;opacity:1;transition:none;transform:none;--lc:' + app.c + ';clip-path:' + clip(r.top, W - r.right, H - r.bottom, r.left, rad);
    icon.style.cssText = 'position:absolute;left:0;top:0;width:' + size + 'px;height:' + size + 'px;transition:none;transform:translate(' + (r.left + r.width / 2 - size / 2) + 'px,' + (r.top + r.height / 2 - size / 2) + 'px)';
    el.hidden = false;
    S.play('open');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'clip-path .4s cubic-bezier(.2,.8,.2,1), opacity .24s';
      el.style.clipPath = clip(0, 0, 0, 0, 0);
      icon.style.transition = 'transform .4s cubic-bezier(.2,.8,.2,1), opacity .18s .2s';
      icon.style.transform = 'translate(' + (W / 2 - size / 2) + 'px,' + (H / 2 - size / 2) + 'px)';
      icon.style.opacity = '0';
    }));
    setTimeout(() => { done(); el.style.opacity = '0'; setTimeout(() => { el.hidden = true; el.className = ''; el.innerHTML = ''; }, 280); }, 410);
  }
  function resume() {
    if (!Run.cur) return;
    Menu.close(true); Qam.close(true);
    const wasPip = D.pip();
    pipOn(false);
    $('#app').classList.add('running');
    if (wasPip && Run.cur.inst.unpip) Run.cur.inst.unpip();
    Hero.paused = true;
    Run.cur.since = performance.now();
    if (Run.cur.inst.resume) Run.cur.inst.resume();
    S.play('select');
  }
  // Picture in picture: an app that's playing something (the news, say) can stay on in a
  // small box in the corner while you're on Home. Its block on Home (or the box) brings it back.
  const pipOn = (on) => { $('#app').classList.toggle('pip', !!on); if (on) $('#run .pip-hit .pip-name').textContent = Run.cur.inst.pipName ? Run.cur.inst.pipName() : Run.cur.app.name; };
  D.pip = () => $('#app').classList.contains('pip');
  D.on('desk', (on) => { if (on && D.pip()) D.closeApp(true); }); // the desktop has its own windows
  D.suspend = function () {
    if (!Run.cur || !$('#app').classList.contains('running')) return;
    accountPlay();
    $('#app').classList.remove('running');
    Hero.paused = false;
    const pip = Run.cur.inst.pip && Run.cur.inst.pip() && D.state.pip !== false;
    pipOn(pip);
    if (!pip && Run.cur.inst.pause) Run.cur.inst.pause();
    S.play('back');
    Shell.go('home', null, { root: true, quiet: true });
    Hero.set(Run.cur.app);
  };
  D.suspendIfRunning = () => { if (Run.cur && $('#app').classList.contains('running')) { accountPlay(); $('#app').classList.remove('running'); Hero.paused = false; if (Run.cur.inst.pause) Run.cur.inst.pause(); } };
  D.closeApp = function (quiet) {
    if (!Run.cur) return;
    accountPlay();
    try { if (Run.cur.inst.unmount) Run.cur.inst.unmount(); } catch (e) { console.error(e); }
    const was = Run.cur;
    Run.cur = null;
    $('#app').classList.remove('pip');
    $('#run').innerHTML = '';
    const wasShowing = $('#app').classList.contains('running');
    $('#app').classList.remove('running');
    Hero.paused = false;
    if (!quiet) { S.play('close'); if (wasShowing || (Shell.view && Shell.view.v === 'home')) Shell.go('home', null, { root: true, quiet: true }); else Shell.render(true); Hero.set(was.app); }
  };
  function accountPlay() {
    if (!Run.cur || !$('#app').classList.contains('running')) return;
    const now = performance.now();
    const key = Run.cur.app.id;
    D.state.played[key] = (D.state.played[key] || 0) + (now - Run.cur.since) / 1000;
    Run.cur.since = now;
    D.save();
  }
  setInterval(accountPlay, 10000);
  // pigeon's own web page, in DiceWeb
  function webApp(app) {
    return { mount(root) {
      root.innerHTML = '<iframe title="' + esc(app.name) + '" src="' + esc(app.web) + '?embed=1" style="position:absolute;inset:0;width:100%;height:100%;border:0;background:var(--bg)"></iframe>';
      return {};
    } };
  }
  D.webApp = webApp;

  // ---- What the buttons do ------------------------------------------------------------
  D.input.handler = function (a) {
    if (D.booting) return D.skipBoot();
    if (D.asleep) return D.wake();
    if (D.wall && D.wall.on && D.wall.action(a)) return;
    if (D.desk.on) return D.desk.action(a);
    if ($('#dialog.open')) {
      if (a === 'b') { Dialog.cancel(); S.play('back'); return; }
      if (a === 'a') return Nav.press();
      if (['up', 'down', 'left', 'right'].includes(a)) return Nav.move(a);
      return;
    }
    // a running app gets first go
    if (Run.cur && $('#app').classList.contains('running') && !Menu.isOpen() && !Qam.isOpen() && !Search.isOpen()) {
      if (Run.cur.inst.onAction && Run.cur.inst.onAction(a)) return;
      if (D.remote && D.remote.global(a)) return;
      if (a === 'b') return D.suspend();
      if (a === 'menu') return Menu.open();
      if (a === 'quick') return Qam.open();
      if (['up', 'down', 'left', 'right'].includes(a)) return Nav.move(a);
      if (a === 'a') return Nav.press();
      if (a === 'x' && Nav.el && Nav.el._x) { S.play('select'); Nav.el._x(); }
      return;
    }
    if (D.remote && D.remote.global(a)) return;
    switch (a) {
      case 'up': case 'down': case 'left': case 'right':
        if (Search.isOpen() && document.activeElement && document.activeElement.id === 'sq' && a === 'up') return;
        return Nav.move(a);
      case 'a': return Nav.press();
      case 'x': if (Nav.el && Nav.el._x) { S.play('select'); Nav.el._x(); } else if (Nav.el && Nav.el.dataset.x === 'Close') { D.closeApp(); } return;
      case 'b':
        if (Search.isOpen()) return Search.close();
        if (Qam.isOpen()) return Qam.close();
        if (Menu.isOpen()) return Menu.close();
        if (Shell.view && Shell.view.inst && Shell.view.inst.onAction && Shell.view.inst.onAction('b')) return;
        if (Run.cur && Shell.stack.length <= 1) return D.launch(Run.cur.id);
        return Shell.back();
      case 'menu': return Menu.toggle();
      case 'quick': return Qam.toggle();
      case 'search': return Search.isOpen() ? Search.close() : Search.open();
      case 'lb': case 'rb': {
        if (Qam.isOpen()) { const i = QTABS.findIndex((t) => t[0] === Qam.tab); const n = QTABS[(i + (a === 'rb' ? 1 : -1) + QTABS.length) % QTABS.length][0]; S.play('tab'); return Qam.show(n); }
        const v = Shell.view;
        if (v && v.inst && v.inst.onAction && v.inst.onAction(a)) return;
        if (v && v.tabs) { const i = v.tabs.indexOf(v.tab || v.tabs[0]); v.tab = v.tabs[(i + (a === 'rb' ? 1 : -1) + v.tabs.length) % v.tabs.length]; S.play('tab'); Shell.render(); Nav.focus($('[data-key="tab:' + v.tab + '"]')); }
        return;
      }
      case 'y': return Search.open();
    }
  };

  // ---- Performance overlay ---------------------------------------------------------------
  const Perf = D.perf = { frames: [], last: 0 };
  Perf.show = function () {
    const el = $('#perf');
    el.hidden = !D.state.perf;
    el.innerHTML = '<span class="fps"></span>' + (D.state.perf >= 2 ? '<canvas width="160" height="36"></canvas>' : '') + (D.state.perf >= 3 ? '<span class="row2"></span>' : '');
  };
  Perf.tick = function (now) {
    const dt = now - (Perf.last || now);
    Perf.last = now;
    Perf.frames.push(dt);
    if (Perf.frames.length > 120) Perf.frames.shift();
    if (now - (Perf.drawn || 0) < 250) return;
    Perf.drawn = now;
    const avg = Perf.frames.reduce((a, b) => a + b, 0) / Perf.frames.length || 16;
    const fps = Math.round(1000 / avg);
    const el = $('#perf');
    if (D.state.perf && !el.hidden) {
      el.querySelector('.fps').textContent = fps + ' FPS';
      const c = el.querySelector('canvas');
      if (c) graph(c);
      const r2 = el.querySelector('.row2');
      if (r2) r2.textContent = (avg.toFixed(1) + ' ms a frame') + (performance.memory ? ', ' + Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '') + ', worlds at ' + (D.state.fps || 'any') + ' FPS' + (D.battery ? ', battery ' + Math.round(D.battery.level * 100) + '%' : '');
    }
    if (Perf.mini && Perf.mini.isConnected) { Perf.mini.querySelector('#q-fps').textContent = fps + ' FPS, ' + avg.toFixed(1) + ' ms'; graph(Perf.mini.querySelector('canvas')); }
  };
  function graph(c) {
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const ink = D.ink();
    g.fillStyle = G.hexA(ink, 0.12); g.fillRect(0, H - Math.round(H * 16.7 / 50), W, 1);
    const n = Perf.frames.length, bw = W / 120;
    Perf.frames.forEach((f, i) => { const hh = Math.min(H, f / 50 * H); g.fillStyle = f > 34 ? '#ff4d5e' : f > 20 ? '#f5c431' : '#4fc16b'; g.fillRect(Math.floor((120 - n + i) * bw), H - hh, Math.max(1, Math.ceil(bw) - 1), hh); });
  }

  // ---- Brightness, sleep, restart -------------------------------------------------------
  D.applyBright = () => { $('#dim').style.opacity = String((1 - D.state.bright) * 0.8); };
  D.sleep = function () {
    D.asleep = true;
    D.wasPlaying = M.now && M.now.playing;
    if (D.wasPlaying) M.pause();
    if (Run.cur && Run.cur.inst.pause) Run.cur.inst.pause();
    accountPlay();
    S.play('sleep');
    const el = $('#sleep');
    el.innerHTML = '<div style="text-align:center"><canvas width="24" height="24"></canvas><p>Press any key or button to wake up</p></div>';
    const g = el.querySelector('canvas').getContext('2d');
    g.fillStyle = '#f6f0d8';
    for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { if (x * x + y * y > 66) continue; const bx = x + 4.5, by = y - 2.5; if (bx * bx + by * by < 40) continue; g.fillRect(12 + x, 12 + y, 1, 1); }
    el.classList.add('on');
    setTimeout(() => { el.onclick = () => D.wake(); }, 400);
  };
  D.wake = function () {
    if (!D.asleep) return;
    D.asleep = false;
    $('#sleep').classList.remove('on');
    S.play('wake');
    if (D.wasPlaying) M.resume();
    if (Run.cur && ($('#app').classList.contains('running') || D.pip())) { Run.cur.since = performance.now(); if (Run.cur.inst.resume) Run.cur.inst.resume(); }
  };
  D.restart = function () {
    if (Run.cur) D.closeApp(true);
    if (D.desk.on) D.desk.exit(true);
    M.stop();
    Shell.stack = [];
    D.boot('full', () => Shell.go('home', null, { root: true, quiet: true }));
  };

  // ---- Boot ---------------------------------------------------------------------------------
  D.boot = function (kind, then) {
    const el = $('#boot');
    if (kind === 'off') { el.classList.add('gone'); el.hidden = true; then && then(); return; }
    D.booting = true;
    el.hidden = false; el.classList.remove('gone');
    el.innerHTML = '<div class="stage"><canvas width="72" height="84"></canvas><div class="word pix" aria-label="' + D.brand + '"></div><div class="bar">' + '<i></i>'.repeat(12) + '</div></div><div class="skip">Press any key to skip</div>';
    const c = el.querySelector('canvas'), g = c.getContext('2d'), word = el.querySelector('.word'), bars = el.querySelector('.bar').children;
    g.imageSmoothingEnabled = false;
    const t0 = performance.now(), quick = kind === 'quick' || D.reduced();
    const T = quick ? { drop: 0, word: 100, end: 650 } : { drop: 1100, word: 1300, end: 2400 };
    const night = D.night(), outline = night ? [58, 58, 68] : null;
    let raf = 0, landed = false;
    const shadow = (w, a) => { for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,' + (a * (k ? 0.5 : 1)).toFixed(3) + ')'; g.fillRect(36 - w / 2 - k * 2, 76 + k, w + k * 4, 1); } };
    function frame(now) {
      const t = Math.max(0, now - t0);
      g.clearRect(0, 0, 72, 84);
      if (t < T.drop) { // tumbling down, bouncing once, settling into its pose
        const k = t / T.drop;
        const fall = Math.min(1, k / 0.55);
        let y = -70 + 70 * (1 - Math.pow(1 - fall, 2));
        if (k > 0.55) y = -Math.abs(Math.sin((k - 0.55) / 0.45 * Math.PI)) * 12 * (1 - (k - 0.55) / 0.45);
        if (k > 0.5 && !landed) { landed = true; S.play('land'); }
        const step = Math.round(k * 40);
        shadow(Math.round(26 + y * 0.15), 0.18 * Math.min(1, fall));
        g.drawImage(G.die(64, DiceDie.tumble(k), { key: 'boot' + step + (night ? 'n' : ''), ss: 2, outline }), 4, Math.round(10 + y));
      } else {
        shadow(26, 0.18);
        g.drawImage(G.die(64, null, { key: 'boot-rest' + (night ? 'n' : ''), ss: 3, outline, ray: true }), 4, 10);
      }
      const wk = Math.max(0, Math.min(1, (t - T.word) / 500));
      const text = D.brand;
      word.textContent = text.slice(0, Math.round(wk * text.length));
      [...bars].forEach((b, i) => b.classList.toggle('on', i < Math.round(Math.min(1, t / T.end) * 12)));
      if (t >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      cancelAnimationFrame(raf);
      if (!D.booting) return;
      D.booting = false;
      D.skipBoot = () => {};
      if (!quick) S.play('boot');
      el.classList.add('gone');
      setTimeout(() => { el.hidden = true; }, 520);
      then && then();
    }
    D.skipBoot = finish;
    raf = requestAnimationFrame(frame);
  };
  D.skipBoot = () => {};

  // ---- First time here -----------------------------------------------------------------
  function welcome(again) {
    D.ask({ who: 'cubby', title: again ? 'Hello again' : 'Welcome to ' + D.brand, text: 'Move with the arrow keys or a controller. Enter picks things, Esc goes back, M opens the menu and Q opens Quick access. The mouse works too.', buttons: [{ label: 'Let\'s go', value: true, go: true }] });
  }

  // ---- On Dice: the settings chosen on the website ----------------------------------
  const WORLDS = { hills: '#7cc4ff', mountains: '#7c9cff', beach: '#ff7a59', city: '#2bc4b2', forest: '#8fd16a', autumn: '#e8913a', desert: '#ef6a1f', garden: '#f5c431', ice: '#9fd3ff', deep: '#d39cf5', meadow: '#d7f07a', pond: '#f6a6b8' };
  D.WORLDS = WORLDS;
  function fromPi(first) {
    const s = D.sys.settings || {};
    const fresh = first || (s.welcome && D.state.welcomed !== s.welcome.at);
    if (!fresh) return;
    if (s.name) D.state.name = String(s.name).slice(0, 20);
    if (['auto', 'day', 'night'].includes(s.look)) D.state.look = s.look;
    if (s.buddy && (s.buddy === 'cubby' || ART.mascots[s.buddy])) D.state.avatar = s.buddy;
    if (['full', 'quick', 'off'].includes(s.boot)) D.state.boot = s.boot;
    D.state.start = s.start === 'gaming' || s.start === 'tv' ? 'game' : s.start === 'home' ? 'home' : 'desk';
    if (WORLDS[s.world]) D.state.world = s.world;
    if (s.homeassistant) D.state.ha = s.homeassistant;
    D.save();
    D.applyLook(true);
  }
  function piWelcome(w) {
    D.state.welcomed = w.at; D.save();
    D.sys.saveSettings({ welcome: null });
    const lines = (w.done || []).concat((w.problems || []).map((p) => 'Heads up: ' + p)).map((l) => String(l).replace(/\.+$/, ''));
    D.ask({ who: D.state.avatar, title: w.name ? 'DiceOS is ready, ' + w.name : 'DiceOS is ready', text: lines.length ? lines.join('. ') + '.' : 'Everything is set up.', buttons: [{ label: 'Let\'s go', value: true, go: true }] });
  }

  // ---- Every frame --------------------------------------------------------------------------
  function loop(now) {
    D.input.pollPads(now);
    if (D.wall && D.wall.on) D.wall.frame(now); // Dice Home covers everything, so nothing else needs drawing
    else if (D.ambient && D.ambient.on) D.ambient.frame(now); // and so does the ambient screen
    else if (!D.desk.on && !document.hidden) Hero.draw(now);
    if (D.desk.on && !(D.wall && D.wall.on)) D.desk.frame(now);
    Perf.tick(now);
    if (Run.cur && Run.cur.inst.frame && $('#app').classList.contains('running')) Run.cur.inst.frame(now);
    requestAnimationFrame(loop);
  }

  // ---- Start up ---------------------------------------------------------------------------
  Shell.start = function () {
    document.title = D.brand;
    // the tab's icon: the same die, drawn small
    try { const l = document.querySelector('link[rel=icon]'); if (l) l.href = G.die(32, null, { key: 'favicon' }).toDataURL('image/png'); } catch (e) { /* keep the drawn one */ }
    document.documentElement.dataset.motion = D.state.motion;
    document.documentElement.setAttribute('data-input', 'keys');
    D.applyLook(true);
    D.applyBright();
    S.setVolume(D.state.volume); S.setUi(D.state.ui); S.setMusic(D.state.musicVol);
    Perf.show();
    badge();
    M.load();
    const first = D.state.fresh;
    if (D.sys) fromPi(first);
    Hero.set(D.app(D.state.recent[0] || 'music'));
    Shell.go('home', null, { root: true, quiet: true });
    requestAnimationFrame(loop);
    // a link can ask for a place to start, just this once: ?start=tv, ?start=home, ?open=settings:cloud
    const q = new URLSearchParams(location.search), want = q.get('start'), open = q.get('open');
    const start = want === 'tv' ? 'game' : want === 'home' || want === 'desk' ? want : D.state.start;
    const after = () => {
      if (start === 'desk' || start === 'home') D.desk.enter(true);
      if (start === 'home') D.wall.enter();
      const wel = D.sys && D.sys.settings.welcome;
      if (wel) setTimeout(() => piWelcome(wel), 700);
      else if (first && start !== 'home') setTimeout(() => welcome(), 600);
      if (open) { const [id, arg] = open.split(':'); if (D.app(id)) setTimeout(() => D.launch(id, { arg }), 400); }
    };
    D.boot(first ? 'full' : D.state.boot, after);
    D.save(true);
    if (D.onSite) fetch('/versions.json').then((r) => r.json()).then((v) => { D.versions = v.apps || v; }).catch(() => {});
  };
})();
