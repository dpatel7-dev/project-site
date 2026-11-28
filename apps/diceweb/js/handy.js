// Three small things only Dice does:
//   Roll for it: can't decide? The die tumbles and picks something to watch, play or listen to,
//     leaning toward what you haven't opened in a while.
//   Float: any window, kept small and on top in a corner, see-through until you point at it, and
//     on every desktop. (Window menu, the window's own menu, or "Deuce, float this window".)
//   Fridge notes: a note on DiceTV's home and the big clock, for whoever's next. ("Deuce, leave a
//     note on the TV: pizza's in the fridge".) Done takes it down.
(function () {
  'use strict';
  const D = window.Dice, h = D.h, esc = D.esc, S = D.S, G = D.G;

  // =====================================================================================================================
  // Roll for it
  // =====================================================================================================================
  const R = (D.roll = {});
  const daysSince = (id) => { const t = D.state.last && D.state.last[id]; return t ? (Date.now() - t) / 864e5 : 30; };
  function pool(what) {
    const out = [], W = D.watch, have = W ? W.settings().have.filter((id) => W.SVC[id]) : [];
    const add = (kind, id, name, c, sub, go) => out.push({ kind, id, name, c: c || '#7c9cff', sub, go });
    if (what === 'watch' || what === 'any') {
      const svcs = have.filter((id) => !['spotify', 'ytmusic'].includes(id));
      (svcs.length ? svcs : ['youtube', 'tubi', 'pluto'].filter((id) => W && W.SVC[id])).forEach((id) => add('watch', id, W.SVC[id].name, W.SVC[id].c, 'Put something on ' + W.SVC[id].name + '.', () => W.open(id)));
      if (D.app('channels')) add('watch', 'channels', 'Dice Channels', D.app('channels').c, 'A channel that\'s always on. Just flick through.', () => D.launch('channels'));
      if (D.watch && D.watch.liveSvc && D.watch.liveSvc()) { const id = D.watch.liveSvc(); add('watch', id, 'Live TV', W.SVC[id].c, 'Whatever\'s on ' + W.SVC[id].name + ' right now.', () => W.open(id)); }
    }
    if (what === 'listen' || what === 'any') {
      (D.M && D.M.RADIO || []).forEach((tr, i) => add('listen', 'radio' + i, tr.name, tr.c, 'On Dice Radio, made right here.', () => { D.M.play('radio', i); D.toast({ icon: 'music', c: tr.c, title: tr.name, text: 'Dice Radio' }); }));
      ['spotify', 'ytmusic'].filter((id) => have.includes(id)).forEach((id) => add('listen', id, W.SVC[id].name, W.SVC[id].c, 'Something on ' + W.SVC[id].name + '.', () => W.open(id)));
    }
    if (what === 'play' || what === 'any') {
      if (D.app('gaming') && D.desk && D.desk.on) add('play', 'gaming', 'DiceGaming', D.app('gaming').c, 'Pick up where you left off.', () => D.launch('gaming'));
      if (D.app('sketch')) add('play', 'sketch', 'Sketch', D.app('sketch').c, 'Draw something. Anything. Five minutes.', () => D.launch('sketch'));
      if (W && W.SVC.twitch) add('play', 'twitch', 'Twitch', W.SVC.twitch.c, 'Watch someone else play for a bit.', () => W.open('twitch'));
      if (D.sys && D.inputs) add('play', 'inputs', 'Your console', '#4fc16b', 'Switch to it in Inputs.', () => D.inputs.open());
    }
    return out;
  }
  // a weighted pick: what you haven't opened lately is likelier, and never the same twice running
  R.pick = function (what) {
    const p = pool(what || 'any').filter((x) => x.id !== D.state.rollLast || pool(what || 'any').length === 1);
    if (!p.length) return null;
    const w = p.map((x) => 1 + Math.min(14, daysSince(x.id === 'channels' ? 'channels' : x.id)));
    let k = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < p.length; i++) { if ((k -= w[i]) < 0) return p[i]; }
    return p[p.length - 1];
  };
  let el = null, what = 'any', raf = 0, pick = null;
  const KINDS = [['any', 'Anything'], ['watch', 'Watch'], ['listen', 'Listen'], ['play', 'Play']];
  R.open = function (w) {
    what = KINDS.some((k) => k[0] === w) ? w : 'any';
    if (!el) {
      el = h('<div id="roll" class="navtrap" role="dialog" aria-label="Roll for it"><div class="rl-in glass">' +
        '<div class="seg rl-kinds" role="group" aria-label="What to roll for">' + KINDS.map(([k, n]) => '<button data-nav data-key="rl:' + k + '" data-k="' + k + '">' + n + '</button>').join('') + '</div>' +
        '<div class="rl-stage"><canvas class="rl-die" width="64" height="64" aria-hidden="true"></canvas><i class="rl-shadow" aria-hidden="true"></i></div>' +
        '<div class="rl-out" aria-live="polite"><span class="rl-kind"></span><b class="rl-name"></b><span class="rl-sub"></span></div>' +
        '<div class="rl-acts"><button class="b go" data-nav data-key="rl:go">Open it</button><button class="b" data-nav data-key="rl:again">' + D.glyph('die', 2) + 'Roll again</button><button class="b" data-nav data-key="rl:no">Not now</button></div></div></div>');
      document.body.appendChild(el);
      el.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { what = b.dataset.k; roll(); }; });
      el.querySelector('[data-key="rl:go"]').onclick = () => { const p = pick; R.close(); if (p) { D.state.rollLast = p.id; D.save(); setTimeout(p.go, 120); } };
      el.querySelector('[data-key="rl:again"]').onclick = () => roll();
      el.querySelector('[data-key="rl:no"]').onclick = () => R.close();
      el.addEventListener('pointerdown', (e) => { if (e.target === el) R.close(); });
    }
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('on'));
    roll();
  };
  R.close = function () { if (!el || el.hidden) return; cancelAnimationFrame(raf); el.classList.remove('on'); setTimeout(() => { if (el && !el.classList.contains('on')) el.hidden = true; }, 260); S.play('close'); };
  R.isOpen = () => !!(el && !el.hidden);
  const fire0 = D.input.fire;
  D.input.fire = function (a, src) { if (R.isOpen() && a === 'b') { R.close(); return; } return fire0.call(D.input, a, src); };
  function roll() {
    el.querySelectorAll('[data-k]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === what));
    pick = R.pick(what);
    const out = el.querySelector('.rl-out'), cv = el.querySelector('.rl-die'), g = cv.getContext('2d'), stage = el.querySelector('.rl-stage');
    out.classList.remove('in');
    el.querySelector('[data-key="rl:go"]').disabled = true;
    S.play('select');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || D.state.motion;
    const t0 = performance.now(), dur = still ? 1 : 1100, night = D.night();
    cancelAnimationFrame(raf);
    const frame = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      g.clearRect(0, 0, 64, 64);
      try { g.drawImage(G.die(64, k < 1 && window.DiceDie ? window.DiceDie.tumble(k) : null, { key: 'rl' + (k < 1 ? Math.round(k * 40) : 'rest') + (night ? 'n' : ''), ss: 2, outline: [44, 46, 72] }), 0, 0); } catch (e) { /* no die here */ }
      // a couple of bounces, smaller each time
      const y = still ? 0 : -Math.abs(Math.sin(k * Math.PI * 2.5)) * 60 * (1 - k);
      stage.style.setProperty('--y', y.toFixed(1) + 'px');
      if (k < 1) raf = requestAnimationFrame(frame);
      else reveal();
    };
    raf = requestAnimationFrame(frame);
  }
  function reveal() {
    const out = el.querySelector('.rl-out'), go = el.querySelector('[data-key="rl:go"]');
    if (!pick) {
      out.querySelector('.rl-kind').textContent = '';
      out.querySelector('.rl-name').textContent = 'Nothing to roll for';
      out.querySelector('.rl-sub').textContent = 'Add your streaming services in Settings, Watch, and try again.';
      go.disabled = true;
    } else {
      out.style.setProperty('--c', pick.c);
      out.querySelector('.rl-kind').textContent = { watch: 'Watch', listen: 'Listen to', play: 'Play' }[pick.kind];
      out.querySelector('.rl-name').textContent = pick.name;
      out.querySelector('.rl-sub').textContent = pick.sub;
      go.disabled = false;
      S.play('toast');
    }
    out.classList.add('in');
    if (D.nav && D.nav.focus) D.nav.focus(go.disabled ? el.querySelector('[data-key="rl:again"]') : go);
  }

  // =====================================================================================================================
  // Float
  // =====================================================================================================================
  const F = (D.float = {});
  // on: true / false, or leave it out to switch. → the window's name, or null if there's none
  F.set = function (on, w) {
    const Desk = D.desk;
    if (!Desk || !Desk.on) return null;
    w = w || Desk.top();
    if (!w) return null;
    if (on === undefined) on = !w.float;
    if (on && !w.float) {
      w.floatWas = { box: Object.assign({}, w.box), max: w.max, snap: w.snap, pinned: !!w.pinned };
      const a = Desk.area(), ww = Math.round(Math.max(360, Math.min(560, a.w * 0.32))), hh = Math.round(Math.max(240, Math.min(420, ww * 0.66)));
      w.max = false; w.snap = null;
      w.box = { x: a.w - ww - 22, y: a.h - hh - 18, w: ww, h: hh };
      w.float = true; w.pinned = true;
    } else if (!on && w.float) {
      const was = w.floatWas || {};
      w.float = false; w.pinned = !!was.pinned;
      if (was.box) { w.box = was.box; w.max = was.max; w.snap = was.snap; }
    } else return w.app.name;
    w.el.classList.toggle('float', w.float);
    w.el.classList.toggle('pinned', w.pinned);
    w.place();
    Desk.focus(w);
    S.play(on ? 'open' : 'close');
    return w.app.name;
  };
  // a floating window comes along to whichever desktop you're on
  function comeAlong() {
    const Desk = D.desk;
    if (!Desk || !Desk.toDesktop || Desk.toDesktop._float) return;
    const to0 = Desk.toDesktop;
    Desk.toDesktop = function (i) { const n = ((i + 4) % 4); Desk.wins.forEach((w) => { if (w.float) w.ws = n; }); return to0.apply(this, arguments); };
    Desk.toDesktop._float = true;
    if (D.deskplus) D.deskplus.toDesktop = Desk.toDesktop;
  }
  comeAlong();
  D.on('desk', comeAlong);

  // =====================================================================================================================
  // Fridge notes
  // =====================================================================================================================
  const N = (D.fridge = {});
  N.get = () => (D.state.fridge && D.state.fridge.text ? D.state.fridge : null);
  N.set = function (text) {
    const was = N.get();
    D.state.fridge = { text: String(text).trim().slice(0, 160), at: Date.now(), by: D.state.name && D.state.name !== 'player' ? D.state.name : '' };
    D.save(); D.emit('fridge');
    if (D.oops) D.oops.add({ type: 'note', note: was, title: 'Left a note on DiceTV' });
  };
  N.clear = function () {
    const was = N.get();
    if (!was) return;
    D.state.fridge = null; D.save(); D.emit('fridge');
    if (D.oops) D.oops.add({ type: 'note', note: was, title: 'Took down the note "' + was.text.slice(0, 40) + '"', bar: true });
  };
  N.restore = function (note) { D.state.fridge = note || null; D.save(); D.emit('fridge'); };
  N.ago = function (n) {
    const m = Math.round((Date.now() - n.at) / 60000);
    return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(n.at).toLocaleDateString([], { weekday: 'long' });
  };
})();
