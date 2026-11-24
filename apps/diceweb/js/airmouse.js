// Air mice and other pointers on a TV (like the iPazzPort remote with a little
// keyboard on the back, or any mouse plugged into a TV build).
//
// - A big pointer you can see from the sofa. It hides itself when you stop
//   moving it, or the moment you pick up the arrows, and shows again when you move.
// - Air mice have no scroll wheel, so resting the pointer near the end of a row
//   (or the top or bottom of the screen) scrolls that way.
// - On DiceTV the right button goes back, like the Back key. So do a mouse's
//   own back and forward buttons, which would otherwise leave the page.
// - The power button sleeps DiceOS (or asks first, or does nothing). diced
//   catches it on DiceOS, so it no longer turns the whole computer off.
// - The zoom keys never blow the screen up on DiceOS; on DiceTV they fit the
//   picture to the TV instead, for TVs that cut off the edges.
(function () {
  'use strict';
  const D = window.Dice, h = D.h;
  const A = D.air = {};
  const DEF = { ptr: 'auto', hide: true, right: true, edge: true, power: 'sleep' };
  A.get = () => Object.assign({}, DEF, D.state.air || {});
  A.set = (k, v) => { D.state.air = Object.assign(A.get(), { [k]: v }); D.save(); A.paint(); };
  const onTV = () => !(D.desk && D.desk.on);
  const root = document.documentElement;

  // ---- the pointer ----------------------------------------------------------------------------------
  // A plain arrow, white with a dark edge so it shows on anything. Cursors can be up to 128 pixels.
  const arrow = (s) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 32 32">' +
      '<path d="M4 2 L4 25 L9.5 19.8 L13.4 28.6 L17.6 26.8 L13.8 18.2 L21.4 18.2 Z" fill="#fff" stroke="#14161c" stroke-width="2" stroke-linejoin="round"/></svg>';
    const hot = Math.round((4 / 32) * s);
    return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + hot + ' ' + Math.round((2 / 32) * s) + ', auto';
  };
  const SIZES = { big: 48, huge: 76 };
  const style = h('<style id="airptr"></style>');
  document.head.appendChild(style);
  A.size = function () {
    const p = A.get().ptr;
    if (p === 'normal') return 0;
    if (p === 'big' || p === 'huge') return SIZES[p];
    return onTV() ? SIZES.big : 0; // auto: big on DiceTV, the usual one on the desktop
  };
  A.paint = function () {
    const s = A.size();
    style.textContent = s ? 'html.airptr, html.airptr * { cursor: ' + arrow(s) + ' !important; }' : '';
    root.classList.toggle('airptr', !!s);
    if (!A.get().hide) root.classList.remove('ptr-hide');
  };

  // hiding it: after a few seconds still, or as soon as a key or button is used
  let hideT = 0, moved = 0, movedAt = 0;
  const P = A.p = { x: -1, y: -1, in: false };
  function show() {
    root.classList.remove('ptr-hide');
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (A.get().hide && onTV() && !edge.on) root.classList.add('ptr-hide'); }, 3000);
  }
  A.hide = () => { if (A.get().hide && onTV()) { clearTimeout(hideT); root.classList.add('ptr-hide'); } };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    P.x = e.clientX; P.y = e.clientY; P.in = true;
    // air mice can drift a pixel or two while resting: only a real move counts
    const now = performance.now();
    if (now - movedAt > 300) moved = 0;
    moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); movedAt = now;
    if (moved > 6 || !(e.movementX || e.movementY)) { show(); if (D.input.source !== 'mouse' && moved > 6) D.input.setSource('mouse'); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { P.in = false; });
  document.documentElement.addEventListener('mouseleave', () => { P.in = false; });
  window.addEventListener('keydown', () => A.hide(), true);
  D.on('source', (s) => { if (s === 'pad' || s === 'remote') A.hide(); });

  // ---- scrolling at the edges --------------------------------------------------------------------------
  const edge = { on: false, since: 0, last: 0 };
  const canX = (el) => el.scrollWidth > el.clientWidth + 2 && /auto|scroll|hidden/.test(getComputedStyle(el).overflowX);
  const canY = (el) => el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY);
  function scrollers(x, y) {
    let el = document.elementFromPoint(x, y), sx = null, sy = null;
    while (el && el !== document.body && el !== root) {
      if (!sx && canX(el)) sx = el;
      if (!sy && canY(el)) sy = el;
      if (sx && sy) break;
      el = el.parentElement;
    }
    return { sx, sy };
  }
  // how far into the edge the pointer is, from 0 (not near) to 1 (right at it), and which way
  function push(lo, hi, at, zone) {
    if (at < lo + zone) return -Math.min(1, (lo + zone - at) / zone);
    if (at > hi - zone) return Math.min(1, (at - (hi - zone)) / zone);
    return 0;
  }
  A.edgeStep = function (now) {
    const a = A.get();
    if (!a.edge || !P.in || D.input.source !== 'mouse' || !onTV() || root.classList.contains('ptr-hide') && !edge.on || document.hidden || D.asleep || D.booting) { edge.on = false; edge.since = 0; return; }
    const { sx, sy } = scrollers(P.x, P.y);
    let dx = 0, dy = 0;
    if (sx) {
      const r = sx.getBoundingClientRect(), lo = Math.max(0, r.left), hi = Math.min(innerWidth, r.right);
      const d = push(lo, hi, P.x, Math.min(110, (hi - lo) * 0.1));
      if ((d < 0 && sx.scrollLeft > 0) || (d > 0 && sx.scrollLeft < sx.scrollWidth - sx.clientWidth - 1)) dx = d;
    }
    if (sy) {
      const r = sy.getBoundingClientRect(), lo = Math.max(0, r.top), hi = Math.min(innerHeight, r.bottom);
      const d = push(lo, hi, P.y, Math.min(90, (hi - lo) * 0.1));
      if ((d < 0 && sy.scrollTop > 0) || (d > 0 && sy.scrollTop < sy.scrollHeight - sy.clientHeight - 1)) dy = d;
    }
    if (!dx && !dy) { edge.on = false; edge.since = 0; return; }
    // wait a moment first, so passing over an edge on the way somewhere doesn't scroll
    if (!edge.since) { edge.since = now; edge.last = now; return; }
    if (now - edge.since < 260) { edge.last = now; return; }
    if (!edge.on) { edge.on = true; root.classList.remove('ptr-hide'); }
    const dt = Math.min(50, now - edge.last); edge.last = now;
    const speed = (v) => Math.sign(v) * (0.25 + 1.1 * Math.abs(v)) * dt; // up to about 1300 pixels a second
    if (dx) sx.scrollLeft += speed(dx);
    if (dy) sy.scrollTop += speed(dy);
  };
  (function loop(now) { A.edgeStep(now); requestAnimationFrame(loop); })(performance.now());

  // ---- the right button, and a mouse's back and forward buttons --------------------------------------
  const isField = (el) => el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable);
  window.addEventListener('contextmenu', (e) => {
    if (!onTV() || !A.get().right || isField(e.target) || e.defaultPrevented) return;
    e.preventDefault();
    D.input.fire('b', 'mouse');
  }, true);
  window.addEventListener('mouseup', (e) => {
    if (e.button !== 3 && e.button !== 4) return;
    e.preventDefault(); // or the browser leaves the page
    if (onTV()) D.input.fire('b', 'mouse');
  }, true);
  window.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault(); }, true);

  // ---- fitting the picture to the TV ----------------------------------------------------------------
  // Some TVs cut a little off every edge ("overscan"). This shrinks everything to fit.
  A.fit = function (v) {
    if (typeof v === 'number') { D.state.fit = Math.max(0.8, Math.min(1, Math.round(v * 100) / 100)); D.save(); }
    const f = D.state.fit || 1;
    if (f < 1) { root.style.setProperty('--fit', f); root.setAttribute('data-fit', ''); } else { root.style.removeProperty('--fit'); root.removeAttribute('data-fit'); }
    D.emit('fit', f);
    return f;
  };
  A.zoom = function (dir) {
    const f = A.fit(dir === 0 ? 1 : (D.state.fit || 1) + dir * 0.01);
    if (D.remote && D.remote.osd) D.remote.osd('tv', f >= 1 ? 'Picture fills the screen' : 'Picture size ' + Math.round(f * 100) + '%', (f - 0.8) / 0.2);
  };
  const ZOOM = { '=': 1, '+': 1, '-': -1, _: -1, 0: 0 };
  const realOS = () => D.sys && !(D.sys.info && D.sys.info.emulated);
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    let dir = null;
    if (k === 'ZoomIn' || k === 'ZoomOut') dir = k === 'ZoomIn' ? 1 : -1;
    else if ((e.ctrlKey || e.metaKey) && !e.altKey && k in ZOOM) {
      // in a web browser the page's zoom is yours; on DiceOS it would break the screen
      if (!realOS()) return;
      dir = ZOOM[k];
    }
    if (dir === null) return;
    e.preventDefault(); e.stopPropagation();
    if (onTV()) A.zoom(dir);
  }, true);
  window.addEventListener('wheel', (e) => { if (e.ctrlKey && realOS()) e.preventDefault(); }, { passive: false, capture: true });

  // ---- the power button --------------------------------------------------------------------------------
  let powerAt = 0;
  A.power = function () {
    // a press can arrive twice (diced and the browser both see it)
    if (Date.now() - powerAt < 900) return true;
    powerAt = Date.now();
    const p = A.get().power;
    if (p === 'off') return true;
    if (p === 'ask') {
      const cec = D.remote && D.remote.cec && D.remote.cec.available;
      const buttons = [{ label: 'Sleep', value: 'sleep', go: true }];
      if (cec) buttons.push({ label: 'Turn the TV off', value: 'tv' });
      if (D.sys) buttons.push({ label: 'Restart', value: 'reboot' }, { label: 'Shut down', value: 'shutdown', danger: true });
      buttons.push({ label: 'Cancel', value: null });
      D.ask({ title: 'Power', text: 'What would you like to do?', buttons }).then((v) => {
        if (v === 'sleep') D.sleep();
        else if (v === 'tv') D.sys.post('/api/remote', { cmd: 'tv-off' });
        else if (v === 'reboot' || v === 'shutdown') D.sys.power(v);
      });
      return true;
    }
    D.sleep();
    return true;
  };

  // when the desktop opens or closes, the pointer size may change
  D.on('desk', () => A.paint());
  D.on('state', (k) => { if (k === 'air') A.paint(); });
  A.paint(); A.fit();
})();
