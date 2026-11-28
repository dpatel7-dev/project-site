// The desktop's top bar: a Mac's menus in DiceTV's clothes. Two glass pills float over your world,
// like DiceTV's: on the left the die (its menu), the app you're in and its menus (File, Edit, View,
// Window, Help); on the right Shield, Wi-Fi, sound, search, Deuce, Control Centre and the clock.
// Windows get glossy close, minimise and zoom buttons; the dock gets DiceTV's big tiles, a name
// when you point at one, and die pips under what's open (two under the one you're in).
// Settings, Desktop has a switch to go back to the tray at the bottom instead.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, Desk = D.desk;
  if (!Desk) return;
  const MB = (D.menubar = { el: null });
  MB.on = () => D.state.deskMac !== false;

  // menus like a Mac's: words only, with a tick by the one that's on
  const menu = (x, y, items) => D.deskplus && D.deskplus.menu && D.deskplus.menu(x, y, items.map((it) => (it && typeof it === 'object' && !it.html ? Object.assign({}, it, { icon: null }) : it)), 'mb');
  const top = () => Desk.top && Desk.top();
  const appName = () => { const w = top(); return w ? w.app.name : 'Desktop'; };
  // the menus drop from under their own name
  const under = (b) => { const r = b.getBoundingClientRect(); return [r.left, r.bottom + 4]; };
  function edit(cmd) {
    const el = document.activeElement;
    if (el && el.focus) el.focus();
    try { document.execCommand(cmd); } catch (e) { /* not here */ }
  }

  const MENUS = {
    die: () => [
      { label: 'About this computer', run: () => D.launch('settings', { arg: D.sys ? 'about' : 'you' }) },
      '-',
      { label: 'Oops: undo a change…', icon: 'loop', key: 'Super Shift Z', run: () => D.oops.open() },
      { label: 'Roll for it…', icon: 'die', run: () => D.roll.open('any') },
      '-',
      { label: 'Settings…', icon: 'gear', key: 'Ctrl ,', run: () => Desk.open('settings') },
      { label: 'Store…', icon: 'store', run: () => Desk.open('store') },
      '-',
      { label: 'Lock screen', icon: 'lock', key: 'Super L', run: () => D.lock && D.lock() },
      { label: 'Sleep', icon: 'moon', run: () => D.sleep && D.sleep() },
    ].concat(D.sys ? [{ label: 'Restart…', icon: 'loop', run: () => D.sys.power('reboot') }, { label: 'Shut down…', icon: 'power', run: () => D.sys.power('shutdown') }] : [{ label: 'Restart DiceWeb', icon: 'loop', run: () => D.restart() }]),
    app: () => {
      const w = top();
      if (!w) return [{ label: 'Show all apps', icon: 'apps', key: 'M', run: () => Desk.toggleStart() }, { label: 'Widgets…', icon: 'dots', run: () => D.deskplus.gallery(innerWidth / 2, 120) }];
      return [
        { label: 'About ' + w.app.name, run: () => D.notify({ icon: 'help', c: w.app.c, title: w.app.name, text: w.app.sub || w.app.blurb || 'Part of DiceOS.' }) },
        '-',
        { label: 'Hide ' + w.app.name, icon: 'pause', key: 'Ctrl H', run: () => Desk.wins.filter((x) => x.id === w.id).forEach((x) => x.minimise()) },
        { label: 'Quit ' + w.app.name, icon: 'close', key: 'Ctrl Q', run: () => Desk.wins.filter((x) => x.id === w.id).forEach((x) => x.close()) },
      ];
    },
    File: () => {
      const w = top();
      return [
        { label: 'New window', icon: 'plus', key: 'Ctrl N', run: () => (w ? Desk.open(w.id, { fresh: true }) : Desk.open('files')) },
        { label: 'Open Files', icon: 'folder', run: () => Desk.open('files') },
        '-',
        { label: 'Close window', icon: 'close', key: 'Ctrl W', run: () => w && w.close() },
      ];
    },
    Edit: () => [
      { label: 'Undo', icon: 'back', key: 'Ctrl Z', run: () => edit('undo') },
      { label: 'Redo', icon: 'loop', key: 'Ctrl Shift Z', run: () => edit('redo') },
      '-',
      { label: 'Cut', icon: 'cut', key: 'Ctrl X', run: () => edit('cut') },
      { label: 'Copy', icon: 'copy', key: 'Ctrl C', run: () => edit('copy') },
      { label: 'Paste', icon: 'paste', key: 'Ctrl V', run: () => (navigator.clipboard && navigator.clipboard.readText ? navigator.clipboard.readText().then((t) => document.execCommand('insertText', false, t)).catch(() => {}) : edit('paste')) },
      { label: 'Select all', icon: 'check', key: 'Ctrl A', run: () => edit('selectAll') },
    ],
    View: () => {
      const w = top();
      return [
        { label: w && w.max ? 'Back to its own size' : 'Fill the screen', icon: 'desktop', run: () => w && w.toggleMax() },
        { label: 'Left half', icon: 'back', key: 'Super ←', run: () => w && w.snapTo('left') },
        { label: 'Right half', icon: 'forward', key: 'Super →', run: () => w && w.snapTo('right') },
        '-',
        { label: 'Overview', icon: 'apps', key: 'Super Tab', run: () => D.deskplus.overview() },
        { label: 'Day or night', icon: D.night() ? 'sun' : 'moon', run: () => { D.set('look', D.night() ? 'day' : 'night'); D.applyLook(true); } },
      ];
    },
    Window: () => {
      const w = top(), list = Desk.wins.filter((x) => x.ws === Desk.ws);
      return [
        { label: 'Minimise', icon: 'pause', key: 'Ctrl M', run: () => w && w.minimise() },
        { label: 'Zoom', icon: 'desktop', run: () => w && w.toggleMax() },
        { label: 'Bring all to front', icon: 'stack', run: () => list.forEach((x) => Desk.focus(x)) },
        { label: 'Float on top', icon: 'spark', on: !!(w && w.float), run: () => w && D.float.set(!w.float, w) },
      ].concat(list.length ? ['-'] : [], list.map((x) => ({ label: x.app.name + (x.min ? ' (minimised)' : ''), icon: x === w ? 'check' : 'dot', on: x === w, run: () => Desk.focus(x) })));
    },
    Help: () => [
      { label: 'Ask Deuce…', icon: 'spark', key: 'Super C', run: () => (D.deuceAsk ? D.deuce.pc && D.deuce.pc.show ? D.deuce.pc.show() : D.deuceAsk('help') : D.launch('deuce')) },
      { label: 'Show me how…', icon: 'help', run: () => D.showme.pick() },
      { label: 'Keyboard shortcuts', run: () => D.launch('settings', { arg: 'desk' }) },
      { label: 'Set up Inputs, step by step', icon: 'tv', run: () => D.inputs && D.inputs.guide ? D.inputs.guide() : Desk.open('settings') },
      { label: 'What\'s new in DiceOS', icon: 'info', run: () => D.launch('settings', { arg: D.sys ? 'about' : 'you' }) },
    ],
  };

  function build() {
    const desk = D.$('#desk');
    if (!desk || MB.el) return;
    MB.el = h('<div class="mbar" role="menubar" aria-label="Menu bar"><span class="mb-l">' +
      '<button class="mb-die" data-m="die" aria-label="Dice menu">' + D.icon('die', null, 2) + '</button>' +
      '<button class="mb-app" data-m="app"><b></b></button>' +
      ['File', 'Edit', 'View', 'Window', 'Help'].map((m) => '<button class="mb-m" data-m="' + m + '">' + m + '</button>').join('') +
      '</span><span class="mb-r">' +
        '<button class="mb-music" hidden aria-label="Now playing"><span class="eqmini"><i></i><i></i><i></i></span><span class="mb-np"></span></button>' +
        '<button class="mb-shield" aria-label="Shield" title="Shield">' + MB.shieldSvg(true) + '</button>' +
        '<button class="mb-wifi" aria-label="Wi-Fi" title="Wi-Fi"></button>' +
        '<button class="mb-vol" aria-label="Sound" title="Sound"></button>' +
        '<button class="mb-search" aria-label="Search (Ctrl + Space)" title="Search">' + D.glyph('search', 2) + '</button>' +
        '<button class="mb-deuce" aria-label="Deuce (Super + C)" title="Deuce"></button>' +
        '<button class="mb-cc" aria-label="Control Centre (Q)" title="Control Centre"><svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="1" y="2.5" width="14" height="4.5" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="4.6" cy="4.75" r="1.5" fill="currentColor"/><rect x="1" y="9" width="14" height="4.5" rx="2.25" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="11.4" cy="11.25" r="1.5" fill="currentColor"/></svg></button>' +
        '<button class="mb-clock" aria-label="Date and time"></button>' +
      '</span></div>');
    desk.appendChild(MB.el);
    MB.el.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => { const [x, y] = under(b); menu(x, y, MENUS[b.dataset.m]()); MB.el.querySelectorAll('[data-m]').forEach((o) => o.classList.toggle('open', o === b)); };
      // like a Mac: once one menu is open, moving along the bar opens the others
      b.onpointerenter = () => { if (D.$('#desk .dmenu') && MB.el.querySelector('.open') && !b.classList.contains('open')) b.click(); };
    });
    addEventListener('pointerdown', (e) => { if (!e.target.closest('.dmenu') && !e.target.closest('.mbar')) MB.el.querySelectorAll('.open').forEach((o) => o.classList.remove('open')); }, true);
    MB.el.querySelector('.mb-shield').onclick = () => D.launch('settings', { arg: 'shield' });
    MB.el.querySelector('.mb-wifi').onclick = () => D.launch('settings', { arg: D.sys ? 'wifi' : 'you' });
    MB.el.querySelector('.mb-vol').onclick = () => (D.qam.isOpen() ? D.qam.close() : D.qam.open('quick'));
    MB.el.querySelector('.mb-search').onclick = () => D.deskplus.bar();
    MB.el.querySelector('.mb-deuce').onclick = () => { const p = D.$('.dp-dock'); if (p) p.click(); else if (D.deuceAsk) D.deuceAsk(''); };
    MB.el.querySelector('.mb-cc').onclick = () => (D.qam.isOpen() ? D.qam.close() : D.qam.open('quick'));
    MB.el.querySelector('.mb-clock').onclick = () => Desk.open('calendar');
    MB.el.querySelector('.mb-music').onclick = () => Desk.open('hum');
    if (D.deuce && D.deuce.orbSvg) MB.el.querySelector('.mb-deuce').innerHTML = D.deuce.orbSvg(22);
    else MB.el.querySelector('.mb-deuce').innerHTML = D.glyph('spark', 2);
    MB.paint();
  }
  // what's on the right, and the name of the app you're in
  MB.paint = function () {
    if (!MB.el) return;
    const d = new Date();
    MB.el.querySelector('.mb-clock').textContent = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + '  ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    MB.el.querySelector('.mb-app b').textContent = appName();
    const st = D.sys && D.sys.status;
    MB.el.querySelector('.mb-wifi').innerHTML = D.glyph(st && st.wifi ? (st.wifi.ssid ? 'wifi' : 'nowifi') : navigator.onLine ? 'wifi' : 'nowifi', 2);
    MB.el.querySelector('.mb-vol').innerHTML = D.glyph(D.state.volume > 0 ? 'volume' : 'mute', 2);
    const M = D.M, m = MB.el.querySelector('.mb-music');
    m.hidden = !(M && M.now);
    if (M && M.now) { m.querySelector('.mb-np').textContent = M.now.name; m.querySelector('.eqmini').classList.toggle('still', !M.now.playing); }
    const sh = MB.el.querySelector('.mb-shield');
    sh.hidden = !(D.shield && D.shield.available && D.shield.available());
    if (!sh.hidden && D.shield.get && !MB._shAsk) {
      MB._shAsk = true;
      D.shield.get().then((s) => {
        MB._shAsk = false;
        if (!s) return;
        const on = s.on !== false;
        if (sh.dataset.on !== String(on)) { sh.dataset.on = on; sh.innerHTML = MB.shieldSvg(on); }
        sh.title = on ? 'Shield is on: ' + Number(s.today || 0).toLocaleString() + ' ads and trackers kept out today' : 'Shield is off';
        sh.setAttribute('aria-label', sh.title);
      }).catch(() => { MB._shAsk = false; });
    }
  };
  // Shield's badge: glass in two blues with the die's three pips across it; grey, with a line through, when it's off
  MB.shieldSvg = function (on) {
    const id = 'shg' + (on ? 1 : 0);
    return '<svg class="mb-sh ' + (on ? 'on' : 'off') + '" viewBox="0 0 20 22" width="19" height="21" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1">' +
      (on ? '<stop offset="0" stop-color="#43d6bd"/><stop offset=".55" stop-color="#2f9fe0"/><stop offset="1" stop-color="#4b6bec"/>' : '<stop offset="0" stop-color="#b9b9c2"/><stop offset="1" stop-color="#7d7d88"/>') + '</linearGradient></defs>' +
      '<path d="M10 1.3 17.4 4.1C17.6 11.6 15.1 17.1 10 20.7 4.9 17.1 2.4 11.6 2.6 4.1Z" fill="url(#' + id + ')"/>' +
      '<path d="M10 1.3 10 20.7C4.9 17.1 2.4 11.6 2.6 4.1Z" fill="#fff" opacity=".2"/>' +
      '<path d="M10 1.3 17.4 4.1C17.6 11.6 15.1 17.1 10 20.7 4.9 17.1 2.4 11.6 2.6 4.1Z" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1.1" stroke-linejoin="round"/>' +
      '<g fill="#fff"><rect x="5.6" y="5.6" width="2.6" height="2.6" rx=".7"/><rect x="8.7" y="9.2" width="2.6" height="2.6" rx=".7"/><rect x="11.8" y="12.8" width="2.6" height="2.6" rx=".7"/></g>' +
      (on ? '' : '<path d="M3.5 18.5 16.5 3.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M3.5 18.5 16.5 3.5" stroke="#55555f" stroke-width="1.2" stroke-linecap="round"/>') + '</svg>';
  };
  // the desktop's look: the menu bar at the top, or the tray at the bottom
  MB.apply = function () {
    const desk = D.$('#desk');
    if (!desk) return;
    MB.scale();
    desk.classList.toggle('mac', MB.on());
    desk.classList.toggle('mag', D.state.dockMag === true);
    document.documentElement.classList.toggle('desk-mac', MB.on());
    if (MB.on()) build();
    if (MB.el) MB.el.hidden = !MB.on();
    MB.paint();
  };
  // Desk.area leaves room for the bar on top and the bigger dock
  const area0 = Desk.area;
  Desk.area = () => { const a = area0(); return MB.on() ? { w: a.w, h: a.h - MB.TOP - (MB.DOCK - 62) } : a; };
  MB.TOP = 56; MB.DOCK = 92;
  // sized to the screen: the bar and the dock shrink on a small screen (a laptop, a TV at 720p, a Pi's
  // little touch screen) and grow a little on a big one. It goes by the shorter way round, so a very wide
  // monitor doesn't make them huge.
  MB.scale = function () {
    const k = Math.max(0.66, Math.min(1.18, Math.min(innerWidth / 1640, innerHeight / 980)));
    MB.k = Math.round(k * 100) / 100;
    MB.TOP = Math.round(56 * MB.k); MB.DOCK = Math.round(92 * MB.k);
    const desk = D.$('#desk');
    if (desk) desk.style.setProperty('--k', MB.k);
    document.documentElement.style.setProperty('--desk-k', MB.k);
  };
  MB.scale();
  addEventListener('resize', () => { MB.scale(); if (Desk.on) Desk.wins.forEach((w) => { if (w.max || w.snap) w.place(); }); });

  // the dock grows under the pointer, if you'd like that (Settings, Desktop)
  function magnify(e) {
    const shelf = D.$('#desk.mag .dshelf');
    if (!shelf) return;
    shelf.querySelectorAll('.pin, .task, .launch').forEach((b) => {
      if (!e) { b.style.removeProperty('--mag'); return; }
      const r = b.getBoundingClientRect(), dx = Math.abs(e.clientX - (r.left + r.width / 2));
      b.style.setProperty('--mag', (1 + 0.55 * Math.max(0, 1 - dx / 130)).toFixed(3));
    });
  }
  D.on('desk', () => {
    MB.apply();
    const shelf = D.$('#desk .dshelf');
    if (shelf && !shelf.dataset.mag) { shelf.dataset.mag = 1; shelf.addEventListener('pointermove', magnify); shelf.addEventListener('pointerleave', () => magnify(null)); }
  });
  D.on('state', (k) => { if (k === 'deskMac' || k === 'dockMag') MB.apply(); });
  D.on('look', () => MB.paint());
  if (D.M && D.M.on) D.M.on(() => MB.paint());
  setInterval(() => { if (Desk.on && MB.el && !MB.el.hidden) MB.paint(); }, 5000);
  addEventListener('pointerup', () => { if (Desk.on && MB.el) setTimeout(MB.paint, 80); }, true);
  // the app name follows the window you're in
  const focus0 = Desk.focus;
  Desk.focus = function (w) { const r = focus0.apply(Desk, arguments); MB.paint(); return r; };
  // Settings, Desktop: the switches
  D.moreDesk = (D.moreDesk || []).concat([
    { name: 'Menu bar at the top', sub: 'Like a Mac: the app you\'re in and its menus up top, the clock on the right. Off puts the tray back at the bottom.', key: 'deskMac', on: () => D.state.deskMac !== false },
    { name: 'Magnify the dock', sub: 'Icons grow a little as the pointer passes over them.', key: 'dockMag', on: () => D.state.dockMag === true },
  ]);
})();
