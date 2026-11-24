// Channels: live pictures to leave on, like TV channels. A crackling fireplace,
// an aquarium, rain on a window at night, the northern lights, deep space, every
// world and every city. They're drawn here as they play, so there's nothing to
// download and they never run out. Then the news: the 24-hour live streams news
// channels put on YouTube themselves, in YouTube's own player. Up and down (or
// CH + and CH −, or a number) change channel; OK shows the guide.
// D.channels.make() is used elsewhere too (Axiom's study sessions).
(function () {
  'use strict';
  const D = window.Dice, G = D.G, M = D.M, S = D.S, h = D.h, esc = D.esc;
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---- 1. a fireplace (the flames are the old Doom fire, from the bottom up, in big chunky blocks) ----
  // a few flat colours, like an old game, rather than a smooth blend
  const FIRE = [null, [92, 14, 10], [158, 30, 14], [222, 66, 24], [246, 124, 32], [255, 182, 54], [255, 226, 122], [255, 247, 214]];
  const BAND = (v) => (v < 4 ? 0 : v < 9 ? 1 : v < 14 ? 2 : v < 19 ? 3 : v < 25 ? 4 : v < 30 ? 5 : v < 34 ? 6 : 7);
  function fireplace(W, H) {
    const bg = G.canvas(W, H), b = bg.getContext('2d');
    const hx = Math.round(W * 0.28), hw = Math.round(W * 0.44), hy = Math.round(H * 0.38), hh = Math.round(H * 0.44);
    // the wall: warm bricks
    b.fillStyle = '#2a1712'; b.fillRect(0, 0, W, H);
    for (let y = 0, r = 0; y < H; y += 6, r++) for (let x = -(r % 2) * 6; x < W; x += 12) {
      const k = 0.75 + 0.25 * Math.abs(Math.sin(x * 12.9 + y * 7.1));
      b.fillStyle = 'rgb(' + Math.round(92 * k) + ',' + Math.round(46 * k) + ',' + Math.round(34 * k) + ')'; b.fillRect(x + 1, y + 1, 10, 4);
    }
    // the surround, the opening and the mantel
    b.fillStyle = '#3b3430'; b.fillRect(hx - 10, hy - 8, hw + 20, hh + 8);
    b.fillStyle = '#4a423c'; b.fillRect(hx - 10, hy - 8, hw + 20, 2);
    b.fillStyle = '#080506'; b.fillRect(hx, hy, hw, hh);
    for (let i = 0; i < hh; i += 3) { b.fillStyle = 'rgba(40,20,14,' + (0.5 * (1 - i / hh)) + ')'; b.fillRect(hx, hy + i, hw, 3); }
    b.fillStyle = '#5a3a26'; b.fillRect(hx - 22, hy - 16, hw + 44, 8);
    b.fillStyle = '#6e4a32'; b.fillRect(hx - 22, hy - 16, hw + 44, 2);
    b.fillStyle = '#3a2416'; b.fillRect(hx - 22, hy - 9, hw + 44, 1);
    // a rug and the floor
    b.fillStyle = '#1b1210'; b.fillRect(0, hy + hh, W, H - hy - hh);
    b.fillStyle = '#5e2a2a'; b.fillRect(Math.round(W * 0.2), hy + hh + 6, Math.round(W * 0.6), H - hy - hh - 6);
    b.fillStyle = '#7a3b34'; for (let x = Math.round(W * 0.2) + 3; x < W * 0.8 - 3; x += 6) b.fillRect(x, hy + hh + 9, 3, 2);
    // a candle and a clock on the mantel
    b.fillStyle = '#e8dcc0'; b.fillRect(hx + 6, hy - 26, 4, 10); b.fillRect(hx + hw - 14, hy - 24, 3, 8);
    b.fillStyle = '#2c2420'; b.fillRect(hx + hw / 2 - 7, hy - 30, 14, 14); b.fillStyle = '#d9cdb0'; b.fillRect(hx + hw / 2 - 5, hy - 28, 10, 10);
    b.fillStyle = '#2c2420'; b.fillRect(hx + hw / 2, hy - 26, 1, 4); b.fillRect(hx + hw / 2, hy - 23, 3, 1);
    // the fire is worked out on a coarse grid (each square is px × px), then blown up without smoothing
    const px = Math.max(3, Math.round(hw / 46));
    const fw = Math.max(8, Math.floor((hw - 6) / px)), fh = Math.max(8, Math.floor((hh - 4) / px));
    const fire = new Uint8Array(fw * fh), fc = G.canvas(fw, fh), fg = fc.getContext('2d'), img = fg.createImageData(fw, fh);
    const fx = hx + Math.round((hw - fw * px) / 2), fy = hy + hh - fh * px;
    // the logs, built from the same big squares: two along the bottom and one across them
    const logs = G.canvas(hw, px * 5), lg = logs.getContext('2d');
    const log = (x0, x1, row) => {
      const a = Math.round(x0 * fw) * px, w = Math.round((x1 - x0) * fw) * px, y = row * px;
      lg.fillStyle = '#3a2214'; lg.fillRect(a, y, w, px * 2);
      lg.fillStyle = '#5c3820'; lg.fillRect(a, y, w, px);
      lg.fillStyle = '#2a170d'; for (let x = a + px * 2; x < a + w - px * 2; x += px * 5) lg.fillRect(x, y + px, px * 2, px);
      lg.fillStyle = '#c9a27a'; lg.fillRect(a, y, px, px * 2); lg.fillRect(a + w - px, y, px, px * 2);
      lg.fillStyle = '#8a6040'; lg.fillRect(a, y + px, px, px); lg.fillRect(a + w - px, y, px, px);
    };
    log(0.30, 0.72, 0); log(0.08, 0.50, 2); log(0.50, 0.92, 2);
    const ly = hy + hh - px * 5;
    const cool = 36 / (fh * 0.85); // how fast it cools on the way up, so the tallest flames lick the top
    const sparks = [];
    let last = 0, acc = 0;
    function tick() {
      // feed the fire: hot where the logs are, cooler at the ends
      for (let x = 0; x < fw; x++) { const k = Math.sin(((x + 0.5) / fw) * Math.PI); fire[(fh - 1) * fw + x] = Math.max(0, Math.min(36, Math.round(36 * Math.pow(k, 0.5) - rnd(0, 7)))); }
      for (let x = 0; x < fw; x++) for (let y = 1; y < fh; y++) {
        const i = y * fw + x, v = fire[i];
        if (!v) { fire[i - fw] = 0; continue; }
        const dst = i - fw + ((Math.random() * 3) | 0) - 1;
        if (dst >= 0 && dst < fire.length) fire[dst] = Math.max(0, v - Math.floor(Math.random() * (2 * cool + 1)));
      }
      // now and then a spark jumps out of the hottest part
      if (Math.random() < 0.22 && sparks.length < 14) sparks.push({ x: fx + Math.round(rnd(0.25, 0.75) * fw) * px, y: fy + (fh - 3) * px, vy: rnd(10, 22), wob: rnd(0, 6), life: 0, max: rnd(1.1, 2.4) });
    }
    return {
      draw(g, t) {
        const dt = Math.min(0.25, last ? t - last : 0); last = t;
        // the flames move at a steady, slightly jerky 16 steps a second, like an old game
        acc += dt; let n = 0;
        while (acc > 1 / 16 && n < 3) { acc -= 1 / 16; tick(); n++; }
        if (!n && !fire[(fh - 1) * fw + (fw >> 1)]) tick();
        const d = img.data;
        for (let i = 0; i < fire.length; i++) { const c = FIRE[BAND(fire[i])], o = i * 4; if (!c) { d[o + 3] = 0; continue; } d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255; }
        fg.putImageData(img, 0, 0);
        g.drawImage(bg, 0, 0);
        const smooth = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = false;
        g.drawImage(fc, 0, 0, fw, fh, fx, fy, fw * px, fh * px);
        g.imageSmoothingEnabled = smooth;
        // a bed of embers glowing under the logs, square by square
        for (let x = 0; x < fw; x++) {
          const k = Math.sin(((x + 0.5) / fw) * Math.PI), f = 0.5 + 0.5 * Math.sin(t * 3.1 + x * 1.7) * Math.sin(t * 1.3 + x * 0.6);
          if (k < 0.25) continue;
          g.fillStyle = f > 0.75 ? '#ffb636' : f > 0.4 ? '#de4218' : '#7a1a0c';
          g.fillRect(fx + x * px, hy + hh - px, px, px);
        }
        g.drawImage(logs, fx, ly);
        // sparks: single squares that rise, drift and go dim
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i]; s.life += dt; s.y -= s.vy * dt;
          if (s.life > s.max || s.y < hy + 2) { sparks.splice(i, 1); continue; }
          const sx = Math.round((s.x + Math.sin(t * 4 + s.wob) * px) / px) * px, sy = Math.round(s.y / px) * px, k = s.life / s.max;
          g.fillStyle = k < 0.35 ? '#fff6d6' : k < 0.7 ? '#ffb636' : '#de4218';
          g.fillRect(sx, sy, Math.max(2, px - 1), Math.max(2, px - 1));
        }
        // the room glows with it
        const f = 0.13 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1) + rnd(0, 0.02);
        const glow = g.createRadialGradient(hx + hw / 2, hy + hh, 4, hx + hw / 2, hy + hh, W * 0.7);
        glow.addColorStop(0, 'rgba(255,140,50,' + f + ')'); glow.addColorStop(1, 'rgba(255,120,40,0)');
        g.globalCompositeOperation = 'lighter'; g.fillStyle = glow; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
        // the candle flames
        g.fillStyle = '#ffd36b'; g.fillRect(hx + 7, hy - 28 + (Math.sin(t * 9) > 0.6 ? -1 : 0), 2, 2); g.fillRect(hx + hw - 13, hy - 26, 1, 2);
      },
    };
  }

  // ---- 2. an aquarium ----------------------------------------------------------------------------------
  function aquarium(W, H) {
    const COLS = [['#ff8a3d', '#ffffff'], ['#ffd23f', '#2b6cb0'], ['#5ad1e8', '#1d4e89'], ['#ff5d8f', '#ffd0e0'], ['#9be564', '#2f6b2f'], ['#c48cff', '#ffffff'], ['#ff6b4a', '#1a1a1a']];
    const fish = Array.from({ length: Math.max(7, Math.round(W / 40)) }, (_, i) => ({ x: rnd(0, W), y: rnd(H * 0.15, H * 0.72), v: rnd(6, 18) * (Math.random() < 0.5 ? -1 : 1), L: Math.round(rnd(9, 17)), c: COLS[i % COLS.length], ph: rnd(0, 6) }));
    const bubbles = [], plants = Array.from({ length: Math.round(W / 26) }, (_, i) => ({ x: Math.round((i + rnd(0.1, 0.9)) * 26), hgt: rnd(H * 0.15, H * 0.42), c: i % 3 ? '#2f8f5a' : '#4fb06a', ph: rnd(0, 6) }));
    const bg = G.canvas(W, H), b = bg.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#2fa3c4'); grad.addColorStop(0.55, '#14628f'); grad.addColorStop(1, '#0b3557');
    b.fillStyle = grad; b.fillRect(0, 0, W, H);
    const sy = Math.round(H * 0.86);
    for (let x = 0; x < W; x++) { const top = sy + Math.round(Math.sin(x * 0.05) * 3 + Math.sin(x * 0.21) * 1); b.fillStyle = '#d8c08a'; b.fillRect(x, top, 1, H - top); b.fillStyle = '#c4a970'; if (x % 3 === 0) b.fillRect(x, top + 3 + (x * 7) % 9, 1, 1); }
    [[0.18, '#7d8a96'], [0.7, '#8e7d6e'], [0.82, '#6f7b85']].forEach(([fx, c]) => { const x = W * fx, r = H * 0.06; b.fillStyle = c; b.beginPath(); b.ellipse(x, sy + 2, r * 1.6, r, 0, Math.PI, 0); b.fill(); });
    // a little sunken castle
    const cx = Math.round(W * 0.6), ch = Math.round(H * 0.16);
    b.fillStyle = '#9a8f86'; b.fillRect(cx, sy - ch, 26, ch); b.fillRect(cx - 6, sy - ch - 10, 10, ch + 10); b.fillRect(cx + 22, sy - ch - 8, 10, ch + 8);
    b.fillStyle = '#6e655e'; for (const x of [cx - 6, cx - 2, cx + 22, cx + 26, cx + 30]) b.fillRect(x, sy - ch - (x < cx ? 13 : 11), 2, 3);
    b.fillStyle = '#1b2a33'; b.fillRect(cx + 9, sy - 12, 8, 12); b.fillRect(cx - 3, sy - ch - 4, 3, 4);
    return {
      draw(g, t) {
        g.drawImage(bg, 0, 0);
        // light coming down through the water
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 6; i++) { const x = ((i * W / 5 + t * 6 * (i % 2 ? 1 : -0.6)) % (W + 60)) - 30; g.fillStyle = 'rgba(160,235,255,0.05)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 60, H * 0.9); g.lineTo(x + 30, H * 0.9); g.fill(); }
        g.globalCompositeOperation = 'source-over';
        // waving plants
        for (const p of plants) for (let k = 0; k < p.hgt; k++) { const sway = Math.sin(t * 1.3 + p.ph + k * 0.08) * (k / p.hgt) * 5; g.fillStyle = k % 5 === 0 ? '#5cc47a' : p.c; g.fillRect(Math.round(p.x + sway), Math.round(H * 0.88 - k), 2, 1); }
        // fish
        for (const f of fish) {
          f.x += f.v / 30; f.y += Math.sin(t * 1.7 + f.ph) * 0.08;
          if (f.x > W + 20) f.v = -Math.abs(f.v); if (f.x < -20) f.v = Math.abs(f.v);
          const dir = f.v > 0 ? 1 : -1, L = f.L, hgt = Math.max(3, Math.round(L * 0.42)), x0 = Math.round(f.x), y0 = Math.round(f.y), wag = Math.sin(t * 8 + f.ph) > 0 ? 1 : 0;
          for (let i = 0; i < L; i++) { const half = Math.round(Math.sin((i / L) * Math.PI) * hgt / 2); g.fillStyle = i % 4 === 2 ? f.c[1] : f.c[0]; g.fillRect(x0 + dir * (i - L / 2), y0 - half, 1, half * 2 + 1); }
          g.fillStyle = f.c[0]; for (let k = 0; k < 4; k++) g.fillRect(x0 - dir * (L / 2 + k), y0 - k - wag, 1, k * 2 + 1);
          g.fillStyle = '#0d1b24'; g.fillRect(x0 + dir * (L / 2 - 3), y0 - 1, 1, 1);
        }
        // bubbles
        if (Math.random() < 0.25) bubbles.push({ x: W * 0.6 + 12 + rnd(-2, 2), y: H * 0.86 - H * 0.16, r: Math.random() < 0.3 ? 2 : 1 });
        if (Math.random() < 0.08) bubbles.push({ x: rnd(0, W), y: H * 0.88, r: 1 });
        for (let i = bubbles.length - 1; i >= 0; i--) { const q = bubbles[i]; q.y -= 0.6 + q.r * 0.3; q.x += Math.sin(q.y * 0.15) * 0.3; if (q.y < 2) { bubbles.splice(i, 1); continue; } g.fillStyle = 'rgba(220,250,255,.75)'; g.fillRect(Math.round(q.x), Math.round(q.y), q.r, q.r); }
      },
    };
  }

  // ---- 3. rain on a window, the city lights blurred behind it --------------------------------------
  function rainy(W, H) {
    const bg = G.canvas(W, H), b = bg.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0c1020'); grad.addColorStop(1, '#1d1830'); b.fillStyle = grad; b.fillRect(0, 0, W, H);
    const lights = ['255,196,110', '255,140,90', '120,180,255', '255,230,170', '190,120,255'];
    for (let i = 0; i < W / 4; i++) {
      const x = rnd(0, W), y = rnd(H * 0.35, H), r = rnd(4, 14), c = lights[i % lights.length];
      const gr = b.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + c + ',.55)'); gr.addColorStop(0.7, 'rgba(' + c + ',.25)'); gr.addColorStop(1, 'rgba(' + c + ',0)');
      b.fillStyle = gr; b.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const drops = Array.from({ length: Math.round(W * H / 220) }, () => ({ x: Math.round(rnd(0, W)), y: Math.round(rnd(0, H)), r: Math.random() < 0.2 ? 2 : 1 }));
    const runs = [], streaks = Array.from({ length: Math.round(W / 3) }, () => ({ x: rnd(0, W), y: rnd(0, H), v: rnd(120, 200) }));
    let last = 0;
    return {
      draw(g, t) {
        const dt = Math.min(0.1, t - last || 0.05); last = t;
        g.drawImage(bg, 0, 0);
        // rain falling outside
        g.fillStyle = 'rgba(170,190,230,.22)';
        for (const s of streaks) { s.y += s.v * dt; s.x += s.v * dt * 0.15; if (s.y > H) { s.y = -6; s.x = rnd(-20, W); } g.fillRect(Math.round(s.x), Math.round(s.y), 1, 4); }
        // drops sitting on the glass
        for (const d of drops) { g.fillStyle = 'rgba(200,220,255,.5)'; g.fillRect(d.x, d.y, d.r, d.r); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(d.x, d.y, 1, 1); }
        // and a few running down it
        if (Math.random() < 0.06) runs.push({ x: Math.round(rnd(0, W)), y: rnd(0, H * 0.5), v: rnd(10, 40), trail: [] });
        for (let i = runs.length - 1; i >= 0; i--) {
          const r = runs[i]; r.y += r.v * dt; if (Math.random() < 0.1) r.x += Math.random() < 0.5 ? -1 : 1;
          r.trail.push([r.x, Math.round(r.y)]); if (r.trail.length > 40) r.trail.shift();
          if (r.y > H) { runs.splice(i, 1); continue; }
          g.fillStyle = 'rgba(190,210,250,.28)'; for (const [x, y] of r.trail) g.fillRect(x, y, 1, 1);
          g.fillStyle = 'rgba(230,240,255,.85)'; g.fillRect(r.x, Math.round(r.y), 2, 2);
        }
        // the window frame
        g.fillStyle = '#07060c'; g.fillRect(Math.round(W / 2) - 2, 0, 4, H); g.fillRect(0, Math.round(H * 0.42) - 2, W, 4);
        g.fillRect(0, 0, W, 5); g.fillRect(0, H - 8, W, 8); g.fillRect(0, 0, 5, H); g.fillRect(W - 5, 0, 5, H);
        g.fillStyle = '#2a2433'; g.fillRect(0, H - 8, W, 2);
      },
    };
  }

  // ---- 4. the northern lights over snow --------------------------------------------------------------
  function aurora(W, H) {
    const bg = G.canvas(W, H), b = bg.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#030712'); grad.addColorStop(0.7, '#0c1a33'); grad.addColorStop(1, '#13284a'); b.fillStyle = grad; b.fillRect(0, 0, W, H);
    const stars = Array.from({ length: Math.round(W * H / 300) }, () => [Math.round(rnd(0, W)), Math.round(rnd(0, H * 0.7)), rnd(0, 6)]);
    const fg = G.canvas(W, H), f = fg.getContext('2d');
    const ridge = (base, amp, fr, col) => { f.fillStyle = col; for (let x = 0; x < W; x++) { const y = Math.round(H * base - Math.abs(Math.sin(x * fr) * amp + Math.sin(x * fr * 2.7 + 1) * amp * 0.4)); f.fillRect(x, y, 1, H - y); } };
    ridge(0.72, H * 0.16, 0.012, '#1a2b45'); ridge(0.8, H * 0.08, 0.03, '#d7e4f2');
    for (let x = 0; x < W; x += 1) { if (Math.sin(x * 0.03) > -0.2) { f.fillStyle = '#b9c9dd'; f.fillRect(x, Math.round(H * 0.8 - Math.abs(Math.sin(x * 0.03) * H * 0.08)) + 2, 1, 2); } }
    for (let i = 0, x = 0; x < W; i++) { const th = Math.round(rnd(H * 0.06, H * 0.13)); for (let k = 0; k < th; k++) { const hw = Math.round((k / th) * th * 0.22); f.fillStyle = '#0a1a1c'; f.fillRect(x - hw, H - th + k - 2, hw * 2 + 1, 1); } x += Math.round(rnd(4, 11)); }
    f.fillStyle = '#e9f1fa'; f.fillRect(0, H - 3, W, 3);
    const snow = Array.from({ length: Math.round(W / 4) }, () => ({ x: rnd(0, W), y: rnd(0, H), v: rnd(6, 16) }));
    return {
      draw(g, t) {
        g.drawImage(bg, 0, 0);
        for (const [x, y, p] of stars) { const a = 0.45 + 0.4 * Math.sin(t * 1.3 + p); g.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; g.fillRect(x, y, 1, 1); }
        g.globalCompositeOperation = 'lighter';
        for (let band = 0; band < 3; band++) {
          for (let x = 0; x < W; x += 2) {
            const y0 = H * (0.2 + band * 0.08) + Math.sin(x * 0.012 + t * 0.25 + band) * H * 0.07 + Math.sin(x * 0.031 - t * 0.4 + band * 2) * H * 0.03;
            const len = H * (0.16 + 0.1 * Math.sin(x * 0.02 + t * 0.3 + band)), a = 0.08 + 0.07 * Math.sin(x * 0.05 + t * 0.9 + band * 1.7);
            const gr = g.createLinearGradient(0, y0, 0, y0 + len);
            gr.addColorStop(0, 'rgba(200,90,220,0)'); gr.addColorStop(0.25, 'rgba(160,90,230,' + (a * 0.6).toFixed(3) + ')'); gr.addColorStop(0.6, 'rgba(70,240,170,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(40,220,140,0)');
            g.fillStyle = gr; g.fillRect(x, y0, 2, len);
          }
        }
        g.globalCompositeOperation = 'source-over';
        g.drawImage(fg, 0, 0);
        g.fillStyle = 'rgba(240,246,255,.85)';
        for (const s of snow) { s.y += s.v / 30; s.x += Math.sin(t + s.v) * 0.2; if (s.y > H) { s.y = -2; s.x = rnd(0, W); } g.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
      },
    };
  }

  // ---- 5. deep space ---------------------------------------------------------------------------------------
  function space(W, H) {
    const layers = [0.6, 1.4, 3].map((v, i) => ({ v, stars: Array.from({ length: Math.round(W * H / (240 + i * 380)) }, () => [rnd(0, W), rnd(0, H), rnd(0.4, 1)]) }));
    const bg = G.canvas(W, H), b = bg.getContext('2d');
    b.fillStyle = '#02030a'; b.fillRect(0, 0, W, H);
    [['90,60,160', 0.25, 0.3, 0.5], ['40,110,170', 0.75, 0.6, 0.45], ['170,60,110', 0.55, 0.15, 0.3]].forEach(([c, fx, fy, r]) => { const gr = b.createRadialGradient(W * fx, H * fy, 0, W * fx, H * fy, W * r); gr.addColorStop(0, 'rgba(' + c + ',.28)'); gr.addColorStop(1, 'rgba(' + c + ',0)'); b.fillStyle = gr; b.fillRect(0, 0, W, H); });
    // a ringed planet
    const px = W * 0.7, py = H * 0.58, pr = Math.round(H * 0.17), pl = G.canvas(W, H), p = pl.getContext('2d');
    const ring = (front) => { p.strokeStyle = 'rgba(230,200,150,.8)'; p.lineWidth = 2; p.beginPath(); p.ellipse(px, py, pr * 1.9, pr * 0.42, -0.25, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); p.stroke(); p.strokeStyle = 'rgba(180,150,110,.6)'; p.lineWidth = 1; p.beginPath(); p.ellipse(px, py, pr * 2.15, pr * 0.5, -0.25, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); p.stroke(); };
    ring(false);
    for (let y = -pr; y <= pr; y++) for (let x = -pr; x <= pr; x++) {
      if (x * x + y * y > pr * pr) continue;
      const band = Math.sin((y + x * 0.25) * 0.35) > 0.2, lit = (x * -0.6 + y * -0.5) / pr;
      const base = band ? [214, 170, 120] : [190, 140, 100], k = 0.35 + 0.65 * Math.max(0, Math.min(1, 0.55 + lit));
      p.fillStyle = 'rgb(' + Math.round(base[0] * k) + ',' + Math.round(base[1] * k) + ',' + Math.round(base[2] * k) + ')'; p.fillRect(Math.round(px + x), Math.round(py + y), 1, 1);
    }
    ring(true);
    let shoot = null;
    return {
      draw(g, t) {
        g.drawImage(bg, 0, 0);
        layers.forEach((l, li) => { for (const s of l.stars) { const x = ((s[0] - t * l.v * 2) % W + W) % W; g.fillStyle = 'rgba(255,255,255,' + (s[2] * (0.4 + li * 0.25)).toFixed(2) + ')'; g.fillRect(Math.round(x), Math.round(s[1]), li === 2 && s[2] > 0.9 ? 2 : 1, 1); } });
        g.drawImage(pl, 0, 0);
        if (!shoot && Math.random() < 0.004) shoot = { x: rnd(0, W * 0.6), y: rnd(0, H * 0.4), k: 0 };
        if (shoot) { shoot.k += 1; for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,' + (1 - i / 14).toFixed(2) + ')'; g.fillRect(Math.round(shoot.x + shoot.k * 3 - i * 2), Math.round(shoot.y + shoot.k * 1.5 - i), 1, 1); } if (shoot.k > 40) shoot = null; }
      },
    };
  }

  // ---- the line-up ---------------------------------------------------------------------------------------------
  const WORLD_NAMES = { hills: 'Rolling hills', mountains: 'Mountains', beach: 'The beach', city: 'Little city', forest: 'Forest', autumn: 'Autumn', desert: 'Desert', garden: 'Garden', ice: 'Ice', deep: 'Under the sea', meadow: 'Meadow', pond: 'The pond' };
  const CITY_NAMES = { newyork: 'New York', london: 'London', santorini: 'Santorini', dubai: 'Dubai' };
  const LIST = [
    { id: 'fire', name: 'Fireplace', line: 'Logs crackling in a warm room.', c: '#e0753a', make: fireplace },
    { id: 'fish', name: 'Aquarium', line: 'Fish, bubbles and a sunken castle.', c: '#1f8fc0', make: aquarium },
    { id: 'rain', name: 'Rainy night', line: 'Rain on the window, city lights behind.', c: '#5a6cf0', make: rainy },
    { id: 'aurora', name: 'Northern lights', line: 'The sky glowing green over the snow.', c: '#2fae8a', make: aurora },
    { id: 'space', name: 'Deep space', line: 'Drifting past a ringed planet.', c: '#7a4fd8', make: space },
  ].concat(Object.keys(WORLD_NAMES).map((w) => ({ id: 'w:' + w, name: WORLD_NAMES[w], line: 'One of DiceOS\'s worlds, as the day goes by.', c: (D.WORLDS && D.WORLDS[w]) || '#7cc4ff', world: w })))
    .concat(Object.keys(CITY_NAMES).map((c) => ({ id: 'c:' + c, name: CITY_NAMES[c], line: 'The skyline, live under its own sky.', c: '#d4a857', city: c })));
  const CH = D.channels = { LIST };
  // ---- the news: each channel's own round-the-clock stream on YouTube ----------------------------------------
  // (live_stream?channel= always plays whatever that channel has live right now)
  CH.NEWS = [
    { id: 'n:abc', mono: 'ABC', name: 'ABC News Live', yt: 'UCBi2mrWuNuyYy4gbM6fU18Q', site: 'abcnews.go.com', c: '#2a3d8f', line: 'Breaking news and live events from the U.S.' },
    { id: 'n:nbc', mono: 'NBC', name: 'NBC News NOW', yt: 'UCeY0bbntWzzVIaj2z3QigXg', site: 'nbcnews.com', c: '#4a3c9c', line: 'News from NBC, live all day.' },
    { id: 'n:cbs', mono: 'CBS', name: 'CBS News 24/7', yt: 'UC8p1vwvWtl6T73JiExfWs1g', site: 'cbsnews.com', c: '#1f2a44', line: 'CBS News\'s round-the-clock stream.' },
    { id: 'n:bbc', mono: 'BBC', name: 'BBC News', yt: 'UC16niRr50-MSBwiO3YDb3RA', site: 'bbc.com', c: '#a3171d', line: 'The BBC News channel, from London.' },
    { id: 'n:sky', mono: 'Sky', name: 'Sky News', yt: 'UCoMdktPbSTixAyNGwb-UYkQ', site: 'news.sky.com', c: '#b3121f', line: 'British and world news.' },
    { id: 'n:dw', mono: 'DW', name: 'DW News', yt: 'UCknLrEdhRCp1aegoMqRaCZg', site: 'dw.com', c: '#0a5aa4', line: 'World news from Germany, in English.' },
    { id: 'n:f24', mono: 'F24', name: 'France 24 English', yt: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', site: 'france24.com', c: '#1b8fc0', line: 'World news from Paris, in English.' },
    { id: 'n:aje', mono: 'AJE', name: 'Al Jazeera English', yt: 'UCNye-wNBqNL5ZzHSJj3l8Bg', site: 'aljazeera.com', c: '#c4862a', line: 'World news from Doha.' },
    { id: 'n:bbg', mono: 'BTV', name: 'Bloomberg Television', yt: 'UCIALMKvObZNtJ6AmdCLP7Lg', site: 'bloomberg.com', c: '#2b2b2b', line: 'Business and markets.' },
  ];
  // yours too: any YouTube channel that streams live, by its channel ID (UC…)
  CH.news = () => CH.NEWS.concat((Array.isArray(D.state.news) ? D.state.news : []).map((n) => Object.assign({ c: '#5a6270', line: 'A channel you added.', mine: true }, n, { id: 'n:' + n.yt })));
  CH.all = () => LIST.concat(CH.news());
  CH.ytId = (s) => { const m = /(UC[\w-]{22})/.exec(String(s || '')); return m ? m[1] : null; };
  CH.embed = (yt) => 'https://www.youtube.com/embed/live_stream?channel=' + encodeURIComponent(yt) + '&autoplay=1&rel=0&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
  CH.find = (id) => CH.all().find((c) => c.id === id) || LIST[0];
  // a picture W × H pixels wide: draw(g, seconds)
  CH.make = function (id, W, H) {
    const c = CH.find(id);
    if (c.make) return c.make(W, H);
    if (c.world) { const sc = new G.Scape({ world: c.world, night: D.night(), W, H, seed: 'channel' }); return { draw: (g, t) => sc.draw(g, t, D.reduced()) }; }
    const sk = new G.Skyline({ city: c.city, W, H, now: new Date() });
    return { draw: (g, t) => sk.draw(g, t, D.reduced()) };
  };
  CH.cell = () => Math.max(2, Math.round(Math.max(innerWidth, innerHeight * 1.6) / 420));

  // ---- the app -------------------------------------------------------------------------------------------------
  D.register({ id: 'channels', mount(root, ctx) {
    root.classList.add('chn');
    root.innerHTML = '<canvas class="ch-cv"></canvas><div class="ch-yt" hidden></div><div class="ch-banner glass" hidden></div><div class="ch-guide glass" hidden role="dialog" aria-label="Channel guide"><h2>Channels</h2><div class="ch-list" data-row></div></div><div class="ch-bar"><button class="b small" data-nav data-key="ch:prev" aria-label="Previous channel">' + D.glyph('prev', 2) + '</button><button class="b small" data-nav data-key="ch:guide">Guide</button><button class="b small" data-nav data-key="ch:next" aria-label="Next channel">' + D.glyph('next', 2) + '</button><button class="b small" data-nav data-key="ch:radio">' + D.glyph('music', 2) + '<span>Dice Radio</span></button></div>';
    const cv = root.querySelector('.ch-cv'), g = cv.getContext('2d'), banner = root.querySelector('.ch-banner'), guide = root.querySelector('.ch-guide'), yt = root.querySelector('.ch-yt');
    let all = CH.all();
    let idx = Math.max(0, all.findIndex((c) => c.id === (ctx.arg || D.state.channel))), scene = null, key = '', bannerT = 0, digits = '', digitT = 0, last = 0, ytPaused = false;
    const cur = () => all[idx];
    function showBanner(sticky) {
      const c = cur(), now = M.now;
      const extra = c.yt ? 'Live on YouTube · <span class="bt bt-keys">▶︎ ⏸</span> pauses · ' + D.btn('a') + ' guide' : (now && now.playing ? 'Dice Radio: ' + esc(now.name) : 'Press ' + D.btn('a') + ' for the guide');
      banner.innerHTML = '<b class="ch-num" style="--c:' + c.c + '">' + (idx + 1) + '</b><div><b class="ch-name">' + (c.yt ? '<i class="ch-live">Live</i>' : '') + esc(c.name) + '</b><span>' + esc(c.line) + '</span><small>' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + extra + '</small></div>';
      banner.hidden = false; banner.classList.add('on');
      clearTimeout(bannerT);
      if (!sticky) bannerT = setTimeout(() => { banner.classList.remove('on'); setTimeout(() => { if (!banner.classList.contains('on')) banner.hidden = true; }, 400); }, 4200);
    }
    // a news channel plays in YouTube's own player; the pictures are drawn here
    function stage() {
      const c = cur();
      if (c.yt) {
        if (yt.dataset.yt !== c.yt) {
          yt.dataset.yt = c.yt; ytPaused = false;
          yt.innerHTML = '<iframe title="' + esc(c.name) + '" src="' + esc(CH.embed(c.yt)) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><p class="ch-yt-note">If it says the stream is offline, ' + esc(c.name) + ' isn\'t live right now: try another.</p>';
          if (M.now && M.now.playing) M.pause(); // not two things talking at once
        }
        yt.hidden = false; cv.hidden = true; root.classList.add('ch-news');
      } else {
        if (yt.dataset.yt) { yt.innerHTML = ''; yt.dataset.yt = ''; }
        yt.hidden = true; cv.hidden = false; root.classList.remove('ch-news');
      }
    }
    const ytSay = (func, args) => { const f = yt.querySelector('iframe'); if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), 'https://www.youtube.com'); };
    // the remote keeps working after a click in YouTube's player: keys come back here
    const onBlur = () => setTimeout(() => { if (document.activeElement && yt.contains(document.activeElement) && root.isConnected) { const b = root.querySelector('[data-key="ch:guide"]'); if (b) b.focus({ preventScroll: true }); } }, 0);
    addEventListener('blur', onBlur);
    function tune(i, quiet) {
      all = CH.all();
      idx = (i + all.length) % all.length; key = '';
      D.state.channel = cur().id; D.save();
      if (!quiet) S.play('tab');
      ctx.setTitle(cur().name + ' · Channels');
      stage();
      showBanner();
      paintGuide();
    }
    function paintGuide() {
      const list = guide.querySelector('.ch-list');
      list.innerHTML = '';
      all.forEach((c, i) => {
        if (i === 0) list.appendChild(h('<h3 class="ch-group">Pictures</h3>'));
        if (c.yt && !(all[i - 1] || {}).yt) list.appendChild(h('<h3 class="ch-group">News, live</h3>'));
        const b = h('<button class="ch-item' + (i === idx ? ' on' : '') + '" data-nav data-key="ch:' + esc(c.id) + '" style="--c:' + c.c + '"' + (c.mine ? ' data-x="Remove"' : '') + '><b>' + (i + 1) + '</b><span>' + esc(c.name) + '</span></button>');
        b.onclick = () => { tune(i); closeGuide(); };
        if (c.mine) b._x = () => removeNews(c);
        list.appendChild(b);
      });
      const add = h('<button class="ch-item ch-add" data-nav data-key="ch:addnews"><b>+</b><span>Add a news channel</span></button>');
      add.onclick = addNews;
      list.appendChild(add);
    }
    async function addNews() {
      const r = await D.ask({ title: 'Add a news channel', text: 'Any YouTube channel that streams live, like your local news. Paste its channel link or ID: it starts with UC (on YouTube: the channel, then About, then Share channel, then Copy channel ID).', input: { label: 'Channel ID or link', placeholder: 'UC…' }, buttons: [{ label: 'Next', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!r || !r.value) return;
      const id = CH.ytId(r.value);
      if (!id) return D.toast({ icon: 'tv', c: '#e5534b', title: 'That isn\'t a channel ID', text: 'It starts with UC and is 24 letters long.' });
      const n = await D.ask({ title: 'What\'s it called?', input: { label: 'Name', placeholder: 'My local news' }, buttons: [{ label: 'Add it', value: true, go: true }, { label: 'Cancel', value: false }] });
      if (!n) return;
      const list = Array.isArray(D.state.news) ? D.state.news.slice() : [];
      if (!list.some((x) => x.yt === id)) list.push({ yt: id, name: (n.value || '').trim().slice(0, 30) || 'News' });
      D.set('news', list);
      all = CH.all();
      tune(all.findIndex((c) => c.yt === id));
      closeGuide();
    }
    async function removeNews(c) {
      const ok = await D.ask({ title: 'Take ' + c.name + ' off?', buttons: [{ label: 'Take it off', value: true, go: true }, { label: 'Keep it', value: false }] });
      if (!ok) return;
      D.set('news', (D.state.news || []).filter((x) => x.yt !== c.yt));
      const was = cur().id;
      all = CH.all(); idx = Math.max(0, all.findIndex((x) => x.id === was)); if (idx < 0) idx = 0;
      tune(idx, true); openGuide();
    }
    const guideOpen = () => !guide.hidden;
    function openGuide() {
      paintGuide(); guide.hidden = false; banner.hidden = true;
      const on = guide.querySelector('.ch-item.on') || guide.querySelector('[data-nav]');
      D.nav.focus(on, { scroll: false }); on.scrollIntoView({ block: 'center' });
      S.play('open');
    }
    function closeGuide() { guide.hidden = true; if (D.nav.el && guide.contains(D.nav.el)) D.nav.focus(root.querySelector('[data-key="ch:guide"]'), { scroll: false }); }
    root.querySelector('[data-key="ch:prev"]').onclick = () => tune(idx - 1);
    root.querySelector('[data-key="ch:next"]').onclick = () => tune(idx + 1);
    root.querySelector('[data-key="ch:guide"]').onclick = () => (guideOpen() ? closeGuide() : openGuide());
    root.querySelector('[data-key="ch:radio"]').onclick = () => { if (cur().yt) { ytSay('pauseVideo'); ytPaused = true; } if (M.now) M.toggle(); else M.play('radio', 0); setTimeout(() => showBanner(), 50); };
    cv.addEventListener('click', () => (guideOpen() ? closeGuide() : showBanner()));
    paintGuide();
    tune(idx, true);
    ctx.legend([['a', 'Guide'], ['rb', 'Next channel'], ['x', 'Info'], ['b', 'Back']]);
    return {
      frame(now) {
        if (cur().yt) return;
        const cell = CH.cell(), W = Math.ceil(root.clientWidth / cell), H = Math.ceil(root.clientHeight / cell);
        if (!W || !H) return;
        const k = cur().id + W + 'x' + H + (cur().world ? D.night() : '');
        if (k !== key) { key = k; cv.width = W; cv.height = H; cv.style.width = W * cell + 'px'; cv.style.height = H * cell + 'px'; scene = CH.make(cur().id, W, H); }
        if (now - last < 1000 / Math.min(30, D.state.fps || 30)) return;
        last = now;
        scene.draw(g, now / 1000);
      },
      onAction(a) {
        if (guideOpen()) {
          if (a === 'b') { closeGuide(); return true; }
          if (a === 'x') { if (D.nav.el && D.nav.el._x) D.nav.el._x(); else closeGuide(); return true; }
          if (a === 'up' || a === 'down') { D.nav.move(a); if (D.nav.el && guide.contains(D.nav.el)) D.nav.el.scrollIntoView({ block: 'nearest' }); return true; }
          if (a === 'a') { D.nav.press(); return true; }
          return true;
        }
        if (/^d\d$/.test(a)) {
          clearTimeout(digitT); digits = (digits + a[1]).slice(-2);
          if (D.remote) D.remote.osd('tv', 'Channel ' + digits + '…');
          digitT = setTimeout(() => { const n = +digits; digits = ''; if (n >= 1 && n <= all.length) tune(n - 1); }, digits.length >= 2 ? 300 : 1300);
          return true;
        }
        // on a news channel, play and pause go to YouTube's player
        if (cur().yt && (a === 'play' || a === 'stop')) { ytPaused = a === 'stop' ? true : !ytPaused; ytSay(ytPaused ? 'pauseVideo' : 'playVideo'); if (D.remote) D.remote.osd(ytPaused ? 'pause' : 'play', cur().name); return true; }
        if (a === 'up' || a === 'rb') { tune(idx + 1); return true; }
        if (a === 'down' || a === 'lb') { tune(idx - 1); return true; }
        if (a === 'a') { openGuide(); return true; }
        if (a === 'x' || a === 'left' || a === 'right') { showBanner(); return true; }
        return false;
      },
      unmount() { clearTimeout(bannerT); clearTimeout(digitT); removeEventListener('blur', onBlur); yt.innerHTML = ''; },
    };
  } });
})();
