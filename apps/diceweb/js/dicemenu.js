// The Dice menu: the one menu for the whole desktop, under the die.
//
// Press the Windows key (Super) on its own, or the die at the top left, or the die at the start of the
// dock. Type straight away to find an app, a setting (it lights the way there with Show me how), a sum,
// or ask Deuce. Your pinned apps, everything A to Z, what you opened lately, and the power buttons.
// Right-click (or hold) an app for Pin to the Dice menu and Keep in the dock.
// On DiceTV, the Windows key opens DiceTV's menu instead, which has the die at the top too.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G, Desk = D.desk;
  if (!Desk) return;
  const DM = (D.dicemenu = {});
  const PINNED = ['browser', 'files', 'hum', 'notes', 'calendar', 'terminal', 'gossip', 'den', 'tidy', 'hey', 'magpie', 'photos', 'weather', 'clock', 'calculator', 'store', 'settings', 'sketch'];
  DM.pinned = () => (Array.isArray(D.state.startPins) && D.state.startPins.length ? D.state.startPins : PINNED).filter((id) => D.app(id));

  // the Dice die, as its own little picture (each one a copy, so it can be in two places)
  DM.die = function (px) {
    const src = G.die(px * 2, null, { key: 'menu' + px });
    const c = G.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    c.className = 'dm-die';
    c.style.width = px + 'px'; c.style.height = px + 'px';
    return c;
  };

  let el = null, mode = 'pinned', from = null;
  const appBtn = (a, size, cls) => {
    const b = h('<button class="' + (cls || 'dm-app') + '" data-id="' + esc(a.id) + '"><span></span></button>');
    b.querySelector('span').textContent = a.name;
    b.prepend(D.appIconEl(a, size));
    b.title = a.blurb || a.name;
    b.onclick = () => { DM.close(); openApp(a); };
    b.oncontextmenu = (e) => { e.preventDefault(); appMenu(a, e.clientX, e.clientY); };
    return b;
  };
  const openApp = (a) => Desk.open(a.suite ? 'web:' + a.id : a.id);
  function appMenu(a, x, y) {
    const pins = DM.pinned(), dock = Desk.pinsNow();
    D.deskplus.menu(x, y, [
      { label: 'Open', icon: 'play', run: () => { DM.close(); openApp(a); } },
      '-',
      pins.includes(a.id) ? { label: 'Unpin from the Dice menu', icon: 'close', run: () => { D.set('startPins', pins.filter((x) => x !== a.id)); paint(); } }
        : { label: 'Pin to the Dice menu', icon: 'spark', run: () => { D.set('startPins', pins.concat([a.id])); paint(); } },
      dock.includes(a.id) ? { label: 'Take off the dock', icon: 'close', run: () => Desk.setDock(dock.filter((x) => x !== a.id)) }
        : { label: 'Keep in the dock', icon: 'desktop', run: () => Desk.setDock(dock.concat([a.id])) },
    ]);
  }

  function build() {
    el = h('<section id="dicemenu" class="glass" role="dialog" aria-label="Dice menu" hidden>' +
      '<header class="dm-head"><span class="dm-brand"></span><b>Dice</b><button class="dm-me" aria-label="Your name and picture"><canvas width="56" height="56"></canvas><span></span></button></header>' +
      '<label class="dm-find">' + D.glyph('search', 2) + '<input type="search" placeholder="Search apps, settings, sums, or ask Deuce" aria-label="Search" autocomplete="off" spellcheck="false"></label>' +
      '<div class="dm-body"></div>' +
      '<footer class="dm-foot"><div class="dm-own"></div><div class="dm-power"></div></footer></section>');
    Desk.root().appendChild(el);
    el.querySelector('.dm-brand').appendChild(DM.die(30));
    el.querySelector('.dm-me').onclick = () => { DM.close(); Desk.open('settings', { arg: 'you' }); };
    const input = el.querySelector('input');
    input.oninput = () => { mode = input.value.trim() ? 'find' : 'pinned'; paint(); };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') { const b = el.querySelector('.dm-body button'); if (b) b.click(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { const b = el.querySelector('.dm-body button'); if (b) { b.focus(); e.preventDefault(); } }
    };
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); DM.close(); return; }
      if (/^Arrow/.test(e.key) && e.target.tagName === 'BUTTON') { e.preventDefault(); step(e.target, e.key); }
      // typing anywhere in the menu goes into the search
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.target !== input) { input.focus(); }
    });
    // own things, then power
    [['loop', 'Oops', 'Take back a change', () => D.oops.open()], ['die', 'Roll for it', 'The die picks', () => D.roll.open('any')], ['help', 'Show me how', 'Find any setting', () => D.showme.pick()]].forEach(([ic, n, t, run]) => {
      const b = h('<button class="dm-pill" title="' + esc(t) + '">' + D.glyph(ic, 2) + '<span>' + esc(n) + '</span></button>');
      b.onclick = () => { DM.close(); setTimeout(run, 60); };
      el.querySelector('.dm-own').appendChild(b);
    });
    const power = D.sys ? [['lock', 'Lock', () => D.lock()], ['moon', 'Sleep', () => D.standby ? D.standby() : D.sleep()], ['restart', 'Restart', () => D.sys.power('reboot')], ['power', 'Shut down', () => D.sys.power('shutdown')]]
      : [['lock', 'Lock', () => D.lock()], ['moon', 'Sleep', () => D.sleep()], ['restart', 'Restart', () => D.restart()]];
    power.forEach(([ic, n, run]) => {
      const b = h('<button class="dm-pw" aria-label="' + n + '" title="' + n + '">' + D.glyph(ic, 2) + '</button>');
      b.onclick = () => { DM.close(); run(); };
      el.querySelector('.dm-power').appendChild(b);
    });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    addEventListener('pointerdown', (e) => { if (DM.isOpen() && !e.target.closest('#dicemenu') && !e.target.closest('.dmenu') && !e.target.closest('[data-dicemenu]')) DM.close(); }, true);
  }

  // arrows move to the nearest button that way
  function step(b, key) {
    const all = Array.from(el.querySelectorAll('button, input')).filter((x) => x.offsetParent);
    const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bd = Infinity;
    all.forEach((x) => {
      if (x === b) return;
      const q = x.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      const ok = key === 'ArrowRight' ? dx > 4 : key === 'ArrowLeft' ? dx < -4 : key === 'ArrowDown' ? dy > 4 : dy < -4;
      if (!ok) return;
      const along = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dx) : Math.abs(dy), across = key === 'ArrowRight' || key === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      const d = along + across * 3;
      if (d < bd) { bd = d; best = x; }
    });
    if (best) best.focus();
  }

  function paint() {
    if (!el) return;
    const body = el.querySelector('.dm-body'), q = el.querySelector('input').value.trim();
    body.innerHTML = '';
    const me = el.querySelector('.dm-me');
    me.querySelector('span').textContent = D.state.name && D.state.name !== 'player' ? D.state.name : 'You';
    me.querySelector('canvas').getContext('2d').clearRect(0, 0, 56, 56);
    me.querySelector('canvas').getContext('2d').drawImage(G.face(D.state.avatar, 56, G.hexA(G.colourOf(D.state.avatar), 0.25)), 0, 0);
    if (mode === 'find' && q) return find(body, q);
    if (mode === 'all') {
      const head = h('<div class="dm-h"><b>All apps</b><button class="dm-link">‹ Pinned</button></div>');
      head.querySelector('button').onclick = () => { mode = 'pinned'; paint(); };
      body.appendChild(head);
      const list = h('<div class="dm-list"></div>');
      let letter = '';
      apps().sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => {
        const L = a.name[0].toUpperCase();
        if (L !== letter) { letter = L; list.appendChild(h('<i class="dm-letter">' + esc(L) + '</i>')); }
        list.appendChild(appBtn(a, 30, 'dm-row'));
      });
      body.appendChild(list);
      return;
    }
    const head = h('<div class="dm-h"><b>Pinned</b><button class="dm-link">All apps ›</button></div>');
    head.querySelector('button').onclick = () => { mode = 'all'; paint(); };
    body.appendChild(head);
    const grid = h('<div class="dm-grid"></div>');
    DM.pinned().slice(0, 18).forEach((id) => grid.appendChild(appBtn(D.app(id), 44)));
    body.appendChild(grid);
    // lately
    const recent = (D.state.recent || []).filter((id) => D.app(id) && !D.app(id).pc).slice(0, 4);
    if (recent.length) {
      body.appendChild(h('<div class="dm-h"><b>Lately</b></div>'));
      const row = h('<div class="dm-recent"></div>');
      recent.forEach((id) => {
        const a = D.app(id), t = D.state.last && D.state.last[id];
        const b = appBtn(a, 30, 'dm-row');
        b.appendChild(h('<small>' + esc(t ? ago(t) : '') + '</small>'));
        row.appendChild(b);
      });
      body.appendChild(row);
    }
  }
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'Just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString([], { weekday: 'short' }); };
  const apps = () => D.all().filter((a) => !a.suite || (D.onSite && a.web)).filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === i);

  // what you typed: apps, then settings (with Show me how), a sum, and Deuce
  function find(body, q) {
    const got = apps().map((a) => [D.L.score(q, a), a]).filter((x) => x[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 6);
    if (got.length) {
      body.appendChild(h('<div class="dm-h"><b>Apps</b></div>'));
      const list = h('<div class="dm-list"></div>');
      got.forEach(([, a]) => list.appendChild(appBtn(a, 30, 'dm-row')));
      body.appendChild(list);
    }
    const T = (D.showme && D.showme.TOPICS) || {}, low = q.toLowerCase();
    const topics = Object.keys(T).filter((id) => {
      if (T[id].dice && !D.sys) return false;
      const n = T[id].name.toLowerCase();
      return n.includes(low) || low.split(/\s+/).filter((w) => w.length > 2).some((w) => n.includes(w)) || (window.DeuceBrain && window.DeuceBrain.howto && window.DeuceBrain.howto(q) === id);
    }).slice(0, 4);
    if (topics.length) {
      body.appendChild(h('<div class="dm-h"><b>Settings</b><small>Deuce lights the way</small></div>'));
      const list = h('<div class="dm-list"></div>');
      topics.forEach((id) => {
        const b = h('<button class="dm-row">' + D.icon('gear', '#7c9cff', 2) + '<span></span></button>');
        b.querySelector('span').textContent = T[id].name;
        b.onclick = () => { DM.close(); setTimeout(() => D.showme.start(id), 120); };
        list.appendChild(b);
      });
      body.appendChild(list);
    }
    const sum = window.DeuceCalc && window.DeuceCalc.looks && window.DeuceCalc.looks(q) ? (() => { try { return window.DeuceCalc.eval(q); } catch (e) { return null; } })() : null;
    if (sum && sum.text) {
      const b = h('<button class="dm-row dm-sum">' + D.glyph('plus', 2) + '<span></span><small>Copy</small></button>');
      b.querySelector('span').textContent = q + ' = ' + sum.text;
      b.onclick = () => { try { navigator.clipboard.writeText(String(sum.text)); } catch (e) { /* fine */ } D.toast({ icon: 'plus', c: '#ff9f43', title: sum.text, text: 'Copied' }); };
      body.prepend(b);
    }
    const ask = h('<button class="dm-row dm-ask"><span class="dm-orb"></span><span></span></button>');
    ask.querySelector('span:last-child').textContent = 'Ask Deuce: ' + q;
    if (D.deuce && D.deuce.orbSvg) ask.querySelector('.dm-orb').innerHTML = D.deuce.orbSvg(22);
    ask.onclick = () => { DM.close(); D.deuce.ask(q); };
    body.appendChild(ask);
  }

  // ---- opening and closing --------------------------------------------------------------------------------------
  DM.isOpen = () => !!(el && !el.hidden);
  DM.open = function (anchor) {
    if (!el) build();
    from = anchor || null;
    mode = 'pinned';
    el.querySelector('input').value = '';
    paint();
    el.hidden = false;
    place();
    requestAnimationFrame(() => el.classList.add('on'));
    document.querySelectorAll('[data-dicemenu]').forEach((b) => b.classList.add('open'));
    S.play('open');
    setTimeout(() => el.querySelector('input').focus(), 40);
  };
  DM.close = function () {
    if (!DM.isOpen()) return;
    el.classList.remove('on');
    document.querySelectorAll('[data-dicemenu]').forEach((b) => b.classList.remove('open'));
    setTimeout(() => { if (el && !el.classList.contains('on')) el.hidden = true; }, 180);
    S.play('close');
  };
  DM.toggle = (anchor) => (DM.isOpen() ? DM.close() : DM.open(anchor));
  // under the die at the top, or over the die in the dock
  function place() {
    const top = D.menubar && D.menubar.on && D.menubar.on(), k = (D.menubar && D.menubar.k) || 1;
    const atDock = from === 'dock' || !top;
    el.classList.toggle('up', atDock);
    if (atDock) {
      const dock = Desk.root().querySelector('.dshelf .launch[data-die]'), r = dock ? dock.getBoundingClientRect() : { left: 20, top: innerHeight - 80 };
      Object.assign(el.style, { left: Math.max(10, Math.min(innerWidth - el.offsetWidth - 10, r.left - 10)) + 'px', top: 'auto', bottom: Math.round(innerHeight - r.top + 12) + 'px' });
    } else Object.assign(el.style, { left: Math.round(12 * k) + 'px', top: Math.round((D.menubar.TOP || 56) + 6 * k) + 'px', bottom: 'auto' });
  }
  // Desk.toggleStart (M, the dock, Deuce's "show all apps") is the Dice menu now
  Desk.toggleStart = function (on, anchor) {
    if (on === undefined) return DM.toggle(anchor);
    if (on) DM.open(anchor); else DM.close();
  };
  D.on('desk', (on) => { if (!on) DM.close(); dress(); });
  D.on('state', (k) => { if (DM.isOpen() && (k === 'name' || k === 'avatar')) paint(); });
  // controllers and remotes: Back closes it
  const action0 = Desk.action;
  Desk.action = function (a) { if (DM.isOpen() && a === 'b') return DM.close(); return action0.apply(Desk, arguments); };

  // the die on the dock and on the bar
  function dress() {
    const root = Desk.root && Desk.root();
    if (!root) return;
    const launch = root.querySelector('.dshelf .launch:not(.ovbtn):not(.barbtn):not(.dp-dock)');
    if (launch && !launch.dataset.die) {
      launch.dataset.die = 1; launch.setAttribute('data-dicemenu', '');
      launch.parentNode.prepend(launch); // first in the dock, like Start
      launch.innerHTML = ''; launch.appendChild(DM.die(34));
      launch.setAttribute('aria-label', 'Dice menu (Windows key)'); launch.title = 'Dice menu';
      launch.onclick = (e) => { e.stopPropagation(); DM.toggle('dock'); };
    }
    const top = root.querySelector('.mbar .mb-die');
    if (top && !top.dataset.die) {
      top.dataset.die = 1; top.setAttribute('data-dicemenu', '');
      top.innerHTML = ''; top.appendChild(DM.die(24));
      top.setAttribute('aria-label', 'Dice menu (Windows key)');
      top.onclick = (e) => { e.stopPropagation(); D.deskplus.closeMenu && D.deskplus.closeMenu(); DM.toggle('top'); };
      top.onpointerenter = null;
    }
  }
  dress();
  D.on('look', dress);

  // ---- the Windows key on DiceTV: DiceTV's menu ----------------------------------------------------------------
  let alone = false;
  addEventListener('keydown', (e) => { if (Desk.on) return; alone = e.key === 'Meta' || e.key === 'OS'; }, true);
  addEventListener('keyup', (e) => {
    if (Desk.on || !alone || (e.key !== 'Meta' && e.key !== 'OS')) return;
    alone = false;
    if (D.asleep || document.querySelector('#boot:not(.gone)') && !document.querySelector('#boot.gone') && document.querySelector('#boot').offsetParent) return;
    if (D.menu) { if (D.menu.isOpen()) D.menu.close(); else D.menu.open(); }
  }, true);
})();
