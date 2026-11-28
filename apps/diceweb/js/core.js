// DiceWeb's core: what it remembers, day and night, the keyboard and
// controllers, moving around the screen, pop-ups and friends.
(function () {
  'use strict';
  const L = window.DiceLogic, G = window.DiceGfx, S = window.DiceSound, M = window.DiceMusic;
  const Dice = window.Dice = { L, G, S, M, music: M, started: Date.now() };
  Dice.version = CATALOG.version;
  // on a computer running it (or in the emulator) this is DiceOS; in a browser tab, DiceWeb
  Dice.brand = window.DICE_SYS ? 'DiceOS' : 'DiceWeb';
  Dice.desk = { on: false, action() {}, frame() {}, enter() {}, exit() {}, open() {} };

  // ---- Little helpers -------------------------------------------------------------
  Dice.$ = (sel, root) => (root || document).querySelector(sel);
  Dice.$$ = (sel, root) => [...(root || document).querySelectorAll(sel)];
  Dice.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  Dice.h = function (html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  Dice.ago = function (t) {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 50) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
  };
  Dice.mins = function (sec) {
    const m = Math.round((sec || 0) / 60);
    if (m < 1) return 'less than a minute';
    if (m < 60) return m + (m === 1 ? ' minute' : ' minutes');
    const h = Math.floor(m / 60), r = m % 60;
    return h + (h === 1 ? ' hour' : ' hours') + (r ? ' ' + r + ' min' : '');
  };
  const events = {};
  Dice.on = (e, fn) => { (events[e] = events[e] || new Set()).add(fn); return () => events[e].delete(fn); };
  Dice.emit = (e, d) => (events[e] || []).forEach((fn) => { try { fn(d); } catch (err) { console.error(err); } });
  Dice.reduced = () => Dice.state.motion === 'less' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The website's address, for install lines and links.
  Dice.onSite = /^https?:$/.test(location.protocol) && /\/diceweb\b/.test(location.pathname);
  Dice.origin = Dice.onSite ? location.origin : CATALOG.site;

  // ---- What DiceWeb remembers ------------------------------------------------------
  // the emulator on the website keeps its own pretend computer, apart from your DiceWeb
  const KEY = window.DICE_SYS && window.DICE_SYS.emulated ? 'diceweb-emu' : 'diceweb';
  const DEFAULTS = {
    v: 2, name: 'player', avatar: 'cubby', look: 'auto', volume: 0.7, ui: true, musicVol: 0.8, motion: 'full', boot: 'full', start: 'desk',
    perf: 0, fps: 30, bright: 1, friendPops: false, deskIcons: 'home', recent: [], played: {}, last: {}, seen: {}, notifs: [], said: {},
    warm: 'off', warmth: 0.5, dnd: false, idle: 10,
    stats: { cmds: 0 }, disk: null, hist: [],
  };
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    const out = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), s || {});
    out.stats = Object.assign({}, DEFAULTS.stats, out.stats || {});
    if (!out.disk) out.disk = L.newDisk((out.name || 'player').toLowerCase().replace(/[^a-z0-9._-]+/g, '') || 'player');
    // version 2: DiceWeb opens on the desktop, and the games and achievements are gone
    if (s && (s.v || 1) < 2) { out.v = 2; if (out.start === 'game') out.start = 'desk'; out.notifs = (out.notifs || []).filter((n) => n.kind !== 'ach'); }
    delete out.ach; delete out.stats.flight; delete out.stats.rollWins; delete out.stats.rollGames;
    out.recent = (out.recent || []).filter((id) => id !== 'roll' && id !== 'flight');
    out.fresh = !s;
    return out;
  }
  Dice.state = load();
  let saveT = null;
  Dice.save = function (now) {
    clearTimeout(saveT);
    const go = () => { try { const s = Object.assign({}, Dice.state); delete s.fresh; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* full or blocked: carry on */ } };
    if (now) go(); else saveT = setTimeout(go, 250);
  };
  Dice.set = function (k, v) { Dice.state[k] = v; Dice.save(); Dice.emit('state', k); };
  Dice.reset = function () { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } M.clear(); location.reload(); };
  Dice.user = () => (Dice.state.name || 'player').toLowerCase().replace(/[^a-z0-9._-]+/g, '') || 'player';
  Dice.home = () => '/home/' + Dice.user();

  // ---- Day and night ------------------------------------------------------------
  let night = null;
  Dice.night = () => (Dice.state.look === 'night' ? true : Dice.state.look === 'day' ? false : L.clockNight(new Date()));
  Dice.ink = () => (Dice.night() ? '#f3f3f5' : '#141416');
  Dice.applyLook = function (force) {
    const n = Dice.night();
    document.documentElement.setAttribute('data-look', n ? 'dark' : 'light');
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = n ? '#000000' : '#ffffff';
    if (n !== night || force) {
      const changed = night !== null;
      night = n;
      if (changed || force) { G.clearCovers(); Dice.emit('look', n); }
    }
  };
  setInterval(() => Dice.applyLook(), 60000);

  // A one-colour icon that takes the colour of the words around it.
  const glyphs = new Map();
  Dice.glyph = function (name, scale, cls) {
    scale = scale || 2;
    const k = name + scale;
    if (!glyphs.has(k)) glyphs.set(k, G.icon(name, '#000000', '#000000', scale));
    const ic = glyphs.get(k);
    return '<i class="gl ' + (cls || '') + '" aria-hidden="true" style="--m:url(' + ic.url + ');width:' + ic.w + 'px;height:' + ic.h + 'px"></i>';
  };
  // A two-colour icon: the ink, plus a colour of its own.
  Dice.icon = (name, accent, scale) => G.img(name, accent, scale);

  // A picture element for an app. The suite's apps have their own little world with
  // their animal in it; DiceWeb's built-in apps get a clean cover made from their icon.
  const clean = new Map();
  function cleanCover(app, layout) {
    const night = Dice.night(), key = app.id + layout + night;
    if (!clean.has(key)) {
      const [w, h] = layout === 'cover' ? [240, 360] : layout === 'wide' ? [384, 216] : [256, 256];
      const c = G.canvas(w, h), g = c.getContext('2d'), tile = G.TILES[app.id];
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, G.mix(tile, night ? '#000000' : '#ffffff', night ? 0.42 : 0.62));
      grad.addColorStop(1, G.mix(tile, night ? '#000000' : '#ffffff', night ? 0.62 : 0.3));
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const isz = Math.round(Math.min(w, h) * 0.44), cy = layout === 'cover' ? h * 0.36 : h * 0.42;
      const glow = g.createRadialGradient(w / 2, cy, 0, w / 2, cy, isz);
      glow.addColorStop(0, night ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.5)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = glow; g.fillRect(0, 0, w, h);
      const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
      const ic = G.appIcon(app.id, isz / dpr);
      g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = 18; g.shadowOffsetY = 8;
      g.drawImage(ic, Math.round((w - ic.width) / 2), Math.round(cy - ic.height / 2));
      clean.set(key, c);
    }
    const src = clean.get(key), img = document.createElement('canvas');
    img.width = src.width; img.height = src.height; img.className = 'art smooth';
    img.getContext('2d').drawImage(src, 0, 0);
    return img;
  }
  Dice.coverEl = function (app, layout) {
    if (!app.suite && G.TILES && G.TILES[app.id]) return cleanCover(app, layout);
    const c = G.cover(app, layout, Dice.night());
    const img = document.createElement('canvas');
    img.width = c.width; img.height = c.height; img.className = 'art';
    img.getContext('2d').drawImage(c, 0, 0);
    return img;
  };

  // ---- Apps ------------------------------------------------------------------------
  Dice.apps = {};
  Dice.register = (def) => { Dice.apps[def.id] = def; };
  Dice.all = function () {
    return CATALOG.builtins.map((a) => Object.assign({ suite: false }, a)).concat(CATALOG.suite.map((a) => Object.assign({ kind: 'suite', suite: true, who: ART.mascots[a.id] ? a.id : null }, a)));
  };
  Dice.app = (id) => Dice.all().find((a) => a.id === id);
  Dice.touch = function (id) { // remember what was opened, newest first
    const r = Dice.state.recent.filter((x) => x !== id);
    r.unshift(id);
    Dice.state.recent = r.slice(0, 12);
    Dice.state.last[id] = Date.now();
    Dice.save();
    Dice.emit('opened', id);
  };

  // ---- Notifications and pop-ups --------------------------------------------------
  Dice.notify = function (n) {
    const item = Object.assign({ t: Date.now(), read: false }, n);
    Dice.state.notifs.unshift(item);
    Dice.state.notifs = Dice.state.notifs.slice(0, 40);
    Dice.save();
    Dice.emit('notifs');
    if (n.toast !== false && (!Dice.state.dnd || n.urgent)) Dice.toast(item); // Do not disturb: into the list, quietly
  };
  Dice.unread = () => Dice.state.notifs.filter((n) => !n.read).length;
  const toastQ = [];
  let toasting = false;
  Dice.toast = function (n) { toastQ.push(n); if (!toasting) nextToast(); };
  function nextToast() {
    const n = toastQ.shift();
    const box = Dice.$('#toasts');
    if (!n || !box) { toasting = false; return; }
    toasting = true;
    const pic = n.who ? '<canvas class="tface" width="40" height="40"></canvas>' : '<span class="tico" style="--c:' + (n.c || 'var(--ink)') + '">' + Dice.icon(n.icon || 'bell', n.c || '#7c9cff', 2) + '</span>';
    const el = Dice.h('<div class="toast glass ' + (n.kind || '') + '" role="status">' + pic + '<div><b>' + Dice.esc(n.title) + '</b><span>' + Dice.esc(n.text || '') + '</span></div></div>');
    if (n.who) { const c = el.querySelector('canvas'); c.getContext('2d').drawImage(G.face(n.who, 40, G.hexA(G.colourOf(n.who), 0.25)), 0, 0); }
    box.appendChild(el);
    S.play(n.sound || 'toast');
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); el.classList.add('out'); setTimeout(() => { el.remove(); nextToast(); }, 320); }, 3400);
  }

  // ---- Friends: the mascots, up to their own things -------------------------------
  const STATUSES = [['Online', 4], ['Away', 2], ['Listening to Dice Radio', 3], ['In Terminal', 2], ['Writing notes', 2], ['Tidying files', 1], ['Snoozing', 1]];
  Dice.friends = Object.keys(CATALOG.friends).map((id) => ({ id, name: ART.mascots[id].name, kind: CATALOG.friends[id][0], lines: CATALOG.friends[id][1], status: 'Online' }));
  function pickStatus(r) {
    const total = STATUSES.reduce((n, s) => n + s[1], 0);
    let k = r * total;
    for (const [s, w] of STATUSES) { if ((k -= w) < 0) return s; }
    return 'Online';
  }
  Dice.friends.forEach((f) => { f.status = pickStatus(Math.random()); });
  setInterval(() => {
    const f = Dice.friends[Math.floor(Math.random() * Dice.friends.length)];
    f.status = pickStatus(Math.random());
    Dice.emit('friends');
  }, 40000);
  Dice.sayHi = function (id) {
    const f = Dice.friends.find((x) => x.id === id);
    if (!f) return;
    const n = (Dice.state.said[id] || 0);
    Dice.state.said[id] = n + 1;
    Dice.save();
    Dice.toast({ who: id, title: f.name, text: f.lines[n % f.lines.length] });
  };

  // ---- Input: keyboard, controllers, mouse and touch -------------------------------
  // Everything becomes one of: up down left right a b x y lb rb menu quick search
  const Input = Dice.input = { source: 'keys', handler: null, pads: {} };
  Dice.keyFirst = [];
  const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'a', ' ': 'a', Escape: 'b', Backspace: 'b',
    m: 'menu', M: 'menu', q: 'quick', Q: 'quick', '/': 'search', x: 'x', X: 'x', y: 'y', Y: 'y', '[': 'lb', ']': 'rb', Tab: null };
  const typing = (el) => el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(range|checkbox|radio|button)$/i.test(el.type)) || el.isContentEditable);
  Input.setSource = function (s) {
    if (Input.source === s) return;
    Input.source = s;
    document.documentElement.setAttribute('data-input', s);
    Dice.emit('source', s);
  };
  Input.fire = function (action, src) {
    if (Input.handler) Input.handler(action, src);
  };
  window.addEventListener('keydown', (e) => {
    S.unlock();
    if (Dice.keyFirst.some((f) => f(e))) return; // (the on-screen keyboard listens here for a real one)
    if (Dice.keyHook && Dice.keyHook(e)) return;
    const t = e.target;
    let action = null;
    if (e.ctrlKey && !e.altKey && !e.metaKey && (e.key === '1' || e.key === '2')) action = e.key === '1' ? 'menu' : 'quick';
    else if (e.ctrlKey || e.metaKey || e.altKey) return;
    else if (typing(t)) {
      // in a text box, keep the keys for typing except a few that move about
      if (e.key === 'Escape') action = 'b';
      else if (t.hasAttribute('data-nav') && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) action = KEYS[e.key];
      else return;
    } else action = KEYS[e.key];
    if (e.key === 'Tab') return; // let Tab move between things the normal way
    if (!action) return;
    Input.setSource('keys');
    e.preventDefault();
    Input.fire(action, 'keys');
  }, true);
  ['pointerdown', 'touchstart'].forEach((ev) => window.addEventListener(ev, (e) => {
    S.unlock();
    Input.setSource(e.pointerType === 'touch' || ev === 'touchstart' ? 'touch' : 'mouse');
  }, { passive: true, capture: true }));

  // controllers: checked every frame
  const PAD = { 0: 'a', 1: 'b', 2: 'x', 3: 'y', 4: 'lb', 5: 'rb', 8: 'quick', 9: 'menu', 16: 'menu', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const held = {};
  Input.padNames = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter(Boolean).map((p) => p.id);
  Input.pollPads = function (now) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const state = {};
      for (const b in PAD) if (p.buttons[b] && p.buttons[b].pressed) state[PAD[b]] = true;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.55) state.left = true; if (ax > 0.55) state.right = true;
      if (ay < -0.55) state.up = true; if (ay > 0.55) state.down = true;
      Input.pads[p.index] = { id: p.id, buttons: p.buttons.map((b) => b.value), axes: p.axes.slice() };
      for (const a of ['up', 'down', 'left', 'right', 'a', 'b', 'x', 'y', 'lb', 'rb', 'menu', 'quick']) {
        const k = p.index + a;
        if (state[a]) {
          if (!held[k]) { held[k] = { at: now, rep: now + 380 }; Input.setSource('pad'); S.unlock(); Input.fire(a, 'pad'); }
          else if (['up', 'down', 'left', 'right'].includes(a) && now >= held[k].rep) { held[k].rep = now + 110; Input.fire(a, 'pad'); }
        } else delete held[k];
      }
    }
  };
  window.addEventListener('gamepadconnected', (e) => {
    Input.setSource('pad');
    Dice.notify({ icon: 'pad', c: '#7c9cff', title: 'Controller connected', text: e.gamepad.id.replace(/\(.*?\)/g, '').trim().slice(0, 60) || 'Ready to play' });
    Dice.emit('pads');
  });
  window.addEventListener('gamepaddisconnected', () => { Dice.emit('pads'); Dice.toast({ icon: 'pad', c: '#96969f', title: 'Controller disconnected', text: 'The keyboard still works.' }); });

  // ---- Moving around: focus that follows arrows, sticks and the mouse --------------
  const Nav = Dice.nav = { el: null, roots: [] };
  // The layer on top decides where focus can go: a dialog, then search, then the side menus, then the page.
  Nav.root = function () {
    for (const sel of ['#osk.open', '#dialog.open', '.navtrap', '.dov.on', '.dbar.on', '#wall.on', '#search.open', '#qam.open', '#menu.open']) { const r = Dice.$(sel); if (r) return r; }
    if (Dice.$('#app').classList.contains('running')) return Dice.$('#run');
    return Dice.$('#view');
  };
  const visible = (el) => { if (!el.isConnected || el.closest('[hidden]') || el.disabled) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  Nav.items = (root) => Dice.$$('[data-nav]', root || Nav.root()).filter(visible);
  Nav.focus = function (el, opts) {
    opts = opts || {};
    if (!el) return;
    if (Nav.el && Nav.el !== el) Nav.el.classList.remove('is-focus');
    Nav.el = el;
    el.classList.add('is-focus');
    if (document.activeElement !== el && !(opts.keepTyping && typing(document.activeElement))) { if (!el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.tabIndex = -1; el.focus({ preventScroll: true }); }
    const row = el.closest('[data-row]');
    if (row) { row._last = el; }
    if (opts.scroll !== false) Nav.reveal(el);
    Dice.emit('focus', el);
  };
  Nav.reveal = function (el) {
    const smooth = Dice.reduced() ? 'auto' : 'smooth';
    const row = el.closest('[data-row]');
    if (row && row.scrollWidth > row.clientWidth) {
      const pad = parseFloat(getComputedStyle(row).scrollPaddingLeft) || 0;
      const left = el.offsetLeft - row.offsetLeft;
      if (row.dataset.row === 'snap') row.scrollTo({ left: Math.max(0, left - pad), behavior: smooth });
      else {
        const r = el.getBoundingClientRect(), rr = row.getBoundingClientRect();
        if (r.left < rr.left + pad) row.scrollBy({ left: r.left - rr.left - pad, behavior: smooth });
        else if (r.right > rr.right - pad) row.scrollBy({ left: r.right - rr.right + pad, behavior: smooth });
      }
    }
    const pane = el.closest('[data-scroll]');
    if (pane) {
      const r = el.getBoundingClientRect(), pr = pane.getBoundingClientRect();
      const block = el.closest('[data-block]') || el;
      const br = block.getBoundingClientRect();
      const top = pr.top + (parseFloat(pane.dataset.scroll) || 90), bottom = pr.bottom - 90;
      if (br.top < top) pane.scrollBy({ top: br.top - top, behavior: smooth });
      else if (r.bottom > bottom) pane.scrollBy({ top: Math.min(r.bottom - bottom, br.top - top), behavior: smooth });
    }
  };
  Nav.first = function (root) {
    root = root || Nav.root();
    const pref = Dice.$('[data-first]', root);
    const items = Nav.items(root);
    const el = pref && visible(pref) ? pref : items[0];
    if (el) Nav.focus(el, { scroll: true });
    return el;
  };
  Nav.move = function (dir) {
    const root = Nav.root();
    let cur = Nav.el;
    if (!cur || !root.contains(cur) || !visible(cur)) { Nav.first(root); return true; }
    if ((dir === 'left' || dir === 'right') && cur._lr && cur._lr(dir === 'left' ? -1 : 1)) return true;
    const items = Nav.items(root).filter((e) => e !== cur);
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    // a group can say where to go when you leave it that way (Home's apps, then the rows below them),
    // so a closer thing off to the side doesn't win
    const grp = cur.closest('[data-nav-' + dir + ']');
    if (grp && !L.pickNext(box(cur), items.filter((e) => grp.contains(e)).map((e) => ({ e, r: box(e) })), dir)) {
      const tgt = Dice.$(grp.getAttribute('data-nav-' + dir), root);
      const there = tgt ? items.filter((e) => tgt.contains(e) && visible(e)) : [];
      if (there.length) {
        const pick = L.pickNext(box(cur), there.map((e) => ({ e, r: box(e) })), dir);
        let to = pick ? pick.e : there[0];
        const row = to.closest('[data-row]');
        if (row && row._last && row.contains(row._last) && visible(row._last)) to = row._last;
        Nav.focus(to);
        S.play('move', dir);
        return true;
      }
    }
    const best = L.pickNext(box(cur), items.map((e) => ({ e, r: box(e) })), dir);
    if (!best) { S.play('error'); return false; }
    let to = best.e;
    // going into a row you were in before: back to where you were in it
    const row = to.closest('[data-row]');
    if (row && row !== cur.closest('[data-row]') && row._last && row.contains(row._last) && visible(row._last) && (dir === 'up' || dir === 'down')) to = row._last;
    Nav.focus(to);
    S.play('move', dir);
    return true;
  };
  Nav.press = function () {
    const el = Nav.el;
    if (!el || !el.isConnected) return false;
    if (typing(el)) { el.focus(); return true; }
    if (el.dataset.sound !== 'none') S.play(el.dataset.sound || 'select');
    // a tiny press, so you can see it took (CSS keeps it small, and leaves it out with Less motion)
    el.classList.remove('is-press'); void el.offsetWidth; el.classList.add('is-press');
    setTimeout(() => el.classList.remove('is-press'), 220);
    el.click();
    return true;
  };
  // the mouse moves focus too, without scrolling things about
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || !(e.movementX || e.movementY)) return; // (a page changing under a still pointer isn't the mouse moving)
    const el = e.target.closest && e.target.closest('[data-nav]');
    if (el && el !== Nav.el && Nav.root().contains(el)) Nav.focus(el, { scroll: false, keepTyping: true });
  }, { passive: true });

  // ---- The legend along the bottom: what each button does here ----------------
  const GLYPH = {
    keys: { a: 'Enter', b: 'Esc', x: 'X', y: 'Y', menu: 'M', quick: 'Q', lb: '[', rb: ']', search: '/', home: 'Home' },
    pad: { menu: '☰', quick: '⋯', lb: 'L', rb: 'R', home: 'Home' },
    remote: { a: 'OK', b: 'Back', x: 'Info', y: 'Yellow', menu: 'Menu', quick: 'Blue', lb: 'CH −', rb: 'CH +', search: 'Search', home: 'Home', voice: 'Mic' },
  };
  // On a controller the four face buttons are shown by where they are (a little
  // diamond of dots with one filled in), not by a letter or a colour, so any
  // controller makes sense.
  const FACE = { a: [7, 12], b: [12, 7], x: [2, 7], y: [7, 2], search: [7, 2] };
  Dice.btn = function (b) {
    const forced = Dice.state && Dice.state.btns && Dice.state.btns !== 'auto' ? Dice.state.btns : null; // Settings can pick how buttons are shown
    const src = forced || (Input.source === 'pad' ? 'pad' : Input.source === 'remote' ? 'remote' : 'keys');
    if (src === 'pad' && FACE[b]) {
      const dots = [[7, 2], [12, 7], [7, 12], [2, 7]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="' + (x === FACE[b][0] && y === FACE[b][1] ? 2.4 : 1.5) + '"' + (x === FACE[b][0] && y === FACE[b][1] ? '' : ' fill="none" stroke="currentColor" stroke-width="1"') + '/>').join('');
      return '<span class="bt bt-pad bt-face" aria-label="' + ({ a: 'bottom button', b: 'right button', x: 'left button', y: 'top button', search: 'top button' })[b] + '"><svg viewBox="0 0 14 14" width="14" height="14" fill="currentColor" aria-hidden="true">' + dots + '</svg></span>';
    }
    const label = GLYPH[src][b] || b;
    return '<span class="bt bt-' + src + ' bt-' + b + '">' + Dice.esc(label) + '</span>';
  };
})();
