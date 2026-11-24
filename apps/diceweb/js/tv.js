// DiceTV's extras: the Today row (the time, the weather, what's due in Axiom,
// what's playing and the sleep timer), the Watch row (your streaming sites, one
// press away, and you can add your own), and the ambient screen: after a while
// with nothing to do, a big clock over your world, like a TV's screensaver.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, L = D.L, M = D.M, S = D.S, h = D.h, esc = D.esc;
  const TV = D.tv = {};
  const two = (n) => String(n).padStart(2, '0');
  const timeNow = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const dateNow = () => new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  // ---- the weather, shared with Dice Home and SereneTab ------------------------------------
  const place = () => (D.state.home && D.state.home.place) || (D.state.st && D.state.st.place) || null;
  const units = () => (D.state.st && D.state.st.units) || (/^en-US$/i.test(navigator.language || '') ? 'f' : 'c');
  let wx = null, wxAt = 0, wxBusy = false;
  async function weather() {
    const p = place();
    if (!p || !D.weather) return null;
    if (wx && wx.place === p.name && Date.now() - wxAt < 15 * 60000) return wx;
    if (wxBusy) return wx;
    wxBusy = true;
    try { const d = await D.weather.get(p.lat, p.lon, units()); wx = Object.assign({ place: p.name, words: D.weather.words(d.code) }, d); wxAt = Date.now(); } catch (e) { wx = null; }
    wxBusy = false;
    return wx;
  }
  TV.askTown = async function () {
    const r = await D.ask({ title: 'Your town', text: 'For the weather here, in Dice Home and in SereneTab.', input: { label: 'Town or city', placeholder: 'Town or city', value: (place() || {}).name || '' }, buttons: [{ label: 'Save', value: true, go: true }, { label: 'Cancel', value: false }] });
    const q = r && r.value && r.value.trim();
    if (!q) return;
    try {
      const p = await D.weather.find(q);
      if (!p) return D.toast({ icon: 'sun', c: '#96969f', title: 'No town called ' + q, text: 'Try the nearest city.' });
      D.state.st = D.state.st || {}; D.state.st.place = p;
      if (D.state.home) D.state.home.place = p;
      D.save(); wx = null; paintToday();
    } catch (e) { D.toast({ icon: 'nowifi', c: '#96969f', title: 'Offline', text: 'Looking up towns needs the internet.' }); }
  };

  // ---- Today --------------------------------------------------------------------------------
  let today = null;
  const card = (key, cls, a, x) => h('<button class="tcard glass ' + cls + '" data-nav data-key="td:' + key + '" data-a="' + esc(a) + '"' + (x ? ' data-x="' + esc(x) + '"' : '') + '></button>');
  function dueList() {
    const A = D.state.axiom;
    if (!A || !Array.isArray(A.tasks)) return null;
    const day = L.dayKey(new Date()), b = L.planBuckets(A.tasks, day);
    return b.overdue.concat(b.today).map((t) => Object.assign({ late: t.due < day, cls: (A.classes || []).find((c) => c.id === t.classId) }, t));
  }
  async function paintToday(fresh) {
    if (!today || (!fresh && !today.isConnected)) return; // (a fresh row isn't on the page yet)
    const q = (k) => today.querySelector('[data-key="td:' + k + '"]');
    q('time').innerHTML = '<span class="tlab">' + D.glyph('timer', 1) + 'Now</span><b class="tbig">' + esc(timeNow()) + '</b><span class="tsub">' + esc(dateNow()) + '</span>';
    const due = dueList(), dc = q('due');
    dc.innerHTML = '<span class="tlab">' + D.glyph('bell', 1) + 'Due today</span>' + (!due ? '<b class="tmid">Nothing planned</b><span class="tsub">Add classes and tasks in Axiom.</span>'
      : !due.length ? '<b class="tmid">All done</b><span class="tsub">Nothing due today.</span>'
        : '<ul class="tdue">' + due.slice(0, 3).map((t) => '<li style="--k:' + esc(t.cls ? t.cls.color : '#d4a857') + '"><span>' + esc(t.title) + '</span>' + (t.late ? '<small>late</small>' : '') + '</li>').join('') + '</ul>' + (due.length > 3 ? '<span class="tsub">and ' + (due.length - 3) + ' more</span>' : ''));
    const now = M.now, np = q('np');
    np.dataset.a = now ? (now.playing ? 'Pause' : 'Play') : 'Play Dice Radio';
    np.innerHTML = '<span class="tlab">' + D.glyph('music', 1) + (now && now.playing ? 'Playing' : now ? 'Paused' : 'Music') + '</span><b class="tmid">' + esc(now ? now.name : 'Dice Radio') + '</b><span class="tsub">' + esc(now ? now.by || '' : 'Calm music, made right here.') + '</span>' + (now && now.playing ? '<span class="eqmini"><i></i><i></i><i></i></span>' : '');
    if (now) np.style.setProperty('--tc', now.c); else np.style.removeProperty('--tc');
    const left = D.tools.sleepLeft(), sc = q('sleep');
    sc.innerHTML = '<span class="tlab">' + D.glyph('moon', 1) + 'Sleep timer</span><b class="tmid">' + (left ? left + ' min left' : 'Off') + '</b><span class="tsub">' + (left ? 'Then the music stops and the screen sleeps.' : 'Press to fall asleep to something.') + '</span>';
    const wc = q('wx'), p = place();
    if (!p) { wc.dataset.a = 'Add your town'; wc.innerHTML = '<span class="tlab">' + D.glyph('sun', 1) + 'Weather</span><b class="tmid">Where are you?</b><span class="tsub">Add your town to see the weather.</span>'; return; }
    wc.dataset.a = 'Change town';
    if (!wx) wc.innerHTML = '<span class="tlab">' + D.glyph('sun', 1) + esc(p.name) + '</span><b class="tmid">Looking…</b>';
    const w = await weather();
    if (wc.closest('#today') !== today) return;
    wc.innerHTML = w ? '<span class="tlab">' + D.glyph('sun', 1) + esc(p.name) + '</span><span class="twx">' + D.weather.icon(w.words.kind, D.night()) + '<b class="tbig">' + w.t + '°</b></span><span class="tsub">' + esc(w.words.text) + ', high ' + w.hi + '°</span>'
      : '<span class="tlab">' + D.glyph('nowifi', 1) + esc(p.name) + '</span><b class="tmid">No weather</b><span class="tsub">It needs the internet.</span>';
    D.legend.update();
  }
  function todayRow() {
    const s = h('<section class="shelf" data-block><h2>Today</h2><div class="row" data-row id="today"></div></section>');
    today = s.querySelector('#today');
    const time = card('time', 't-time', 'Open Clock'), wxc = card('wx', 't-wx', 'Change town'), due = card('due', 't-due', 'Open Axiom'), np = card('np', 't-np', 'Play', 'Open Music'), sleep = card('sleep', 't-sleep', 'Change');
    time.onclick = () => D.launch('clock');
    wxc.onclick = () => TV.askTown();
    due.onclick = () => D.launch('calendar');
    np.onclick = () => { if (M.now) M.toggle(); else M.play('radio', 0); setTimeout(paintToday, 60); };
    np._x = () => D.launch('music');
    sleep.onclick = () => D.tools.setSleep(L.nextSleep(D.tools.sleepMins()));
    today.append(time, wxc, due, np, sleep);
    paintToday(true);
    return s;
  }
  setInterval(paintToday, 20000);
  M.on(() => paintToday());
  D.on('sleeptimer', () => paintToday());

  // ---- Watch: your streaming sites ---------------------------------------------------------
  // Plain letters on a colour, not anybody's logo. They open in the real browser.
  TV.WATCH = [
    { name: 'YouTube', url: 'https://www.youtube.com', c: '#d9443c' },
    { name: 'Netflix', url: 'https://www.netflix.com', c: '#a3202a' },
    { name: 'Disney+', url: 'https://www.disneyplus.com', c: '#2a4fb8' },
    { name: 'Prime Video', url: 'https://www.primevideo.com', c: '#1f8fc0' },
    { name: 'Twitch', url: 'https://www.twitch.tv', c: '#7a4fd8' },
    { name: 'Spotify', url: 'https://open.spotify.com', c: '#1f9e58' },
  ];
  const PALETTE = ['#d9443c', '#e0753a', '#c9a227', '#2f9e6e', '#1f8fc0', '#3a5fd8', '#7a4fd8', '#c0438f'];
  const watchList = () => (Array.isArray(D.state.watch) ? D.state.watch : TV.WATCH);
  TV.mono = L.monogram;
  TV.host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };
  TV.cleanUrl = L.cleanUrl;
  TV.openWatch = function (i) {
    const w = watchList()[i];
    if (!w) return false;
    if (D.remote) D.remote.osd('tv', ((i + 1) % 10) + '  ' + w.name);
    TV.open(w.url);
    return true;
  };
  TV.open = function (url) {
    if (D.sys) D.sys.open(url);
    else window.open(url, '_blank', 'noopener');
  };
  function watchTile(w, i) {
    const b = h('<button class="wtile" data-nav data-key="w:' + i + '" data-a="Watch" data-x="Remove" style="--wc:' + esc(w.c) + '" aria-label="' + esc(w.name) + '"><span class="wmono">' + esc(TV.mono(w.name)) + '</span><span class="wname">' + esc(w.name) + '</span></button>');
    b.onclick = () => { S.play('select'); TV.open(w.url); };
    b._x = () => removeWatch(i);
    return b;
  }
  async function removeWatch(i) {
    const list = watchList().slice(), w = list[i];
    const ok = await D.ask({ title: 'Take ' + w.name + ' off?', text: 'Only the shortcut goes. You can add it again.', buttons: [{ label: 'Take it off', value: true, go: true }, { label: 'Keep it', value: false }] });
    if (!ok) return;
    list.splice(i, 1); D.set('watch', list); paintWatch(Math.max(0, i - 1));
  }
  async function addWatch() {
    const n = await D.ask({ title: 'Add a site to Watch', text: 'What\'s it called?', input: { label: 'Name', placeholder: 'Crunchyroll' }, buttons: [{ label: 'Next', value: true, go: true }, { label: 'Cancel', value: false }] });
    const name = n && n.value && n.value.trim().slice(0, 24);
    if (!name) return;
    const u = await D.ask({ title: name, text: 'Its web address. A media box at home works too, like 192.168.1.20:32400.', input: { label: 'Web address', placeholder: 'crunchyroll.com', type: 'text' }, buttons: [{ label: 'Add it', value: true, go: true }, { label: 'Cancel', value: false }] });
    const url = u && TV.cleanUrl(u.value);
    if (!u) return;
    if (!url) return D.toast({ icon: 'link', c: '#ff4d5e', title: 'That isn\'t a web address', text: 'Something like crunchyroll.com.' });
    const list = watchList().slice();
    list.push({ name, url, c: PALETTE[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETTE.length] });
    D.set('watch', list); paintWatch(list.length - 1);
  }
  let watch = null;
  function paintWatch(focusAt, fresh) {
    if (!watch || (!fresh && !watch.isConnected)) return;
    watch.replaceChildren();
    watchList().forEach((w, i) => watch.appendChild(watchTile(w, i)));
    const add = h('<button class="wtile add" data-nav data-key="w:add" data-a="Add"><span class="wmono">' + D.glyph('plus', 3) + '</span><span class="wname">Add a site</span></button>');
    add.onclick = addWatch;
    watch.appendChild(add);
    if (focusAt !== undefined) D.nav.focus(watch.querySelector('[data-key="w:' + focusAt + '"]') || add);
  }
  function watchRow() {
    const s = h('<section class="shelf" data-block><h2>Watch <small>Opens in the browser. ' + D.btn('x') + ' takes one off.</small></h2><div class="row" data-row id="watch"></div></section>');
    watch = s.querySelector('#watch');
    paintWatch(undefined, true);
    return s;
  }
  D.on('source', () => { if (watch && watch.isConnected) { const sm = watch.parentElement.querySelector('h2 small'); if (sm) sm.innerHTML = 'Opens in the browser. ' + D.btn('x') + ' takes one off.'; } });

  // ---- Live: Channels' pictures, playing in little tiles ----------------------------------------
  const thumbs = new Map();
  function thumb(id, cv) {
    const W = 160, H = 90;
    cv.width = W; cv.height = H;
    if (!thumbs.has(id)) {
      const c = G.canvas(W, H), s = D.channels.make(id, W, H);
      try { for (let i = 0; i < 40; i++) s.draw(c.getContext('2d'), 1 + i / 20); } catch (e) { /* a picture that needs the page */ }
      thumbs.set(id, c);
    }
    cv.getContext('2d').drawImage(thumbs.get(id), 0, 0);
  }
  function liveRow() {
    const s = h('<section class="shelf" data-block><h2>Live <small>Pictures to leave on, like TV channels.</small></h2><div class="row" data-row id="live"></div></section>');
    const row = s.querySelector('#live');
    D.channels.LIST.slice(0, 9).forEach((c, i) => {
      const b = h('<button class="ltile" data-nav data-key="lv:' + c.id + '" data-a="Watch" style="--lc:' + esc(c.c) + '"><canvas aria-hidden="true"></canvas><span class="lnum">' + (i + 1) + '</span><span class="lname">' + esc(c.name) + '</span></button>');
      thumb(c.id, b.querySelector('canvas'));
      b.onclick = () => D.launch('channels', { arg: c.id });
      row.appendChild(b);
    });
    const all = h('<button class="ltile lall" data-nav data-key="lv:all" data-a="Open"><span class="lname">All ' + D.channels.LIST.length + ' channels</span></button>');
    all.onclick = () => D.launch('channels');
    row.appendChild(all);
    return s;
  }

  TV.rows = function (page) { page.append(todayRow()); if (D.channels && D.app('channels')) page.append(liveRow()); page.append(watchRow()); };

  // what the big words over the world say when one of these is focused
  TV.spot = function (key) {
    if (key.startsWith('lv:')) {
      if (key === 'lv:all') return { kick: 'Live', name: 'Channels', line: 'A fireplace, an aquarium, rain, the northern lights, space, every world and every city. Up and down change channel; numbers jump.' };
      const c = D.channels.find(key.slice(3));
      return { kick: 'Live · channel ' + (D.channels.LIST.indexOf(c) + 1), name: c.name, line: c.line + ' Made here as it plays, so it never runs out.', c: c.c };
    }
    if (key.startsWith('w:')) {
      if (key === 'w:add') return { kick: 'Watch', name: 'Add a site', line: 'Any streaming site, or anything else you open a lot.' };
      const w = watchList()[+key.slice(2)];
      return w ? { kick: 'Watch', name: w.name, line: TV.host(w.url) + (D.sys ? ' opens in the browser, over DiceOS. Close it to come back.' : ' opens in a new tab.'), c: w.c } : null;
    }
    const k = key.slice(3);
    if (k === 'time') return { kick: 'Today', name: timeNow(), line: dateNow() + '.' };
    if (k === 'wx') { const p = place(); return p && wx ? { kick: 'Weather in ' + p.name, name: wx.t + '° and ' + wx.words.text.toLowerCase(), line: 'High ' + wx.hi + '°, low ' + wx.lo + '°.' } : { kick: 'Weather', name: 'Your town', line: 'Add it once; Dice Home and SereneTab use it too.' }; }
    if (k === 'due') { const d = dueList(); return { kick: 'Axiom', name: !d ? 'No plans yet' : d.length ? d.length + (d.length === 1 ? ' thing' : ' things') + ' due' : 'All done', line: d && d.length ? d.slice(0, 4).map((t) => t.title).join(', ') + '.' : 'Tasks due today show up here.' }; }
    if (k === 'np') return M.now ? { kick: M.now.playing ? 'Playing' : 'Paused', name: M.now.name, line: M.now.by || '', c: M.now.c } : { kick: 'Music', name: 'Dice Radio', line: 'Calm music, made as it plays. Nothing to download.' };
    if (k === 'sleep') { const l = D.tools.sleepLeft(); return { kick: 'Sleep timer', name: l ? l + ' minutes left' : 'Off', line: 'Press to go through 15, 30, 60 and 90 minutes. When it ends, the music stops and the screen goes to sleep.' }; }
    return null;
  };

  // ---- the ambient screen ----------------------------------------------------------------------
  const A = D.ambient = { on: false, last: Date.now() };
  let amb = null, scene = null, sceneKey = '', lastMin = -1, lastSec = -1;
  function buildAmbient() {
    amb = h('<div id="ambient" hidden aria-hidden="true"><canvas class="am-bg"></canvas><div class="am-veil"></div><div class="am-in"><b class="am-clock"></b><span class="am-date"></span><span class="am-wx"></span><span class="am-np"></span></div></div>');
    amb.addEventListener('pointerdown', () => A.exit());
    document.body.appendChild(amb);
  }
  A.poke = () => { A.last = Date.now(); };
  A.can = function () {
    const mins = D.state.idle === undefined ? 10 : D.state.idle;
    if (!mins || D.booting || D.asleep || document.hidden) return false;
    if ((D.desk && D.desk.on) || (D.wall && D.wall.on)) return false;
    if (D.$('#dialog.open')) return false;
    const run = D.running && D.running();
    if (run && D.$('#app').classList.contains('running')) return false; // something's on: leave it be
    return Date.now() - A.last > mins * 60000;
  };
  A.enter = function () {
    if (A.on) return;
    if (!amb) buildAmbient();
    A.on = true; lastMin = -1; lastSec = -1;
    amb.hidden = false;
    requestAnimationFrame(() => amb.classList.add('on'));
    paintAmbient(true);
  };
  A.exit = function () {
    if (!A.on) return;
    A.on = false; A.poke();
    amb.classList.remove('on');
    setTimeout(() => { if (!A.on) amb.hidden = true; }, 600);
  };
  async function paintAmbient(all) {
    const now = new Date();
    amb.querySelector('.am-clock').textContent = timeNow();
    if (now.getMinutes() !== lastMin || all) {
      lastMin = now.getMinutes();
      amb.querySelector('.am-date').textContent = dateNow();
      const k = lastMin % 8, dx = [0, 5, 10, 5, 0, -5, -10, -5][k], dy = [0, 4, 0, -4, 0, 4, 0, -4][k];
      amb.querySelector('.am-in').style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const np = M.now;
      amb.querySelector('.am-np').innerHTML = np && np.playing ? '<span class="eqmini"><i></i><i></i><i></i></span>' + esc(np.name) : '';
      const w = await weather();
      amb.querySelector('.am-wx').innerHTML = w ? D.weather.icon(w.words.kind, D.night()) + '<span>' + w.t + '°, ' + esc(w.words.text.toLowerCase()) + ' in ' + esc(w.place) + '</span>' : '';
    }
  }
  A.frame = function (now) {
    if (!A.on || !amb) return;
    const sec = Math.floor(now / 1000);
    if (sec !== lastSec) { lastSec = sec; paintAmbient(false); }
    const cv = amb.querySelector('.am-bg'), cell = D.scapeCell ? D.scapeCell() : 3;
    const Wd = Math.ceil(innerWidth / cell), Hd = Math.ceil(innerHeight / cell), night = D.night(), key = Wd + 'x' + Hd + night + D.state.world;
    if (key !== sceneKey) { sceneKey = key; cv.width = Wd; cv.height = Hd; cv.style.width = Wd * cell + 'px'; cv.style.height = Hd * cell + 'px'; scene = new G.Scape({ world: D.state.world || 'hills', night, W: Wd, H: Hd, seed: 'ambient' }); scene.last = 0; }
    if (now - (scene.last || 0) < 1000 / Math.min(20, D.state.fps || 20)) return;
    scene.last = now;
    scene.draw(cv.getContext('2d'), now / 1000, D.reduced());
  };
  // anything at all wakes it, and the key or button that woke it does nothing else
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) {
    A.poke();
    if (A.on) { A.exit(); return; }
    return fire0.call(D.input, a, src);
  };
  ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, () => { A.poke(); if (A.on) A.exit(); }, { capture: true, passive: true }));
  let px = -1, py = -1;
  addEventListener('pointermove', (e) => {
    if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) < 6) return;
    px = e.clientX; py = e.clientY; A.poke();
    if (A.on) A.exit();
  }, { passive: true });
  setInterval(() => { if (!A.on && A.can()) A.enter(); }, 10000);
  TV.two = two;
})();
