// Making Dice yours:
//
// - Modes: one tap (or "start focus mode") changes the whole computer. Focus quiets
//   notifications and starts a 25-minute timer; School opens Axiom and Notes; Play turns on
//   Traced mode and the games; Chill puts on music by the beach; Night goes dark and warm.
//   Make your own, or change these. Quick access, the Dice Bar, Deuce and Routines start them.
// - Routines: "at 7:30 on school days, start School mode and tell me the weather"; "when
//   DiceOS starts, open SereneTab"; "at 9:30 every night, Night mode".
// - Your week: time on the computer each day, the apps you used most, the sites you went to,
//   what Shield kept out, what you finished in Axiom. It stays on this computer.
// - Pick up where you left off: the desktop's windows come back where they were.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, L = D.L;
  D.moreSettings = D.moreSettings || [];
  const dayKey = (d) => L.dayKey(d || new Date());

  // ---- Modes ---------------------------------------------------------------------------------------------------
  const DEFAULT_MODES = [
    { id: 'focus', name: 'Focus', c: '#4b7bec', c2: '#3fd0b8', blurb: 'Notifications wait, and a 25-minute timer runs.', dnd: true, timer: 25, world: 'pond' },
    { id: 'school', name: 'School', c: '#e9a23b', c2: '#ef6a55', blurb: 'Axiom and Notes open. Notifications wait.', dnd: true, open: ['calendar', 'notes'], world: 'garden' },
    { id: 'play', name: 'Play', c: '#8a6bd8', c2: '#ff707a', blurb: 'Traced mode and your games.', looks: 'traced', open: ['gaming'], world: 'city' },
    { id: 'chill', name: 'Chill', c: '#2bc4b2', c2: '#7cc4ff', blurb: 'Music on, by the beach.', music: true, world: 'beach', looks: 'traced' },
    { id: 'night', name: 'Night', c: '#5b4fa8', c2: '#d39cf5', blurb: 'Dark, warm and quiet.', look: 'night', warm: true, dnd: true },
  ];
  // what a mode may change, and how to put each back afterwards
  const KNOBS = {
    look: { get: () => D.state.look, set: (v) => { D.set('look', v); D.applyLook(true); } },
    looks: { get: () => D.state.looks || 'normal', set: (v) => { D.state.looks = v; D.save(); if (D.prefs) D.prefs.live(); D.emit('prefs'); } },
    world: { get: () => D.state.world, set: (v) => { D.set('world', v); D.emit('prefs'); } },
    warm: { get: () => D.tools.warmOn(), set: (v) => D.tools.setWarm(v ? 'on' : 'off') },
    dnd: { get: () => D.tools.quiet(), set: (v) => D.tools.setQuiet(v) },
    sounds: { get: () => D.state.ui, set: (v) => { D.set('ui', v); D.S.setUi(v); } },
  };
  const M = D.modes = {
    list() {
      if (!Array.isArray(D.state.modes) || !D.state.modes.length) D.state.modes = JSON.parse(JSON.stringify(DEFAULT_MODES));
      for (const m of D.state.modes) if (m.looks === 'heaven') { m.looks = 'traced'; if (m.blurb) m.blurb = m.blurb.replace('Heavenly looks', 'Traced mode'); } // its old name
      return D.state.modes;
    },
    find: (name) => { const n = String(name || '').toLowerCase().trim(); return M.list().find((m) => m.id === n || m.name.toLowerCase() === n) || null; },
    current: () => (D.state.mode ? M.list().find((m) => m.id === D.state.mode.id) || null : null),
    start(id, quiet) {
      const m = M.list().find((x) => x.id === id);
      if (!m) return;
      if (D.state.mode) M.end(true);
      const before = {};
      Object.keys(KNOBS).forEach((k) => { if (m[k] !== undefined && m[k] !== '') { before[k] = KNOBS[k].get(); KNOBS[k].set(m[k]); } });
      D.state.mode = { id: m.id, since: Date.now(), before };
      (m.open || []).forEach((a, i) => { if (D.app(a) && (!D.app(a).pc || (D.desk && D.desk.on))) setTimeout(() => D.launch(a), 300 + i * 250); });
      if (m.site && /^https?:/.test(m.site) && D.browse) setTimeout(() => D.browse(m.site), 400);
      if (m.music && D.M) D.M.play('radio', 0);
      if (m.timer) { const T = D.timer || (D.timer = {}); Object.assign(T, { total: m.timer * 60000, left: m.timer * 60000, end: Date.now() + m.timer * 60000, running: true }); D.emit('timer'); }
      if (m.input && D.inputs && D.sys) D.inputs.find({ name: m.input }).then((r) => { if (r && r.ok) D.inputs.go(r.device); });
      D.save(); D.emit('mode', m);
      used(m.id);
      if (!quiet) D.toast({ icon: 'spark', c: m.c, title: m.name + ' mode', text: m.blurb || 'On.' });
    },
    end(quiet) {
      const cur = D.state.mode;
      if (!cur) return;
      const m = M.list().find((x) => x.id === cur.id);
      Object.entries(cur.before || {}).forEach(([k, v]) => { if (KNOBS[k]) KNOBS[k].set(v); });
      D.state.mode = null;
      if (m && m.timer && D.timer && D.timer.running) { D.timer.running = false; D.timer.left = 0; D.emit('timer'); }
      D.save(); D.emit('mode', null);
      if (!quiet && m) D.toast({ icon: 'spark', c: '#96969f', title: m.name + ' mode is off', text: 'Everything is back how it was.' });
    },
    // Quick access: a row of modes
    quickRow(close) {
      const row = h('<div class="qgroup md-quick"><div class="md-qhead"><b>Modes</b><button class="b small" data-nav data-key="q:modes">Edit</button></div><div class="md-chips"></div></div>');
      row.querySelector('[data-key="q:modes"]').onclick = () => { close(); D.launch('settings', { arg: 'modes' }); };
      const box = row.querySelector('.md-chips'), cur = M.current();
      M.list().forEach((m) => {
        const on = cur && cur.id === m.id;
        const b = h('<button class="md-chip' + (on ? ' on' : '') + '" data-nav data-key="q:mode-' + esc(m.id) + '" style="--c:' + m.c + ';--c2:' + (m.c2 || m.c) + '" aria-pressed="' + !!on + '">' + D.glyph('spark', 2) + esc(m.name) + '</button>');
        b.onclick = () => { if (on) M.end(); else M.start(m.id); close(); };
        box.appendChild(b);
      });
      return row;
    },
  };
  function used(id) { const u = usage(); u.modes = u.modes || {}; u.modes[id] = (u.modes[id] || 0) + 1; }

  // the mode on now, beside the clock on the desktop
  function paintPill() {
    const tray = D.$('#desk .dtray');
    if (!tray) return;
    let pill = tray.querySelector('.md-pill');
    const m = M.current();
    if (!m) { if (pill) pill.remove(); return; }
    if (!pill) { pill = h('<button class="md-pill" aria-label=""></button>'); tray.prepend(pill); pill.onclick = () => M.end(); }
    pill.style.setProperty('--c', m.c); pill.style.setProperty('--c2', m.c2 || m.c);
    pill.innerHTML = D.glyph('spark', 2) + '<span>' + esc(m.name) + '</span>';
    pill.setAttribute('aria-label', m.name + ' mode is on. Click to end it.');
    pill.title = m.name + ' mode. Click to end it.';
  }
  D.on('mode', paintPill); D.on('desk', (on) => { if (on) setTimeout(paintPill, 0); });

  D.moreSettings.push({ id: 'modes', name: 'Modes', icon: 'spark', c: '#8a6bd8', after: 'look', pane: modesPane });
  function modesPane(pane, k) {
    pane.appendChild(h('<h2>Modes</h2>'));
    pane.appendChild(h('<p class="note">One tap changes the whole computer, and ending it puts everything back. Start one from Quick access, the Dice Bar, or say "start focus mode" to Deuce.</p>'));
    const grid = h('<div class="md-grid"></div>');
    const cur = M.current();
    M.list().forEach((m) => {
      const on = cur && cur.id === m.id;
      const card = h('<div class="md-card' + (on ? ' on' : '') + '" style="--c:' + m.c + ';--c2:' + (m.c2 || m.c) + '"><div class="md-top"><b>' + esc(m.name) + '</b>' + (on ? '<span class="md-on">On now</span>' : '') + '</div><p>' + esc(describe(m)) + '</p><div class="md-btns"></div></div>');
      const go = h('<button class="b small ' + (on ? '' : 'go') + '" data-nav data-key="md:go-' + esc(m.id) + '">' + (on ? 'End it' : 'Start') + '</button>');
      go.onclick = () => { if (on) M.end(); else M.start(m.id); k.again(); };
      const ed = h('<button class="b small" data-nav data-key="md:ed-' + esc(m.id) + '">Change</button>');
      ed.onclick = () => editMode(pane, k, m);
      card.querySelector('.md-btns').append(go, ed);
      grid.appendChild(card);
    });
    const add = h('<button class="md-card md-new" data-nav data-key="md:new">' + D.glyph('plus', 2) + '<b>New mode</b></button>');
    add.onclick = () => { const m = { id: 'm' + Date.now().toString(36), name: 'My mode', c: '#ef6a55', c2: '#f5c431', blurb: '' }; M.list().push(m); D.save(); editMode(pane, k, m); };
    grid.appendChild(add);
    pane.appendChild(grid);
    const rs = h('<button class="b small" data-nav data-key="md:reset">Put the first ones back</button>');
    rs.onclick = () => { if (D.state.mode) M.end(true); D.state.modes = null; M.list(); D.save(); k.again(); };
    pane.appendChild(k.row('Start again', 'Focus, School, Play, Chill and Night, as they were.', rs));
  }
  function describe(m) {
    const bits = [];
    if (m.dnd) bits.push('notifications wait');
    if (m.timer) bits.push('a ' + m.timer + '-minute timer');
    if (m.look === 'night') bits.push('dark'); else if (m.look === 'day') bits.push('light');
    if (m.warm) bits.push('night light');
    if (m.looks === 'traced') bits.push('Traced mode');
    if (m.world) bits.push('the ' + m.world + ' world');
    if (m.music) bits.push('music');
    if (m.open && m.open.length) bits.push('opens ' + m.open.map((a) => (D.app(a) || { name: a }).name).join(' and '));
    if (m.site) bits.push('opens ' + L.hostOf(m.site).replace(/^www\./, ''));
    if (m.input) bits.push('switches to ' + m.input);
    return bits.length ? bits.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'Nothing yet: press Change.';
  }
  function editMode(pane, k, m) {
    pane.innerHTML = '';
    pane.appendChild(h('<h2>' + esc(m.name) + ' mode</h2>'));
    const { row, seg, sw } = k;
    const nm = h('<input type="text" data-nav data-key="md:name" maxlength="16" aria-label="Name">'); nm.value = m.name; nm.onchange = () => { m.name = nm.value.trim().slice(0, 16) || 'My mode'; D.save(); };
    pane.appendChild(row('Name', 'Say "start ' + m.name.toLowerCase() + ' mode" to Deuce.', nm));
    const COLS = [['#4b7bec', '#3fd0b8'], ['#e9a23b', '#ef6a55'], ['#8a6bd8', '#ff707a'], ['#2bc4b2', '#7cc4ff'], ['#5b4fa8', '#d39cf5'], ['#ef6a55', '#f5c431'], ['#2f9e6e', '#d7f07a']];
    const sws = h('<div class="swatches"></div>');
    COLS.forEach(([a, b], i) => { const s = h('<button class="sw2" data-nav data-key="md:c' + i + '" style="--c:' + a + ';--c2:' + b + '" aria-pressed="' + (m.c === a) + '" aria-label="Colours ' + (i + 1) + '"></button>'); s.onclick = () => { m.c = a; m.c2 = b; D.save(); sws.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === s)); }; sws.appendChild(s); });
    pane.appendChild(row('Colours', '', sws));
    pane.appendChild(row('Notifications wait', 'Do not disturb while it\'s on.', sw(!!m.dnd, (v) => { m.dnd = v; D.save(); }, 'md:dnd', 'Do not disturb')));
    pane.appendChild(row('Light or dark', '', seg([['', 'Leave it'], ['day', 'Light'], ['night', 'Dark']], m.look || '', (v) => { m.look = v || undefined; D.save(); }, 'md:look')));
    pane.appendChild(row('Night light', '', sw(!!m.warm, (v) => { m.warm = v || undefined; D.save(); }, 'md:warm', 'Night light')));
    pane.appendChild(row('Traced mode', 'Your world painted by hand.', seg([['', 'Leave it'], ['traced', 'On'], ['normal', 'Off']], m.looks || '', (v) => { m.looks = v || undefined; D.save(); }, 'md:looks')));
    const worlds = h('<select class="sel" data-nav data-key="md:world" aria-label="World"><option value="">Leave it</option>' + Object.keys(D.WORLDS || {}).map((w) => '<option value="' + w + '"' + (m.world === w ? ' selected' : '') + '>' + w.replace(/^./, (c) => c.toUpperCase()) + '</option>').join('') + '</select>');
    worlds.onchange = () => { m.world = worlds.value || undefined; D.save(); };
    pane.appendChild(row('World', 'The landscape behind everything.', worlds));
    pane.appendChild(row('Focus timer', 'Starts when the mode does; the Clock rings at the end.', seg([[0, 'None'], [15, '15 min'], [25, '25'], [45, '45'], [60, '60']], m.timer || 0, (v) => { m.timer = +v || undefined; D.save(); }, 'md:timer')));
    pane.appendChild(row('Music', 'Dice Radio comes on.', sw(!!m.music, (v) => { m.music = v || undefined; D.save(); }, 'md:music', 'Music')));
    const apps = h('<div class="md-apps"></div>');
    D.all().filter((a) => !a.suite && a.id !== 'settings').sort((a, b) => a.name.localeCompare(b.name)).forEach((a) => {
      const on = (m.open || []).includes(a.id);
      const b = h('<button class="b small" data-nav data-key="md:app-' + esc(a.id) + '" aria-pressed="' + on + '">' + esc(a.name) + '</button>');
      b.onclick = () => { m.open = (m.open || []).filter((x) => x !== a.id); if (b.getAttribute('aria-pressed') !== 'true') m.open.push(a.id); b.setAttribute('aria-pressed', String(m.open.includes(a.id))); D.save(); };
      apps.appendChild(b);
    });
    const ar = row('Open these apps', '', null); ar.classList.add('col'); ar.appendChild(apps); pane.appendChild(ar);
    const site = h('<input type="url" data-nav data-key="md:site" placeholder="https://…" aria-label="A website to open">'); site.value = m.site || '';
    site.onchange = () => { const v = site.value.trim(); m.site = /^https?:\/\/\S+$/.test(v) ? v : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(v) ? 'https://' + v : undefined; site.value = m.site || ''; D.save(); };
    pane.appendChild(row('Open a website', 'In SereneTab.', site));
    if (D.sys && D.inputs) {
      const inp = h('<input type="text" data-nav data-key="md:input" placeholder="PlayStation, Work laptop…" aria-label="An input to switch to">'); inp.value = m.input || '';
      inp.onchange = () => { m.input = inp.value.trim().slice(0, 40) || undefined; D.save(); };
      pane.appendChild(row('Switch the TV or screen to', 'Like saying "switch to the PlayStation".', inp));
    }
    const done = h('<button class="b go" data-nav data-key="md:done">Done</button>');
    done.onclick = () => k.again();
    const del = h('<button class="b danger" data-nav data-key="md:del">' + D.glyph('trash', 2) + 'Delete this mode</button>');
    del.onclick = () => { if (D.state.mode && D.state.mode.id === m.id) M.end(true); D.state.modes = M.list().filter((x) => x !== m); D.save(); k.again(); };
    const foot = h('<div class="md-foot"></div>'); foot.append(done, del);
    pane.appendChild(foot);
    D.nav.focus(nm);
  }

  // ---- Routines ------------------------------------------------------------------------------------------------
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ACTS = { mode: 'Start a mode', end: 'End the mode', open: 'Open an app', site: 'Open a website', say: 'Deuce says', remind: 'Remind me', warm: 'Night light on', look: 'Go dark', music: 'Play music', weather: 'Tell me the weather' };
  const DEFAULT_ROUTINES = [
    { id: 'r-school', on: false, name: 'School mornings', when: { type: 'time', time: '07:30', days: [1, 2, 3, 4, 5] }, do: [{ a: 'mode', v: 'school' }, { a: 'weather' }] },
    { id: 'r-wind', on: false, name: 'Wind down', when: { type: 'time', time: '21:30', days: [0, 1, 2, 3, 4, 5, 6] }, do: [{ a: 'mode', v: 'night' }, { a: 'say', v: 'Time to wind down. Good night.' }] },
    { id: 'r-start', on: false, name: 'When DiceOS starts', when: { type: 'start' }, do: [{ a: 'open', v: 'browser' }] },
  ];
  const RT = D.routines = {
    list() { if (!Array.isArray(D.state.routines)) D.state.routines = JSON.parse(JSON.stringify(DEFAULT_ROUTINES)); return D.state.routines; },
    run(r) {
      r.last = Date.now(); D.save();
      (r.do || []).forEach((x, i) => setTimeout(() => act(x), i * 600));
      D.toast({ icon: 'loop', c: '#2f9e6e', title: r.name, text: 'Your routine ran.' });
    },
  };
  function act(x) {
    const DU = D.deuce;
    if (x.a === 'mode' && x.v) M.start(x.v, true);
    else if (x.a === 'end') M.end(true);
    else if (x.a === 'open' && D.app(x.v)) D.launch(x.v);
    else if (x.a === 'site' && x.v && D.browse) D.browse(x.v);
    else if (x.a === 'say' && x.v) { if (D.sys && !D.sys.info.emulated) D.sys.post('/api/voice', { action: 'say', text: x.v }); else D.toast({ icon: 'die', c: '#4b7bec', title: 'Deuce', text: x.v }); }
    else if (x.a === 'remind' && x.v && DU) DU.reminders.add(x.v, Date.now() + 1000);
    else if (x.a === 'warm') D.tools.setWarm('on');
    else if (x.a === 'look') { D.set('look', 'night'); D.applyLook(true); }
    else if (x.a === 'music' && D.M) D.M.play('radio', 0);
    else if (x.a === 'weather' && DU) { if (DU.usePC && DU.usePC()) DU.ask('what\'s the weather'); else DU.DO.weather({ tomorrow: false }); }
  }
  // time routines: checked twice a minute, once a day each
  setInterval(() => {
    const now = new Date(), hm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'), today = dayKey(now);
    RT.list().forEach((r) => {
      if (!r.on || !r.when || r.when.type !== 'time' || r.when.time !== hm) return;
      if (Array.isArray(r.when.days) && r.when.days.length && !r.when.days.includes(now.getDay())) return;
      if (r.lastDay === today) return;
      r.lastDay = today;
      RT.run(r);
    });
  }, 20000);
  // start-up routines and mode ones
  D.on('booted', () => RT.list().filter((r) => r.on && r.when && r.when.type === 'start').forEach((r) => setTimeout(() => RT.run(r), 1200)));
  D.on('mode', (m) => { if (!m) return; RT.list().filter((r) => r.on && r.when && r.when.type === 'mode' && r.when.mode === m.id).forEach((r) => RT.run(Object.assign({}, r, { do: r.do.filter((x) => x.a !== 'mode') }))); });

  D.moreSettings.push({ id: 'routines', name: 'Routines', icon: 'loop', c: '#2f9e6e', after: 'modes', pane: routinesPane });
  function whenText(w) {
    if (!w) return '';
    if (w.type === 'start') return 'When DiceOS starts';
    if (w.type === 'mode') return 'When ' + ((M.list().find((m) => m.id === w.mode) || {}).name || 'a') + ' mode starts';
    const d = w.days || [];
    const days = d.length === 7 || !d.length ? 'every day' : d.join() === '1,2,3,4,5' ? 'on school days' : d.join() === '0,6' ? 'on weekends' : 'on ' + d.map((x) => DAYS[x]).join(', ');
    const [hh, mm] = (w.time || '00:00').split(':').map(Number);
    return 'At ' + new Date(2026, 0, 1, hh, mm).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ', ' + days;
  }
  function doText(x) {
    if (x.a === 'mode') return 'start ' + ((M.list().find((m) => m.id === x.v) || {}).name || x.v) + ' mode';
    if (x.a === 'open') return 'open ' + ((D.app(x.v) || {}).name || x.v);
    if (x.a === 'site') return 'open ' + L.hostOf(x.v || '').replace(/^www\./, '');
    if (x.a === 'say') return 'Deuce says "' + x.v + '"';
    if (x.a === 'remind') return 'remind me to ' + x.v;
    return ACTS[x.a].toLowerCase();
  }
  function routinesPane(pane, k) {
    pane.appendChild(h('<h2>Routines</h2>'));
    pane.appendChild(h('<p class="note">Things Dice does by itself: at a time, when it starts, or when a mode starts.</p>'));
    RT.list().forEach((r, i) => {
      const card = h('<div class="rt-card' + (r.on ? ' on' : '') + '"><div><b>' + esc(r.name) + '</b><span class="rt-when">' + esc(whenText(r.when)) + '</span><span class="rt-do">' + esc((r.do || []).map(doText).join(', then ').replace(/^./, (c) => c.toUpperCase())) + '</span></div><div class="rt-btns"></div></div>');
      const s = k.sw(!!r.on, (v) => { r.on = v; D.save(); card.classList.toggle('on', v); }, 'rt:on' + i, r.name);
      const ed = h('<button class="b small" data-nav data-key="rt:ed' + i + '">Change</button>'); ed.onclick = () => editRoutine(pane, k, r);
      const run = h('<button class="b small" data-nav data-key="rt:run' + i + '">Run now</button>'); run.onclick = () => RT.run(r);
      card.querySelector('.rt-btns').append(run, ed, s);
      pane.appendChild(card);
    });
    const add = h('<button class="b" data-nav data-key="rt:new">' + D.glyph('plus', 2) + 'New routine</button>');
    add.onclick = () => { const r = { id: 'r' + Date.now().toString(36), on: true, name: 'My routine', when: { type: 'time', time: '08:00', days: [1, 2, 3, 4, 5] }, do: [] }; RT.list().push(r); D.save(); editRoutine(pane, k, r); };
    pane.appendChild(add);
  }
  function editRoutine(pane, k, r) {
    pane.innerHTML = '';
    pane.appendChild(h('<h2>' + esc(r.name) + '</h2>'));
    const { row, seg } = k;
    const nm = h('<input type="text" data-nav data-key="rt:name" maxlength="30" aria-label="Name">'); nm.value = r.name; nm.onchange = () => { r.name = nm.value.trim().slice(0, 30) || 'My routine'; D.save(); };
    pane.appendChild(row('Name', '', nm));
    const whenBox = h('<div class="rt-whenbox"></div>');
    const paintWhen = () => {
      whenBox.innerHTML = '';
      if (r.when.type === 'time') {
        const t = h('<input type="time" data-nav data-key="rt:time" aria-label="Time">'); t.value = r.when.time || '08:00'; t.onchange = () => { r.when.time = t.value || '08:00'; D.save(); };
        whenBox.appendChild(row('Time', '', t));
        const days = h('<div class="rt-days"></div>');
        DAYS.forEach((d, i) => { const b = h('<button class="b small" data-nav data-key="rt:d' + i + '" aria-pressed="' + (r.when.days || []).includes(i) + '">' + d + '</button>'); b.onclick = () => { const set = new Set(r.when.days || []); if (set.has(i)) set.delete(i); else set.add(i); r.when.days = [...set].sort(); b.setAttribute('aria-pressed', String(set.has(i))); D.save(); }; days.appendChild(b); });
        whenBox.appendChild(row('Days', '', days));
      } else if (r.when.type === 'mode') {
        const s = h('<select class="sel" data-nav data-key="rt:wmode" aria-label="Which mode">' + M.list().map((m) => '<option value="' + esc(m.id) + '"' + (r.when.mode === m.id ? ' selected' : '') + '>' + esc(m.name) + '</option>').join('') + '</select>');
        if (!r.when.mode) r.when.mode = M.list()[0].id;
        s.onchange = () => { r.when.mode = s.value; D.save(); };
        whenBox.appendChild(row('Which mode', '', s));
      }
    };
    pane.appendChild(row('When', '', seg([['time', 'At a time'], ['start', 'DiceOS starts'], ['mode', 'A mode starts']], r.when.type, (v) => { r.when = v === 'time' ? { type: 'time', time: '08:00', days: [1, 2, 3, 4, 5] } : { type: v }; D.save(); paintWhen(); }, 'rt:when')));
    pane.appendChild(whenBox); paintWhen();
    // what it does
    const list = h('<div class="rt-do-list"></div>');
    const paintDo = () => {
      list.innerHTML = '';
      if (!r.do.length) list.appendChild(h('<p class="muted">Nothing yet. Add something below.</p>'));
      r.do.forEach((x, i) => { const it = h('<div class="rt-step"><span>' + (i + 1) + '</span><b></b><button class="b small" data-nav data-key="rt:x' + i + '" aria-label="Take this off">' + D.glyph('close', 2) + '</button></div>'); it.querySelector('b').textContent = doText(x).replace(/^./, (c) => c.toUpperCase()); it.querySelector('button').onclick = () => { r.do.splice(i, 1); D.save(); paintDo(); }; list.appendChild(it); });
    };
    paintDo();
    const addRow = h('<form class="rt-add"><select class="sel" data-nav data-key="rt:act" aria-label="What to do">' + Object.entries(ACTS).map(([a, n]) => '<option value="' + a + '">' + esc(n) + '</option>').join('') + '</select><span class="rt-val"></span><button class="b small" data-nav data-key="rt:addgo">Add</button></form>');
    const sel = addRow.querySelector('select'), val = addRow.querySelector('.rt-val');
    const paintVal = () => {
      const a = sel.value;
      val.innerHTML = a === 'mode' ? '<select class="sel" aria-label="Mode">' + M.list().map((m) => '<option value="' + esc(m.id) + '">' + esc(m.name) + '</option>').join('') + '</select>'
        : a === 'open' ? '<select class="sel" aria-label="App">' + D.all().filter((x) => !x.suite).sort((x, y) => x.name.localeCompare(y.name)).map((x) => '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('') + '</select>'
        : /^(site|say|remind)$/.test(a) ? '<input type="text" aria-label="What" placeholder="' + (a === 'site' ? 'example.com' : a === 'say' ? 'Good morning!' : 'take my vitamins') + '">' : '';
    };
    sel.onchange = paintVal; paintVal();
    addRow.onsubmit = (e) => {
      e.preventDefault();
      const f = val.querySelector('select,input'), a = sel.value;
      let v = f ? f.value.trim() : undefined;
      if (a === 'site' && v) v = /^https?:/.test(v) ? v : 'https://' + v;
      if (f && !v) { f.focus(); return; }
      r.do.push(v === undefined ? { a } : { a, v }); D.save(); paintDo(); if (f && f.tagName === 'INPUT') f.value = '';
    };
    const dr = row('Then do', 'In this order.', null); dr.classList.add('col'); dr.appendChild(list); dr.appendChild(addRow); pane.appendChild(dr);
    const done = h('<button class="b go" data-nav data-key="rt:done">Done</button>'); done.onclick = () => k.again();
    const del = h('<button class="b danger" data-nav data-key="rt:del">' + D.glyph('trash', 2) + 'Delete this routine</button>');
    del.onclick = () => { D.state.routines = RT.list().filter((x) => x !== r); D.save(); k.again(); };
    const foot = h('<div class="md-foot"></div>'); foot.append(done, del); pane.appendChild(foot);
  }

  // ---- Your week -----------------------------------------------------------------------------------------------
  function usage() {
    const all = D.state.usage && typeof D.state.usage === 'object' ? D.state.usage : (D.state.usage = {});
    const k = dayKey();
    if (!all[k]) { all[k] = { t: 0, apps: {} }; Object.keys(all).sort().slice(0, -14).forEach((x) => delete all[x]); }
    return all[k];
  }
  // a minute at a time, while you're using it
  let idleSince = Date.now();
  ['pointermove', 'keydown', 'pointerdown', 'wheel'].forEach((ev) => addEventListener(ev, () => { idleSince = Date.now(); }, { passive: true, capture: true }));
  D.on('remote', () => { idleSince = Date.now(); });
  setInterval(() => {
    if (D.asleep || document.hidden || Date.now() - idleSince > 5 * 60000 || D.serenePage) return;
    const u = usage();
    u.t += 1;
    let id = 'home';
    if (D.desk && D.desk.on) { const w = D.desk.top && D.desk.top(); id = w ? w.id.replace('web:', '') : 'desktop'; } else { const r = D.running && D.running(); id = r ? r.id : D.inputs && D.inputs.away ? 'inputs' : 'home'; }
    u.apps[id] = (u.apps[id] || 0) + 1;
    if (u.t % 5 === 0) D.save();
  }, 60000);
  const hm = (mins) => (mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' h' + (mins % 60 ? ' ' + (mins % 60) + ' min' : ''));
  const R = D.recap = {
    days() {
      const out = [], all = D.state.usage || {};
      for (let i = 6; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5), k = dayKey(d); out.push({ d, k, t: (all[k] && all[k].t) || 0, apps: (all[k] && all[k].apps) || {} }); }
      return out;
    },
    summary() {
      const days = R.days(), week = days.reduce((a, x) => a + x.t, 0), apps = {};
      days.forEach((x) => Object.entries(x.apps).forEach(([id, n]) => { apps[id] = (apps[id] || 0) + n; }));
      const top = Object.entries(apps).sort((a, b) => b[1] - a[1]).slice(0, 5);
      return { days, week, top, todayText: hm(days[6].t), weekText: hm(week) };
    },
    open() { D.launch('settings', { arg: 'week' }); },
  };
  D.moreSettings.push({ id: 'week', name: 'Your week', icon: 'chart', c: '#2bc4b2', after: 'you', pane: weekPane });
  async function weekPane(pane, k) {
    const s = R.summary();
    pane.appendChild(h('<h2>Your week</h2>'));
    const max = Math.max(30, ...s.days.map((x) => x.t));
    const hero = h('<div class="wk-hero glass"><div class="wk-big"><b>' + esc(s.weekText || '0 min') + '</b><span>on the computer in the last 7 days</span></div>' +
      '<div class="wk-bars" role="img" aria-label="' + esc(s.days.map((x) => x.d.toLocaleDateString([], { weekday: 'long' }) + ' ' + hm(x.t)).join(', ')) + '">' +
      s.days.map((x, i) => '<div class="wk-bar' + (i === 6 ? ' today' : '') + '" title="' + esc(x.d.toLocaleDateString([], { weekday: 'long' }) + ': ' + hm(x.t)) + '"><small>' + (x.t ? esc(hm(x.t)) : '') + '</small><i style="height:' + Math.max(3, Math.round(x.t / max * 100)) + '%"></i><span>' + esc(x.d.toLocaleDateString([], { weekday: 'short' })) + '</span></div>').join('') + '</div></div>');
    pane.appendChild(hero);
    const tiles = h('<div class="wk-tiles"></div>');
    pane.appendChild(tiles);
    const tile = (c, title, big, sub) => { const t = h('<div class="wk-tile" style="--c:' + c + '"><span>' + esc(title) + '</span><b>' + esc(big) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'); tiles.appendChild(t); return t; };
    // the apps you used most
    const names = { home: 'DiceTV', desktop: 'The desktop', inputs: 'Other inputs', browser: 'SereneTab' };
    const appsT = h('<div class="wk-tile wide" style="--c:#4b7bec"><span>Most used</span><div class="wk-apps"></div></div>');
    const al = appsT.querySelector('.wk-apps');
    if (!s.top.length) al.appendChild(h('<p class="muted">Use Dice for a while and your apps show up here.</p>'));
    s.top.forEach(([id, n]) => { const a = D.app(id); const r = h('<div class="wk-app"><span class="wk-ico"></span><b>' + esc(names[id] || (a ? a.name : id)) + '</b><em>' + esc(hm(n)) + '</em><i style="--w:' + Math.round(n / s.top[0][1] * 100) + '%"></i></div>'); if (a && D.appIconEl) r.querySelector(".wk-ico").appendChild(D.appIconEl(a, 28)); al.appendChild(r); });
    tiles.appendChild(appsT);
    // sites in SereneTab
    const st = D.state.st || {}, weekAgo = Date.now() - 7 * 864e5, sites = {};
    (st.history || []).filter((x) => x.at > weekAgo && !x.search).forEach((x) => { const hh = L.hostOf(x.url).replace(/^www\./, ''); if (hh) sites[hh] = (sites[hh] || 0) + 1; });
    const ts = Object.entries(sites).sort((a, b) => b[1] - a[1]);
    tile('#2fa5a0', 'Websites', String(ts.length), ts.length ? 'Most: ' + ts.slice(0, 3).map((x) => x[0]).join(', ') : 'in SereneTab');
    // Axiom
    const A = D.state.axiom, done = A && Array.isArray(A.tasks) ? A.tasks.filter((t) => t.done && t.doneAt && t.doneAt >= dayKey(new Date(weekAgo))).length : 0;
    tile('#d4a857', 'Finished in Axiom', String(done), done === 1 ? 'task' : 'tasks');
    // modes
    const modes = {};
    s.days.forEach((x) => { const u = (D.state.usage || {})[x.k]; if (u && u.modes) Object.entries(u.modes).forEach(([id, n]) => { modes[id] = (modes[id] || 0) + n; }); });
    const fav = Object.entries(modes).sort((a, b) => b[1] - a[1])[0];
    tile('#8a6bd8', 'Favourite mode', fav ? ((M.list().find((m) => m.id === fav[0]) || { name: fav[0] }).name) : 'None yet', fav ? 'started ' + fav[1] + (fav[1] === 1 ? ' time' : ' times') : 'Try Focus in Quick access');
    // Shield
    if (D.shield && D.shield.available()) {
      const t = tile('#3fd0b8', 'Shield kept out', '…', 'ads and trackers this week');
      D.shield.get().then((x) => { t.querySelector('b').textContent = x ? Number(Object.values(x.week || {}).reduce((a, b) => a + b, 0)).toLocaleString() : 'On'; });
    }
    pane.appendChild(h('<p class="note">Your week stays on this computer. Dice counts a minute when you\'ve used it in the last five.</p>'));
    const clr = h('<button class="b small" data-nav data-key="wk:clear">Clear it</button>');
    clr.onclick = () => { D.state.usage = {}; D.save(); k.again(); };
    pane.appendChild(k.row('Start counting again', '', clr));
  }

  // ---- Pick up where you left off: the desktop's windows ---------------------------------------------------------
  function snapshot() {
    if (!D.desk || !D.desk.on || D.state.restoreWins === false) return;
    D.state.deskSession = D.desk.wins.filter((w) => !w.id.startsWith('web:')).slice(0, 12).map((w) => ({ id: w.id, ws: w.ws, box: w.box, max: !!w.max, snap: w.snap || null, min: !!w.min }));
  }
  D.saveSession = () => { snapshot(); D.save(true); };
  setInterval(snapshot, 15000);
  addEventListener('beforeunload', () => { snapshot(); try { D.save(true); } catch (e) { /* closing anyway */ } });
  let restored = false;
  D.on('desk', (on) => {
    if (!on || restored) return;
    restored = true;
    const list = D.state.restoreWins === false ? [] : (D.state.deskSession || []);
    if (!list.length) return;
    setTimeout(() => {
      list.forEach((s) => {
        if (!D.app(s.id) || !D.apps[s.id]) return;
        D.desk.open(s.id);
        const w = D.desk.wins[D.desk.wins.length - 1];
        if (!w || w.id !== s.id) return;
        if (s.box && s.box.w > 100) w.box = s.box;
        w.max = s.max; w.snap = s.snap; w.place();
        if (typeof s.ws === 'number' && s.ws !== w.ws && D.deskplus && D.deskplus.moveTo) D.deskplus.moveTo(w, s.ws);
        if (s.min && w.minimise) w.minimise();
      });
      D.toast({ icon: 'desktop', c: '#2f9e6e', title: 'Picked up where you left off', text: list.length + (list.length === 1 ? ' window is' : ' windows are') + ' back. (Settings, Desktop to change this.)' });
    }, 900);
  });
})();
