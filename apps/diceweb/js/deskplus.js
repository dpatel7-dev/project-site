// More for the desktop, to make DiceOS on a PC the nicest place to work:
//
// - Snapping: drag a window to an edge (left, right, a corner, the top), or hold
//   the pointer on its maximise button for layouts (halves, thirds, quarters).
// - Four desktops, each with its own windows. Ctrl + Alt + ← → or the dots by the clock.
// - Overview: every window at once, laid out so you can pick one. The Super key,
//   F3, the top-left corner or the button in the dock.
// - Alt + Tab (or Alt + `) to flip between windows.
// - The Dice Bar (Ctrl + Space): apps, settings, sums, "5 km in miles", "timer 10",
//   "todo read chapter 7 friday" (straight into Axiom), open windows, web searches.
// - Widgets on the desktop: a clock, the weather, Axiom, music, sticky notes, the computer.
// - Clipboard history (Super + V or Ctrl + Alt + V).
// - Right-click a window's title or the desktop for more.
(function () {
  'use strict';
  const D = window.Dice, L = D.L, M = D.M, S = D.S, G = D.G, h = D.h, esc = D.esc;
  const Desk = D.desk;
  const $d = (sel) => D.$('#desk ' + sel);
  const P = D.deskplus = {};
  let built = false;
  function build() {
    if (built || !$d('.wins')) return;
    built = true;
    const desk = D.$('#desk');
    desk.insertBefore(h('<div class="dwid" aria-label="Widgets"></div>'), desk.querySelector('.wins'));
    desk.appendChild(h('<div class="dsnap" hidden></div>'));
    desk.appendChild(h('<div class="dhot" aria-hidden="true"></div>'));
    // the dock gets an overview button; the tray gets the desktops
    const launch = desk.querySelector('.launch');
    const ov = h('<button class="launch ovbtn" aria-label="Overview (Super)" title="Overview"><svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="3" width="6" height="5" rx="1.2"/><rect x="10" y="3" width="6" height="5" rx="1.2"/><rect x="2" y="10" width="6" height="5" rx="1.2"/><rect x="10" y="10" width="6" height="5" rx="1.2"/></svg></button>');
    ov.onclick = () => P.overview();
    launch.after(ov);
    const bar = h('<button class="launch barbtn" aria-label="Dice Bar (Ctrl + Space)" title="Dice Bar (Ctrl + Space)">' + D.glyph('search', 2) + '</button>');
    bar.onclick = () => P.bar();
    ov.after(bar);
    const ws = h('<div class="dws" role="group" aria-label="Desktops">' + [0, 1, 2, 3].map((i) => '<button data-ws="' + i + '" aria-label="Desktop ' + (i + 1) + '" title="Desktop ' + (i + 1) + ' (Ctrl + Alt + ' + (i + 1) + ')"></button>').join('') + '</div>');
    ws.querySelectorAll('button').forEach((b) => { b.onclick = () => P.toDesktop(+b.dataset.ws); });
    desk.querySelector('.dtray').prepend(ws);
    // the hot corner
    let hotT = 0;
    desk.querySelector('.dhot').addEventListener('pointerenter', () => { if (D.state.hotCorner !== false) hotT = setTimeout(() => P.overview(), 220); });
    desk.querySelector('.dhot').addEventListener('pointerleave', () => clearTimeout(hotT));
    // right-click the desktop
    desk.querySelector('.wall').addEventListener('contextmenu', (e) => { e.preventDefault(); deskMenu(e.clientX, e.clientY); });
    desk.querySelector('.dwid').addEventListener('contextmenu', (e) => { if (e.target.classList.contains('dwid')) { e.preventDefault(); deskMenu(e.clientX, e.clientY); } });
    // layouts when you hold the pointer on a window's maximise button
    desk.querySelector('.wins').addEventListener('pointerover', (e) => {
      const b = e.target.closest && e.target.closest('.wmax');
      if (!b || b._lay) return;
      b._lay = setTimeout(() => { const w = b.closest('.win')._win; const r = b.getBoundingClientRect(); layouts(w, r.right - 230, r.bottom + 6); }, 550);
      b.addEventListener('pointerleave', () => { clearTimeout(b._lay); b._lay = null; }, { once: true });
    });
    paintDesks();
    widgets();
  }

  // ---- where a window will snap, while you drag it ---------------------------------------------
  Desk.preview = function (zone) {
    const p = $d('.dsnap');
    if (!p) return;
    if (!zone) { p.hidden = true; return; }
    const r = L.snapRect(zone, Desk.area());
    Object.assign(p.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    p.hidden = false;
  };

  // ---- little menus --------------------------------------------------------------------------------
  let menuEl = null;
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
  function menu(x, y, items, kind) {
    closeMenu();
    menuEl = h('<div class="dmenu glass' + (kind ? ' dmenu-' + kind : '') + '" role="menu"></div>');
    items.forEach((it) => {
      if (it === '-') return menuEl.appendChild(h('<hr>'));
      if (it.html) return menuEl.appendChild(h(it.html));
      const b = h('<button role="menuitem"' + (it.on ? ' aria-checked="true"' : '') + '>' + (it.icon ? D.glyph(it.icon, 1) : '<span class="dmi"></span>') + '<span>' + esc(it.label) + '</span>' + (it.key ? '<kbd>' + esc(it.key) + '</kbd>' : '') + '</button>');
      b.onclick = () => { closeMenu(); it.run(); };
      menuEl.appendChild(b);
    });
    D.$('#desk').appendChild(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = Math.max(6, Math.min(innerWidth - r.width - 6, x)) + 'px';
    menuEl.style.top = Math.max(6, Math.min(innerHeight - r.height - 6, y)) + 'px';
  }
  addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }, true);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuEl) { closeMenu(); e.stopPropagation(); } }, true);
  const LAYS = [['Left half', ['left', 'right']], ['Thirds', ['l3', 'c3', 'r3']], ['Two thirds and one', ['l23', 'r3']], ['One and two thirds', ['l3', 'r23']], ['Quarters', ['tl', 'tr', 'bl', 'br']]];
  function layoutsHtml() {
    return '<div class="dlays">' + LAYS.map(([name, zones]) => '<div class="dlay" title="' + esc(name) + '">' + zones.map((z) => { const r = L.snapRect(z, { w: 100, h: 64 }, 0); return '<button data-z="' + z + '" style="left:' + r.x + '%;top:' + (r.y / 64 * 100) + '%;width:' + r.w + '%;height:' + (r.h / 64 * 100) + '%" aria-label="' + esc(name + ': ' + z) + '"></button>'; }).join('') + '</div>').join('') + '</div>';
  }
  function layouts(w, x, y) {
    menu(x, y, [{ html: '<p class="dmenu-h">Snap ' + esc(w.app.name) + ' to</p>' }, { html: layoutsHtml() }]);
    menuEl.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { closeMenu(); w.snapTo(b.dataset.z); }; });
  }
  Desk.winMenu = function (w, x, y) {
    const items = [{ label: 'Snap left', icon: 'prev', key: 'Super ←', run: () => w.snapTo('left') }, { label: 'Snap right', icon: 'next', key: 'Super →', run: () => w.snapTo('right') },
      { label: w.max ? 'Restore' : 'Maximise', icon: 'desktop', key: 'Super ↑', run: () => (w.max || w.snap ? w.unsnap() : w.toggleMax()) }, { label: 'Layouts…', icon: 'dots', run: () => layouts(w, x, y) }, '-',
      { label: 'Keep on top', icon: 'lock', on: !!w.pinned, run: () => { w.pinned = !w.pinned; w.el.classList.toggle('pinned', w.pinned); Desk.focus(w); } }];
    [0, 1, 2, 3].filter((i) => i !== w.ws).forEach((i) => items.push({ label: 'Move to desktop ' + (i + 1), icon: 'next', run: () => P.moveTo(w, i) }));
    items.push('-', { label: 'Minimise', icon: 'pause', run: () => w.minimise() }, { label: 'Close', icon: 'close', key: 'Alt F4', run: () => w.close() });
    menu(x, y, items);
  };
  function deskMenu(x, y) {
    const NAMES = { hills: 'Hills', mountains: 'Mountains', beach: 'Beach', city: 'City', forest: 'Forest', autumn: 'Autumn', desert: 'Desert', garden: 'Garden', ice: 'Ice', deep: 'Under the sea', meadow: 'Meadow', pond: 'Pond' };
    menu(x, y, [
      { label: 'Add a sticky note', icon: 'copy', run: () => addWidget('sticky', x, y) },
      { label: 'Widgets…', icon: 'dots', run: () => gallery(x, y) },
      { label: 'Next world: ' + (NAMES[nextWorld()] || ''), icon: 'sun', run: () => { D.set('world', nextWorld()); D.emit('look'); } },
      '-',
      { label: 'Overview', icon: 'desktop', key: 'Super', run: () => P.overview() },
      { label: 'Dice Bar', icon: 'search', key: 'Ctrl Space', run: () => P.bar() },
      { label: 'Night light', icon: 'warm', on: D.tools.warmOn(), run: () => D.tools.setWarm(D.tools.warmOn() ? 'off' : 'on') },
      { label: 'Settings', icon: 'gear', run: () => Desk.open('settings') },
    ]);
  }
  const nextWorld = () => { const ws = Object.keys(D.WORLDS || { hills: 1 }); return ws[(ws.indexOf(D.state.world) + 1) % ws.length]; };

  // ---- four desktops --------------------------------------------------------------------------------
  function paintDesks() {
    const ws = $d('.dws');
    if (!ws) return;
    ws.querySelectorAll('button').forEach((b) => {
      const i = +b.dataset.ws;
      b.classList.toggle('on', i === Desk.ws);
      b.classList.toggle('used', Desk.wins.some((w) => w.ws === i));
    });
    Desk.wins.forEach((w) => { w.el.classList.toggle('offws', w.ws !== Desk.ws); w.task.classList.toggle('offws', w.ws !== Desk.ws); });
  }
  P.toDesktop = Desk.toDesktop = function (i, focusWin) {
    i = (i + 4) % 4;
    if (i === Desk.ws) { if (focusWin) Desk.focus(focusWin); return; }
    const dir = i > Desk.ws ? 1 : -1;
    Desk.ws = i;
    paintDesks();
    const wins = $d('.wins');
    if (wins && !D.reduced()) { wins.classList.remove('slide-l', 'slide-r'); void wins.offsetWidth; wins.classList.add(dir > 0 ? 'slide-r' : 'slide-l'); }
    if (D.remote) D.remote.osd('desktop', 'Desktop ' + (i + 1));
    S.play('tab');
    const t = focusWin || Desk.top();
    if (t) Desk.focus(t);
  };
  P.moveTo = function (w, i) { w.ws = i; paintDesks(); const t = Desk.top(); if (t) Desk.focus(t); D.toast({ icon: 'desktop', title: w.app.name + ' moved', text: 'It\'s on desktop ' + (i + 1) + ' now.' }); };
  setInterval(() => { if (Desk.on) paintDesks(); }, 1500);

  // ---- overview: every window on this desktop, side by side --------------------------------------------
  let ovOn = false;
  P.overview = function () {
    if (!Desk.on) return;
    if (ovOn) return P.closeOverview();
    closeMenu(); P.closeBar(); Desk.toggleStart(false);
    ovOn = true;
    const desk = D.$('#desk'), wins = Desk.wins.filter((w) => w.ws === Desk.ws && !w.min);
    const ov = h('<div class="dov on" role="dialog" aria-label="Overview"><div class="dov-top"><div class="dov-ws"></div><input class="dov-q" data-nav data-key="ov:q" placeholder="Type to search apps, settings and more" aria-label="Search"></div><div class="dov-grid"></div><p class="dov-tip">' + (wins.length ? 'Pick a window, or a desktop above.' : 'Nothing open on this desktop.') + '</p></div>');
    desk.appendChild(ov);
    desk.classList.add('ov');
    ov.querySelector('.dov-ws').innerHTML = [0, 1, 2, 3].map((i) => {
      const mine = Desk.wins.filter((w) => w.ws === i && !w.min), a = Desk.area();
      return '<button class="dov-d' + (i === Desk.ws ? ' on' : '') + '" data-nav data-key="ov:ws' + i + '" data-ws="' + i + '"><span class="dov-mini">' + mine.map((w) => { const b = w.max ? { x: 0, y: 0, w: a.w, h: a.h } : w.snap ? L.snapRect(w.snap, a) : w.box; return '<i style="left:' + (b.x / a.w * 100).toFixed(1) + '%;top:' + (b.y / a.h * 100).toFixed(1) + '%;width:' + (b.w / a.w * 100).toFixed(1) + '%;height:' + (b.h / a.h * 100).toFixed(1) + '%;background:' + w.app.c + '"></i>'; }).join('') + '</span><b>Desktop ' + (i + 1) + '</b></button>';
    }).join('');
    ov.querySelectorAll('.dov-d').forEach((b) => { b.onclick = () => { const i = +b.dataset.ws; P.closeOverview(); P.toDesktop(i); }; });
    const top = ov.querySelector('.dov-top').getBoundingClientRect().bottom + 16, area = { w: innerWidth - 80, h: innerHeight - top - 110 };
    const cells = L.fitGrid(wins.length, area.w, area.h, 36), grid = ov.querySelector('.dov-grid');
    wins.forEach((w, i) => {
      const c = cells[i], r = w.el.getBoundingClientRect(), s = Math.min(c.w / r.width, c.h / r.height, 1);
      const tx = 40 + c.x + (c.w - r.width * s) / 2, ty = top + c.y + (c.h - r.height * s) / 2;
      w._ov = { t: w.el.style.transform };
      w.el.style.transformOrigin = '0 0';
      w.el.style.transform = 'translate(' + (tx - r.left) + 'px,' + (ty - r.top) + 'px) scale(' + s.toFixed(3) + ')';
      const hit = h('<button class="dov-hit" data-nav data-key="ov:w' + i + '" style="left:' + tx + 'px;top:' + ty + 'px;width:' + r.width * s + 'px;height:' + r.height * s + 'px"><span>' + esc(w.el.querySelector('.wt').textContent) + '</span></button>');
      hit.onclick = () => { P.closeOverview(); Desk.focus(w); };
      grid.appendChild(hit);
    });
    const q = ov.querySelector('.dov-q');
    q.oninput = () => { const v = q.value; P.closeOverview(); P.bar(v); };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.classList.contains('dov-grid')) P.closeOverview(); });
    D.nav.focus(grid.querySelector('.dov-hit') || q, { scroll: false });
    if (!grid.querySelector('.dov-hit')) setTimeout(() => q.focus(), 30);
    S.play('open');
  };
  P.closeOverview = function () {
    if (!ovOn) return;
    ovOn = false;
    const ov = $d('.dov');
    if (ov) ov.remove();
    D.$('#desk').classList.remove('ov');
    Desk.wins.forEach((w) => { if (w._ov) { w.el.style.transform = w._ov.t || ''; delete w._ov; } });
  };

  // ---- Alt + Tab ---------------------------------------------------------------------------------------------
  let alt = null;
  function altStep(dir) {
    const order = Desk.wins.filter((w) => w.ws === Desk.ws).sort((a, b) => (b.min ? -1 : b.zi) - (a.min ? -1 : a.zi));
    if (!order.length) return;
    if (!alt) {
      alt = { i: 0, order, el: h('<div class="dalt glass" role="listbox" aria-label="Windows"></div>') };
      order.forEach((w) => { const it = h('<div class="dalt-i" role="option"><span class="dalt-ico"></span><b>' + esc(w.el.querySelector('.wt').textContent) + '</b></div>'); it.querySelector('.dalt-ico').appendChild(G.appIconEl ? G.appIconEl(w.app.id, 56) : h('<i></i>')); alt.el.appendChild(it); });
      D.$('#desk').appendChild(alt.el);
    }
    alt.i = (alt.i + dir + alt.order.length) % alt.order.length;
    alt.el.querySelectorAll('.dalt-i').forEach((it, k) => it.classList.toggle('on', k === alt.i));
  }
  function altDone(go) {
    if (!alt) return;
    const w = alt.order[alt.i];
    alt.el.remove(); alt = null;
    if (go && w) Desk.focus(w);
  }

  // ---- the Dice Bar ------------------------------------------------------------------------------------------------
  let barEl = null, barSel = 0, barItems = [], barTarget = null, findQ = '', findT = 0, findItems = [];
  const clips = []; // things copied, newest first (only kept while DiceOS runs)
  const NAMES = { look: 'Look', sound: 'Sound', wifi: 'Wi-Fi', bt: 'Bluetooth', display: 'Screen', pads: 'Controllers and keys', start: 'Starting up', storage: 'Storage', about: 'About', cloud: 'Dice Cloud', me: 'You', remote: 'TV remote', desk: 'Desktop', power: 'Power' };
  function actions() {
    const A = [
      ['Overview', 'windows desktops expose', 'desktop', () => P.overview()],
      ['Show the desktop', 'hide minimise all windows', 'desktop', () => showDesktop()],
      ['Night light', 'warm screen evening', 'warm', () => D.tools.setWarm(D.tools.warmOn() ? 'off' : 'on')],
      ['Do not disturb', 'quiet notifications focus', 'quiet', () => D.tools.setQuiet(!D.tools.quiet())],
      ['Clipboard history', 'copied paste', 'copy', () => P.clipboard()],
      ['Keyboard shortcuts', 'keys help', 'keys', () => D.tools.shortcuts()],
      ['Widgets', 'clock weather sticky note desktop', 'dots', () => gallery(innerWidth / 2 - 150, innerHeight / 3)],
      ['Back up', 'backup export save everything', 'box', () => D.tools.backup()],
      ['Lock', 'lock screen away pin', 'lock', () => D.lock()],
      ['Emoji and symbols', 'emoji smiley symbol character special', 'dots', () => D.extras.emoji()],
      ['Sleep', 'sleep screen off away', 'moon', () => D.sleep()],
      ['DiceTV', 'tv big screen couch controller', 'tv', () => Desk.exit()],
      ['Dice Home', 'wall clock home assistant', 'home', () => D.wall && D.wall.enter()],
    ];
    if (D.sys && D.inputs) A.push(['Inputs', 'kvm switch hdmi displayport usb-c input source screen monitor tv playstation xbox laptop', 'tv', () => D.inputs.open()]);
    if (D.inputs && D.inputs.guide) A.push(['Set up Inputs, step by step', 'kvm hdmi switch screen tv inputs guide help monitor keyboard', 'tv', () => D.inputs.guide()]);
    if (D.sys) A.push(['Take a screenshot', 'screen capture picture print', 'camera', () => D.tools.screenshot()], ['Restart the desktop', 'reload', 'restart', () => D.sys.power('restart-desktop')], ['Shut down', 'power off', 'power', () => D.sys.power('shutdown')]);
    (D.settingsSections ? D.settingsSections() : Object.entries(NAMES)).forEach(([k, n]) => A.push(['Settings: ' + n, 'settings ' + k + ' ' + n.toLowerCase(), 'gear', () => D.launch('settings', { arg: k })]));
    return A.map(([name, words, icon, run]) => ({ kind: 'Do it', name, words, icon, run }));
  }
  function results(q) {
    const v = q.trim(), out = [], tk = L.dayKey(new Date());
    if (!v) {
      D.state.recent.slice(0, 6).map((id) => D.app(id)).filter((a) => a && !a.suite).forEach((a) => out.push({ kind: 'Recent', name: a.name, app: a }));
      return out.concat(actions().slice(0, 4));
    }
    // a sum
    if (/[\d)]\s*[-+*/×÷%^]\s*[\d(.]|^\s*\(/.test(v) && !/[a-z]/i.test(v.replace(/e[+-]?\d/gi, ''))) {
      try { const n = L.calc(v.replace(/\^/g, '**').replace(/\*\*/g, '*')); if (isFinite(n)) out.push({ kind: 'Sum', name: '= ' + L.calcText(n), sub: 'Enter copies it', icon: 'chart', run: () => D.copy(L.calcText(n).replace(/,/g, '')) }); } catch (e) { /* not a sum */ }
    }
    const conv = L.convert(v);
    if (conv) out.push({ kind: 'Convert', name: conv.text, sub: 'Enter copies the answer', icon: 'chart', run: () => D.copy(String(+conv.value.toPrecision(6))) });
    const ms = L.parseTimer(v);
    if (ms) out.push({ kind: 'Timer', name: 'Start a ' + (ms >= 60000 ? Math.round(ms / 6000) / 10 + '-minute' : Math.round(ms / 1000) + '-second') + ' timer', sub: 'The Clock rings when it\'s done', icon: 'timer', run: () => { const T = D.timer || (D.timer = {}); Object.assign(T, { total: ms, left: ms, end: Date.now() + ms, running: true }); D.toast({ icon: 'timer', c: '#2f9e8f', title: 'Timer started', text: 'It rings in ' + Math.round(ms / 60000 * 10) / 10 + ' minutes.' }); } });
    const task = L.parseTask(v, tk);
    if (task && D.app('calendar')) out.push({ kind: 'Axiom', name: 'Add "' + task.title + '"', sub: 'Due ' + (task.due === tk ? 'today' : task.due === L.addDays(tk, 1) ? 'tomorrow' : new Date(task.due + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })), icon: 'bell', run: () => { const A = D.state.axiom || (D.state.axiom = { classes: [], tasks: [], notes: [], theme: 'dawn' }); (A.tasks = A.tasks || []).push({ id: Date.now().toString(36), title: task.title, classId: null, type: 'homework', due: task.due, time: '', done: false }); D.save(); D.toast({ icon: 'bell', c: '#d4a857', title: 'Added to Axiom', text: task.title }); } });
    // ":heart" and the like: emoji, straight in
    if (/^:\S/.test(v)) D.extras.emojiFind(v).slice(0, 6).forEach((x) => out.push({ kind: 'Emoji', name: x.e + '  ' + x.words.split(' ')[0], sub: 'Enter puts it where you were typing, or copies it', icon: 'dots', run: () => D.extras.put(x.e, barTarget) }));
    // "send <a link or some words>": Dice Drop, to each of your other computers
    const snd = /^send\s+(?:to\s+tv\s+)?(.+)$/i.exec(v);
    if (snd && D.cloud && D.cloud.on()) {
      const what = snd[1].trim(), url = /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(what) && !/\s/.test(what) ? (/^https?:/i.test(what) ? what : 'https://' + what) : '';
      D.cloud.devices().filter((d) => !d.me).slice(0, 4).forEach((d) => out.push({ kind: 'Dice Drop', name: 'Send to ' + d.name, sub: url || what.slice(0, 80), icon: d.tv ? 'tv' : 'desktop',
        run: () => D.cloud.send(d.id, url ? { url } : { text: what }).then((ok) => D.toast({ icon: 'cloud', c: ok ? '#4b7bec' : '#e5534b', title: ok ? 'Sent to ' + d.name : 'Not sent yet', text: ok ? 'It shows up there in a few seconds.' : 'It goes as soon as Dice Cloud can be reached.' })) }));
    }
    const items = [];
    Desk.wins.forEach((w) => items.push({ kind: 'Window', name: w.el.querySelector('.wt').textContent, words: w.app.name, icon: 'desktop', run: () => Desk.focus(w) }));
    D.all().filter((a) => !a.suite || D.state.seen).forEach((a) => items.push({ kind: a.suite ? 'For your computer' : 'App', name: a.name, words: (a.words || '') + ' ' + (a.blurb || ''), app: a }));
    actions().forEach((a) => items.push(a));
    clips.forEach((c) => items.push({ kind: 'Copied', name: c.slice(0, 80), words: c, icon: 'copy', run: () => paste(c) }));
    // when it's already a sum, a conversion, a timer or a task, only names that really match come too
    const strict = out.length > 0, lv = v.toLowerCase();
    items.filter((it) => (!strict && !(it.app && it.app.suite)) || it.name.toLowerCase().includes(lv))
      .map((it) => [L.score(v, it), it]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 7).forEach((x) => out.push(x[1]));
    // your files, by name (they arrive a moment later on DiceOS)
    if (v.length >= 2 && !/^[:=]/.test(v)) {
      if (findQ !== v) { findQ = v; clearTimeout(findT); findT = setTimeout(() => D.extras.findFiles(v).then((items) => { if (findQ === v) { findItems = items; if (barEl) paintBar(); } }), 140); findItems = []; }
      findItems.slice(0, 4).forEach((f) => out.push({ kind: f.dir ? 'Folder' : 'File', name: f.name, sub: f.path, icon: f.dir ? 'box' : 'copy', run: () => D.extras.openFile(f) }));
    }
    const o = L.omni(v, (D.state.st && D.state.st.engine) || 'ddg');
    if (o) out.push({ kind: 'Web', name: o.search ? 'Search the web for "' + v + '"' : 'Open ' + v, icon: 'link', run: () => (D.browse ? D.browse(o.url) : Desk.open('browser', { arg: o.url })) });
    // a question, or something to do: Deuce
    if (D.deuceAsk && D.deuce && D.deuce.cfg().on && v.split(/\s+/).length >= 2 && !/^[:=]/.test(v)) {
      const ask = { kind: 'Deuce', name: 'Ask Deuce: ' + v, sub: 'Answers from the web, or does it for you', icon: 'die', run: () => D.deuceAsk(v) };
      if (/\?\s*$/.test(v) || /^(who|what|whats|when|where|why|how|which|remind|remember|turn|start|is|are|can|does|do)\b/i.test(v)) out.unshift(ask); else out.push(ask);
    }
    return out;
  }
  function paintBar() {
    const list = barEl.querySelector('.dbar-list');
    barItems = results(barEl.querySelector('input').value);
    barSel = Math.min(barSel, Math.max(0, barItems.length - 1));
    list.innerHTML = '';
    barItems.forEach((it, i) => {
      const r = h('<button class="dbar-i' + (i === barSel ? ' on' : '') + '" role="option" aria-selected="' + (i === barSel) + '"><span class="dbar-ico"></span><span class="dbar-t"><b>' + esc(it.name) + '</b>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</span><em>' + esc(it.kind) + '</em></button>');
      r.querySelector('.dbar-ico').appendChild(it.app ? G.appIconEl(it.app.id, 28) : h('<i class="dbar-g">' + D.glyph(it.icon || 'dots', 2) + '</i>'));
      r.onclick = () => runItem(it);
      r.onpointermove = () => { if (barSel !== i) { barSel = i; list.querySelectorAll('.dbar-i').forEach((x, k) => x.classList.toggle('on', k === i)); } };
      list.appendChild(r);
    });
  }
  function runItem(it) {
    P.closeBar();
    if (!it) return;
    if (it.app) return it.app.suite ? Desk.open('store') : Desk.open(it.app.id);
    it.run();
  }
  P.bar = function (initial) {
    if (!Desk.on) return;
    if (barEl) return P.closeBar();
    closeMenu(); P.closeOverview(); Desk.toggleStart(false);
    const ae = document.activeElement;
    barTarget = ae && (ae.tagName === 'TEXTAREA' || (ae.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/i.test(ae.type)) || ae.isContentEditable) ? ae : null;
    barEl = h('<div class="dbar on" role="dialog" aria-label="Dice Bar"><div class="dbar-box glass"><div class="dbar-in">' + D.glyph('search', 3) + '<input aria-label="Type a command, a sum or an app" placeholder="Apps, settings, 12 × 7, 5 km in miles, timer 10, todo…" autocomplete="off" spellcheck="false"></div><div class="dbar-list" role="listbox"></div></div></div>');
    D.$('#desk').appendChild(barEl);
    const input = barEl.querySelector('input');
    input.value = initial || '';
    barSel = 0; paintBar();
    input.oninput = () => { barSel = 0; paintBar(); };
    input.onkeydown = (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); barSel = (barSel + (e.key === 'ArrowDown' ? 1 : -1) + barItems.length) % Math.max(1, barItems.length); paintBar(); }
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); runItem(barItems[barSel]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); P.closeBar(); }
    };
    barEl.addEventListener('pointerdown', (e) => { if (e.target === barEl) P.closeBar(); });
    setTimeout(() => { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }, 20);
    S.play('open');
  };
  P.closeBar = function () { if (barEl) { barEl.remove(); barEl = null; const t = Desk.top(); if (t) Desk.focus(t); } };

  // ---- clipboard history ----------------------------------------------------------------------------------
  let lastField = null;
  document.addEventListener('focusin', (e) => { const t = e.target; if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && /^(text|search|url|email|)$/i.test(t.type)) || t.isContentEditable) && !t.closest('.dbar')) lastField = t; });
  function remember(text) {
    text = String(text || '').trim();
    if (!text || text.length > 5000) return;
    const i = clips.indexOf(text);
    if (i >= 0) clips.splice(i, 1);
    clips.unshift(text);
    clips.length = Math.min(clips.length, 25);
  }
  document.addEventListener('copy', () => { const s = String(getSelection() || ''); if (s) remember(s); });
  document.addEventListener('cut', () => { const s = String(getSelection() || ''); if (s) remember(s); });
  const copy0 = D.copy;
  D.copy = function (text) { remember(text); return copy0.apply(D, arguments); };
  function paste(text) {
    try { navigator.clipboard.writeText(text); } catch (e) { /* not allowed here */ }
    if (lastField && lastField.isConnected) {
      lastField.focus();
      if (!document.execCommand('insertText', false, text)) { const f = lastField, s = f.selectionStart || 0; f.value = f.value.slice(0, s) + text + f.value.slice(f.selectionEnd || s); f.dispatchEvent(new Event('input', { bubbles: true })); }
    } else D.toast({ icon: 'copy', title: 'Copied', text: 'Paste it with Ctrl + V.' });
  }
  P.clipboard = function () {
    if (!clips.length) return D.toast({ icon: 'copy', title: 'Nothing copied yet', text: 'Things you copy show up here until DiceOS restarts.' });
    const x = innerWidth / 2 - 210, y = innerHeight / 4;
    menu(x, y, [{ html: '<p class="dmenu-h">Copied lately: pick one to paste it</p>' }].concat(clips.slice(0, 12).map((c) => ({ label: c.replace(/\s+/g, ' ').slice(0, 70) + (c.length > 70 ? '…' : ''), icon: 'copy', run: () => paste(c) }))).concat(['-', { label: 'Forget them all', icon: 'trash', run: () => { clips.length = 0; } }]));
    menuEl.classList.add('wide');
  };
  P.clips = clips;

  function showDesktop() {
    const ws = Desk.wins.filter((w) => w.ws === Desk.ws);
    if (ws.some((w) => !w.min)) ws.forEach((w) => { if (!w.min) w.minimise(); });
    else ws.forEach((w) => Desk.focus(w));
  }

  // ---- widgets ------------------------------------------------------------------------------------------------
  const KINDS = {
    clock: ['Clock', 'The time and the date'], weather: ['Weather', 'Your town, now and later'], due: ['Axiom', 'What\'s due, and the next class'],
    music: ['Music', 'What\'s playing, with play and skip'], sticky: ['Sticky note', 'A note on the desktop'], system: ['This computer', 'How busy it is (DiceOS)'],
    calendar: ['Calendar', 'This month, with today and what\'s due'], reminders: ['Reminders', 'What Deuce will remind you about'], world: ['World clock', 'The time in other places'],
    timer: ['Timer', 'A quick countdown with a chime'], countdown: ['Countdown', 'Days until something'], shield: ['Shield', 'Ads and trackers kept out today'],
    week: ['Screen time', 'Today, this week and your top apps'], modes: ['Modes', 'Start Focus, School, Play or your own'], deuce: ['Ask Deuce', 'A question box on the desktop'],
  };
  const ZONES = [['New York', 'America/New_York'], ['Los Angeles', 'America/Los_Angeles'], ['Chicago', 'America/Chicago'], ['London', 'Europe/London'], ['Paris', 'Europe/Paris'], ['Berlin', 'Europe/Berlin'],
    ['Mumbai', 'Asia/Kolkata'], ['Dubai', 'Asia/Dubai'], ['Singapore', 'Asia/Singapore'], ['Tokyo', 'Asia/Tokyo'], ['Seoul', 'Asia/Seoul'], ['Sydney', 'Australia/Sydney'], ['São Paulo', 'America/Sao_Paulo'],
    ['Mexico City', 'America/Mexico_City'], ['Toronto', 'America/Toronto'], ['Johannesburg', 'Africa/Johannesburg'], ['Cairo', 'Africa/Cairo'], ['Honolulu', 'Pacific/Honolulu']];
  // the hour and minute somewhere else, and how far ahead or behind it is
  function zoneNow(tz) {
    const now = new Date(), p = {};
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).forEach((x) => { p[x.type] = x.value; }); } catch (e) { return null; }
    const there = new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute), diff = Math.round((there - new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())) / 36e5 * 2) / 2;
    const day = there.getDate() === now.getDate() ? '' : there > now ? 'Tomorrow' : 'Yesterday';
    return { time: there.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), hour: +p.hour, diff, day };
  }
  const timers = new Map();
  const wlist = () => (Array.isArray(D.state.widgets) ? D.state.widgets : (D.state.widgets = [{ type: 'clock', x: 0.76, y: 0.05 }, { type: 'weather', x: 0.76, y: 0.25 }, { type: 'due', x: 0.76, y: 0.45 }]));
  let wxCache = null, wxAt = 0;
  async function wxNow() {
    const p = (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place);
    if (!p || !D.weather) return null;
    if (wxCache && wxCache.name === p.name && Date.now() - wxAt < 15 * 60000) return wxCache;
    try { const d = await D.weather.get(p.lat, p.lon, (D.state.st && D.state.st.units) || 'c'); wxCache = Object.assign({ name: p.name, words: D.weather.words(d.code) }, d); wxAt = Date.now(); } catch (e) { /* offline */ }
    return wxCache;
  }
  async function fill(el, w) {
    const body = el.querySelector('.dw-b');
    if (w.type === 'clock') { const n = new Date(); body.innerHTML = '<b class="dw-big">' + n.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '</b><span>' + n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + '</span>'; }
    if (w.type === 'weather') {
      const x = await wxNow();
      body.innerHTML = x ? '<div class="dw-wx">' + D.weather.icon(x.words.kind, D.night()) + '<b class="dw-big">' + x.t + '°</b></div><span>' + esc(x.words.text) + ', ' + esc(x.name) + '</span><small>High ' + x.hi + '°, low ' + x.lo + '°</small>' : '<span>Add your town to see the weather.</span><button class="b small" data-go>Add town</button>';
      const go = body.querySelector('[data-go]'); if (go) go.onclick = async () => { if (D.tv) await D.tv.askTown(); wxCache = null; fill(el, w); };
      body.onclick = (e) => { if (!e.target.closest('button')) Desk.open('weather'); };
    }
    if (w.type === 'due') {
      const A = D.state.axiom || {}, tk = L.dayKey(new Date()), b = L.planBuckets(A.tasks || [], tk), list = b.overdue.concat(b.today), cn = L.classNow(A.classes || [], new Date());
      body.innerHTML = (cn.now || cn.next ? '<small class="dw-cls">' + esc(cn.now ? 'Now: ' + cn.now.cls.name : 'Next: ' + cn.next.cls.name + ' at ' + cn.next.start) + '</small>' : '') +
        (list.length ? '<ul>' + list.slice(0, 5).map((t) => { const c = (A.classes || []).find((x) => x.id === t.classId); return '<li style="--k:' + (c ? c.color : '#d4a857') + '"' + (t.due < tk ? ' class="late"' : '') + '>' + esc(t.title) + '</li>'; }).join('') + '</ul>' : '<span>Nothing due today.</span>');
      body.onclick = () => Desk.open('calendar');
    }
    if (w.type === 'music') {
      const n = M.now;
      body.innerHTML = '<b class="dw-mid">' + esc(n ? n.name : 'Dice Radio') + '</b><span>' + esc(n ? n.by || '' : 'Nothing playing') + '</span><div class="dw-btns"><button class="b small" data-m="prev" aria-label="Previous">' + D.glyph('prev', 1) + '</button><button class="b small" data-m="toggle" aria-label="Play or pause">' + D.glyph(n && n.playing ? 'pause' : 'play', 1) + '</button><button class="b small" data-m="next" aria-label="Next">' + D.glyph('next', 1) + '</button></div>';
      body.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { const m = b.dataset.m; if (m === 'toggle' && !M.now) M.play('radio', 0); else M[m](); setTimeout(() => fill(el, w), 60); }; });
    }
    if (w.type === 'sticky') {
      if (!body.querySelector('textarea')) {
        body.innerHTML = '<textarea aria-label="Sticky note" placeholder="Write something…" spellcheck="true"></textarea>';
        const ta = body.querySelector('textarea');
        ta.value = w.text || '';
        let t0 = 0;
        ta.oninput = () => { w.text = ta.value; clearTimeout(t0); t0 = setTimeout(() => D.save(), 400); };
      }
    }
    if (w.type === 'calendar') {
      const n = new Date(), y = n.getFullYear(), mo = n.getMonth(), first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
      const due = new Set(((D.state.axiom || {}).tasks || []).filter((t) => !t.done && t.due).map((t) => t.due));
      const key = (d) => y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cells = '';
      for (let i = 0; i < first; i++) cells += '<i></i>';
      for (let d = 1; d <= days; d++) cells += '<i class="' + (d === n.getDate() ? 'today' : '') + (due.has(key(d)) ? ' due' : '') + '">' + d + '</i>';
      body.innerHTML = '<b class="dw-mon">' + n.toLocaleDateString([], { month: 'long', year: 'numeric' }) + '</b><div class="dw-cal">' + ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => '<em>' + x + '</em>').join('') + cells + '</div>';
      body.onclick = () => Desk.open('calendar');
    }
    if (w.type === 'reminders') {
      const R = D.deuce && D.deuce.reminders, list = R ? R.upcoming().slice(0, 4) : [];
      if (!body.querySelector('input')) {
        body.innerHTML = '<ul class="dw-rem"></ul><form class="dw-add"><input placeholder="Remind me to… (at 6, tomorrow)" aria-label="Add a reminder" maxlength="200"></form>';
        body.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          const inp = body.querySelector('input'), v = inp.value.trim();
          if (!v || !R || !window.DeuceBrain) return;
          const it = window.DeuceBrain.reminder('remind me to ' + v.toLowerCase(), new Date());
          if (!it || !it.at) { inp.value = ''; inp.placeholder = 'Say when: "at 6", "in 20 minutes", "tomorrow"'; return; }
          R.add(it.what || v, it.at); inp.value = ''; fill(el, w);
        };
      }
      const ul = body.querySelector('.dw-rem');
      ul.innerHTML = list.length ? list.map((r) => '<li><button class="dw-tick" data-id="' + esc(r.id) + '" aria-label="Done: ' + esc(r.what) + '"></button><span>' + esc(r.what.replace(/^./, (c) => c.toUpperCase())) + '<small>' + esc(D.deuce.whenWords ? D.deuce.whenWords(r.at) : new Date(r.at).toLocaleString()) + '</small></span></li>').join('') : '<li class="dw-none">Nothing to remember. Type one below.</li>';
      ul.querySelectorAll('.dw-tick').forEach((b) => { b.onclick = () => { R.remove(b.dataset.id); fill(el, w); }; });
    }
    if (w.type === 'world') {
      w.zones = Array.isArray(w.zones) && w.zones.length ? w.zones : ['Europe/London', 'Asia/Tokyo', 'America/Los_Angeles'];
      const rows = w.zones.map((tz) => { const z = zoneNow(tz), nm = (ZONES.find((q) => q[1] === tz) || [tz.split('/').pop().replace(/_/g, ' ')])[0]; if (!z) return ''; const night = z.hour < 6 || z.hour >= 19; return '<li class="' + (night ? 'night' : '') + '"><i aria-hidden="true">' + D.glyph(night ? 'moon' : 'sun', 1) + '</i><span>' + esc(nm) + '<small>' + esc((z.day ? z.day + ', ' : 'Today, ') + (z.diff === 0 ? 'same time' : (z.diff > 0 ? '+' : '') + z.diff + ' h')) + '</small></span><b>' + esc(z.time) + '</b><button class="dw-del" data-tz="' + esc(tz) + '" aria-label="Remove ' + esc(nm) + '">' + D.glyph('close', 1) + '</button></li>'; }).join('');
      body.innerHTML = '<ul class="dw-world">' + rows + '</ul>' + (w.zones.length < 5 ? '<select class="dw-sel" aria-label="Add a city"><option value="">Add a city…</option>' + ZONES.filter((q) => !w.zones.includes(q[1])).map((q) => '<option value="' + q[1] + '">' + esc(q[0]) + '</option>').join('') + '</select>' : '');
      body.querySelectorAll('.dw-del').forEach((b) => { b.onclick = () => { w.zones = w.zones.filter((z) => z !== b.dataset.tz); D.save(); fill(el, w); }; });
      const sel = body.querySelector('.dw-sel');
      if (sel) sel.onchange = () => { if (sel.value) { w.zones.push(sel.value); D.save(); fill(el, w); } };
    }
    if (w.type === 'timer') {
      if (!body.querySelector('.dw-tleft')) {
        body.innerHTML = '<b class="dw-big dw-tleft">0:00</b><div class="dw-btns dw-tset">' + [1, 5, 10, 25].map((m) => '<button class="b small" data-min="' + m + '">' + m + ' min</button>').join('') + '</div><div class="dw-btns"><button class="b small dw-tstop" hidden>Stop</button></div>';
        body.querySelectorAll('[data-min]').forEach((b) => { b.onclick = () => { w.end = Date.now() + +b.dataset.min * 60000; w.mins = +b.dataset.min; D.save(); fill(el, w); }; });
        body.querySelector('.dw-tstop').onclick = () => { w.end = 0; D.save(); fill(el, w); };
      }
      const tick = () => {
        const left = Math.max(0, (w.end || 0) - Date.now()), s = Math.ceil(left / 1000);
        const lab = body.querySelector('.dw-tleft');
        if (!lab) return;
        lab.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        body.querySelector('.dw-tstop').hidden = !w.end;
        el.style.setProperty('--left', w.end && w.mins ? (left / (w.mins * 60000)) : 0);
        if (w.end && left <= 0) { w.end = 0; D.save(); D.notify({ icon: 'clock', c: '#ef6a55', title: 'Time\'s up', text: (w.mins || '') + ' minute timer', urgent: true }); S.play('wake'); body.querySelector('.dw-tstop').hidden = true; }
      };
      clearInterval(timers.get(el));
      if (w.end) timers.set(el, setInterval(() => { if (!el.isConnected) return clearInterval(timers.get(el)); tick(); }, 500));
      tick();
    }
    if (w.type === 'countdown') {
      const when = w.date ? new Date(w.date + 'T00:00') : null, days = when ? Math.ceil((when - new Date(new Date().toDateString())) / 864e5) : null;
      if (!when || w.editing) {
        body.innerHTML = '<form class="dw-cd"><input name="l" placeholder="What is it? (Summer break)" maxlength="40" aria-label="What it is"><input name="d" type="date" aria-label="The day"><button class="b small">Start counting</button></form>';
        const f = body.querySelector('form');
        f.l.value = w.label || ''; f.d.value = w.date || '';
        f.onsubmit = (e) => { e.preventDefault(); if (!f.d.value) return; w.label = f.l.value.trim(); w.date = f.d.value; w.editing = false; D.save(); fill(el, w); };
      } else {
        body.innerHTML = '<b class="dw-big">' + Math.abs(days) + '</b><span>' + (days === 0 ? 'Today is ' : days > 0 ? (days === 1 ? 'day' : 'days') + ' until ' : (days === -1 ? 'day' : 'days') + ' since ') + esc(w.label || when.toLocaleDateString([], { month: 'long', day: 'numeric' })) + '</span><small>' + esc(when.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })) + '</small><button class="dw-link">Change</button>';
        body.querySelector('.dw-link').onclick = () => { w.editing = true; fill(el, w); };
      }
    }
    if (w.type === 'shield') {
      const SH = D.shield, s = SH && SH.available() ? await SH.get().catch(() => null) : null;
      body.innerHTML = s ? '<div class="dw-shield">' + SH.art(s.on !== false, 40) + '<div><b class="dw-big">' + (s.today || 0).toLocaleString() + '</b><span>ads and trackers kept out today</span></div></div>' + (s.week ? SH.weekBars(s.week) : '') : '<span>Shield blocks ads on DiceOS and in SereneTab. Turn it on in Settings, Shield.</span>';
      body.onclick = () => D.launch('settings', { arg: 'shield' });
    }
    if (w.type === 'week') {
      const s = D.recap ? D.recap.summary() : null;
      body.innerHTML = s ? '<b class="dw-big">' + esc(s.todayText || '0 min') + '</b><span>today · ' + esc(s.weekText || '0 min') + ' this week</span>' + (s.top.length ? '<ul class="dw-top">' + s.top.slice(0, 3).map(([id, n]) => '<li><span>' + esc((D.app(id) || { name: id }).name) + '</span><i style="--w:' + Math.round(n / s.top[0][1] * 100) + '%"></i></li>').join('') + '</ul>' : '') : '<span>Screen time starts counting now.</span>';
      body.onclick = () => D.recap && D.recap.open();
    }
    if (w.type === 'modes') {
      body.innerHTML = '';
      if (D.modes && D.modes.quickRow) body.appendChild(D.modes.quickRow(() => {}));
    }
    if (w.type === 'deuce') {
      if (!body.querySelector('form')) {
        body.innerHTML = '<form class="dw-ask"><span class="dw-orb" aria-hidden="true">' + (D.deuce && D.deuce.orbSvg ? D.deuce.orbSvg(26) : '') + '</span><input placeholder="Ask Deuce anything" aria-label="Ask Deuce"></form><small>Try: "what\'s the weather", "remind me at 5", "why is the sky blue"</small>';
        body.querySelector('form').onsubmit = (e) => { e.preventDefault(); const inp = body.querySelector('input'), v = inp.value.trim(); if (!v) return; inp.value = ''; if (D.deuceAsk) D.deuceAsk(v); else D.launch('deuce'); };
      }
    }
    if (w.type === 'system') {
      const s = D.sys && D.sys.status;
      body.innerHTML = s ? '<div class="dw-sys"><span>Load<b>' + (typeof s.load === 'number' ? s.load.toFixed(2) : '—') + '</b></span><span>Memory<b>' + (s.mem ? Math.round(s.mem.used / s.mem.total * 100) : '?') + '%</b></span><span>Warmth<b>' + (s.temp ? Math.round(s.temp) + '°C' : '—') + '</b></span></div>' : '<span>On DiceOS this shows how busy the computer is.</span>';
      body.onclick = () => Desk.open('monitor');
    }
  }
  function widgets() {
    const layer = $d('.dwid');
    if (!layer) return;
    layer.innerHTML = '';
    const a = Desk.area();
    wlist().forEach((w, i) => {
      const el = h('<section class="dw glass dw-' + w.type + '" aria-label="' + esc(KINDS[w.type] ? KINDS[w.type][0] : 'Widget') + '"><header><span>' + esc(KINDS[w.type] ? KINDS[w.type][0] : '') + '</span><button class="dw-x" aria-label="Remove this widget">' + D.glyph('close', 1) + '</button></header><div class="dw-b"></div></section>');
      el.style.left = Math.round(Math.max(0, Math.min(0.96, w.x)) * a.w) + 'px';
      el.style.top = Math.round(Math.max(0, Math.min(0.92, w.y)) * a.h) + 'px';
      el.querySelector('.dw-x').onclick = () => { wlist().splice(i, 1); D.save(); widgets(); };
      const head = el.querySelector('header');
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        e.preventDefault(); head.setPointerCapture(e.pointerId);
        const r = el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
        head.onpointermove = (ev) => { el.style.left = Math.max(0, Math.min(a.w - 60, ev.clientX - sx)) + 'px'; el.style.top = Math.max(0, Math.min(a.h - 40, ev.clientY - sy)) + 'px'; };
        head.onpointerup = () => { head.onpointermove = null; w.x = parseFloat(el.style.left) / a.w; w.y = parseFloat(el.style.top) / a.h; D.save(); };
      });
      layer.appendChild(el);
      fill(el, w);
    });
  }
  function addWidget(type, x, y) {
    const a = Desk.area();
    wlist().push({ type, x: Math.max(0, Math.min(0.8, (x || a.w / 2) / a.w)), y: Math.max(0, Math.min(0.8, (y || a.h / 3) / a.h)), text: '' });
    D.save(); widgets();
  }
  function gallery(x, y) {
    menu(x, y, [{ html: '<p class="dmenu-h">Add a widget to the desktop</p>' }].concat(Object.entries(KINDS).filter(([k]) => k !== 'system' || D.sys).map(([k, [name, sub]]) => ({ label: name + ' · ' + sub, icon: 'plus', run: () => addWidget(k, x, y) }))));
    menuEl.classList.add('wide');
  }
  P.gallery = gallery;
  P.menu = menu;
  // the ones you type into, or that tick by themselves, aren't redrawn every 15 seconds
  const SELF = ['sticky', 'weather', 'timer', 'countdown', 'deuce', 'modes'];
  setInterval(() => { if (!Desk.on) return; D.$$('#desk .dw').forEach((el, i) => { const w = wlist()[i]; if (w && !SELF.includes(w.type) && !el.contains(document.activeElement)) fill(el, w); }); }, 15000);
  D.on('reminders', () => { if (Desk.on) D.$$('#desk .dw-reminders').forEach((el) => fill(el, wlist().find((x) => x.type === 'reminders'))); });
  setInterval(() => { if (!Desk.on) return; D.$$('#desk .dw-weather').forEach((el) => { const w = wlist().find((x) => x.type === 'weather'); if (w) fill(el, w); }); }, 10 * 60000);
  M.on(() => { if (Desk.on) D.$$('#desk .dw-music').forEach((el) => fill(el, { type: 'music' })); });
  D.on('look', () => { if (Desk.on) widgets(); });
  addEventListener('resize', () => { if (Desk.on) widgets(); });

  // ---- keys -------------------------------------------------------------------------------------------------------
  let superAlone = false;
  addEventListener('keydown', (e) => {
    if (!Desk.on || D.asleep) return;
    const k = e.key, meta = e.metaKey || k === 'Meta' || k === 'OS', ca = e.ctrlKey && e.altKey;
    if (k === 'Meta' || k === 'OS') { superAlone = true; return; }
    superAlone = false;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (alt) { if (k === 'Tab' || k === '`') { stop(); altStep(e.shiftKey ? -1 : 1); return; } if (k === 'Escape') { stop(); altDone(false); return; } }
    if (e.altKey && !e.ctrlKey && (k === 'Tab' || k === '`')) { stop(); altStep(e.shiftKey ? -1 : 1); return; }
    if (e.altKey && k === 'F4') { stop(); const t = Desk.top(); if (t) t.close(); return; }
    if (k === 'F3' || (meta && k === 'Tab')) { stop(); P.overview(); return; }
    if ((e.ctrlKey && k === ' ') || (meta && k === ' ')) { stop(); P.bar(); return; }
    if ((meta || ca) && (k === 'v' || k === 'V')) { stop(); P.clipboard(); return; }
    if ((meta || ca) && (k === 'd' || k === 'D')) { stop(); showDesktop(); return; }
    if (meta && (k === 'e' || k === 'E')) { stop(); Desk.open('files'); return; }
    if (meta && (k === 'l' || k === 'L')) { stop(); D.lock(); return; }
    if (ca && /^[1-4]$/.test(k)) { stop(); P.toDesktop(+k - 1); return; }
    if ((e.ctrlKey && meta) || (ca && !e.shiftKey && (k === 'PageUp' || k === 'PageDown'))) {
      if (k === 'ArrowLeft' || k === 'PageUp') { stop(); P.toDesktop(Desk.ws - 1); return; }
      if (k === 'ArrowRight' || k === 'PageDown') { stop(); P.toDesktop(Desk.ws + 1); return; }
    }
    if ((meta && e.shiftKey) && (k === 'ArrowLeft' || k === 'ArrowRight')) { stop(); const t = Desk.top(); if (t) { P.moveTo(t, (t.ws + (k === 'ArrowLeft' ? 3 : 1)) % 4); } return; }
    if ((meta && !e.ctrlKey) || (ca && !e.metaKey)) {
      const t = Desk.top();
      if (!t || !/^Arrow/.test(k)) return;
      stop();
      if (k === 'ArrowLeft') { if (t.snap === 'right' || t.snap === 'tr' || t.snap === 'br') t.unsnap(); else t.snapTo('left'); }
      else if (k === 'ArrowRight') { if (t.snap === 'left' || t.snap === 'tl' || t.snap === 'bl') t.unsnap(); else t.snapTo('right'); }
      else if (k === 'ArrowUp') t.snapTo(t.snap === 'bl' ? 'left' : t.snap === 'br' ? 'right' : t.snap === 'left' ? 'tl' : t.snap === 'right' ? 'tr' : 'top');
      else if (k === 'ArrowDown') { if (t.max) t.unsnap(); else if (t.snap === 'left') t.snapTo('bl'); else if (t.snap === 'right') t.snapTo('br'); else if (t.snap) t.unsnap(); else t.minimise(); }
    }
  }, true);
  addEventListener('keyup', (e) => {
    if (!Desk.on) return;
    if (alt && (e.key === 'Alt' || !e.altKey)) altDone(true);
    if ((e.key === 'Meta' || e.key === 'OS') && superAlone) { superAlone = false; P.overview(); }
  }, true);

  // buttons (controllers and remotes) while the overview or the bar is up
  const action0 = Desk.action;
  Desk.action = function (a) {
    if (ovOn) {
      if (a === 'b') return P.closeOverview();
      if (['up', 'down', 'left', 'right'].includes(a)) return D.nav.move(a);
      if (a === 'a') return D.nav.press();
      return;
    }
    if (barEl && a === 'b') return P.closeBar();
    return action0.apply(Desk, arguments);
  };
  // build when the desktop first opens
  const enter0 = Desk.enter;
  Desk.enter = async function () { const r = await enter0.apply(Desk, arguments); build(); paintDesks(); widgets(); return r; };
  const exit0 = Desk.exit;
  Desk.exit = function () { P.closeOverview(); P.closeBar(); closeMenu(); Desk.ws = 0; return exit0.apply(Desk, arguments); };
  const open0 = Desk.open;
  Desk.open = function () { const w = open0.apply(Desk, arguments); paintDesks(); return w; };
})();
