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
  // when something on a card really changes (the minute, the weather arriving), it fades in;
  // painting the same thing again does nothing
  function ticks(fn) {
    const before = [...today.children].map((c) => c.innerHTML);
    const r = fn();
    const after = () => [...today.children].forEach((c, i) => { if (c._painted && c.innerHTML !== before[i]) { c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); } c._painted = true; });
    if (r && r.then) r.then(after); else after();
    return r;
  }
  async function paintToday(fresh) {
    if (!today || (!fresh && !today.isConnected)) return; // (a fresh row isn't on the page yet)
    return ticks(() => paintTodayNow());
  }
  async function paintTodayNow() {
    const q = (k) => today.querySelector('[data-key="td:' + k + '"]');
    const ampm = new Date().getHours() < 12 ? 'am' : 'pm';
    q('time').innerHTML = '<b class="tbig">' + esc(timeNow()) + '<small>' + ampm + '</small></b><span class="tsub">' + esc(dateNow()) + '</span>';
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
    const ac = q('alarm');
    if (ac && D.alarm) {
      const on = D.alarm.list().filter((a) => a.on).map((a) => [D.alarm.next(a), a]).filter((x) => x[0]).sort((x, y) => x[0] - y[0])[0];
      ac.innerHTML = '<span class="tlab">' + D.glyph('bell', 1) + 'Alarm</span><b class="tmid">' + (on ? esc(D.alarm.t12(on[1].time)) : 'Off') + '</b><span class="tsub">' + (on ? esc(on[0].toLocaleDateString([], { weekday: 'long' }) + ', ' + D.alarm.daysText(on[1]).toLowerCase()) : 'Wake up to Dice Radio, with the TV on.') + '</span>';
    }
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
  // Home's left column: the time, then the rest of today, one line each
  TV.now = function (col) {
    col.id = 'today';
    today = col;
    const time = card('time', 't-time', 'Open Clock'), wxc = card('wx', 't-wx', 'Change town'), due = card('due', 't-due', 'Open Axiom'), np = card('np', 't-np', 'Play', 'Open Music'), sleep = card('sleep', 't-sleep', 'Change');
    [time, wxc, due, np, sleep].forEach((c) => c.classList.remove('glass'));
    time.onclick = () => D.launch('clock');
    wxc.onclick = () => TV.askTown();
    due.onclick = () => D.launch('calendar');
    np.onclick = () => { if (M.now) M.toggle(); else M.play('radio', 0); setTimeout(paintToday, 60); };
    np._x = () => D.launch('music');
    sleep.onclick = () => D.tools.setSleep(L.nextSleep(D.tools.sleepMins()));
    const alarm = card('alarm', 't-alarm', 'Alarms');
    alarm.classList.remove('glass');
    alarm.onclick = () => D.launch('clock', { arg: 'alarm' });
    today.append(time, wxc, due, np, sleep, alarm);
    paintToday(true);
  };
  setInterval(paintToday, 20000);
  M.on(() => paintToday());
  D.on('sleeptimer', () => paintToday());
  D.on('alarms', () => paintToday());

  // ---- Watch: your streaming sites ---------------------------------------------------------
  // Each shows the site's own icon, fetched as the tile appears (the way a browser shows
  // a site's icon on its shortcuts), on that site's colour; with no internet, its first
  // letters instead. On DiceOS they open as full-screen apps (js/watch.js); in a browser, in a tab.
  TV.WATCH = [
    { name: 'YouTube', url: 'https://www.youtube.com', c: '#d9443c' },
    { name: 'Netflix', url: 'https://www.netflix.com', c: '#a3202a' },
    { name: 'Disney+', url: 'https://www.disneyplus.com', c: '#2a4fb8' },
    { name: 'Prime Video', url: 'https://www.primevideo.com', c: '#1f8fc0' },
    { name: 'HBO Max', url: 'https://www.hbomax.com', c: '#3b2bb3' },
    { name: 'Hulu', url: 'https://www.hulu.com', c: '#14a865' },
    { name: 'Spotify', url: 'https://open.spotify.com', c: '#1f9e58', icon: 'spotify.com' },
    { name: 'Twitch', url: 'https://www.twitch.tv', c: '#7a4fd8' },
    { name: 'Tubi', url: 'https://tubitv.com', c: '#5b2bd6' },
  ];
  // more to pick from when adding one
  TV.MORE = [
    { name: 'Apple TV', url: 'https://tv.apple.com', c: '#2b2b30' },
    { name: 'Peacock', url: 'https://www.peacocktv.com', c: '#2b2f6b' },
    { name: 'Paramount+', url: 'https://www.paramountplus.com', c: '#0b5fd8' },
    { name: 'Crunchyroll', url: 'https://www.crunchyroll.com', c: '#e8691c' },
    { name: 'Pluto TV', url: 'https://pluto.tv', c: '#2d2d6b' },
    { name: 'YouTube Music', url: 'https://music.youtube.com', c: '#c4302b' },
  ];
  // the site's own icon, big (not for a box at home: its address stays at home)
  TV.icon = function (w) {
    const host = (w.icon || TV.host(w.url)).split(':')[0];
    if (!host || !host.includes('.') || /^(\d+\.){3}\d+$|^localhost$|\.(local|lan|home|internal)$/i.test(host)) return null;
    return 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=256';
  };
  // an icon on a tile: the letters stay underneath until it loads, and come back if it can't
  TV.iconOn = function (tile, src, cls) {
    if (!src) return;
    const big = h('<img class="' + (cls || 'wico') + '" alt="" referrerpolicy="no-referrer" decoding="async">');
    const glow = h('<img class="wbg" alt="" referrerpolicy="no-referrer" decoding="async" aria-hidden="true">');
    big.onload = () => { tile.classList.add('has-ico'); if (big.naturalWidth < 64) tile.classList.add('ico-small'); glow.src = src; };
    big.onerror = () => { big.remove(); glow.remove(); };
    tile.prepend(glow);
    (tile.querySelector('.wico-box') || tile).appendChild(big);
    big.src = src;
  };
  const PALETTE = ['#d9443c', '#e0753a', '#c9a227', '#2f9e6e', '#1f8fc0', '#3a5fd8', '#7a4fd8', '#c0438f'];
  const watchList = () => (Array.isArray(D.state.watch) ? D.state.watch : TV.WATCH);
  TV.mono = L.monogram;
  TV.host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch (e) { return u; } };
  TV.cleanUrl = L.cleanUrl;
  TV.openWatch = function (i) {
    const w = watchList()[i];
    if (!w) return false;
    if (D.remote) D.remote.osd('tv', ((i + 1) % 10) + '  ' + w.name);
    TV.open(w.url, w.name);
    return true;
  };
  TV.open = function (url, name) {
    if (D.watch) return D.watch.open(url, name);
    if (D.sys) D.sys.open(url);
    else window.open(url, '_blank', 'noopener');
  };
  function watchTile(w, i) {
    const b = h('<button class="wtile" data-nav data-key="w:' + i + '" data-a="Watch" data-x="Remove" style="--wc:' + esc(w.c) + '" aria-label="' + esc(w.name) + '"><span class="wico-box"><span class="wmono">' + esc(TV.mono(w.name)) + '</span></span><span class="wname">' + esc(w.name) + '</span></button>');
    TV.iconOn(b, TV.icon(w));
    b.onclick = () => { S.play('select'); TV.open(w.url, w.name); };
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
    // one of the usual ones, or your own
    const have = watchList().map((w) => w.url);
    const more = TV.WATCH.concat(TV.MORE).filter((w) => !have.includes(w.url)).slice(0, 6);
    if (more.length) {
      const pick = await D.ask({ title: 'Add to Watch', text: 'Pick one, or add any site (or a media box at home, like Plex).', buttons: more.map((w, k) => ({ label: w.name, value: 'm' + k, go: k === 0 })).concat([{ label: 'Something else', value: 'own' }, { label: 'Cancel', value: null }]) });
      if (!pick) return;
      if (pick !== 'own') { const list = watchList().slice(); list.push(Object.assign({}, more[+pick.slice(1)])); D.set('watch', list); paintWatch(list.length - 1); return; }
    }
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
    const add = h('<button class="wtile add" data-nav data-key="w:add" data-a="Add"><span class="wico-box"><span class="wmono">' + D.glyph('plus', 3) + '</span></span><span class="wname">Add a site</span></button>');
    add.onclick = addWatch;
    watch.appendChild(add);
    if (focusAt !== undefined) D.nav.focus(watch.querySelector('[data-key="w:' + focusAt + '"]') || add);
  }
  function watchRow() {
    const s = h('<section class="shelf" data-block><h2>Watch <small>' + watchWords() + '</small></h2><div class="row" data-row id="watch"></div></section>');
    watch = s.querySelector('#watch');
    paintWatch(undefined, true);
    return s;
  }
  function watchWords() { return (D.sys ? 'Full-screen apps. Home on the remote comes back. ' : 'Each opens in a new tab. ') + D.btn('x') + ' takes one off.'; }
  D.on('source', () => { if (watch && watch.isConnected) { const sm = watch.parentElement.querySelector('h2 small'); if (sm) sm.innerHTML = watchWords(); } });

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
  // Dice Home covers everything, so a picture in picture closes first
  if (D.wall && D.wall.enter) { const we = D.wall.enter; D.wall.enter = function () { if (D.pip && D.pip()) D.closeApp(true); return we.apply(this, arguments); }; }

  // the Live tile you're on plays, like a little preview of the channel
  let prev = null;
  function preview(el) {
    if (prev) { cancelAnimationFrame(prev.raf); prev = null; }
    if (!el || !el.classList.contains('ltile') || D.reduced() || !el.dataset.key.startsWith('lv:') || el.dataset.key === 'lv:all') return;
    const cv = el.querySelector('canvas'), id = el.dataset.key.slice(3);
    let scene = null;
    try { scene = D.channels.make(id, 160, 90); } catch (e) { return; }
    const g = cv.getContext('2d'), me = { raf: 0, last: 0 };
    const step = (now) => {
      if (prev !== me) return;
      if (!el.isConnected || D.nav.el !== el) { prev = null; return; }
      if (now - me.last > 66) { me.last = now; try { scene.draw(g, now / 1000); } catch (e) { prev = null; return; } }
      me.raf = requestAnimationFrame(step);
    };
    prev = me; me.raf = requestAnimationFrame(step);
  }
  D.on('focus', preview);
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

  // ---- News: the news channels' own live streams --------------------------------------------------
  function newsRow() {
    const s = h('<section class="shelf" data-block><h2>News <small>Live, from each channel\'s own stream.</small></h2><div class="row" data-row id="news"></div></section>');
    const row = s.querySelector('#news'), all = D.channels.all();
    D.channels.news().forEach((c) => {
      const num = all.findIndex((x) => x.id === c.id) + 1;
      const b = h('<button class="wtile ntile" data-nav data-key="nw:' + esc(c.id) + '" data-a="Watch" style="--wc:' + esc(c.c) + '" aria-label="' + esc(c.name) + '"><span class="wico-box"><span class="wmono">' + esc(c.mono || TV.mono(c.name)) + '</span></span><span class="wname">' + esc(c.name) + '</span><span class="nlive">Live</span><span class="wnum">' + num + '</span></button>');
      if (c.site) TV.iconOn(b, TV.icon({ url: 'https://' + c.site }));
      b.onclick = () => D.launch('channels', { arg: c.id, swap: true });
      row.appendChild(b);
    });
    const add = h('<button class="wtile add" data-nav data-key="nw:add" data-a="Add"><span class="wico-box"><span class="wmono">' + D.glyph('plus', 3) + '</span></span><span class="wname">Add a channel</span></button>');
    add.onclick = () => D.launch('channels', { arg: (D.channels.news()[0] || {}).id, swap: true });
    row.appendChild(add);
    return s;
  }

  // ---- the ground: a strip of your world's grass and soil (or sand, or snow) under the apps --------------
  const STRATA = {
    grass: ['#6fae4e', '#4f8a38', '#7a5434', '#5e4129', '#8d8e97'], gold: ['#c2a64a', '#94802f', '#7a5531', '#5c3f24', '#9a8f80'],
    stone: ['#a3a5ad', '#7d7f88', '#5d5f69', '#43454d', '#8b8d96'], sand: ['#ecd59c', '#d6b877', '#c99f5f', '#a57c45', '#e8d9b0'],
    snow: ['#f1f6fb', '#c9daea', '#9fb8d2', '#7894b4', '#e6eef7'], dune: ['#e8c27a', '#c99a52', '#b07c3e', '#8a5b2c', '#e2c58f'],
  };
  const KIND = { autumn: 'gold', city: 'stone', town: 'stone', beach: 'sand', ice: 'snow', snow: 'snow', desert: 'dune' };
  TV.strip = function (el) {
    if (!el) return;
    const world = D.state.world || 'hills', s = STRATA[KIND[world] || 'grass'], k = D.night() ? 0.55 : 1;
    const dim = (hex, m) => { const n = parseInt(hex.slice(1), 16); return 'rgb(' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v * m)).join(',') + ')'; };
    let seed = [...world].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // the top: tufts of grass, then a darker band where the soil starts
    const e = G.canvas(16, 8), eg = e.getContext('2d');
    eg.fillStyle = dim(s[0], k); eg.fillRect(0, 2, 16, 4);
    [[1, 1], [2, 0], [3, 1], [6, 1], [9, 1], [10, 0], [13, 1]].forEach(([x, y]) => eg.fillRect(x, y, 1, 2 - y));
    eg.fillStyle = dim(s[1], k); eg.fillRect(0, 5, 16, 1); [[2, 4], [7, 4], [12, 4]].forEach(([x, y]) => eg.fillRect(x, y, 1, 1));
    eg.fillStyle = dim(s[2], k); eg.fillRect(0, 6, 16, 2); eg.fillStyle = dim(s[1], k); [[4, 6], [11, 6], [15, 6]].forEach(([x, y]) => eg.fillRect(x, y, 1, 1));
    // the soil: specks and the odd pebble
    const t = G.canvas(32, 32), tg = t.getContext('2d');
    tg.fillStyle = dim(s[2], k); tg.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 46; i++) { tg.fillStyle = dim(i % 3 ? s[3] : s[1], k * (0.9 + rnd() * 0.2)); tg.fillRect(Math.floor(rnd() * 32), Math.floor(rnd() * 32), 1, 1); }
    for (let i = 0; i < 3; i++) { const x = Math.floor(rnd() * 29), y = Math.floor(rnd() * 30); tg.fillStyle = dim(s[4], k * 0.8); tg.fillRect(x, y, 3, 2); tg.fillStyle = dim(s[4], k); tg.fillRect(x, y, 2, 1); }
    el.style.setProperty('--edge', 'url(' + e.toDataURL() + ')');
    el.style.setProperty('--soil', 'url(' + t.toDataURL() + ')');
    el.style.setProperty('--soilc', dim(s[2], k));
    el.style.setProperty('--soild', dim(s[3], k * 0.85));
    el.style.setProperty('--px', Math.max(3, (D.scapeCell ? D.scapeCell() : 2) + 1) + 'px');
  };

  // the rows sit on frosted glass, below the ground
  // ---- Dice Cloud: your newest photos, videos and songs, from any of your computers -------------------
  function fillCloud(row) {
    const F = D.drive;
    row.innerHTML = '';
    F.recent(12).forEach((f) => {
      const k = F.kind(f), ext = (f.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      const b = h('<button class="ltile ctile k-' + k + '" data-nav data-key="cl:' + esc(f.id) + '" data-a="' + (k === 'photo' ? 'View' : k === 'song' || k === 'video' ? 'Play' : 'Open') + '" aria-label="' + esc(f.name) + '">' + (f.thumb ? '' : '<span class="cext">' + esc(ext) + '</span>') + '<span class="lname">' + esc(f.name) + '</span></button>');
      if (f.thumb) F.thumbUrl(f.id).then((u) => { if (u) b.style.backgroundImage = 'url("' + u + '")'; });
      b.onclick = () => (k === 'photo' && D.app('photos') ? D.launch('photos', { arg: 'cloud:' + f.id, swap: true }) : D.launch('files', { arg: 'cloud-open:' + f.id, swap: true }));
      row.appendChild(b);
    });
    const all = h('<button class="ltile lall" data-nav data-key="cl:all" data-a="Open"><span class="lname">All your files</span></button>');
    all.onclick = () => D.launch('files', { arg: 'cloud:/', swap: true });
    row.appendChild(all);
  }
  function cloudRow() {
    const s = h('<section class="shelf" data-block id="cloudshelf"><h2>Dice Cloud <small>Your photos, videos and songs, from all your computers.</small></h2><div class="row" data-row id="cloudrow"></div></section>');
    fillCloud(s.querySelector('#cloudrow'));
    return s;
  }
  const hasCloud = () => !!(D.drive && D.drive.on() && D.drive.files().length && D.app('files'));
  let cloudT = 0;
  D.on('drive', () => {
    clearTimeout(cloudT);
    cloudT = setTimeout(() => {
      const ground = D.$('.tvb-ground'), shelf = D.$('#cloudshelf');
      if (!ground) return;
      if (!hasCloud()) { if (shelf && !shelf.contains(D.nav.el)) shelf.remove(); return; }
      if (shelf) { if (!shelf.contains(D.nav.el)) fillCloud(shelf.querySelector('#cloudrow')); return; }
      const watch = ground.querySelector('#watch');
      ground.insertBefore(cloudRow(), watch ? watch.closest('.shelf') : null);
    }, 500);
  });
  // TV channels and Watch first (what a TV is for), then Dice's own Live pictures, the news, Dice
  // Cloud and your apps. (DiceGaming lives on the desktop: games are a computer thing.)
  TV.rows = function (ground) {
    if (D.watch) ground.append(D.watch.row());
    ground.append(watchRow());
    if (D.channels && D.app('channels')) { ground.append(liveRow()); ground.append(newsRow()); }
    if (hasCloud()) ground.append(cloudRow());
    if (D.myApps && D.myApps.list().length) ground.append(myRow());
  };
  // ---- the apps you got from the Store: real ones and web ones ----------------------------------------
  function myRow() {
    const s = h('<section class="shelf" data-block id="myshelf"><h2>Your apps <small>From the Store. Home on the remote comes back here.</small></h2><div class="row" data-row id="myapps"></div></section>');
    const row = s.querySelector('#myapps');
    D.myApps.list().forEach((a) => {
      const b = h('<button class="wtile mytile" data-nav data-key="my:' + esc(a.id) + '" data-a="Open" aria-label="' + esc(a.name) + '"><span class="wname">' + esc(a.name) + '</span></button>');
      b.prepend(D.myApps.el(a, 64));
      b.onclick = () => D.myApps.open(a);
      row.appendChild(b);
    });
    const more = h('<button class="wtile add" data-nav data-key="my:store" data-a="Open"><span class="wmono">+</span><span class="wname">The Store</span></button>');
    more.onclick = () => D.launch('store');
    row.appendChild(more);
    return s;
  }
  D.on('myapps', () => {
    const ground = D.$('.tvb-ground'), shelf = D.$('#myshelf');
    if (!ground || (shelf && shelf.contains(D.nav.el))) return;
    const fresh = D.myApps.list().length ? myRow() : null;
    if (shelf) { if (fresh) shelf.replaceWith(fresh); else shelf.remove(); return; }
    if (fresh) { const watch = ground.querySelector('#watch'); ground.insertBefore(fresh, watch ? watch.closest('.shelf') : null); }
  });

  // ---- the selection frame: a pixel-art frame that moves to whatever's picked on Home ----------------
  const FRAME = (() => {
    const c = G.canvas(12, 12), g = c.getContext('2d');
    const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
      const cx = x < 4 ? x : x > 7 ? 11 - x : 4, cy = y < 4 ? y : y > 7 ? 11 - y : 4; // fold into the corner
      if (cx >= 4 && cy >= 4) continue; // the middle stays clear
      const ex = Math.min(cx, 3), ey = Math.min(cy, 3), d = ex + ey;
      if (cx >= 4 || cy >= 4) { const v = cx >= 4 ? cy : cx; if (v === 0) px(x, y, '#141416'); else if (v <= 2) px(x, y, '#ffffff'); continue; }
      if (d >= 3 && d <= 5 && ex >= 1 && ey >= 1) px(x, y, '#ffffff');
      else if (d === 2 || (ex === 0 && ey >= 3) || (ey === 0 && ex >= 3)) px(x, y, '#141416');
    }
    return c.toDataURL();
  })();
  let cur = null, curRaf = 0;
  function cursor() {
    if (!cur) {
      cur = h('<div id="tvcur" aria-hidden="true" hidden></div>');
      cur.style.borderImage = 'url(' + FRAME + ') 4 / 12px / 7px';
      D.$('#view').appendChild(cur);
    }
    return cur;
  }
  function placeCursor() {
    curRaf = 0;
    const el = D.nav.el, c = cursor();
    const on = el && el.isConnected && el.closest('.tvb, .tvb-lib') && !(D.desk && D.desk.on) && !D.$('#app').classList.contains('running');
    if (!on) { c.hidden = true; return; }
    if (c.parentElement !== D.$('#view')) D.$('#view').appendChild(c);
    const target = el.querySelector('.bk') || el, r = target.getBoundingClientRect(), vr = D.$('#view').getBoundingClientRect();
    if (r.bottom < vr.top + 60 || r.top > vr.bottom) { c.hidden = true; return; }
    c.hidden = false;
    c.style.transform = 'translate(' + Math.round(r.left - vr.left) + 'px,' + Math.round(r.top - vr.top) + 'px)';
    c.style.width = Math.round(r.width) + 'px'; c.style.height = Math.round(r.height) + 'px';
  }
  const placeSoon = () => { if (!curRaf) curRaf = requestAnimationFrame(placeCursor); };
  D.on('focus', placeSoon);
  document.addEventListener('scroll', placeSoon, { capture: true, passive: true });
  addEventListener('resize', placeSoon);
  D.on('desk', placeSoon);
  setInterval(placeSoon, 400); // (rows that glide into place after a press)

  // what the big words over the world say when one of these is focused
  TV.spot = function (key) {
    if (key.startsWith('nw:')) {
      if (key === 'nw:add') return { kick: 'News', name: 'Add a channel', line: 'Any YouTube channel that streams live, like your local news. In the Channels guide.' };
      const c = D.channels.find(key.slice(3));
      return { kick: 'News · channel ' + (D.channels.all().findIndex((x) => x.id === c.id) + 1), name: c.name, line: c.line + ' Live, in YouTube\'s own player.', c: c.c };
    }
    if (key.startsWith('lv:')) {
      if (key === 'lv:all') return { kick: 'Live', name: 'Channels', line: 'A fireplace, an aquarium, rain, the northern lights, space, every world and every city. Up and down change channel; numbers jump.' };
      const c = D.channels.find(key.slice(3));
      return { kick: 'Live · channel ' + (D.channels.LIST.indexOf(c) + 1), name: c.name, line: c.line + ' Made here as it plays, so it never runs out.', c: c.c };
    }
    if (key.startsWith('w:')) {
      if (key === 'w:add') return { kick: 'Watch', name: 'Add a site', line: 'Any streaming site, or anything else you open a lot.' };
      const w = watchList()[+key.slice(2)];
      return w ? { kick: 'Watch', name: w.name, line: D.sys ? 'Opens full screen, as its own app: sign in once, inside it. Home on the remote comes back.' : TV.host(w.url) + ' opens in a new tab.', c: w.c } : null;
    }
    if ((key.startsWith('ch:') || key.startsWith('an:')) && D.watch) return D.watch.spot(key);
    const k = key.slice(3);
    if (k === 'time') return { kick: 'Today', name: timeNow(), line: dateNow() + '.' };
    if (k === 'wx') { const p = place(); return p && wx ? { kick: 'Weather in ' + p.name, name: wx.t + '° and ' + wx.words.text.toLowerCase(), line: 'High ' + wx.hi + '°, low ' + wx.lo + '°.' } : { kick: 'Weather', name: 'Your town', line: 'Add it once; Dice Home and SereneTab use it too.' }; }
    if (k === 'due') { const d = dueList(); return { kick: 'Axiom', name: !d ? 'No plans yet' : d.length ? d.length + (d.length === 1 ? ' thing' : ' things') + ' due' : 'All done', line: d && d.length ? d.slice(0, 4).map((t) => t.title).join(', ') + '.' : 'Tasks due today show up here.' }; }
    if (k === 'np') return M.now ? { kick: M.now.playing ? 'Playing' : 'Paused', name: M.now.name, line: M.now.by || '', c: M.now.c } : { kick: 'Music', name: 'Dice Radio', line: 'Calm music, made as it plays. Nothing to download.' };
    if (k === 'alarm') return { kick: 'Alarms', name: 'Wake up to DiceTV', line: 'DiceOS wakes, the TV comes on (through the HDMI cable) and plays Dice Radio, a chime or the fireplace. OK snoozes for 9 minutes, Back stops it.' };
    if (k === 'sleep') { const l = D.tools.sleepLeft(); return { kick: 'Sleep timer', name: l ? l + ' minutes left' : 'Off', line: 'Press to go through 15, 30, 60 and 90 minutes. When it ends, the music stops and the screen goes to sleep.' }; }
    return null;
  };

  // ---- the ambient screen ----------------------------------------------------------------------
  const A = D.ambient = { on: false, last: Date.now() };
  let amb = null, scene = null, sceneKey = '', lastMin = -1, lastSec = -1;
  function buildAmbient() {
    amb = h('<div id="ambient" hidden aria-hidden="true"><canvas class="am-bg"></canvas><img class="am-ph" alt=""><img class="am-ph" alt=""><div class="am-veil"></div><div class="am-in"><b class="am-clock"></b><span class="am-date"></span><span class="am-wx"></span><span class="am-np"></span></div></div>');
    amb.addEventListener('pointerdown', () => A.exit());
    document.body.appendChild(amb);
  }
  A.poke = () => { A.last = Date.now(); };
  A.can = function () {
    const mins = D.state.idle === undefined ? 10 : D.state.idle;
    if (D.pip && D.pip()) return false; // something's playing in the corner
    if (D.tools && D.tools.picOff && D.tools.picOff()) return false;
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
    A.on = true; lastMin = -1; lastSec = -1; phNext = 0;
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
  // what's behind the clock: your world, one of the Live channels, or just the clock on black
  A.CHOICES = [['world', 'Your world'], ['photos', 'Photos in Dice Cloud'], ['fire', 'Fireplace'], ['fish', 'Aquarium'], ['aurora', 'Northern lights'], ['space', 'Space'], ['dark', 'Just the clock']];
  // your photos from Dice Cloud, one every 20 seconds, fading slowly from one to the next
  let phAt = -1, phNext = 0, phLayer = 0;
  function photoStep(list, now) {
    if (now < phNext) return;
    phNext = now + 20000;
    phAt = (phAt + 1) % list.length;
    D.drive.url(list[phAt].id).then((u) => {
      if (!A.on) return;
      const imgs = amb.querySelectorAll('.am-ph'), next = imgs[phLayer ^ 1], was = imgs[phLayer];
      next.onload = () => { next.classList.add('on'); was.classList.remove('on'); phLayer ^= 1; };
      next.src = u;
    }).catch(() => { phNext = now + 4000; });
  }
  A.frame = function (now) {
    if (!A.on || !amb) return;
    const sec = Math.floor(now / 1000);
    if (sec !== lastSec) { lastSec = sec; paintAmbient(false); }
    const pick = D.state.amb || 'world', ch = pick !== 'world' && pick !== 'dark' && D.channels && D.channels.LIST.some((c) => c.id === pick);
    const cv = amb.querySelector('.am-bg'), cell = ch ? D.channels.cell() : D.scapeCell ? D.scapeCell() : 3;
    amb.classList.toggle('am-dark', pick === 'dark');
    if (pick === 'dark') { A.scene = null; return; }
    const photos = pick === 'photos' && D.drive && D.drive.on() ? D.drive.photos() : null;
    amb.classList.toggle('am-photos', !!(photos && photos.length));
    if (photos && photos.length) { A.scene = null; return photoStep(photos, now); }
    const Wd = Math.ceil(innerWidth / cell), Hd = Math.ceil(innerHeight / cell), night = D.night(), key = Wd + 'x' + Hd + night + D.state.world + pick;
    if (key !== sceneKey) {
      sceneKey = key; cv.width = Wd; cv.height = Hd; cv.style.width = Wd * cell + 'px'; cv.style.height = Hd * cell + 'px';
      if (ch) { const sc = D.channels.make(pick, Wd, Hd); scene = { draw: (g, t) => sc.draw(g, t) }; }
      else scene = new G.Scape({ world: D.state.world || 'hills', night, W: Wd, H: Hd, seed: 'ambient' });
      scene.last = 0;
    }
    // (Heavenly looks puts its light over your world here too: js/heaven.js)
    A.el = amb; A.scene = ch ? null : scene; A.cell = cell;
    if (now - (scene.last || 0) < 1000 / Math.min(ch || D.state.looks === 'heaven' ? 30 : 20, D.state.fps || 30)) return;
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
