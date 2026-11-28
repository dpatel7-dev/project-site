// hum: your music, off to one side. (It takes over from the old Music app.)
//
// The OS version of hum from the suite: a tall panel at the side of the screen (on the desktop it opens
// against the right edge; on DiceTV it fills the screen), with Dice Radio's little songs, your own songs,
// YouTube links (in YouTube's own player, never downloaded), playlists, Liked, Up next, shuffle and repeat.
// Bumble the bumblebee flies along the bar as the song plays, and the garden underneath dances to the beat.
// Ctrl + Alt + M opens and closes it on the desktop, like hum's ⌃⌥M.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, M = D.M, esc = D.esc, h = D.h, S = D.S;
  const PLANTS = ['tulip', 'sunflower', 'rose', 'lavender', 'moonflower', 'clover', 'fern', 'cactus'];
  const HU = (D.hum = {});
  const st = () => { const s = D.state.hum || (D.state.hum = {}); s.lists = Array.isArray(s.lists) ? s.lists : []; s.liked = Array.isArray(s.liked) ? s.liked : []; s.yt = Array.isArray(s.yt) ? s.yt : []; return s; };
  const ytId = (s) => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/.exec(String(s)) || /^([A-Za-z0-9_-]{11})$/.exec(String(s).trim()); return m ? m[1] : null; };

  // ---- what can be played: a key for each ('radio:2', 'song:<id>', 'yt:<id>') ------------------------------------
  function item(key) {
    const [k, v] = String(key).split(':');
    if (k === 'radio') { const tr = M.RADIO[+v]; return tr && { key, kind: 'radio', i: +v, name: tr.name, by: 'Dice Radio', c: tr.c }; }
    if (k === 'song') { const i = M.songs.findIndex((s) => String(s.id) === v); return i >= 0 && { key, kind: 'song', i, name: M.songs[i].name, by: 'Your songs', c: '#d39cf5' }; }
    if (k === 'yt') { const y = st().yt.find((x) => x.id === v); return { key, kind: 'yt', id: v, name: (y && y.name) || 'YouTube video', by: 'YouTube', c: '#ff5f57' }; }
    return null;
  }
  const keyNow = () => (yt.on ? 'yt:' + yt.id : M.now ? (M.now.kind === 'radio' ? 'radio:' + M.now.i : M.songs[M.now.i] ? 'song:' + M.songs[M.now.i].id : '') : '');

  // ---- the queue: what plays next ---------------------------------------------------------------------------------
  const Q = { list: [], at: -1, shuffle: false, repeat: false };
  HU.play = function (key, list) {
    if (list) { Q.list = list.slice(); Q.at = Q.list.indexOf(key); }
    const it = item(key);
    if (!it) return;
    if (it.kind === 'yt') { M.pause && M.now && M.pause(); ytPlay(it); }
    else { ytStop(); M.play(it.kind, it.i); }
    M.onEnd = () => HU.next(true);
    D.emit('hum');
  };
  HU.next = function (auto) {
    if (auto && Q.repeat && keyNow()) return HU.play(keyNow());
    if (!Q.list.length) { ytStop(); return M.next(); }
    Q.at = Q.shuffle ? Math.floor(Math.random() * Q.list.length) : Q.at + 1;
    if (Q.at >= Q.list.length) { Q.at = 0; if (auto && !Q.repeat) { ytStop(); M.stop(); return; } }
    HU.play(Q.list[Q.at]);
  };
  HU.prev = function () { if (!Q.list.length) return M.prev(); Q.at = (Q.at - 1 + Q.list.length) % Q.list.length; HU.play(Q.list[Q.at]); };
  HU.toggle = function () { if (yt.on) return ytToggle(); M.toggle(); };
  HU.like = function (key) { const s = st(); s.liked = s.liked.includes(key) ? s.liked.filter((x) => x !== key) : [key].concat(s.liked); D.save(); D.emit('hum'); };

  // ---- YouTube, in its own player (its rules: the video shows while it plays) --------------------------------------
  const yt = { on: false, id: null, playing: false, frame: null };
  function ytPlay(it) {
    yt.on = true; yt.id = it.id; yt.playing = true;
    D.emit('hum-yt');
  }
  function ytStop() { if (!yt.on) return; yt.on = false; yt.id = null; yt.playing = false; D.emit('hum-yt'); }
  function ytToggle() {
    if (!yt.frame) return;
    yt.playing = !yt.playing;
    yt.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: yt.playing ? 'playVideo' : 'pauseVideo', args: [] }), '*');
    D.emit('hum');
  }
  addEventListener('message', (e) => {
    if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin || 'http://x').hostname)) return;
    let d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
    const state = d && d.info && d.info.playerState;
    if (state === 0) HU.next(true); // ended
    if (state === 1 || state === 2) { yt.playing = state === 1; D.emit('hum'); }
    const title = d && d.info && d.info.videoData && d.info.videoData.title;
    if (title && yt.id) { const y = st().yt.find((x) => x.id === yt.id); if (y && y.name !== title) { y.name = title; D.save(); D.emit('hum'); } }
  });
  HU.addLink = function (text) {
    const id = ytId(String(text).replace(/^(?!https?:)/, 'https://'));
    if (!id) return null;
    const s = st();
    if (!s.yt.some((x) => x.id === id)) { s.yt.unshift({ id, name: 'YouTube video', added: Date.now() }); D.save(); }
    D.emit('hum');
    return 'yt:' + id;
  };

  // ---- the app ----------------------------------------------------------------------------------------------------
  const TABS = [['radio', 'Radio'], ['songs', 'Songs'], ['lists', 'Playlists'], ['liked', 'Liked']];
  D.register({ id: 'hum', mount(root, ctx) {
    root.classList.add('hum');
    let tab = 'radio', open = null; // open: a playlist being looked at
    root.innerHTML = '<header class="hu-top"><canvas class="hu-bee" width="22" height="22" aria-hidden="true"></canvas><b class="pix">hum</b><span class="hu-tabs seg" role="tablist">' +
      TABS.map(([k, n]) => '<button role="tab" data-nav data-key="hu:t:' + k + '" data-t="' + k + '">' + n + '</button>').join('') + '</span></header>' +
      '<div class="hu-list" data-scroll="30"></div>' +
      '<div class="hu-yt" hidden></div>' +
      '<footer class="hu-now"><div class="hu-title"><b></b><span></span></div>' +
      '<div class="hu-bar"><canvas class="hu-track" aria-hidden="true"></canvas></div>' +
      '<div class="hu-ctl"><button class="hu-b" data-nav data-key="hu:shuf" aria-label="Shuffle">' + D.glyph('loop', 2) + '</button><button class="hu-b" data-nav data-key="hu:prev" aria-label="Previous">' + D.glyph('prev', 2) + '</button>' +
      '<button class="hu-play" data-nav data-key="hu:play" aria-label="Play or pause"></button><button class="hu-b" data-nav data-key="hu:next" aria-label="Next">' + D.glyph('next', 2) + '</button><button class="hu-b hu-heart" data-nav data-key="hu:like" aria-label="Like">♥</button></div>' +
      '<canvas class="hu-garden" aria-hidden="true"></canvas></footer>';
    const list = root.querySelector('.hu-list'), file = h('<input type="file" accept="audio/*" multiple hidden>');
    root.appendChild(file);
    file.onchange = () => M.add(file.files).then((n) => { if (n) D.toast({ icon: 'music', c: '#f5c431', title: 'Added ' + n + ' song' + (n === 1 ? '' : 's'), text: 'They\'re in Songs.' }); file.value = ''; tab = 'songs'; paint(); });
    root.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; open = null; paint(); }; });
    root.querySelector('[data-key="hu:play"]').onclick = () => HU.toggle();
    root.querySelector('[data-key="hu:next"]').onclick = () => HU.next();
    root.querySelector('[data-key="hu:prev"]').onclick = () => HU.prev();
    root.querySelector('[data-key="hu:shuf"]').onclick = (e) => { Q.shuffle = !Q.shuffle; e.currentTarget.setAttribute('aria-pressed', Q.shuffle); };
    root.querySelector('[data-key="hu:like"]').onclick = () => { const k = keyNow(); if (k) HU.like(k); };
    root.addEventListener('dragover', (e) => { e.preventDefault(); root.classList.add('drop'); });
    root.addEventListener('dragleave', () => root.classList.remove('drop'));
    root.addEventListener('drop', (e) => {
      e.preventDefault(); root.classList.remove('drop');
      const t = e.dataTransfer.getData('text/plain');
      if (t && HU.addLink(t)) { tab = 'songs'; paint(); return; }
      M.add(e.dataTransfer.files).then(() => { tab = 'songs'; paint(); });
    });
    // on the desktop: a tall panel against the right edge
    if (ctx.win && D.desk && !ctx.arg) {
      const a = D.desk.area(), w = Math.min(400, Math.max(330, Math.round(a.w * 0.24)));
      ctx.win.box = { x: a.w - w - 14, y: 10, w, h: Math.max(420, a.h - 20) };
      ctx.win.place();
    }

    const row = (key, extra) => {
      const it = item(key);
      if (!it) return null;
      const on = keyNow() === key, liked = st().liked.includes(key);
      const b = h('<button class="hu-row ' + (on ? 'on' : '') + '" data-nav data-key="hu:' + esc(key) + '" style="--c:' + it.c + '"><span class="hu-pic"></span><span class="hu-w"><b></b><small></small></span>' +
        (on ? '<span class="eqmini ' + (playingNow() ? '' : 'still') + '"><i></i><i></i><i></i></span>' : liked ? '<span class="hu-liked">♥</span>' : '') + '</button>');
      b.querySelector('b').textContent = it.name;
      b.querySelector('small').textContent = extra || it.by;
      b.querySelector('.hu-pic').innerHTML = it.kind === 'radio' ? D.glyph('music', 2) : it.kind === 'yt' ? D.glyph('play', 2) : D.glyph('music', 2);
      b.oncontextmenu = (e) => { e.preventDefault(); rowMenu(key, e.clientX, e.clientY); };
      b.dataset.x = 'More';
      b._x = () => { const r = b.getBoundingClientRect(); rowMenu(key, r.right - 200, r.bottom); };
      return b;
    };
    const playingNow = () => (yt.on ? yt.playing : !!(M.now && M.now.playing));
    function rowMenu(key, x, y) {
      const lists = st().lists, inList = open;
      const items = [{ label: st().liked.includes(key) ? 'Unlike' : 'Like', icon: 'spark', run: () => HU.like(key) },
        { label: 'Play next', icon: 'next', run: () => { Q.list.splice(Q.at + 1, 0, key); D.toast({ icon: 'music', c: '#f5c431', title: 'Up next', text: item(key).name }); } }]
        .concat(lists.map((L) => ({ label: 'Add to ' + L.name, icon: 'plus', run: () => { if (!L.items.includes(key)) L.items.push(key); D.save(); paint(); } })))
        .concat([{ label: 'Add to a new playlist…', icon: 'plus', run: () => newList([key]) }])
        .concat(inList ? [{ label: 'Take out of ' + inList.name, icon: 'close', run: () => { inList.items = inList.items.filter((x) => x !== key); D.save(); paint(); } }] : [])
        .concat(key.startsWith('song:') ? [{ label: 'Remove from hum', icon: 'trash', run: () => M.remove(+key.slice(5) || key.slice(5)) }] : key.startsWith('yt:') ? [{ label: 'Remove the link', icon: 'trash', run: () => { const s = st(); s.yt = s.yt.filter((x) => 'yt:' + x.id !== key); D.save(); paint(); } }] : []);
      if (D.deskplus && D.deskplus.menu && D.desk && D.desk.on) D.deskplus.menu(x, y, items);
      else D.ask({ title: item(key).name, buttons: items.map((it, i) => ({ label: it.label, value: i })).concat([{ label: 'Never mind', value: -1 }]) }).then((i) => { if (i >= 0) items[i].run(); });
    }
    function newList(keys) {
      D.ask({ title: 'A new playlist', input: { label: 'Its name', value: 'My playlist ' + (st().lists.length + 1) }, buttons: [{ label: 'Make it', value: true, go: true }, { label: 'Never mind', value: false }] }).then((r) => make(r && r.ok && r.value));
      function make(name) { if (!name || !String(name).trim()) return; st().lists.push({ id: Date.now().toString(36), name: String(name).slice(0, 40), items: keys || [] }); D.save(); tab = 'lists'; paint(); }
    }
    function paint() {
      root.querySelectorAll('[data-t]').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === tab));
      const keep = D.nav.el && root.contains(D.nav.el) ? D.nav.el.dataset.key : null;
      list.innerHTML = '';
      const keys = (arr) => arr.filter((k) => item(k));
      let shown = [];
      if (tab === 'radio') {
        list.appendChild(h('<p class="hu-note">Little songs, written as they play. Each one is new.</p>'));
        shown = M.RADIO.map((tr, i) => 'radio:' + i);
        shown.forEach((k) => list.appendChild(row(k, M.RADIO[+k.slice(6)].bpm + ' beats a minute')));
      } else if (tab === 'songs') {
        const add = h('<div class="hu-add"><button class="b small" data-nav data-key="hu:files">' + D.glyph('plus', 2) + 'Choose songs</button><form class="hu-link"><input placeholder="Paste a YouTube link" aria-label="A YouTube link" data-nav data-key="hu:link"><button class="b small" data-nav data-key="hu:addlink">Add</button></form></div>');
        add.querySelector('[data-key="hu:files"]').onclick = () => file.click();
        add.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = add.querySelector('input').value; const k = HU.addLink(v); if (k) { add.querySelector('input').value = ''; paint(); } else D.toast({ icon: 'help', c: '#ff5f57', title: 'That isn\'t a YouTube link', text: 'Paste the address of a video, a Short or a YouTube Music song.' }); };
        list.appendChild(add);
        shown = M.songs.map((s) => 'song:' + s.id).concat(st().yt.map((y) => 'yt:' + y.id));
        if (!shown.length) list.appendChild(h('<p class="hu-note">Drop music files here, choose some, or paste a YouTube link. Your files stay yours: they\'re kept on this computer.</p>'));
        shown.forEach((k) => list.appendChild(row(k)));
      } else if (tab === 'liked') {
        shown = keys(st().liked);
        if (!shown.length) list.appendChild(h('<p class="hu-note">Press ♥ while something plays and it lands here.</p>'));
        shown.forEach((k) => list.appendChild(row(k)));
      } else if (open) {
        const back = h('<div class="hu-lhead"><button class="b small" data-nav data-key="hu:back">‹ Playlists</button><b></b><button class="b small" data-nav data-key="hu:playall">' + D.glyph('play', 2) + 'Play</button></div>');
        back.querySelector('b').textContent = open.name;
        back.querySelector('[data-key="hu:back"]').onclick = () => { open = null; paint(); };
        back.querySelector('[data-key="hu:playall"]').onclick = () => { const k = keys(open.items); if (k.length) HU.play(k[0], k); };
        list.appendChild(back);
        shown = keys(open.items);
        if (!shown.length) list.appendChild(h('<p class="hu-note">Empty for now. Right-click a song (or press X on the remote) and choose Add to ' + esc(open.name) + '.</p>'));
        shown.forEach((k) => list.appendChild(row(k)));
      } else {
        const mk = h('<button class="b small hu-new" data-nav data-key="hu:newlist">' + D.glyph('plus', 2) + 'New playlist</button>');
        mk.onclick = () => newList([]);
        list.appendChild(mk);
        st().lists.forEach((L) => {
          const b = h('<button class="hu-row hu-pl" data-nav data-key="hu:pl:' + esc(L.id) + '"><span class="hu-pic">' + D.glyph('library', 2) + '</span><span class="hu-w"><b></b><small></small></span></button>');
          b.querySelector('b').textContent = L.name;
          b.querySelector('small').textContent = keys(L.items).length + ' song' + (keys(L.items).length === 1 ? '' : 's');
          b.onclick = () => { open = L; paint(); };
          b.dataset.x = 'Delete';
          b._x = () => D.ask({ title: 'Delete ' + L.name + '?', text: 'The songs stay in hum.', buttons: [{ label: 'Delete', value: true, danger: true, go: true }, { label: 'Keep it', value: false }] }).then((ok) => { if (ok) { st().lists = st().lists.filter((x) => x !== L); D.save(); paint(); } });
          list.appendChild(b);
        });
      }
      list.querySelectorAll('.hu-row:not(.hu-pl)').forEach((b) => { const k = b.dataset.key.slice(3); b.onclick = () => (keyNow() === k ? HU.toggle() : HU.play(k, shown)); });
      // the player
      const k = keyNow(), it = k && item(k);
      root.querySelector('.hu-title b').textContent = it ? it.name : 'Nothing playing';
      root.querySelector('.hu-title span').textContent = it ? it.by : 'Pick something to start';
      root.querySelector('[data-key="hu:play"]').innerHTML = D.glyph(playingNow() ? 'pause' : 'play', 2);
      root.querySelector('.hu-heart').classList.toggle('on', !!(k && st().liked.includes(k)));
      root.style.setProperty('--c', (it && it.c) || '#f5c431');
      if (keep) { const e = root.querySelector('[data-key="' + keep + '"]'); if (e) D.nav.focus(e, { scroll: false }); }
    }
    // YouTube's own player, shown while it plays
    function ytPaint() {
      const box = root.querySelector('.hu-yt');
      box.hidden = !yt.on;
      if (!yt.on) { box.innerHTML = ''; yt.frame = null; return; }
      if (yt.frame && yt.frame.dataset.id === yt.id) return;
      box.innerHTML = '';
      const f = h('<iframe title="YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>');
      f.dataset.id = yt.id;
      f.src = 'https://www.youtube-nocookie.com/embed/' + yt.id + '?autoplay=1&enablejsapi=1&playsinline=1&origin=' + encodeURIComponent(location.origin);
      f.onload = () => { try { f.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'hum' }), '*'); } catch (e) { /* fine */ } };
      box.appendChild(f);
      yt.frame = f;
    }
    const offs = [M.on(paint), D.on('hum', paint), D.on('hum-yt', () => { ytPaint(); paint(); })];
    paint(); ytPaint();
    if (!M.songs.length) M.load().then(paint);

    // Bumble along the bar, and the garden dancing underneath
    const track = root.querySelector('.hu-track'), tg = track.getContext('2d');
    const garden = root.querySelector('.hu-garden'), gg = garden.getContext('2d');
    let world = null, W = 0, H = 0, TW = 0, jumps = PLANTS.map(() => 0), raf = 0, lastC = null, nightNow = null;
    function size() {
      const r = garden.getBoundingClientRect(), tr = track.getBoundingClientRect();
      W = Math.max(60, Math.round(r.width / 4)); H = Math.max(18, Math.round(r.height / 4));
      garden.width = W; garden.height = H;
      TW = Math.max(40, Math.round(tr.width / 2)); track.width = TW; track.height = 14;
      nightNow = D.night();
      world = new G.World({ land: 'garden', c: lastC || '#f5c431', who: null, night: nightNow, W, H, layout: 'stage', seed: 'hum' });
    }
    const ro = new ResizeObserver(size); ro.observe(garden);
    const bee = G.mascot('hum');
    function draw(now) {
      raf = requestAnimationFrame(draw);
      if (!world) return;
      const t = now / 1000, c = (item(keyNow()) || {}).c || '#f5c431';
      if (c !== lastC || nightNow !== D.night()) { lastC = c; size(); }
      world.draw(gg, t, D.reduced());
      const playing = playingNow(), beat = M.beat ? M.beat() : {}, lv = (M.levels && M.levels(PLANTS.length)) || PLANTS.map(() => 0);
      PLANTS.forEach((name, i) => {
        const p = ART.plants[name];
        if (!p) return;
        if (playing && beat.hit && (i + Math.floor(t * 2)) % 2 === 0) jumps[i] = 2.5;
        jumps[i] = Math.max(0, jumps[i] - 0.35);
        const sway = playing ? Math.round(Math.sin(t * 4 + i) * (lv[i] * 1.6 + (yt.on ? 0.6 : 0))) : 0;
        const droop = playing ? 0 : 1;
        const x = Math.round((i + 0.5) / PLANTS.length * W) - 3;
        gg.drawImage(G.sprite(p.grid, p.ink, 'p:' + name), x + sway, world.gy - 2 - Math.round(jumps[i]) + droop + (i % 2));
      });
      // the bar: how far through, and Bumble at the front of it
      const pr = M.progress && M.progress(), frac = yt.on ? (t / 6) % 1 : pr ? pr.t / pr.d : M.now && M.now.kind === 'radio' && M.now.started ? ((Date.now() - M.now.started) / 1000 / 64) % 1 : 0;
      tg.clearRect(0, 0, TW, 14);
      tg.fillStyle = 'rgba(128,128,140,.25)'; tg.fillRect(0, 6, TW, 2);
      tg.fillStyle = c; tg.fillRect(0, 6, Math.round(TW * frac), 2);
      if (bee) {
        const bx = Math.round(Math.min(TW - 11, Math.max(0, TW * frac - 5))), by = 1 + (playing ? Math.round(Math.sin(t * (beat.hit ? 14 : 6))) : 1);
        tg.drawImage(bee, bx, by, 11, 11 * bee.height / bee.width);
      }
    }
    raf = requestAnimationFrame(draw);
    root.querySelector('.hu-bar').addEventListener('pointerdown', (e) => { if (yt.on || !M.seek) return; const r = e.currentTarget.getBoundingClientRect(); M.seek((e.clientX - r.left) / r.width); });
    const beeC = root.querySelector('.hu-bee').getContext('2d');
    if (bee) { beeC.imageSmoothingEnabled = false; beeC.drawImage(bee, 0, Math.round((22 - 22 * bee.height / bee.width) / 2), 22, 22 * bee.height / bee.width); }
    setTimeout(() => { if (ctx.mode === 'run') D.nav.focus(root.querySelector('[data-key="hu:play"]')); }, 40);
    ctx.legend([]);
    return {
      pause() { cancelAnimationFrame(raf); },
      resume() { raf = requestAnimationFrame(draw); },
      unmount() { cancelAnimationFrame(raf); ro.disconnect(); offs.forEach((f) => f && f()); },
    };
  } });

  // the old Music app was this; "open music" opens hum
  const app0 = D.app;
  D.app = (id) => app0(id === 'music' ? 'hum' : id);
  const launch0 = D.launch;
  D.launch = function (id) { return launch0.apply(this, [id === 'music' ? 'hum' : id].concat([].slice.call(arguments, 1))); };
  if (D.desk) { const open0 = D.desk.open; D.desk.open = function (id) { return open0.apply(this, [id === 'music' ? 'hum' : id].concat([].slice.call(arguments, 1))); }; }
  // Ctrl + Alt + M, like hum's ⌃⌥M: open it, or close it
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey && (e.key === 'm' || e.key === 'M')) || !D.desk || !D.desk.on) return;
    e.preventDefault();
    const w = D.desk.wins.find((x) => x.id === 'hum');
    if (w && !w.min) w.close(); else D.desk.open('hum');
  }, true);
})();
