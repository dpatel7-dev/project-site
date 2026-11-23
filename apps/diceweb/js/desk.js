// Desktop mode: a wallpaper where the friends wander about, windows you can
// drag, resize and stack, a launcher, and a bar along the bottom. The same
// apps as Big screen run inside the windows.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S, M = D.M, $ = D.$, esc = D.esc, h = D.h;
  const Desk = D.desk = { on: false, wins: [], z: 10, world: null, last: 0 };
  const SIZES = { files: [900, 600], browser: [720, 520], music: [880, 580], terminal: [740, 470], notes: [780, 520], settings: [960, 640], store: [900, 620], pigeon: [1000, 680] };
  const ICONS = ['gaming', 'files', 'browser', 'terminal', 'notes', 'music', 'store', 'settings'];

  let root, wall, wg;
  function build() {
    root = $('#desk');
    root.innerHTML = '<canvas class="wall"></canvas><div class="dicons" role="list"></div><div class="wins"></div>' +
      '<div class="start glass" hidden><div class="sbox2">' + D.glyph('search', 2) + '<input placeholder="Search apps" aria-label="Search apps"></div><div class="sgrid"></div><div class="srow2"></div></div>' +
      '<nav class="dshelf glass" aria-label="Shelf"><button class="launch" aria-label="Everything (M)" title="Everything">' + D.icon('die', null, 2) + '</button><div class="pins"></div><div class="tasks"></div></nav>' +
      '<div class="dtray glass"><button class="dt-music" hidden></button><button class="dt-look" aria-label="Day or night" title="Day or night"></button><button class="dt-qam" aria-label="Quick settings (Q)" title="Quick settings"><span class="dt-wifi"></span><span class="dt-vol"></span><span class="dt-clock"></span></button></div>';
    wall = root.querySelector('.wall'); wg = wall.getContext('2d');
    root.querySelector('.launch').onclick = () => Desk.toggleStart();
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
  function appIcon(id) {
    if (id === 'gaming') return { id, name: 'Big screen', c: '#8a8a96' };
    if (id === 'pigeon') return D.app('pigeon');
    return D.app(id);
  }
  function mini(app, size) {
    if (app.id === 'gaming') { const c = G.canvas(64, 64), g = c.getContext('2d'); g.fillStyle = D.night() ? '#1b1b1f' : '#f4f4f6'; g.fillRect(0, 0, 64, 64); const ic = G.icon('die', D.ink(), null, 4); const im = new Image(); im.onload = () => g.drawImage(im, 8, 8); im.src = ic.url; c.className = 'art'; c.style.width = c.style.height = size + 'px'; return c; }
    const c = D.coverEl(app, 'square'); c.style.width = c.style.height = size + 'px'; return c;
  }
  function icons() {
    const box = root.querySelector('.dicons');
    box.innerHTML = '';
    const list = ICONS.concat(['pigeon']);
    list.forEach((id) => {
      const app = appIcon(id);
      const b = h('<button class="dicon" role="listitem"><span>' + esc(app.name) + '</span></button>');
      b.prepend(mini(app, 56));
      b.onclick = () => (id === 'gaming' ? Desk.exit() : Desk.open(id === 'pigeon' ? 'web:pigeon' : id));
      box.appendChild(b);
    });
  }
  Desk.PINS = ['files', 'browser', 'terminal', 'notes', 'music', 'settings'];
  function pins() {
    const box = root.querySelector('.pins');
    box.innerHTML = '';
    Desk.PINS.filter((id) => D.app(id)).forEach((id) => {
      const app = D.app(id);
      const b = h('<button class="pin" data-id="' + id + '" title="' + esc(app.name) + '" aria-label="' + esc(app.name) + '"></button>');
      b.appendChild(mini(app, 38));
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
  function fillStart(q) {
    const grid = root.querySelector('.sgrid');
    grid.innerHTML = '';
    const apps = D.all().filter((a) => !a.suite || (a.web && D.onSite)).filter((a) => !q || D.L.score(q, a) > 0);
    apps.forEach((a) => {
      const b = h('<button><span>' + esc(a.name) + '</span></button>');
      b.prepend(mini(a, 52));
      b.onclick = () => { Desk.toggleStart(false); Desk.open(a.suite ? 'web:' + a.id : a.id); };
      grid.appendChild(b);
    });
    if (!apps.length) grid.innerHTML = '<p class="muted" style="grid-column:1/-1;margin:8px">No app called that.</p>';
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
        const b = h('<button class="b small">' + (ic === 'die' ? D.icon('die', null, 1) : D.glyph(ic, 2)) + esc(n) + '</button>'); b.onclick = () => { Desk.toggleStart(false); fn(); }; row.appendChild(b);
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
      this.el.querySelector('.wico').appendChild(mini(app, 18));
      this.body = this.el.querySelector('.wbody');
      this.place();
      root.querySelector('.wins').appendChild(this.el);
      this.wire();
      const def = id.startsWith('web:') ? D.webApp(app) : D.apps[id];
      const ctx = D.ctx(id, 'desk', { arg: opts.arg, win: this });
      this.inst = def.mount(this.body, ctx) || {};
      this.task = h('<button class="task" title="' + esc(app.name) + '" aria-label="' + esc(app.name) + '"></button>');
      this.task.appendChild(mini(app, 38));
      if (Desk.PINS.includes(id)) this.task.hidden = true; // pinned apps show a dot under their pin instead
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
  Desk.area = () => ({ w: innerWidth, h: innerHeight - 76 });
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
    if (!quiet) D.toast({ icon: 'desktop', c: '#8fd16a', title: 'Desktop', text: 'Drag windows about. The die at the bottom left has everything.' });
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
  // the wallpaper: a wide world with everyone wandering about
  Desk.frame = function (now) {
    if (!Desk.on || document.hidden) return;
    const vw = innerWidth, vh = innerHeight, cell = Math.max(4, Math.round(vw / 270));
    const W = Math.ceil(vw / cell), H = Math.ceil(vh / cell);
    if (!Desk.world || Desk.world.W !== W || Desk.world.H !== H || Desk.world.night !== D.night() || Desk.world.o.land !== (D.state.world || 'hills')) {
      wall.width = W; wall.height = H; wall.style.width = W * cell + 'px'; wall.style.height = H * cell + 'px';
      const land = D.WORLDS && D.WORLDS[D.state.world] ? D.state.world : 'hills';
      Desk.world = new G.World({ land, c: (D.WORLDS || {})[land] || '#7cc4ff', who: null, night: D.night(), W, H, layout: 'wall', gang: true, seed: 'desk' });
      Desk.last = 0;
    }
    const fps = D.state.fps || 60;
    if (now - Desk.last < 1000 / Math.min(fps, 30)) return;
    Desk.last = now;
    Desk.world.draw(wg, now / 1000, D.reduced());
    for (const w of Desk.wins) if (!w.min && w.inst.frame) w.inst.frame(now);
  };
  D.on('look', () => { if (Desk.on) { Desk.world = null; icons(); pins(); tray(); } });
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
      row.prepend(mini(app, 52));
      row.querySelector('button').onclick = (e) => D.copy(cmd, e.currentTarget);
      list.appendChild(row);
    });
    return {};
  } });
})();
