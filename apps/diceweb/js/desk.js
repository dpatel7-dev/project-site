// Desktop mode, where DiceWeb opens: a calm moving landscape, windows you can
// drag, resize and stack, a small dock along the bottom, and every app in a
// grid behind the die. Like Ubuntu, lots comes built in but stays out of the
// way: only your favourites are in the dock, and nothing pops up by itself.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S, M = D.M, $ = D.$, esc = D.esc, h = D.h;
  const Desk = D.desk = { on: false, wins: [], z: 10, world: null, last: 0 };
  const SIZES = { files: [900, 600], browser: [720, 520], music: [880, 580], terminal: [740, 470], notes: [780, 520], settings: [960, 640], store: [900, 620], pigeon: [1000, 680],
    calculator: [330, 500], calendar: [820, 580], clock: [560, 520], monitor: [760, 540] };

  let root, wall, wg;
  function build() {
    root = $('#desk');
    root.innerHTML = '<canvas class="wall"></canvas><div class="dicons" role="list"></div><div class="wins"></div>' +
      '<div class="start" hidden role="dialog" aria-label="All apps"><div class="sbox2">' + D.glyph('search', 2) + '<input placeholder="Type to search" aria-label="Search apps"></div><div class="sscroll"><div class="sgrid"></div></div><div class="srow2"></div></div>' +
      '<nav class="dshelf glass" aria-label="Dock"><button class="launch" aria-label="All apps (M)" title="All apps"></button><div class="pins"></div><span class="dsep" hidden></span><div class="tasks"></div></nav>' +
      '<div class="dtray glass"><button class="dt-music" hidden></button><button class="dt-look" aria-label="Day or night" title="Day or night"></button><button class="dt-qam" aria-label="Quick settings (Q)" title="Quick settings"><span class="dt-wifi"></span><span class="dt-vol"></span><span class="dt-clock"></span></button></div>';
    wall = root.querySelector('.wall'); wg = wall.getContext('2d');
    root.querySelector('.launch').innerHTML = '<svg viewBox="0 0 18 18" width="18" height="18" fill="currentColor" aria-hidden="true">' + [2, 8, 14].map((y) => [2, 8, 14].map((x) => '<rect x="' + (x - 1.5) + '" y="' + (y - 1.5) + '" width="3" height="3" rx="1"/>').join('')).join('') + '</svg>';
    root.querySelector('.launch').onclick = () => Desk.toggleStart();
    root.querySelector('.start').addEventListener('click', (e) => { if (e.target.classList.contains('start') || e.target.classList.contains('sscroll')) Desk.toggleStart(false); });
    root.querySelector('.dt-qam').onclick = () => (D.qam.isOpen() ? D.qam.close() : D.qam.open('quick'));
    root.querySelector('.dt-look').onclick = () => { D.set('look', D.night() ? 'day' : 'night'); D.applyLook(true); };
    root.querySelector('.dt-music').onclick = () => Desk.open('music');
    const input = root.querySelector('.start input');
    input.oninput = () => fillStart(input.value);
    input.onkeydown = (e) => { if (e.key === 'Enter') { const b = root.querySelector('.sgrid button'); if (b) b.click(); } if (e.key === 'Escape') Desk.toggleStart(false); };
    root.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.start') && !e.target.closest('.launch')) Desk.toggleStart(false);
      const w = e.target.closest('.win'); if (w) Desk.focus(w._win);
    });
    icons(); pins(); tray();
    setInterval(tray, 5000);
    M.on(tray);
    D.on('sys', tray);
  }
  // built-in apps get a clean flat icon; the apps for your computer show their animal on their colour
  function mini(app, size) {
    if (G.TILES[app.id]) return G.appIconEl(app.id, size);
    const c = G.face(app.id, size * 2, G.hexA(app.c || '#7c9cff', 0.3));
    c.style.width = c.style.height = size + 'px'; c.style.borderRadius = Math.round(size * 0.24) + 'px'; c.className = 'appicon';
    return c;
  }
  D.appIconEl = mini;
  // just your Home folder on the desktop, unless you'd rather have nothing
  function icons() {
    const box = root.querySelector('.dicons');
    box.innerHTML = '';
    if (D.state.deskIcons === 'none') return;
    const b = h('<button class="dicon" role="listitem"><span>Home</span></button>');
    b.prepend(G.appIconEl('home', 48));
    b.ondblclick = () => Desk.open('files');
    b.onclick = (e) => { if (e.detail === 0 || matchMedia('(pointer: coarse)').matches) Desk.open('files'); else b.focus(); };
    b.onkeydown = (e) => { if (e.key === 'Enter') Desk.open('files'); };
    box.appendChild(b);
  }
  Desk.PINS = ['files', 'browser', 'terminal', 'notes', 'music', 'store', 'settings'];
  function pins() {
    const box = root.querySelector('.pins');
    box.innerHTML = '';
    Desk.PINS.filter((id) => D.app(id)).forEach((id) => {
      const app = D.app(id);
      const b = h('<button class="pin" data-id="' + id + '" title="' + esc(app.name) + '" aria-label="' + esc(app.name) + '"></button>');
      b.appendChild(mini(app, 34));
      b.onclick = () => { const w = Desk.wins.find((x) => x.id === id); if (w) { if (w.min || w !== Desk.top()) Desk.focus(w); else w.minimise(); } else Desk.open(id); };
      box.appendChild(b);
    });
  }
  function tray() {
    if (!root) return;
    const d = new Date();
    root.querySelector('.dt-clock').innerHTML = '<b>' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M/i, '') + '</b><span>' + d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + '</span>';
    root.querySelector('.dt-vol').innerHTML = D.glyph(D.state.volume > 0 ? 'volume' : 'mute', 2);
    const st = D.sys && D.sys.status;
    root.querySelector('.dt-wifi').innerHTML = D.glyph(st && st.wifi ? (st.wifi.ssid ? 'wifi' : 'nowifi') : navigator.onLine ? 'wifi' : 'nowifi', 2);
    root.querySelector('.dt-look').innerHTML = D.glyph(D.night() ? 'moon' : 'sun', 2);
    const m = root.querySelector('.dt-music');
    m.hidden = !M.now;
    if (M.now) m.innerHTML = '<span class="eqmini ' + (M.now.playing ? '' : 'still') + '"><i></i><i></i><i></i></span>' + esc(M.now.name);
    m.classList.toggle('playing', !!(M.now && M.now.playing));
  }
  // every app, like Ubuntu's Show Apps: the built-in ones by name, then the suite's (on the website)
  function fillStart(q) {
    const box = root.querySelector('.sgrid');
    box.innerHTML = '';
    const match = (a) => !q || D.L.score(q, a) > 0;
    const builtIn = D.all().filter((a) => !a.suite && match(a)).sort((a, b) => a.name.localeCompare(b.name));
    const suite = D.onSite ? D.all().filter((a) => a.suite && a.web && match(a)) : [];
    const add = (a) => {
      const b = h('<button><span>' + esc(a.name) + '</span></button>');
      b.prepend(mini(a, 56));
      b.title = a.blurb || a.name;
      b.onclick = () => { Desk.toggleStart(false); Desk.open(a.suite ? 'web:' + a.id : a.id); };
      return b;
    };
    const big = h('<button><span>Big screen</span></button>'); big.prepend(G.appIconEl('gaming', 56)); big.title = 'For a TV or a controller';
    big.onclick = () => { Desk.toggleStart(false); Desk.exit(); };
    const g1 = h('<div class="sgroup"></div>');
    builtIn.forEach((a) => g1.appendChild(add(a)));
    if (!q || /big|screen|tv|game|controller/i.test(q)) g1.appendChild(big);
    box.appendChild(g1);
    if (suite.length) {
      box.appendChild(h('<h3 class="shead">On this website</h3>'));
      const g2 = h('<div class="sgroup"></div>');
      suite.forEach((a) => g2.appendChild(add(a)));
      box.appendChild(g2);
    }
    if (!builtIn.length && !suite.length) box.innerHTML = '<p class="sempty">No app called that.</p>';
  }
  Desk.toggleStart = function (on) {
    const st = root.querySelector('.start');
    on = on === undefined ? st.hidden : on;
    if (on === !st.hidden) return;
    st.hidden = !on;
    if (on) {
      fillStart('');
      const row = root.querySelector('.srow2');
      row.innerHTML = '';
      (D.sys ? [['moon', 'Sleep', () => D.sleep()], ['restart', 'Restart', () => D.sys.power('reboot')], ['power', 'Shut down', () => D.sys.power('shutdown')], ['die', 'Big screen', () => Desk.exit()]]
        : [['moon', 'Sleep', () => D.sleep()], ['restart', 'Restart', () => D.restart()], ['die', 'Big screen', () => Desk.exit()]]).forEach(([ic, n, fn]) => {
        if (ic === 'die') return;
        const b = h('<button class="b small">' + D.glyph(ic, 2) + esc(n) + '</button>'); b.onclick = () => { Desk.toggleStart(false); fn(); }; row.appendChild(b);
      });
      const input = root.querySelector('.start input'); input.value = ''; setTimeout(() => input.focus(), 30);
      S.play('open');
    } else S.play('close');
  };

  // ---- Windows -------------------------------------------------------------------------
  class Win {
    constructor(id, app, opts) {
      this.id = id; this.app = app;
      const [w, hh] = SIZES[id.replace('web:', '')] || [760, 520];
      const area = Desk.area();
      const n = Desk.wins.length;
      const W = Math.min(w, area.w - 40), H = Math.min(hh, area.h - 40);
      this.box = { x: Math.max(10, Math.round((area.w - W) / 2 + (n % 5) * 28 - 56)), y: Math.max(10, Math.round((area.h - H) / 2 + (n % 5) * 24 - 40)), w: W, h: H };
      this.el = h('<section class="win glass" role="dialog" aria-label="' + esc(app.name) + '"><header><span class="wico"></span><b class="wt">' + esc(app.name) + '</b><span class="wbtns"><button class="wmin" aria-label="Minimise"></button><button class="wmax" aria-label="Maximise"></button><button class="wclose" aria-label="Close">' + D.glyph('close', 1) + '</button></span></header><div class="wbody"></div><span class="wgrip" aria-hidden="true"></span></section>');
      this.el._win = this;
      this.el.querySelector('.wico').appendChild(mini(app, 16));
      this.body = this.el.querySelector('.wbody');
      this.place();
      root.querySelector('.wins').appendChild(this.el);
      this.wire();
      const def = id.startsWith('web:') ? D.webApp(app) : D.apps[id];
      const ctx = D.ctx(id, 'desk', { arg: opts.arg, win: this });
      this.inst = def.mount(this.body, ctx) || {};
      this.task = h('<button class="task" title="' + esc(app.name) + '" aria-label="' + esc(app.name) + '"></button>');
      this.task.appendChild(mini(app, 34));
      if (Desk.PINS.includes(id)) this.task.hidden = true; // pinned apps show a dot under their pin instead
      root.querySelector('.dsep').hidden = !Desk.wins.concat([this]).some((w) => !Desk.PINS.includes(w.id));
      this.task.onclick = () => { if (this.min || this !== Desk.top()) Desk.focus(this); else this.minimise(); };
      root.querySelector('.tasks').appendChild(this.task);
      this.since = performance.now();
      if (!D.reduced()) { this.el.classList.add('opening'); setTimeout(() => this.el.classList.remove('opening'), 260); }
    }
    place() {
      const b = this.max ? Object.assign({ x: 0, y: 0 }, Desk.area()) : this.box;
      Object.assign(this.el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
      this.el.classList.toggle('max', !!this.max);
      if (this.inst && this.inst.resize) this.inst.resize();
    }
    wire() {
      const head = this.el.querySelector('header');
      head.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || this.max) return;
        e.preventDefault();
        head.setPointerCapture(e.pointerId);
        const sx = e.clientX - this.box.x, sy = e.clientY - this.box.y;
        head.onpointermove = (ev) => { const a = Desk.area(); this.box.x = Math.max(-this.box.w + 80, Math.min(a.w - 80, ev.clientX - sx)); this.box.y = Math.max(0, Math.min(a.h - 40, ev.clientY - sy)); this.place(); };
        head.onpointerup = () => { head.onpointermove = null; };
      });
      head.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) this.toggleMax(); });
      const grip = this.el.querySelector('.wgrip');
      grip.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        grip.setPointerCapture(e.pointerId);
        const sx = e.clientX, sy = e.clientY, w0 = this.box.w, h0 = this.box.h;
        grip.onpointermove = (ev) => { this.box.w = Math.max(320, w0 + ev.clientX - sx); this.box.h = Math.max(220, h0 + ev.clientY - sy); this.place(); };
        grip.onpointerup = () => { grip.onpointermove = null; };
      });
      this.el.querySelector('.wclose').onclick = () => this.close();
      this.el.querySelector('.wmax').onclick = () => this.toggleMax();
      this.el.querySelector('.wmin').onclick = () => this.minimise();
    }
    setTitle(t) { this.el.querySelector('.wt').textContent = t; }
    toggleMax() { this.max = !this.max; this.place(); S.play('tab'); }
    minimise() { this.min = true; this.el.hidden = true; this.task.classList.remove('on'); if (this.inst.pause) this.inst.pause(); S.play('close'); const t = Desk.top(); if (t) Desk.focus(t); }
    close() {
      this.account();
      try { if (this.inst.unmount) this.inst.unmount(); } catch (e) { console.error(e); }
      this.el.remove(); this.task.remove();
      Desk.wins = Desk.wins.filter((w) => w !== this);
      root.querySelector('.dsep').hidden = !Desk.wins.some((w) => !Desk.PINS.includes(w.id));
      S.play('close');
      const t = Desk.top(); if (t) Desk.focus(t); else dots();
    }
    account() { const now = performance.now(); const k = this.app.id; D.state.played[k] = (D.state.played[k] || 0) + (now - this.since) / 1000; this.since = now; D.save(); }
  }
  function dots() {
    if (!root) return;
    root.querySelectorAll('.pin').forEach((p) => {
      const ws = Desk.wins.filter((w) => w.id === p.dataset.id);
      p.classList.toggle('open', ws.length > 0);
      p.classList.toggle('active', ws.includes(Desk.top()));
    });
  }
  Desk.top = () => Desk.wins.filter((w) => !w.min).sort((a, b) => b.zi - a.zi)[0] || null;
  Desk.focus = function (w) {
    if (!w) return;
    if (w.min) { w.min = false; w.el.hidden = false; if (w.inst.resume) w.inst.resume(); }
    w.zi = ++Desk.z; w.el.style.zIndex = w.zi;
    Desk.wins.forEach((x) => { x.el.classList.toggle('active', x === w); x.task.classList.toggle('on', !x.min); x.task.classList.toggle('active', x === w); });
    dots();
    document.documentElement.style.setProperty('--c', w.app.c);
  };
  Desk.area = () => ({ w: innerWidth, h: innerHeight - 62 });
  Desk.open = function (id, opts) {
    opts = opts || {};
    const base = id.replace('web:', '');
    const app = D.app(base);
    if (id.startsWith('web:')) return D.launch(id);
    if (!app || (!D.apps[id] && !id.startsWith('web:'))) { if (app && app.suite) return Desk.open('store'); return; }
    // music, settings and the store: one window each
    const one = ['music', 'settings', 'store'].includes(id) || id.startsWith('web:');
    const have = one && Desk.wins.find((w) => w.id === id);
    if (have) { Desk.focus(have); return; }
    const w = new Win(id, app, opts);
    Desk.wins.push(w);
    Desk.focus(w);
    D.touch(base);
    S.play('open');
    return w;
  };
  Desk.enter = async function (quiet) {
    if (Desk.on) return;
    if (D.running()) {
      const r = D.running();
      const ok = quiet ? true : await D.ask({ title: 'Close ' + r.app.name + '?', text: 'Switching to Desktop closes what\'s running on the big screen.', buttons: [{ label: 'Close it and switch', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!ok) return;
      D.closeApp(true);
    }
    if (!root) build();
    D.menu.close(true); D.qam.close(true); D.search.close(true);
    Desk.on = true;
    document.documentElement.classList.add('desk-on');
    root.hidden = false;
    D.hero.paused = true;
    icons(); pins(); tray();
    Desk.world = null;
    S.play('open');
  };
  Desk.exit = function (quiet) {
    if (!Desk.on) return;
    Desk.wins.slice().forEach((w) => w.close());
    Desk.on = false;
    document.documentElement.classList.remove('desk-on');
    root.hidden = true;
    D.hero.paused = false;
    D.hero.set(D.hero.app, true);
    if (!quiet) { S.play('back'); D.shell.go('home', null, { root: true, quiet: true }); }
  };
  // buttons and keys on the desktop go to the window in front
  Desk.action = function (a) {
    if (D.$('#dialog.open') || D.qam.isOpen()) {
      if (a === 'b') { if (D.$('#dialog.open')) D.dialog.cancel(); else D.qam.close(); return; }
      if (a === 'a') return D.nav.press();
      if (['up', 'down', 'left', 'right'].includes(a)) return D.nav.move(a);
      if (a === 'quick') return D.qam.close();
      return;
    }
    const w = Desk.top();
    if (w && w.inst.onAction && w.inst.onAction(a)) return;
    if (a === 'menu') return Desk.toggleStart();
    if (a === 'quick') return D.qam.open();
    if (a === 'b' && !root.querySelector('.start').hidden) return Desk.toggleStart(false);
    if (a === 'search') return Desk.toggleStart(true);
  };
  // the wallpaper: the world you picked, as a calm moving landscape with nobody in it
  Desk.frame = function (now) {
    if (!Desk.on || document.hidden) return;
    const vw = innerWidth, vh = innerHeight, cell = D.scapeCell();
    const W = Math.ceil(vw / cell), H = Math.ceil(vh / cell);
    const world = D.WORLDS && D.WORLDS[D.state.world] ? D.state.world : 'hills';
    if (!Desk.world || Desk.world.W !== W || Desk.world.H !== H || Desk.world.night !== D.night() || Desk.world.world !== world) {
      wall.width = W; wall.height = H; wall.style.width = W * cell + 'px'; wall.style.height = H * cell + 'px';
      Desk.world = new G.Scape({ world, night: D.night(), W, H, seed: 'desk' });
      Desk.last = 0;
    }
    const fps = D.state.fps || 60;
    if (now - Desk.last < 1000 / Math.min(fps, 20)) { for (const w of Desk.wins) if (!w.min && w.inst.frame) w.inst.frame(now); return; }
    Desk.last = now;
    Desk.world.draw(wg, now / 1000, D.reduced());
    for (const w of Desk.wins) if (!w.min && w.inst.frame) w.inst.frame(now);
  };
  D.on('look', () => { if (Desk.on) { Desk.world = null; icons(); pins(); tray(); } });
  D.on('state', (k) => { if (k === 'deskIcons' && root) icons(); });
  setInterval(() => Desk.wins.forEach((w) => w.account()), 15000);

  // ---- Store, as a window -------------------------------------------------------------
  D.register({ id: 'store', mount(rootEl) {
    rootEl.classList.add('dstore');
    rootEl.innerHTML = '<div class="dstore-in"><h2 class="pix">Store</h2><p class="muted">Every app for your computer. Paste the line into Terminal on your computer.</p><div class="dlist"></div></div>';
    const list = rootEl.querySelector('.dlist');
    CATALOG.suite.forEach((a) => {
      const app = D.app(a.id);
      const cmd = 'curl -fsSL ' + D.origin + '/' + a.id + '/install.sh | sh';
      const row = h('<div class="drow"><div><b>' + esc(a.name) + '</b><span>' + esc(a.blurb) + '</span></div><button class="b small">Copy line</button></div>');
      row.prepend(mini(app, 44));
      row.querySelector('button').onclick = (e) => D.copy(cmd, e.currentTarget);
      list.appendChild(row);
    });
    return {};
  } });
})();
