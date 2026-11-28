// Oops: undo for the whole computer.
//
// Every change you make that's worth taking back goes on a list, newest first: a setting you
// changed, something moved to the Trash or renamed, a window you closed, a widget you removed, a
// reminder you deleted, a mode you started. Each one has an Undo. On the desktop, Super + Z takes
// back the last one; Super + Shift + Z (or the die menu, or "Deuce, what did I change?") shows the
// list. On the TV, say "Deuce, undo that", or open it from Quick access. It's kept across restarts.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S;
  const O = (D.oops = {});
  const list = () => (Array.isArray(D.state.oops) ? D.state.oops : (D.state.oops = []));
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let quiet = 0, ready = false;
  // changes made while starting up (or while undoing) aren't yours
  setTimeout(() => { ready = true; }, 6000);
  D.on('booted', () => setTimeout(() => { ready = true; }, 1500));
  O.quietly = (fn) => { quiet++; try { return fn(); } finally { quiet--; } };

  // ---- the settings it watches, and how to say their values ---------------------------------------------------------
  const yes = (v) => (v ? 'on' : 'off');
  const SET = {
    look: ['Day or night', (v) => ({ day: 'always day', night: 'always night', auto: 'follows the clock' })[v] || v],
    looks: ['Traced mode', (v) => yes(v === 'traced')], world: ['Your world', (v) => v], accent: ['Accent colour', (v) => (v === 'auto' ? 'automatic' : v)],
    text: ['Text size', (v) => v], clock: ['Clock style', (v) => v], units: ['Units', (v) => (v === 'f' ? '°F' : '°C')], sounds: ['Interface sounds', yes],
    nightlight: ['Night light', (v) => (typeof v === 'object' ? 'changed' : yes(v))], warm: ['Night light', yes], motion: ['Less motion', yes], amb: ['Behind the clock', (v) => v],
    idle: ['Ambient screen', (v) => (v ? 'after ' + v + ' min' : 'never')], name: ['Your name', (v) => v], deskMac: ['Menu bar at the top', (v) => yes(v !== false)],
    dockMag: ['Magnify the dock', yes], dnd: ['Do not disturb', yes], snap: ['Snap windows', yes], hot: ['Hot corner', yes], restore: ['Open my windows again', yes],
    icons: ['Home on the desktop', yes], boot: ['Start-up', (v) => v], bright: ['Brightness', (v) => v + '%'], pins: ['The dock', () => 'changed'],
  };
  O.add = function (e) {
    if (quiet || !ready) return null;
    const L = list(), top = L[0];
    // the same setting changed again within a few seconds is one change (from where it started)
    if (e.type === 'set' && top && top.type === 'set' && top.key === e.key && !top.undone && Date.now() - top.at < 15000) {
      top.after = e.after; top.title = e.title; top.at = Date.now();
      if (same(top.before, top.after)) L.shift();
    } else L.unshift(Object.assign({ id: Math.random().toString(36).slice(2, 9), at: Date.now() }, e));
    D.state.oops = L.slice(0, 60);
    D.save();
    D.emit('oops');
    if (e.bar) bar(list()[0]);
    return list()[0];
  };

  // ---- how each kind is taken back ----------------------------------------------------------------------------------
  const KINDS = {
    set: { icon: 'gear', undo(e) { D.set(e.key, clone(e.before)); if (D.prefs && D.prefs.live) D.prefs.live(); if (D.applyLook) D.applyLook(true); D.emit('prefs'); } },
    trash: { icon: 'trash', undo(e) { D.disk.restore(e.name); } },
    rename: { icon: 'library', undo(e) { D.disk.rename(e.path, e.from); } },
    win: { icon: 'desktop', undo(e) { if (!D.desk || !D.desk.on) throw new Error('Go to the desktop first.'); const w = D.desk.open(e.app); if (w && e.box) { w.box = Object.assign({}, e.box); w.max = e.max; w.snap = e.snap; w.place(); } } },
    widget: { icon: 'dots', undo(e) { D.state.widgets = (Array.isArray(D.state.widgets) ? D.state.widgets : []).concat([clone(e.widget)]); D.save(); D.emit('widgets'); } },
    rem: { icon: 'bell', undo(e) { if (e.when > Date.now() || e.on) D.deuce.reminders.add(e.what, e.when, e.on); else throw new Error('That time has passed.'); } },
    remset: { icon: 'bell', undo(e) { D.deuce.reminders.remove(e.rid); } },
    mode: { icon: 'spark', undo(e) { if (e.on) D.modes.end(); else if (e.prev) D.modes.start(e.prev); } },
    note: { icon: 'box', undo(e) { if (D.fridge) D.fridge.restore(e.note); } },
    // DiceOS's real files (through diced)
    systrash: { icon: 'trash', undo(e) { return D.sys.post('/api/files', { op: 'restore', name: e.name }).then(sysDone); } },
    sysrename: { icon: 'library', undo(e) { return D.sys.post('/api/files', { op: 'rename', path: e.path, to: e.from }).then(sysDone); } },
  };
  const sysDone = (r) => { if (!r || r.ok === false || r.error) throw new Error((r && r.error) || 'It couldn\'t be put back.'); D.emit('sysfiles'); };
  const base = (p) => String(p).replace(/\/+$/, '').split('/').pop(), dirOf = (p) => String(p).replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/';
  O.fileOp = function (b, r) {
    if (b.op === 'trash' && r && typeof r.path === 'string') O.add({ type: 'systrash', name: r.path, title: 'Moved ' + base(b.path) + ' to the Trash', bar: true });
    else if (b.op === 'rename' && b.to && b.to !== base(b.path)) O.add({ type: 'sysrename', path: dirOf(b.path) + '/' + b.to, from: base(b.path), title: 'Renamed ' + base(b.path) + ' to ' + b.to });
  };
  O.undo = function (id) {
    const e = id ? list().find((x) => x.id === id) : list().find((x) => !x.undone && KINDS[x.type]);
    if (!e) { D.toast({ icon: 'loop', c: '#96969f', title: 'Nothing to undo', text: 'Changes you make show up in Oops.' }); return null; }
    if (e.undone) return e;
    const ok = () => { e.undone = Date.now(); D.save(); D.emit('oops'); S.play('back'); D.toast({ icon: 'loop', c: '#2fa59a', title: 'Undone', text: e.title }); };
    const bad = (err) => D.toast({ icon: 'loop', c: '#ef6a55', title: 'Couldn\'t undo that', text: (err && err.message) || e.title });
    try {
      const p = O.quietly(() => KINDS[e.type].undo(e));
      if (p && p.then) p.then(ok, bad); else ok();
    } catch (err) { bad(err); return null; }
    return e;
  };
  O.list = () => list().slice();

  // ---- watching for changes -----------------------------------------------------------------------------------------
  const set0 = D.set;
  D.set = function (k, v) {
    const before = clone(D.state[k]);
    const r = set0.call(D, k, v);
    if (SET[k] && !same(before, v)) O.add({ type: 'set', key: k, before, after: clone(v), title: SET[k][0] + ': ' + SET[k][1](v) });
    return r;
  };
  if (D.disk) {
    const trash0 = D.disk.trash, rename0 = D.disk.rename;
    D.disk.trash = function (p) { const n = trash0.apply(this, arguments); O.add({ type: 'trash', name: n, title: 'Moved ' + String(p).split('/').pop() + ' to the Trash', bar: true }); return n; };
    D.disk.rename = function (p, to) {
      const r = rename0.apply(this, arguments), dir = String(p).replace(/\/[^/]*$/, ''), from = String(p).split('/').pop();
      if (from !== to) O.add({ type: 'rename', path: dir + '/' + to, from, title: 'Renamed ' + from + ' to ' + to });
      return r;
    };
  }
  // windows: closing one goes on the list, so it can come back where it was
  if (D.desk) {
    const open0 = D.desk.open;
    D.desk.open = function () {
      const w = open0.apply(this, arguments);
      if (w && w.close && !w._oops) {
        w._oops = true;
        const close0 = w.close;
        w.close = function () { O.add({ type: 'win', app: w.id, box: clone(w.box), max: !!w.max, snap: w.snap || null, title: 'Closed ' + w.app.name }); return close0.apply(this, arguments); };
      }
      return w;
    };
  }
  // leaving the desktop closes every window: that isn't a change to take back
  if (D.desk && D.desk.exit) { const exit0 = D.desk.exit; D.desk.exit = function () { return O.quietly(() => exit0.apply(this, arguments)); }; }
  // modes: starting one changes several settings, but it's one thing to undo
  if (D.modes) {
    const start0 = D.modes.start, end0 = D.modes.end;
    D.modes.start = function (id, q) { const prev = D.state.mode && D.state.mode.id; const r = O.quietly(() => start0.apply(this, arguments)); const m = D.modes.current && D.modes.current(); if (m && !q) O.add({ type: 'mode', on: true, prev, title: 'Started ' + m.name + ' mode' }); return r; };
    D.modes.end = function (q) { const m = D.modes.current && D.modes.current(); const r = O.quietly(() => end0.apply(this, arguments)); if (m && !q) O.add({ type: 'mode', on: false, prev: m.id, title: 'Ended ' + m.name + ' mode' }); return r; };
  }
  // reminders (wrapped once Deuce is ready)
  function wrapReminders() {
    const R = D.deuce && D.deuce.reminders;
    if (!R || R._oops) return;
    R._oops = true;
    const add0 = R.add, remove0 = R.remove;
    R.add = function (what, at, on) { const r = add0.apply(this, arguments); if (r && r.id) O.add({ type: 'remset', rid: r.id, title: 'Reminder: ' + what }); return r; };
    R.remove = function (id) { const r = R.list().find((x) => x.id === id); const out = remove0.apply(this, arguments); if (r) O.add({ type: 'rem', what: r.what, when: r.at, on: r.on, title: 'Deleted the reminder "' + r.what + '"', bar: true }); return out; };
  }
  wrapReminders();
  D.on('booted', wrapReminders);
  O.widgetGone = (w) => O.add({ type: 'widget', widget: clone(w), title: 'Removed the ' + w.type + ' widget', bar: true });

  // ---- a bar with Undo, for the things you'd most want back ----------------------------------------------------------
  let barEl = null, barT = 0, barFor = null;
  D.on('oops', () => { if (barEl && barFor && barFor.undone) barEl.classList.remove('on'); });
  function bar(e) {
    if (!barEl) {
      barEl = h('<div id="oopsbar" class="glass" role="status" aria-live="polite"><span></span><button class="b small" data-nav>Undo</button><button class="ob-x" aria-label="Dismiss">' + D.glyph('close', 1) + '</button></div>');
      document.body.appendChild(barEl);
      barEl.querySelector('.ob-x').onclick = () => { barEl.classList.remove('on'); };
    }
    barFor = e;
    barEl.querySelector('span').textContent = e.title;
    barEl.querySelector('.b').onclick = () => { O.undo(e.id); barEl.classList.remove('on'); };
    clearTimeout(barT);
    requestAnimationFrame(() => barEl.classList.add('on'));
    barT = setTimeout(() => barEl.classList.remove('on'), 7000);
  }

  // ---- the list ----------------------------------------------------------------------------------------------------
  let panel = null;
  const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(t).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }); };
  O.open = function () {
    if (panel) return paint();
    panel = h('<div id="oops" class="navtrap" role="dialog" aria-label="Oops: undo a change"><div class="oo-in glass"><header><span class="oo-ico" aria-hidden="true">' + D.glyph('loop', 2) + '</span><div><b>Oops</b><span>Take back anything you changed</span></div>' +
      '<button class="oo-x" data-nav aria-label="Close">' + D.glyph('close', 2) + '</button></header><ul class="oo-list"></ul></div></div>');
    document.body.appendChild(panel);
    panel.querySelector('.oo-x').onclick = O.close;
    panel.addEventListener('pointerdown', (e) => { if (e.target === panel) O.close(); });
    requestAnimationFrame(() => panel.classList.add('on'));
    paint();
    S.play('open');
    setTimeout(() => { const b = panel && panel.querySelector('.oo-list button:not([disabled])') || panel && panel.querySelector('.oo-x'); if (b) b.focus(); }, 60);
  };
  O.close = function () { if (!panel) return; const p = panel; panel = null; p.classList.remove('on'); setTimeout(() => p.remove(), 250); };
  O.isOpen = () => !!panel;
  function paint() {
    if (!panel) return;
    const ul = panel.querySelector('.oo-list'), L = list();
    ul.innerHTML = L.length ? '' : '<li class="oo-none">Nothing yet. When you change a setting, close a window or move something to the Trash, it shows up here, ready to take back.</li>';
    L.slice(0, 30).forEach((e) => {
      const k = KINDS[e.type] || { icon: 'gear' };
      const li = h('<li class="' + (e.undone ? 'done' : '') + '"><span class="oo-k" aria-hidden="true">' + D.glyph(k.icon, 2) + '</span><div><b></b><small></small></div>' +
        (e.undone ? '<em>Undone</em>' : '<button class="b small" data-nav>Undo</button>') + '</li>');
      li.querySelector('b').textContent = e.title;
      li.querySelector('small').textContent = cap(ago(e.at));
      const b = li.querySelector('button');
      if (b) b.onclick = () => { O.undo(e.id); paint(); };
      ul.appendChild(li);
    });
  }
  D.on('oops', paint);
  const typing = (t) => t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);
  D.keyFirst.push((e) => {
    // Super + Z: take back the last change; with Shift, the list (in a text box it's the box's own undo)
    if (e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'z' || e.key === 'Z') && !typing(e.target)) { e.preventDefault(); if (e.shiftKey) O.open(); else O.undo(); return true; }
    return false;
  });
  // Back (Escape, or the remote's Back) closes the list
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) { if (panel && a === 'b') { O.close(); S.play('back'); return; } return fire0.call(D.input, a, src); };
})();
