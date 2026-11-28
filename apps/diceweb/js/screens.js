// Start-up and power screens.
//
// - Traced mode starts up like a film (cineBoot): the die lands under a spotlight, the name opens out, the
//   bars open onto paper, and only then is your world painted in over the screen (tracedPaint). Before 2.6 it
//   had a start-up of its own (tracedBoot, still here): your world drawn by hand in front of you. First a
//   pen traces its outline across a sheet of paper, then brushes paint it in, stroke by stroke;
//   the pixel die drops onto it, DiceOS's name and a hello appear, and the picture becomes your
//   desktop (it's the same world, so nothing jumps).
// - Restarting and shutting down show a screen of their own. In Traced mode it's your world
//   painting itself back out to paper, with the die turning. After a restart the hello says
//   "Welcome back".
// Any key, click or remote button skips the start-up.
(function () {
  'use strict';
  const D = window.Dice, G = D.G, S = D.S;
  const SC = D.screens = {};
  const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const smooth = (a, b, t) => { const x = Math.max(0, Math.min(1, (t - a) / (b - a))); return x * x * (3 - 2 * x); };
  function cv(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  const PAPER = [243, 238, 226], INK = [44, 46, 72];

  function hello(back) {
    const name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '', hr = new Date().getHours();
    if (back) return 'Welcome back' + name;
    return (hr < 5 ? 'Up late' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : hr < 22 ? 'Good evening' : 'Good night') + name;
  }
  // the die, big and sharp, tumbling (k from 0 to 1) or at rest
  const dieImg = (k, night) => G.die(64, k < 1 && window.DiceDie ? window.DiceDie.tumble(k) : null, { key: 'tr' + (k < 1 ? Math.round(k * 40) : 'rest') + (night ? 'n' : ''), ss: 2, outline: [44, 46, 72] });

  // ---- a world, ready to be drawn by hand -----------------------------------------------------------------------------
  // The finished picture, the pen lines in it (where the colour changes sharply), and brush strokes
  // that between them cover every pixel, in the order a painter might lay them down.
  function Sheet(cell) {
    const Wd = Math.ceil(innerWidth / cell), Hd = Math.ceil(innerHeight / cell);
    const world = D.WORLDS && D.WORLDS[D.state.world] ? D.state.world : 'hills';
    const scape = new G.Scape({ world, night: D.night(), W: Wd, H: Hd, seed: 'desk', traced: true });
    const pic = cv(Wd, Hd), pg = pic.getContext('2d');
    scape.draw(pg, 0, true);
    const d = pg.getImageData(0, 0, Wd, Hd).data, lum = new Float32Array(Wd * Hd);
    for (let i = 0; i < Wd * Hd; i++) lum[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15;
    // pen lines: where it changes sharply, column by column so the pen can sweep from left to right
    const pen = [];
    for (let x = 1; x < Wd - 1; x++) for (let y = 1; y < Hd - 1; y++) {
      const i = y * Wd + x, e = Math.max(Math.abs(lum[i] - lum[i - 1]), Math.abs(lum[i] - lum[i - Wd]));
      if (e > 30) pen.push(x, y);
    }
    // brush dabs, overlapping so they cover everything, laid down in a loose order (sky first, as painters do)
    const rand = G.seeded(G.hash(world + 'brush')), strokes = [], step = Math.max(4, Math.round(Hd / 70));
    for (let y = 0; y < Hd + step; y += step) for (let x = 0; x < Wd + step; x += step * 2) {
      const w = step * (2.6 + rand() * 1.4), h = step * (1.5 + rand() * 0.6);
      strokes.push([x + (rand() - 0.5) * step, y + (rand() - 0.5) * step * 0.6, w, h, y / Hd + rand() * 0.22 + (x / Wd) * 0.08, (rand() - 0.5) * 0.5]);
    }
    strokes.sort((a, b) => a[4] - b[4]);
    return { Wd, Hd, cell, scape, pic, pen, strokes };
  }

  // one dab of the brush: an oval of the picture (or of paper, painting it back out)
  function dab(g, s, pic) {
    const [x, y, w, h, , ang] = s;
    g.save();
    g.beginPath(); g.ellipse(x, y, w / 2, h / 2, ang, 0, Math.PI * 2); g.clip();
    const bx = Math.max(0, Math.floor(x - w / 2 - 1)), by = Math.max(0, Math.floor(y - w / 2 - 1)), bw = Math.ceil(w + 2), bh = Math.ceil(w + 2);
    if (pic) { const cw = Math.min(bw, pic.width - bx), ch = Math.min(bh, pic.height - by); if (cw > 0 && ch > 0) g.drawImage(pic, bx, by, cw, ch, bx, by, cw, ch); } else g.fillRect(bx, by, bw, bh);
    g.restore();
  }

  // ---- the Traced start-up --------------------------------------------------------------------------------------------
  SC.tracedBoot = function (kind, then) {
    const quick = kind === 'quick' || D.reduced();
    const back = D.state.byeAt && Date.now() - D.state.byeAt < 15 * 60000;
    if (back) { D.state.byeAt = 0; D.save(); }
    const el = D.h('<div id="trboot" role="img" aria-label="' + D.esc(D.brand + ' is starting') + '"><canvas class="tb-art"></canvas><canvas class="tb-top"></canvas><div class="tb-skip">Press any key to skip</div></div>');
    document.body.appendChild(el);
    const art = el.querySelector('.tb-art'), top = el.querySelector('.tb-top'), ag = art.getContext('2d'), tg = top.getContext('2d');
    const cell = D.scapeCell ? D.scapeCell() : 2;
    let sh = null;
    try { sh = Sheet(cell); } catch (e) { sh = null; }
    const night = D.night();
    const T = quick ? { pen: 0, paint: 0, drop: 0, word: 0, end: 900 } : { pen: 1500, paint: 1700, drop: 600, word: 700, end: 5600 };
    const P0 = 300, P1 = P0 + T.pen, B1 = P1 + T.paint, D1 = B1 + T.drop;
    let t0 = 0, raf = 0, done = false, landed = false, penAt = 0, brushAt = 0, out = 0;
    D.booting = true;
    function size() {
      const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (sh) { art.width = sh.Wd; art.height = sh.Hd; art.style.width = sh.Wd * cell + 'px'; art.style.height = sh.Hd * cell + 'px'; }
      top.width = Math.round(W * dpr); top.height = Math.round(H * dpr); top.style.width = W + 'px'; top.style.height = H + 'px';
      tg.setTransform(dpr, 0, 0, dpr, 0, 0);
      ag.fillStyle = 'rgb(' + PAPER.join(',') + ')'; ag.fillRect(0, 0, art.width, art.height);
      // the paper's grain
      const r = G.seeded(7);
      for (let i = 0; i < art.width * art.height * 0.06; i++) { ag.fillStyle = r() < 0.5 ? 'rgba(120,100,70,.06)' : 'rgba(255,255,255,.35)'; ag.fillRect((r() * art.width) | 0, (r() * art.height) | 0, 1, 1); }
      penAt = 0; brushAt = 0;
    }
    size();
    function frame(now) {
      if (!t0) t0 = now;
      const ms = now - t0;
      SC.at = ms;
      const W = innerWidth, H = innerHeight, u = Math.min(W, H) / 900;
      ag.imageSmoothingEnabled = false;
      if (sh) {
        // the pen: ink lines across the paper, left to right, a little ahead of the brush
        const pk = quick ? 1 : smooth(P0, P1, ms), n = Math.floor((sh.pen.length / 2) * pk), sweep = pk * sh.Wd;
        ag.fillStyle = 'rgba(' + INK.join(',') + ',.85)';
        for (; penAt < n; penAt++) { const x = sh.pen[penAt * 2], y = sh.pen[penAt * 2 + 1]; if (x <= sweep + 4 || pk >= 1) ag.fillRect(x, y, 1, 1); else break; }
        // the brushes: the picture laid in, stroke by stroke
        const bk = quick ? 1 : smooth(P1 - 300, B1, ms), m = Math.floor(sh.strokes.length * bk);
        for (; brushAt < m; brushAt++) dab(ag, sh.strokes[brushAt], sh.pic);
        if (bk >= 1 && !out) { ag.drawImage(sh.pic, 0, 0); out = 1; }
      }
      // the die drops onto the picture, with a small bounce, and settles
      tg.clearRect(0, 0, W, H);
      const dk = quick ? 1 : (ms - B1) / T.drop, sz = Math.max(96, Math.round((150 * u) / 32) * 32), cy = H * 0.42;
      if (dk > 0) {
        const fall = Math.min(1, dk), bounce = dk > 1 ? Math.max(0, Math.sin((dk - 1) * Math.PI * 2.2) * Math.exp(-(dk - 1) * 3.2)) * 0.06 : 0;
        const y = (fall < 1 ? -sz + (cy + sz) * (fall * fall) : cy) - bounce * H;
        if (fall >= 1 && !landed) { landed = true; S.play('traced'); }
        // its shadow on the ground, in dithered dots
        if (fall > 0.3) { tg.fillStyle = 'rgba(30,30,50,' + (0.22 * fall) + ')'; const sw = sz * 0.8 * fall; for (let q = -sw / 2; q < sw / 2; q += 4) for (let j = 0; j < 3; j++) if (((q / 4) + j) % 2 === 0) tg.fillRect(Math.round(W / 2 + q), Math.round(cy + sz * 0.55 + j * 4), 4, 4); }
        tg.imageSmoothingEnabled = false;
        tg.drawImage(dieImg(fall < 1 ? fall : 1, night), Math.round(W / 2 - sz / 2), Math.round(y - sz / 2), sz, sz);
      }
      // the name on a paper label, then the hello
      const wk = quick ? 1 : smooth(D1, D1 + T.word, ms);
      if (wk > 0) {
        const fs = Math.round(52 * u + 16), ty = cy + sz * 0.62 + fs * 0.9, text = D.brand;
        tg.font = '500 ' + fs + 'px ' + getComputedStyle(document.documentElement).getPropertyValue('--pixel');
        const lw = Math.max(tg.measureText(text).width, (tg.measureText(hello(back)).width || 0) * 0.62) + fs * 1.4, lh = fs * 2.25;
        // a hand-cut label, with an ink line round it
        const lx = Math.round(W / 2 - lw / 2), ly = Math.round(ty - fs * 0.85);
        tg.globalAlpha = Math.min(1, wk * 1.6);
        tg.fillStyle = 'rgba(' + INK.join(',') + ',.9)'; tg.fillRect(lx - 3, ly - 3, Math.round(lw) + 6, Math.round(lh) + 6);
        tg.fillStyle = 'rgb(' + PAPER.join(',') + ')'; tg.fillRect(lx, ly, Math.round(lw), Math.round(lh));
        tg.fillStyle = 'rgba(255,255,255,.7)'; tg.fillRect(lx, ly, Math.round(lw), 3);
        tg.fillStyle = 'rgba(120,100,70,.18)'; tg.fillRect(lx, ly + Math.round(lh) - 3, Math.round(lw), 3);
        tg.textAlign = 'center'; tg.textBaseline = 'middle';
        tg.fillStyle = 'rgb(' + INK.join(',') + ')';
        tg.fillText(text.slice(0, Math.ceil(wk * text.length)), W / 2, ty);
        const hk = quick ? 1 : smooth(D1 + T.word * 0.6, D1 + T.word * 1.6, ms);
        if (hk > 0) { tg.globalAlpha = hk; tg.font = '600 ' + Math.round(fs * 0.4) + 'px ' + getComputedStyle(document.documentElement).getPropertyValue('--read'); tg.fillStyle = 'rgba(' + INK.join(',') + ',.75)'; tg.fillText(hello(back), W / 2, ty + fs * 0.92); }
        tg.globalAlpha = 1;
      }
      // a pencil line under it all that fills as it goes
      const prog = Math.min(1, ms / T.end), bw = Math.round(200 * u + 60), by = H - 64;
      tg.fillStyle = 'rgba(' + INK.join(',') + ',.18)'; tg.fillRect(Math.round(W / 2 - bw / 2), by, bw, 3);
      tg.fillStyle = 'rgba(' + INK.join(',') + ',.8)'; for (let q = 0; q < bw * prog; q += 2) tg.fillRect(Math.round(W / 2 - bw / 2 + q), by + (q % 6 === 0 ? 0 : 1), 2, 2);
      if (ms >= T.end) return finish();
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      D.booting = false; D.skipBoot = () => {};
      if (!landed && !quick) S.play('traced');
      el.classList.add('gone');
      setTimeout(() => el.remove(), 800);
      then && then();
    }
    addEventListener('resize', size);
    // skipping finishes the picture and goes
    D.skipBoot = () => { if (!t0) t0 = performance.now(); t0 = Math.min(t0, performance.now() - T.end); };
    const skip = (e) => { if (D.booting) { e.preventDefault(); D.skipBoot(); } };
    el.addEventListener('pointerdown', skip); el.addEventListener('wheel', skip, { passive: false });
    const key = (e) => { if (!done && D.booting) { e.preventDefault(); D.skipBoot(); } };
    addEventListener('keydown', key, { once: true, capture: true });
    raf = requestAnimationFrame(frame);
  };

  // ---- Traced mode's start-up: Dice's own, filmed like the opening of a film --------------------------------------
  // Letterbox bars close in on the dark; the die tumbles down in slow motion under a spotlight and lands;
  // a band of light sweeps across it; DiceOS's name opens out letter by letter with the hello under it.
  // Then the bars open, the screen turns to paper, and only now does the painting happen: your world is
  // traced and brushed in over the real desktop (or DiceTV), which is ready underneath when the paint dries.
  SC.cineBoot = function (kind, then) {
    const quick = kind === 'quick' || D.reduced();
    const back = D.state.byeAt && Date.now() - D.state.byeAt < 15 * 60000;
    if (back) { D.state.byeAt = 0; D.save(); }
    const el = D.h('<div id="cineboot" role="img" aria-label="' + D.esc(D.brand + ' is starting') + '"><canvas></canvas><div class="tb-skip cb-skip">Press any key to skip</div></div>');
    document.body.appendChild(el);
    const c = el.querySelector('canvas'), g = c.getContext('2d'), night = D.night();
    const T = quick ? { bars: 1, drop: 1, land: 1, sweep: 1, word: 1, hold: 1, open: 260 } : { bars: 700, drop: 1500, land: 0, sweep: 700, word: 900, hold: 550, open: 650 };
    const A = T.bars, B = A + T.drop, C = B + T.sweep, W1 = C + T.word, H1 = W1 + T.hold, END = H1 + T.open;
    let t0 = 0, raf = 0, done = false, landed = false, painted = false;
    const grain = (() => { const n = cv(160, 90), ng = n.getContext('2d'), r = G.seeded(11); for (let i = 0; i < 2600; i++) { ng.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.18)'; ng.fillRect((r() * 160) | 0, (r() * 90) | 0, 1, 1); } return n; })();
    D.booting = true;
    function size() { const dpr = Math.min(2, devicePixelRatio || 1); c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
    size();
    const font = (w, px, fam) => w + ' ' + px + 'px ' + getComputedStyle(document.documentElement).getPropertyValue(fam);
    function frame(now) {
      if (!t0) t0 = now;
      const ms = now - t0, W = innerWidth, H = innerHeight, u = Math.min(W, H) / 900;
      SC.at = ms;
      // the dark, with a slow push in
      const push = 1.06 - 0.06 * smooth(0, END, ms);
      const bg = g.createRadialGradient(W / 2, H * 0.44, 10, W / 2, H * 0.44, Math.max(W, H) * 0.75);
      bg.addColorStop(0, night ? '#1f2440' : '#2a2f4e'); bg.addColorStop(0.55, '#10121f'); bg.addColorStop(1, '#05060b');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.save(); g.translate(W / 2, H * 0.44); g.scale(push, push); g.translate(-W / 2, -H * 0.44);
      // a spotlight comes up where the die will land
      const spot = smooth(A * 0.4, B, ms), cy = H * 0.42, sz = Math.max(128, Math.round((190 * u) / 32) * 32);
      if (spot > 0) {
        const sp = g.createRadialGradient(W / 2, cy + sz * 0.5, 4, W / 2, cy + sz * 0.5, sz * 1.9);
        sp.addColorStop(0, 'rgba(255,236,196,' + (0.34 * spot) + ')'); sp.addColorStop(1, 'rgba(255,236,196,0)');
        g.fillStyle = sp; g.fillRect(0, 0, W, H);
      }
      // the die: down in slow motion, turning, then a bounce and the thud
      const dk = quick ? 1 : (ms - A) / T.drop;
      if (dk > 0) {
        const k = Math.min(1, dk), fall = 1 - Math.pow(1 - Math.min(1, k / 0.72), 2.2);
        let y = -sz + (cy + sz) * fall;
        if (k > 0.72) y = cy - Math.abs(Math.sin((k - 0.72) / 0.28 * Math.PI)) * sz * 0.12 * (1 - (k - 0.72) / 0.28);
        if (k > 0.7 && !landed) { landed = true; S.play('land'); }
        const sh = Math.min(1, fall);
        g.fillStyle = 'rgba(0,0,0,' + (0.45 * sh) + ')';
        g.beginPath(); g.ellipse(W / 2, cy + sz * 0.56, sz * 0.42 * sh, sz * 0.07 * sh, 0, 0, Math.PI * 2); g.fill();
        g.imageSmoothingEnabled = false;
        const img = k < 1 ? G.die(64, window.DiceDie ? window.DiceDie.tumble(k) : null, { key: 'cb' + Math.round(k * 48) + (night ? 'n' : ''), ss: 2, outline: [58, 58, 70] }) : G.die(64, null, { key: 'cb-rest' + (night ? 'n' : ''), ss: 3, outline: [58, 58, 70], ray: true });
        g.drawImage(img, Math.round(W / 2 - sz / 2), Math.round(y - sz / 2), sz, sz);
        // a band of light across it
        const sk = quick ? 1 : smooth(B, C, ms);
        if (sk > 0 && sk < 1) {
          g.save(); g.beginPath(); g.rect(W / 2 - sz / 2, cy - sz / 2, sz, sz); g.clip();
          const bx = W / 2 - sz + sk * sz * 2, band = g.createLinearGradient(bx - sz * 0.25, 0, bx + sz * 0.25, 0);
          band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,.55)'); band.addColorStop(1, 'rgba(255,255,255,0)');
          g.globalCompositeOperation = 'lighter'; g.fillStyle = band; g.fillRect(W / 2 - sz / 2, cy - sz / 2, sz, sz); g.restore();
        }
      }
      // the name, opening out letter by letter, then the hello
      const wk = quick ? 1 : smooth(B + T.sweep * 0.4, W1, ms);
      if (wk > 0) {
        const fs = Math.round(62 * u + 18), ty = cy + sz * 0.62 + fs * 0.95, text = D.brand;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = font('500', fs, '--pixel');
        const track = (1 - ease(wk)) * fs * 0.6;
        let x = W / 2 - (g.measureText(text).width + track * (text.length - 1)) / 2;
        [...text].forEach((ch, i) => {
          const a = Math.max(0, Math.min(1, wk * text.length - i));
          const cw = g.measureText(ch).width;
          g.globalAlpha = a; g.fillStyle = '#f4efe2'; g.fillText(ch, x + cw / 2, ty + (1 - a) * 8);
          x += cw + track;
        });
        g.globalAlpha = smooth(W1 - T.word * 0.3, H1, ms) * 0.8;
        g.font = font('600', Math.round(fs * 0.34), '--read');
        g.fillStyle = '#d8d2c4'; g.fillText(hello(back), W / 2, ty + fs * 0.9);
        g.globalAlpha = 1;
      }
      g.restore();
      // film grain, and the letterbox bars: in at the start, out at the end
      g.globalAlpha = 0.5; g.imageSmoothingEnabled = false; g.drawImage(grain, ((ms / 40) | 0) % 7 - 6, ((ms / 60) | 0) % 5 - 4, W + 12, H + 12); g.globalAlpha = 1;
      const bar = H * 0.11 * (quick ? 1 : ease(ms / T.bars)) * (1 - ease((ms - H1) / T.open));
      g.fillStyle = '#000'; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
      // the end: the dark lifts away as the bars open, onto paper
      const lift = quick ? smooth(0, T.open, ms) : smooth(H1, END, ms);
      if (lift > 0) { g.fillStyle = 'rgba(' + PAPER.join(',') + ',' + lift + ')'; g.fillRect(0, 0, W, H); }
      if (ms >= END) return finish();
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      D.booting = false; D.skipBoot = () => {};
      // now the painting: the world, traced and brushed in over the screen that's ready underneath
      then && then();
      SC.tracedPaint(quick, () => { el.remove(); });
      setTimeout(() => el.remove(), 60);
    }
    addEventListener('resize', size);
    D.skipBoot = () => { if (!t0) t0 = performance.now(); t0 = Math.min(t0, performance.now() - END); };
    const skip = (e) => { if (D.booting) { e.preventDefault(); D.skipBoot(); } };
    el.addEventListener('pointerdown', skip); el.addEventListener('wheel', skip, { passive: false });
    addEventListener('keydown', (e) => { if (!done && D.booting) { e.preventDefault(); D.skipBoot(); } }, { once: true, capture: true });
    raf = requestAnimationFrame(frame);
  };
  // the painting on its own, after the start-up: pen lines, then the brush, then the real screen shows through
  SC.tracedPaint = function (quick, then) {
    const el = D.h('<div id="trboot" class="paint" aria-hidden="true"><canvas class="tb-art"></canvas></div>');
    document.body.appendChild(el);
    const art = el.querySelector('canvas'), ag = art.getContext('2d'), cell = D.scapeCell ? D.scapeCell() : 2;
    let sh = null;
    try { sh = Sheet(cell); } catch (e) { sh = null; }
    if (!sh || D.reduced()) { el.remove(); then && then(); return; }
    art.width = sh.Wd; art.height = sh.Hd; art.style.width = sh.Wd * cell + 'px'; art.style.height = sh.Hd * cell + 'px';
    ag.fillStyle = 'rgb(' + PAPER.join(',') + ')'; ag.fillRect(0, 0, art.width, art.height);
    const r = G.seeded(7);
    for (let i = 0; i < art.width * art.height * 0.06; i++) { ag.fillStyle = r() < 0.5 ? 'rgba(120,100,70,.06)' : 'rgba(255,255,255,.35)'; ag.fillRect((r() * art.width) | 0, (r() * art.height) | 0, 1, 1); }
    const T = quick ? { pen: 350, paint: 450 } : { pen: 1100, paint: 1500 }, P1 = T.pen, B1 = P1 + T.paint;
    let t0 = 0, penAt = 0, brushAt = 0, sounded = false, stop = false;
    const skip = () => { t0 = performance.now() - B1; };
    addEventListener('keydown', skip, { once: true, capture: true });
    el.addEventListener('pointerdown', skip);
    (function frame(now) {
      if (stop) return;
      if (!t0) t0 = now;
      const ms = now - t0;
      ag.imageSmoothingEnabled = false;
      const pk = smooth(0, P1, ms), n = Math.floor((sh.pen.length / 2) * pk), sweep = pk * sh.Wd;
      ag.fillStyle = 'rgba(' + INK.join(',') + ',.85)';
      for (; penAt < n; penAt++) { const x = sh.pen[penAt * 2], y = sh.pen[penAt * 2 + 1]; if (x <= sweep + 4 || pk >= 1) ag.fillRect(x, y, 1, 1); else break; }
      const bk = smooth(P1 - 250, B1, ms), m = Math.floor(sh.strokes.length * bk);
      for (; brushAt < m; brushAt++) dab(ag, sh.strokes[brushAt], sh.pic);
      if (bk > 0.4 && !sounded) { sounded = true; S.play('traced'); }
      if (ms >= B1) { ag.drawImage(sh.pic, 0, 0); stop = true; removeEventListener('keydown', skip, true); el.classList.add('gone'); setTimeout(() => { el.remove(); then && then(); }, 750); return; }
      requestAnimationFrame(frame);
    })(performance.now());
  };

  // ---- restarting and shutting down ---------------------------------------------------------------------------------
  const WORDS = {
    restart: ['Restarting', (n) => 'See you in a moment' + n + '.'],
    'restart-desktop': ['Restarting the desktop', () => 'Back in a few seconds.'],
    shutdown: ['Shutting down', (n) => 'Goodbye' + n + '.'],
  };
  SC.power = function (kind, go) {
    const w = WORDS[kind] || WORDS.restart, name = D.state.name && D.state.name !== 'player' ? ', ' + D.state.name : '';
    const traced = D.state.looks === 'traced';
    if (kind !== 'restart-desktop') { D.state.byeAt = Date.now(); D.save(true); }
    D.$('#power-screen') && D.$('#power-screen').remove();
    const el = D.h('<div id="power-screen" class="' + (traced ? 'traced' : 'plain') + '" role="alert" aria-live="assertive"><canvas class="ps-sky"></canvas>' +
      '<div class="ps-in"><canvas class="ps-die" width="64" height="64"></canvas><h1></h1><p></p><div class="ps-dots" aria-hidden="true"><i></i><i></i><i></i></div></div></div>');
    el.querySelector('h1').textContent = w[0];
    el.querySelector('p').textContent = w[1](name);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    S.play('bye');
    const sky = el.querySelector('.ps-sky'), dc = el.querySelector('.ps-die'), dg = dc.getContext('2d');
    const night = D.night(), t0 = performance.now();
    // Traced: the world, painted back out to paper, stroke by stroke
    let sh = null, sg = null, undone = 0;
    if (traced) {
      try {
        const cell = D.scapeCell ? D.scapeCell() : 2;
        sh = Sheet(cell);
        sky.width = sh.Wd; sky.height = sh.Hd; sky.style.width = sh.Wd * cell + 'px'; sky.style.height = sh.Hd * cell + 'px';
        sg = sky.getContext('2d'); sg.imageSmoothingEnabled = false; sg.drawImage(sh.pic, 0, 0);
      } catch (e) { sh = null; }
    }
    let raf = 0;
    const frame = (now) => {
      const ms = now - t0, t = ms / 1000;
      if (sh) {
        const k = smooth(400, 2400, ms), m = Math.floor(sh.strokes.length * k);
        sg.fillStyle = 'rgb(' + PAPER.join(',') + ')';
        for (; undone < m; undone++) dab(sg, sh.strokes[sh.strokes.length - 1 - undone], null);
      }
      // the die turning slowly
      dg.clearRect(0, 0, 64, 64); dg.imageSmoothingEnabled = false;
      const k = (t * 0.35) % 1;
      dg.drawImage(G.die(64, window.DiceDie ? window.DiceDie.tumble(k) : null, { key: 'ps' + Math.round(k * 40) + (night ? 'n' : ''), ss: 2, outline: [58, 58, 68] }), 0, 0);
      if (!D.reduced()) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    // a moment to see it (and for everything to be saved), then do it
    setTimeout(() => {
      try { go && go(); } finally {
        // on the website the computer doesn't really go away: the screen does
        if (!D.sys || D.sys.info.emulated || kind === 'restart-desktop') setTimeout(() => { el.classList.remove('on'); setTimeout(() => { cancelAnimationFrame(raf); el.remove(); }, 500); }, kind === 'restart-desktop' && D.sys && !D.sys.info.emulated ? 4000 : 1200);
      }
    }, D.reduced() ? 600 : traced ? 2600 : 1600);
  };
  SC.Sheet = Sheet;
})();
