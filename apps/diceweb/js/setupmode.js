// Set-up mode: DiceWeb opened from the DiceOS page's "Make it yours" (diceweb/?setup=1). It's
// a version of DiceOS to arrange before you install it, kept apart from your own DiceWeb (its
// own saved state, see core.js). It starts from what you picked on the page, and whatever you
// change here goes straight back there, and so into your dice.json:
//   - your home screens: the dock, DiceTV's Home, the Dice menu and the desktop's widgets
//     (the bar's Home screens button, or right-click an app in the Dice menu, or the desktop);
//   - apps to install (the Store's Apps, or the bar's Apps button): DiceOS gets them from
//     Flathub by itself the first time it's online;
//   - websites as apps (the Store's Web apps);
//   - the look and the rest you change in Settings (your name, world, Traced mode, accent…).
// The page and this tab share the website's storage ("dice-setup"), so the page keeps up as you go.
(function () {
  'use strict';
  const D = window.Dice;
  if (!D.setupMode) return;
  const h = D.h, esc = D.esc, KEY = 'dice-setup';
  const read = () => { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && typeof c === 'object' ? c : {}; } catch (e) { return {}; } };
  const write = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* storage full or blocked */ } };
  const APP_ID = /^[A-Za-z][\w-]*(\.[\w-]+){2,}$/; // a Flathub app id, like org.videolan.VLC

  // ---- start from the page's settings (the page keeps two of them its own way) ----
  const page = read();
  const cfg = Object.assign({}, page);
  if ('traced' in cfg) cfg.looks = cfg.traced ? 'traced' : 'normal';
  if ('lessMotion' in cfg) cfg.motion = cfg.lessMotion ? 'less' : 'full';
  if (cfg.tv && !cfg.tv.live) cfg.tv = Object.assign({}, cfg.tv, { live: null });
  // a fresh start each time, so it always matches the page
  ['dock', 'homeApps', 'startPins', 'widgets'].forEach((k) => { delete D.state[k]; });
  if (D.state.myapps) D.state.myapps.web = [];
  D.prefs.apply(cfg);
  D.state.fresh = false; // no welcome: you know where you are

  const SU = D.setup = {
    apps: () => (Array.isArray(read().apps) ? read().apps.filter((a) => APP_ID.test(a)) : []),
    toggleApp(id) {
      if (!APP_ID.test(id)) return;
      const c = read(), list = Array.isArray(c.apps) ? c.apps : [];
      c.apps = list.includes(id) ? list.filter((x) => x !== id) : list.concat([id]);
      write(c); paintBar();
    },
  };

  // ---- whatever changes here goes back to the page ----
  function mirror() {
    const c = read(), j = D.prefs.json();
    if (j.name && j.name !== 'player') c.name = j.name;
    ['look', 'buddy', 'boot', 'start', 'world', 'accent', 'text', 'clock', 'units', 'sounds', 'nightlight'].forEach((k) => { c[k] = j[k]; });
    c.traced = j.looks === 'traced';
    c.lessMotion = j.motion === 'less';
    c.ambient = Object.assign({}, c.ambient, { after: j.ambient.after });
    c.deuce = j.deuce;
    c.tv = Object.assign({}, c.tv, { live: j.tv.live || '', have: j.tv.have, tuner: j.tv.tuner });
    c.desk = Object.assign({}, c.desk, j.desk);
    if (j.homeassistant) c.homeassistant = j.homeassistant;
    if (j.layout) c.layout = j.layout; else delete c.layout;
    if (j.webapps) c.webapps = j.webapps; else delete c.webapps;
    write(c);
    paintBar();
  }
  const save0 = D.save;
  let mt = 0;
  D.save = function () { const r = save0.apply(D, arguments); clearTimeout(mt); mt = setTimeout(mirror, 350); return r; };

  // ---- the bar along the top ----
  let bar = null, sheet = null;
  function paintBar() {
    if (!bar) return;
    const n = SU.apps().length, name = read().name;
    bar.querySelector('.su-who').textContent = name ? 'for ' + name : '';
    const a = bar.querySelector('.su-n'); a.textContent = n; a.hidden = !n;
    const m = bar.querySelector('[data-a="mode"]');
    m.lastChild.textContent = D.desk.on ? 'DiceTV' : 'Desktop';
    m.setAttribute('aria-label', D.desk.on ? 'See DiceTV, to arrange its Home' : 'Back to the desktop');
  }
  function build() {
    bar = h('<div id="setupbar" class="glass" role="toolbar" aria-label="Setting up DiceOS">' +
      '<span class="su-die" aria-hidden="true"></span><div class="su-t"><b>Setting up DiceOS <span class="su-who"></span></b><small>Changes here go into your dice.json</small></div>' +
      '<button class="su-b" data-a="arrange">' + D.glyph('desktop', 1) + '<span>Home screens</span></button>' +
      '<button class="su-b" data-a="apps">' + D.glyph('store', 1) + '<span>Apps</span><b class="su-n" hidden></b></button>' +
      '<button class="su-b" data-a="mode">' + D.glyph('tv', 1) + '<span>DiceTV</span></button>' +
      '<button class="su-b go" data-a="done"><span>Done</span></button></div>');
    if (D.dicemenu && D.dicemenu.die) bar.querySelector('.su-die').appendChild(D.dicemenu.die(26));
    bar.querySelector('[data-a="arrange"]').onclick = () => (sheet ? closeSheet() : openSheet());
    bar.querySelector('[data-a="apps"]').onclick = () => D.launch('store', { arg: 'apps' });
    bar.querySelector('[data-a="mode"]').onclick = () => { closeSheet(); if (D.desk.on) D.desk.exit(); else D.desk.enter(); setTimeout(paintBar, 300); };
    bar.querySelector('[data-a="done"]').onclick = () => {
      mirror();
      // opened from the page in its own tab: close it and the page is right there, up to date
      window.close();
      setTimeout(() => { location.href = (D.onSite ? '' : D.origin) + '/dice#make'; }, 150);
    };
    document.body.appendChild(bar);
    paintBar();
    D.on('desk', () => setTimeout(paintBar, 50));
  }

  // ---- arranging the home screens: each list in order, with arrows to move things and × to take them off ----
  const LISTS = [
    { key: 'dock', title: 'The dock', sub: 'Along the bottom of the desktop', max: 20, now: () => D.desk.pinsNow(), set: (ids) => D.desk.setDock(ids), reset: () => { D.desk.setDock(D.desk.PINS.slice()); delete D.state.dock; D.save(); } },
    { key: 'tv', title: 'DiceTV\'s Home', sub: 'The big tiles at the top, first to seventh', max: 7, tv: true, now: () => (Array.isArray(D.state.homeApps) && D.state.homeApps.length ? D.state.homeApps : ['hum', 'channels', 'browser', 'calendar', 'weather', 'files', 'notes']).filter((id) => D.app(id)), set: (ids) => { D.set('homeApps', ids); if (!D.desk.on && D.shell.view && D.shell.view.v === 'home') D.shell.go('home', null, { root: true, quiet: true }); }, reset: () => { delete D.state.homeApps; D.save(); } },
    { key: 'menu', title: 'The Dice menu', sub: 'Pinned at the top (the Windows key opens it)', max: 24, now: () => D.dicemenu.pinned(), set: (ids) => D.set('startPins', ids), reset: () => { delete D.state.startPins; D.save(); } },
  ];
  const choices = (tv) => D.all().filter((a) => (a.kind === 'app' || a.kind === 'system') && !a.suite && !(tv && a.pc)).sort((a, b) => a.name.localeCompare(b.name));
  function openSheet() {
    sheet = h('<section id="setupsheet" class="glass" aria-label="Your home screens"><header><h2>Your home screens</h2><button class="su-x" data-k="su:x" aria-label="Close">' + D.glyph('close', 1) + '</button></header><div class="su-lists"></div></section>');
    sheet.querySelector('.su-x').onclick = closeSheet;
    document.body.appendChild(sheet);
    paintSheet();
  }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }
  function paintSheet() {
    if (!sheet) return;
    const box = sheet.querySelector('.su-lists');
    box.innerHTML = '';
    LISTS.forEach((L) => {
      const ids = L.now().slice();
      const sec = h('<div class="su-list"><div class="su-lh"><b>' + esc(L.title) + '</b><small>' + esc(L.sub) + '</small><button class="su-link">Back to the usual</button></div><div class="su-chips"></div></div>');
      const chips = sec.querySelector('.su-chips');
      ids.forEach((id, i) => {
        const a = D.app(id);
        const c = h('<span class="su-chip"><span class="su-ic"></span><b>' + esc(a.name) + '</b>' +
          '<button aria-label="Move ' + esc(a.name) + ' earlier"' + (i ? '' : ' disabled') + '>‹</button><button aria-label="Move ' + esc(a.name) + ' later"' + (i < ids.length - 1 ? '' : ' disabled') + '>›</button>' +
          '<button aria-label="Take ' + esc(a.name) + ' off">' + D.glyph('close', 1) + '</button></span>');
        c.querySelector('.su-ic').appendChild(D.appIconEl ? D.appIconEl(a, 22) : D.icon('die', 22));
        const [l, r, x] = c.querySelectorAll('button');
        l.onclick = () => { ids.splice(i - 1, 0, ids.splice(i, 1)[0]); L.set(ids); paintSheet(); };
        r.onclick = () => { ids.splice(i + 1, 0, ids.splice(i, 1)[0]); L.set(ids); paintSheet(); };
        x.onclick = () => { ids.splice(i, 1); L.set(ids); paintSheet(); };
        chips.appendChild(c);
      });
      if (ids.length < L.max) {
        const sel = h('<select class="su-add" aria-label="Add an app to ' + esc(L.title) + '"><option value="">Add an app…</option></select>');
        choices(L.tv).filter((a) => !ids.includes(a.id)).forEach((a) => sel.add(new Option(a.name, a.id)));
        sel.onchange = () => { if (!sel.value) return; ids.push(sel.value); L.set(ids); paintSheet(); };
        chips.appendChild(sel);
      }
      sec.querySelector('.su-link').onclick = () => { L.reset(); paintSheet(); };
      box.appendChild(sec);
    });
    // the desktop's widgets
    const K = (D.deskplus && D.deskplus.KINDS) || {};
    const ws = Array.isArray(D.state.widgets) ? D.state.widgets : [];
    const wsec = h('<div class="su-list"><div class="su-lh"><b>Widgets</b><small>On the desktop. Drag them where you like them.</small></div><div class="su-chips"></div></div>');
    const wc = wsec.querySelector('.su-chips');
    ws.forEach((w, i) => {
      const c = h('<span class="su-chip"><b>' + esc(K[w.type] ? K[w.type][0] : w.type) + '</b><button aria-label="Take this widget off">' + D.glyph('close', 1) + '</button></span>');
      c.querySelector('button').onclick = () => { ws.splice(i, 1); D.save(); D.emit('widgets'); paintSheet(); };
      wc.appendChild(c);
    });
    if (ws.length < 16) {
      const sel = h('<select class="su-add" aria-label="Add a widget"><option value="">Add a widget…</option></select>');
      Object.entries(K).filter(([k]) => k !== 'system').forEach(([k, [name]]) => sel.add(new Option(name, k)));
      sel.onchange = () => {
        if (!sel.value) return;
        const list = Array.isArray(D.state.widgets) ? D.state.widgets : (D.state.widgets = []);
        list.push({ type: sel.value, x: 0.05 + (list.length % 4) * 0.18, y: 0.08 + Math.floor(list.length / 4) * 0.22, text: '' });
        D.save(); D.emit('widgets'); if (!D.desk.on) D.desk.enter(); paintSheet();
      };
      wc.appendChild(sel);
    }
    box.appendChild(wsec);
  }
  D.on('state', (k) => { if (sheet && /^(dock|homeApps|startPins)$/.test(k)) paintSheet(); });

  D.on('booted', () => setTimeout(build, 400));
})();
