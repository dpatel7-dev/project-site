// DiceWeb's backgrounds: calm, detailed landscapes with nobody in them, one
// for each world. They move a little (clouds drift, water reflects and
// shimmers, grass and reeds sway, snow and leaves fall, fireflies blink at
// night) but stay quiet behind windows and words.
//
// A scene is painted once into layers (sky, the land behind the water, the
// land in front) at about a third of the screen's size, then each frame puts
// the layers together with the moving parts on top, blown up with sharp edges.
(function () {
  'use strict';
  const G = window.DiceGfx;

  // ---- colour, in [r, g, b] -----------------------------------------------------------
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lit = (c, t) => mixc(c, [255, 255, 255], t);
  const dim = (c, t) => mixc(c, [0, 0, 0], t);
  const css = (c, a) => (a === undefined ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')' : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')');

  // ---- noise ----------------------------------------------------------------------------
  function noise1(rand) {
    const n = 512, v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = rand();
    return (x) => { const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return v[((i % n) + n) % n] * (1 - s) + v[(((i + 1) % n) + n) % n] * s; };
  }
  const fbm = (nz, x, oct) => { let s = 0, a = 0.5, f = 1, norm = 0; for (let o = 0; o < oct; o++) { s += a * nz(x * f + o * 37.1); norm += a; a *= 0.5; f *= 2.07; } return s / norm; };
  function noise2(rand) {
    const n = 64, v = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) v[i] = rand();
    const at = (x, y) => v[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx, b = at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
  }

  // ---- a picture made of pixels ----------------------------------------------------------
  class Buf {
    constructor(W, H) { this.W = W; this.H = H; this.d = new Uint8ClampedArray(W * H * 4); }
    set(x, y, c, a) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
      const i = (y * this.W + x) * 4, d = this.d;
      if (a !== undefined && a < 1) { const k = 1 - a; d[i] = d[i] * k + c[0] * a; d[i + 1] = d[i + 1] * k + c[1] * a; d[i + 2] = d[i + 2] * k + c[2] * a; d[i + 3] = Math.max(d[i + 3], 255 * a); return; }
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    get(x, y) { const i = (Math.max(0, Math.min(this.H - 1, y | 0)) * this.W + Math.max(0, Math.min(this.W - 1, x | 0))) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
    canvas() { const c = G.canvas(this.W, this.H); c.getContext('2d').putImageData(new ImageData(this.d, this.W, this.H), 0, 0); return c; }
  }

  // ---- the worlds ---------------------------------------------------------------------------
  // y: where a layer's top sits (0 top of the picture, 1 bottom); amp: how tall its bumps are;
  // bumps: how many across the picture; haze: how far away it looks (fades into the sky).
  const W_ = {
    hills: { sky: ['#5d9fe6', '#a3cdf3', '#e6f2f9'], horizon: 0.56, motes: 'pollen',
      back: [{ k: 'hills', y: 0.57, amp: 0.05, bumps: 3, c: '#94bfae', haze: 0.5, tex: 1 },
        { k: 'hills', y: 0.64, amp: 0.07, bumps: 2.4, c: '#82b56c', haze: 0.25, tex: 1, trees: { n: 0.09, s: 1.3, c: ['#5c9a4a', '#4f8c42'] }, mill: 0.28 },
        { k: 'hills', y: 0.75, amp: 0.06, bumps: 1.8, c: '#68a453', haze: 0.08, tex: 1, trees: { n: 0.02, c: ['#3f7d38', '#4a8a3e'], big: 1 } }],
      front: { k: 'hills', y: 0.9, amp: 0.03, bumps: 2.2, c: '#4d8b41', grass: 1 } },
    mountains: { sky: ['#4f8fe0', '#8ebfee', '#dcecf8'], horizon: 0.6, motes: 'none',
      back: [{ k: 'peaks', y: 0.61, amp: 0.32, bumps: 1.5, c: '#a9b9d6', haze: 0.45, snow: 0.45 },
        { k: 'peaks', y: 0.645, amp: 0.22, bumps: 2.1, c: '#7d90b2', haze: 0.22, snow: 0.6 },
        { k: 'hills', y: 0.665, amp: 0.012, bumps: 4, c: '#456f5a', haze: 0.1, pines: { n: 0.9, h: [3, 8], c: '#3b654f' } }],
      water: { y: 0.68, c: '#4f86b8' },
      front: { k: 'hills', y: 0.9, amp: 0.025, bumps: 1.6, c: '#3f6c4a', grass: 1, pines: { n: 0.06, h: [10, 22], c: '#2e5640' } } },
    beach: { sky: ['#4aa6ec', '#92d2f4', '#f6ecd8'], horizon: 0.58, motes: 'none', boat: 1,
      back: [{ k: 'island', y: 0.585, amp: 0.06, at: 0.2, w: 0.26, c: '#7ea79d', haze: 0.5, palms: 1 }],
      water: { y: 0.586, c: '#2f8fc8', near: '#62cfe0', sea: 1 },
      front: { k: 'sand', y: 0.8, amp: 0.015, bumps: 1.2, c: '#ecd29c', waves: 1, palm: 0.88 } },
    city: { sky: ['#6b9fe0', '#a8c8ef', '#eaeef6'], night: ['#090d26', '#1e1d4c', '#4c3a70'], horizon: 0.62, motes: 'none',
      back: [{ k: 'city', y: 0.62, h: [0.05, 0.17], c: '#aab9cd', haze: 0.5, gap: 0.3 },
        { k: 'city', y: 0.68, h: [0.04, 0.17], c: '#7f8ea9', haze: 0.25, windows: 1, gap: 0.45 },
        { k: 'city', y: 0.8, h: [0.04, 0.16], c: '#58647e', haze: 0.08, windows: 1, spires: 1, gap: 0.55 }],
      front: { k: 'flat', y: 0.9, c: '#3c4357', lamps: 1 } },
    forest: { sky: ['#79aedc', '#b4d4e6', '#e7f0ea'], horizon: 0.55, motes: 'pollen', mist: [0.6, 0.7],
      back: [{ k: 'hills', y: 0.55, amp: 0.03, bumps: 2, c: '#97b8a8', haze: 0.5, pines: { n: 1, h: [4, 9], c: '#8aae9c' } },
        { k: 'hills', y: 0.63, amp: 0.03, bumps: 2.5, c: '#628f74', haze: 0.28, tex: 1, pines: { n: 1, h: [6, 14], c: '#5a876c' } },
        { k: 'hills', y: 0.76, amp: 0.025, bumps: 3, c: '#3d6c52', haze: 0.1, tex: 1, pines: { n: 0.9, h: [16, 34], c: '#36634a' } }],
      front: { k: 'hills', y: 0.9, amp: 0.02, bumps: 2, c: '#2d5642', grass: 1 } },
    autumn: { sky: ['#6fa2dc', '#b9cfe9', '#f6e2c9'], horizon: 0.57, motes: 'leaves',
      back: [{ k: 'hills', y: 0.57, amp: 0.05, bumps: 2.6, c: '#c3a68e', haze: 0.5, tex: 1 },
        { k: 'hills', y: 0.65, amp: 0.05, bumps: 2, c: '#c39a52', haze: 0.22, tex: 1, trees: { n: 0.35, s: 1.5, c: ['#e07a35', '#d6553a', '#f0b23c', '#c9682f', '#e89a3a'] } },
        { k: 'hills', y: 0.77, amp: 0.05, bumps: 1.5, c: '#b8903f', haze: 0.06, tex: 1, trees: { n: 0.04, c: ['#d8602f', '#eaa93a', '#c64a30'], big: 1 } }],
      front: { k: 'hills', y: 0.9, amp: 0.025, bumps: 2, c: '#94703a', grass: 1, gold: 1 } },
    desert: { sky: ['#3f8fdc', '#86c0ec', '#f7e3bd'], night: ['#050a24', '#14205a', '#3a3f7a'], horizon: 0.6, motes: 'sand',
      back: [{ k: 'mesa', y: 0.6, c: '#c98a64', haze: 0.38 },
        { k: 'dunes', y: 0.68, amp: 0.045, bumps: 2.2, c: '#e9ba7c', haze: 0.14 },
        { k: 'dunes', y: 0.79, amp: 0.05, bumps: 1.6, c: '#dda366', haze: 0.04 }],
      front: { k: 'dunes', y: 0.92, amp: 0.025, bumps: 1.3, c: '#cf9254', cacti: 1 } },
    garden: { sky: ['#6eaee8', '#aed6f4', '#eef7f8'], horizon: 0.58, motes: 'petals',
      back: [{ k: 'hills', y: 0.58, amp: 0.04, bumps: 2.4, c: '#a5c8b0', haze: 0.5, trees: { n: 0.05, c: ['#8fb79c'] } },
        { k: 'hedge', y: 0.665, c: '#5f9a55', haze: 0.12 },
        { k: 'beds', y: 0.75, c: '#69a55a', haze: 0.04 }],
      front: { k: 'hills', y: 0.91, amp: 0.012, bumps: 1.5, c: '#579a4a', grass: 1, flowers: 1 } },
    ice: { sky: ['#79b8e8', '#b7dcf2', '#eef8fb'], night: ['#040a1c', '#0d1f3e', '#22436a'], horizon: 0.6, motes: 'snow', aurora: 1,
      back: [{ k: 'peaks', y: 0.605, amp: 0.09, bumps: 2.4, c: '#a9c4dc', haze: 0.25, snow: 0 },
        { k: 'bergs', y: 0.63, c: '#eef6fb' }],
      water: { y: 0.63, c: '#2c6c92' },
      front: { k: 'hills', y: 0.88, amp: 0.025, bumps: 1.4, c: '#e9f1f7', snowbank: 1 } },
    deep: { sky: ['#5cbbe8', '#2b80c2', '#0b3466'], night: ['#0b2a52', '#061a38', '#020b1c'], horizon: 1, under: 1, motes: 'bubbles',
      back: [{ k: 'reef', y: 0.66, amp: 0.12, bumps: 3, c: '#2b6c9c', haze: 0.45 },
        { k: 'reef', y: 0.78, amp: 0.1, bumps: 2.4, c: '#1f5884', haze: 0.2, coral: 1 }],
      front: { k: 'sand', y: 0.9, amp: 0.02, bumps: 1.5, c: '#8c8f7e', kelp: 1 } },
    meadow: { sky: ['#5ea6ea', '#a6d2f2', '#eef6e6'], horizon: 0.6, motes: 'pollen', wind: 1,
      back: [{ k: 'hills', y: 0.6, amp: 0.02, bumps: 3, c: '#86a68f', haze: 0.5, trees: { n: 0.5, c: ['#7c9c86', '#86a690'] } },
        { k: 'field', y: 0.635, amp: 0.02, bumps: 1.4, c: '#a2c45e', haze: 0.08, bigtree: 0.74 }],
      front: { k: 'hills', y: 0.9, amp: 0.015, bumps: 2, c: '#6e9b40', grass: 2, flowers: 1 } },
    pond: { sky: ['#8ab5ea', '#c7d4f0', '#f4e4ee'], horizon: 0.58, motes: 'none', mist: [0.62],
      back: [{ k: 'hills', y: 0.58, amp: 0.02, bumps: 3, c: '#94acab', haze: 0.5, trees: { n: 0.45, c: ['#8aa5a3', '#93adab'] } },
        { k: 'hills', y: 0.625, amp: 0.012, bumps: 2, c: '#6f9a6c', haze: 0.2, trees: { n: 0.08, c: ['#5f8d5c', '#6a9866'] } }],
      water: { y: 0.64, c: '#5b8fb2', lilies: 1, ripples: 1 },
      front: { k: 'hills', y: 0.93, amp: 0.012, bumps: 1.5, c: '#3f6e44', reeds: 1 } },
  };
  const NAMES = Object.keys(W_);
  const NIGHT_SKY = ['#060b20', '#121d45', '#2b3a6c'];
  const NIGHT_LAND = rgb('#0c1630');

  class Scape {
    // o: {world, night, W, H, seed}
    constructor(o) {
      this.o = o;
      this.world = W_[o.world] ? o.world : 'hills';
      this.R = W_[this.world];
      this.W = o.W; this.H = o.H; this.night = !!o.night;
      this.rand = G.seeded(G.hash(this.world + (o.seed || '') + (this.night ? 'n' : 'd')));
      this.k = Math.max(0.6, this.W / 420); // how big things are, so a scene looks the same at any size
      this.moving = [];
      this.build();
    }
    sky() { return (this.night ? this.R.night || NIGHT_SKY : this.R.sky).map(rgb); }
    horizonCol() { return this.sky()[2]; }
    // a land colour, faded by distance and darkened at night
    landCol(hex, haze) {
      let c = rgb(hex);
      if (this.night) c = mixc(mixc(dim(c, 0.1), NIGHT_LAND, 0.64 - haze * 0.2), this.horizonCol(), haze * 0.4);
      else c = mixc(c, this.horizonCol(), haze * 0.55);
      return c;
    }
    pal(list, haze) { return list.map((h) => this.landCol(h, haze)); }

    build() {
      const { W, H } = this;
      this.hy = Math.round(H * this.R.horizon);
      this.skyC = this.buildSky();
      const back = new Buf(W, H), front = new Buf(W, H);
      this.tops = [];
      for (const L of this.R.back) this.layer(back, L);
      const wa = this.R.water;
      this.wy = wa ? Math.round(H * wa.y) : null;
      if (wa) this.prepWater(front, wa);
      this.layer(front, this.R.front, true);
      this.backC = back.canvas();
      this.frontC = front.canvas();
      this.prepMoving();
    }

    // ---- sky: a smooth gradient, one colour per row (no dots), then the sun or the moon ------
    buildSky() {
      const { W, H } = this, b = new Buf(W, H), [top, mid, low] = this.sky();
      const span = this.R.under ? H : this.hy;
      const at = (t) => (t < 0.55 ? mixc(top, mid, t / 0.55) : mixc(mid, low, (t - 0.55) / 0.45));
      for (let y = 0; y < H; y++) {
        const c = at(Math.min(1, y / span));
        for (let x = 0; x < W; x++) b.set(x, y, c);
      }
      if (!this.R.under) this.sun(b);
      return b.canvas();
    }
    sun(b) {
      const { W, H } = this, r = Math.max(3, Math.round(Math.min(W, H) * (this.world === 'desert' ? 0.06 : 0.045)));
      const sx = Math.round(W * 0.8), sy = Math.round(this.hy * (this.night ? 0.26 : 0.3));
      this.sunAt = { x: sx, y: sy, r };
      const glow = this.night ? rgb('#c9d6ff') : rgb(this.world === 'desert' ? '#fff0c0' : '#fff6d8');
      // a soft, even glow (no dots), fading out smoothly
      const G2 = 2.8, gr = Math.ceil(r * G2); // whole pixels, so no ring is missed
      for (let y = -gr; y <= gr; y++) for (let x = -gr; x <= gr; x++) {
        const d = Math.hypot(x, y);
        if (d <= r || d > r * G2) continue;
        const a = Math.pow(1 - (d - r) / (r * (G2 - 1)), 2.2) * (this.night ? 0.28 : 0.5);
        b.set(sx + x, sy + y, mixc(b.get(sx + x, sy + y), glow, a));
      }
      const disc = this.night ? rgb('#f3efdc') : rgb(this.world === 'desert' ? '#ffd257' : '#ffe079');
      const rim = this.night ? rgb('#d8d4c2') : lit(disc, 0.45);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r + 0.3) continue;
        let c = d > r - 1 ? rim : disc;
        if (this.night) { // a few craters on the moon
          for (const [cx, cy, cr] of [[-0.35, -0.2, 0.28], [0.3, 0.3, 0.2], [0.2, -0.45, 0.14]]) if (Math.hypot(x / r - cx, y / r - cy) < cr) c = rgb('#ddd8c2');
        } else if (x + y < -r * 0.6 && d < r - 1) c = lit(disc, 0.35);
        b.set(sx + x, sy + y, c);
      }
    }

    // ---- the land ---------------------------------------------------------------------------
    ridge(L) {
      const { W, H } = this, nz = noise1(this.rand), top = new Int16Array(W), base = L.y * H, amp = (L.amp || 0) * H;
      for (let x = 0; x < W; x++) {
        const u = (x / W) * (L.bumps || 2);
        let v;
        if (L.k === 'peaks') { let s = 0, a = 1, f = 1, n = 0; for (let o = 0; o < 4; o++) { s += a * Math.pow(1 - Math.abs(nz(u * f + o * 9.3) * 2 - 1), 2); n += a; a *= 0.36; f *= 2.4; } v = s / n; }
        else if (L.k === 'dunes') { const f = (u + fbm(nz, u * 0.5, 2) * 0.6) % 1; v = (f < 0.72 ? Math.sin((f / 0.72) * Math.PI / 2) : Math.cos(((f - 0.72) / 0.28) * Math.PI / 2)) * 0.8 + fbm(nz, u * 3, 2) * 0.2; }
        else if (L.k === 'island') { const d = (x / W - L.at) / (L.w / 2); v = d * d < 1 ? Math.pow(1 - d * d, 1.5) * (0.85 + 0.15 * nz(u * 30)) : -1; }
        else v = fbm(nz, u, 4);
        top[x] = v < 0 ? H + 1 : Math.round(base - amp * v);
      }
      return top;
    }
    layer(b, L, isFront) {
      const { W, H } = this, haze = L.haze || 0, r = this.rand;
      const c = this.landCol(L.c, haze), hi = this.night ? lit(c, 0.06) : lit(c, 0.18), lo = dim(c, this.night ? 0.12 : 0.08);
      if (L.k === 'city') return this.city(b, L, c);
      if (L.k === 'mesa') return this.mesa(b, L, c);
      if (L.k === 'bergs') return this.bergs(b, L);
      if (L.k === 'hedge') return this.hedge(b, L, c);
      if (L.k === 'flat') { const y0 = Math.round(L.y * H), top = new Int16Array(W).fill(y0); for (let x = 0; x < W; x++) for (let y = y0; y < H; y++) b.set(x, y, y === y0 ? hi : c); this.tops.push(top); if (isFront) this.frontTop = top; if (L.lamps) this.lamps(b, y0); return; }
      const top = this.ridge(L);
      if (isFront) this.frontTop = top;
      this.tops.push(top);
      const n2 = noise2(r), snowLine = L.snow !== undefined ? Math.round(L.y * H - (L.amp * H) * L.snow) : null;
      // peaks: lit on the sun's side, in shade on the other, split down from each summit
      let peaks = null;
      if (L.k === 'peaks') { peaks = new Int16Array(W); let best = 0; for (let x = 0; x < W; x++) { const l = top[Math.max(0, x - 1)], rr = top[Math.min(W - 1, x + 1)]; if (top[x] <= l && top[x] <= rr) best = x; peaks[x] = best; } }
      for (let x = 0; x < W; x++) {
        if (top[x] > H) continue;
        for (let y = top[x]; y < H; y++) {
          const d = y - top[x];
          let col = c;
          if (peaks) {
            const px = peaks[x], side = x - (px + (y - top[px]) * 0.45 + (n2(x * 0.3, y * 0.3) - 0.5) * 3);
            col = side > 0 ? (this.night ? lit(c, 0.05) : lit(c, 0.14)) : dim(c, this.night ? 0.1 : 0.12);
            if (snowLine !== null && y < snowLine + (n2(x * 0.2, 3) - 0.5) * 6 + (side > 0 ? 0 : 2)) col = this.landCol(side > 0 ? '#ffffff' : '#c8d6ea', haze * 0.6);
            if (L.snow === 0 && d < 4) col = this.landCol('#ffffff', haze);
          } else if (L.k === 'dunes') {
            // the side facing away from the sun has a shadow just under the crest; the sunny side a bright rim
            const sl = (top[Math.min(W - 1, x + 3)] - top[Math.max(0, x - 3)]) / 6;
            const shadow = sl < 0 ? Math.min(14 * this.k, -sl * 18 * this.k) : 0;
            col = d < shadow ? lo : sl > 0.15 && d < 2 ? hi : c;
            if (d >= shadow + 2 && d % 6 === 3 && n2(x * 0.04, y * 0.08) > 0.45) col = dim(col, 0.04);
          } else if (L.k === 'sand') {
            col = d < 1 ? hi : c;
            if (n2(x * 0.08, y * 0.16) > 0.7) col = dim(c, 0.05);
            if (this.R.under) col = mixc(col, this.horizonCol(), Math.min(0.5, 0.25 + d * 0.01));
          } else if (L.k === 'reef') {
            const v = n2(x * 0.06, y * 0.06);
            col = d < 1 ? lit(c, 0.12) : d < 2 ? lit(c, 0.06) : v > 0.68 ? lit(c, 0.04) : v < 0.3 ? dim(c, 0.06) : c;
          } else {
            // grassy land: a lit edge, then soft patches like fields, in clean clusters (not noise)
            if (d === 0) col = hi;
            else if (d === 1) col = mixc(hi, c, 0.5);
            else if (L.tex || L.k === 'field' || isFront) {
              // big soft patches only: no fine speckle
              const v = n2(x * 0.03 / this.k, y * 0.07 / this.k);
              if (v > 0.68) col = lit(c, this.night ? 0.02 : 0.04); else if (v < 0.32) col = dim(c, 0.035);
            }
            if (L.snowbank) col = d < 1 ? rgb(this.night ? '#9fb2cc' : '#ffffff') : n2(x * 0.1, y * 0.2) > 0.6 ? this.landCol('#d6e4ef', 0) : c;
            if (L.gold && n2(x * 0.3, y * 0.6) > 0.66) col = this.landCol('#a8853e', 0);
          }
          b.set(x, y, col);
        }
      }
      if (L.trees) this.trees(b, L, top, haze);
      if (L.pines) this.pines(b, L, top, haze);
      if (L.mill) this.mill(b, top, L);
      if (L.palms) this.islandPalms(b, top, L);
      if (L.coral) this.coral(b, top);
      if (L.k === 'beds') this.beds(b, top);
      if (L.bigtree) this.bigTree(b, top, L);
      if (L.flowers) this.flowers(b, top);
      if (L.cacti) this.cacti(b, top);
      if (L.palm) this.palm(b, top, L.palm);
    }
    trees(b, L, top, haze) {
      const { W } = this, r = this.rand, cols = this.pal(L.trees.c, haze);
      const n = Math.round(W * L.trees.n);
      for (let i = 0; i < n; i++) {
        const x = Math.round(r() * W), y = top[Math.max(0, Math.min(W - 1, x))];
        const R = Math.max(1.5, (L.trees.big ? 3.5 + r() * 4 : 1.6 + r() * 2.2) * (L.trees.s || 1) * this.k * (1 - haze * 0.6));
        const c = cols[Math.floor(r() * cols.length)];
        const cy = y - R * 0.9;
        if (L.trees.big) for (let t = 0; t < R * 0.9; t++) b.set(x, y - t + 1, this.landCol('#5b4330', haze));
        for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy * 1.1);
          if (d > R) continue;
          const light = (dx - dy) / (R * 2); // the sun is up and to the right
          const col = light > 0.28 ? lit(c, this.night ? 0.05 : 0.16) : light < -0.32 ? dim(c, 0.14) : c;
          b.set(x + dx, cy + dy, col);
        }
      }
    }
    pines(b, L, top, haze) {
      const { W } = this, r = this.rand, P = L.pines, c = this.landCol(P.c, haze), lc = this.night ? lit(c, 0.04) : lit(c, 0.12);
      const step = Math.max(1, Math.round(3 / Math.max(0.15, P.n)));
      for (let x0 = 0; x0 < W; x0 += step) {
        if (r() > Math.min(1, P.n * 1.4)) continue;
        const x = x0 + Math.round(r() * step), y = top[Math.max(0, Math.min(W - 1, x))] + 1 + Math.round(r() * 2);
        const h = Math.round((P.h[0] + r() * (P.h[1] - P.h[0])) * this.k);
        for (let j = 0; j < h; j++) {
          const tier = j % Math.max(3, Math.round(h / 4));
          const half = Math.round((h - j) * 0.3 * (0.55 + tier * 0.14));
          for (let dx = -half; dx <= half; dx++) b.set(x + dx, y - j, dx > 0 && dx >= half - 1 ? lc : c);
        }
        b.set(x, y - h, c);
      }
    }
    mill(b, top, L) { // a windmill on a far hill; its sails turn in draw()
      const x = Math.round(this.W * L.mill), y = top[x], h = Math.round(9 * this.k);
      const c = this.landCol('#f2efe6', L.haze), s = this.landCol('#cfc8b8', L.haze);
      for (let j = 0; j < h; j++) { const half = Math.round(1 + (h - j) * 0.18); for (let dx = -half; dx <= half; dx++) b.set(x + dx, y - j, dx > 0 ? s : c); }
      this.millAt = { x, y: y - h, len: Math.round(6 * this.k), c: this.landCol('#6d5a48', L.haze) };
    }
    city(b, L, c) {
      const { W, H } = this, r = this.rand, y0 = Math.round(L.y * H), top = new Int16Array(W).fill(H);
      const winOn = rgb('#ffd98a'), winOn2 = rgb('#fff0c4'), glass = this.night ? dim(c, 0.25) : mixc(c, rgb('#e8f2ff'), 0.32);
      this.windows = this.windows || [];
      let x = -Math.round(r() * 6);
      while (x < W) {
        const w = Math.round((4 + r() * 11) * this.k), h = Math.round((L.h[0] + r() * (L.h[1] - L.h[0])) * H), yt = y0 - h;
        const step = L.spires && r() > 0.7 ? Math.round(h * 0.18) : 0;
        for (let i = 0; i < w; i++) {
          const xx = x + i, inset = step && (i < w * 0.22 || i > w * 0.78) ? step : 0;
          if (xx < 0 || xx >= W) continue;
          top[xx] = Math.min(top[xx], yt + inset);
          for (let y = yt + inset; y < H; y++) b.set(xx, y, i === w - 1 ? dim(c, 0.1) : i === 0 ? lit(c, this.night ? 0.03 : 0.1) : c);
        }
        if (L.spires && r() > 0.75) { const ax = x + Math.round(w / 2), ah = Math.round((3 + r() * 6) * this.k); for (let j = 1; j <= ah; j++) b.set(ax, yt - j, c); this.beacons = (this.beacons || []).concat([{ x: ax, y: yt - ah - 1, p: r() * 6 }]); }
        if (L.windows) {
          for (let wy = yt + 2 + (step || 0); wy < y0 + 6; wy += 3) for (let wx = x + 2; wx < x + w - 2; wx += 2) {
            if (wx < 0 || wx >= W) continue;
            if (this.night) {
              const on = r() < 0.32;
              if (on) { b.set(wx, wy, r() > 0.3 ? winOn : winOn2); this.windows.push({ x: wx, y: wy }); }
            } else if (r() < 0.8) b.set(wx, wy, r() < 0.15 ? dim(c, 0.12) : glass);
          }
        }
        x += w + (r() < (L.gap || 0.3) ? Math.round((1 + r() * 5) * this.k) : 0);
      }
      this.tops.push(top);
    }
    lamps(b, y0) {
      const n = Math.round(this.W / (40 * this.k));
      const post = this.night ? rgb('#1d2233') : rgb('#2f3546');
      this.lampsAt = [];
      for (let i = 0; i < n; i++) {
        const x = Math.round((i + 0.5) * this.W / n), h = Math.round(12 * this.k);
        for (let j = 1; j <= h; j++) b.set(x, y0 - j, post);
        b.set(x + 1, y0 - h, post); b.set(x + 2, y0 - h, post); b.set(x + 2, y0 - h + 1, this.night ? rgb('#ffe2a0') : rgb('#d9dde8'));
        this.lampsAt.push({ x: x + 2, y: y0 - h + 1 });
      }
    }
    mesa(b, L, c) {
      const { W, H } = this, r = this.rand, y0 = Math.round(L.y * H), top = new Int16Array(W).fill(H);
      const n2 = noise2(r);
      for (const [cx, cw, ch] of [[0.12, 0.2, 0.14], [0.46, 0.13, 0.1], [0.68, 0.24, 0.17]]) {
        const x0 = Math.round((cx + (r() - 0.5) * 0.04) * W), w = Math.round(cw * W), h = Math.round(ch * H);
        for (let i = -Math.round(h * 0.6); i < w + Math.round(h * 0.6); i++) {
          const xx = x0 + i; if (xx < 0 || xx >= W) continue;
          const edge = i < 0 ? -i / (h * 0.6) : i >= w ? (i - w) / (h * 0.6) : 0;
          const yt = Math.round(y0 - h * (1 - Math.pow(edge, 0.7)) + (edge ? 0 : (n2(xx * 0.08, 1) > 0.7 ? 1 : 0)));
          top[xx] = Math.min(top[xx], yt);
          for (let y = yt; y < H; y++) {
            let col = i >= w - 2 || edge > 0 && i >= w ? lit(c, this.night ? 0.04 : 0.14) : edge > 0 ? dim(c, 0.12) : c;
            if (!edge && (y - yt) % 6 === 3 && n2(xx * 0.06, y) > 0.3) col = dim(col, 0.06);
            if (y === yt) col = lit(c, this.night ? 0.05 : 0.2);
            b.set(xx, y, col);
          }
        }
      }
      this.tops.push(top);
    }
    bergs(b, L) {
      const { W, H } = this, r = this.rand, wy = Math.round(this.R.water.y * H);
      for (const [cx, cw, ch, flat] of [[0.1, 0.16, 0.09, 1], [0.4, 0.07, 0.06, 0], [0.58, 0.2, 0.13, 0], [0.88, 0.1, 0.05, 1]]) {
        const x0 = Math.round(cx * W), w = Math.round(cw * W), h = Math.round(ch * H);
        const peak = x0 + Math.round(w * (0.3 + r() * 0.4));
        for (let i = 0; i < w; i++) {
          const xx = x0 + i, t = i / w;
          const yt = Math.round(wy - h * (flat ? (t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1 - r() * 0.08) : Math.max(0, 1 - Math.abs(xx - peak) / (w * 0.55)) * (0.9 + r() * 0.1)));
          for (let y = yt; y < wy; y++) b.set(xx, y, (flat ? i > w * 0.7 : xx >= peak) ? this.landCol('#ffffff', 0.02) : this.landCol('#9dc0da', 0.02));
          if (yt < wy) b.set(xx, yt, this.landCol('#ffffff', 0));
        }
      }
    }
    hedge(b, L, c) {
      const { W, H } = this, r = this.rand, y0 = Math.round(L.y * H), top = new Int16Array(W), n2 = noise2(r);
      const bump = Math.round(14 * this.k);
      for (let x = 0; x < W; x++) {
        const f = (x % bump) / bump, v = Math.sqrt(Math.max(0, Math.sin(f * Math.PI)));
        top[x] = Math.round(y0 - v * 4 * this.k - (Math.floor(x / bump) % 3 === 1 ? 3 * this.k * v : 0));
        for (let y = top[x]; y < H; y++) {
          const d = y - top[x], t = n2(x * 0.35, y * 0.35);
          b.set(x, y, d < 1 ? lit(c, this.night ? 0.05 : 0.15) : t > 0.66 ? lit(c, this.night ? 0.03 : 0.08) : t < 0.3 ? dim(c, 0.12) : c);
        }
      }
      this.tops.push(top);
    }
    beds(b, top) {
      const { W } = this, r = this.rand, cols = this.pal(['#ff8fae', '#ffd24a', '#ffffff', '#ff6b6b', '#c79bff'], 0.04);
      for (let x = 1; x < W - 1; x++) {
        const y = top[x];
        for (let row = 0; row < 5; row++) if (r() < 0.6) b.set(x, y + 2 + row * 2 + (x % 2), cols[(Math.floor(x / (5 * this.k)) + row) % cols.length]);
      }
    }
    flowers(b, top) {
      const { W, H } = this, r = this.rand, cols = this.pal(['#ffffff', '#ffd24a', '#ff8fae', '#c79bff'], 0);
      for (let i = 0; i < W * 0.12; i++) {
        const x = Math.round(r() * W), y = top[Math.min(W - 1, x)] + 2 + Math.round(r() * (H - top[Math.min(W - 1, x)] - 3));
        const c = cols[Math.floor(r() * cols.length)];
        b.set(x, y, c); if (r() > 0.6) { b.set(x + 1, y, c); b.set(x, y - 1, c); }
      }
    }
    bigTree(b, top, L) {
      const x = Math.round(this.W * L.bigtree), y = top[x], R = Math.round(13 * this.k);
      const trunk = this.landCol('#5b4330', 0), c = this.landCol('#5f9440', 0), n2 = noise2(this.rand);
      for (let j = 0; j < R * 1.2; j++) for (let dx = -1; dx <= 1; dx++) b.set(x + dx, y - j, dx > 0 ? dim(trunk, 0.2) : trunk);
      for (const [ox, oy, rr] of [[0, -1.5, 1], [-0.75, -1.15, 0.7], [0.8, -1.1, 0.72], [-0.2, -2.2, 0.65]]) {
        const cx = x + ox * R, cy = y - R * 1.2 + oy * R * 0.5, Rr = R * rr;
        for (let dy = -Rr; dy <= Rr; dy++) for (let dx = -Rr; dx <= Rr; dx++) {
          if (Math.hypot(dx, dy) > Rr - (n2((cx + dx) * 0.4, (cy + dy) * 0.4) > 0.7 ? 1 : 0)) continue;
          const light = (dx - dy) / (Rr * 2), t = n2((cx + dx) * 0.3, (cy + dy) * 0.3);
          b.set(cx + dx, cy + dy, light > 0.25 || (light > 0 && t > 0.6) ? lit(c, this.night ? 0.05 : 0.16) : light < -0.3 ? dim(c, 0.15) : c);
        }
      }
    }
    cacti(b, top) {
      const c = this.landCol('#4f8a55', 0), l = this.night ? lit(c, 0.05) : lit(c, 0.15);
      for (const fx of [0.08, 0.83]) {
        const x = Math.round(this.W * fx), y = top[x] + 1, h = Math.round(16 * this.k);
        for (let j = 0; j < h; j++) for (let dx = -1; dx <= 1; dx++) b.set(x + dx, y - j, dx > 0 ? l : c);
        for (const [side, at, len] of [[-1, 0.45, 0.35], [1, 0.6, 0.3]]) {
          const ay = y - Math.round(h * at), ax = x + side * 3;
          for (let dx = 0; dx < 3; dx++) b.set(x + side * (2 + dx), ay, c);
          for (let j = 0; j < h * len; j++) { b.set(ax, ay - j, c); b.set(ax + 1, ay - j, side > 0 ? l : c); }
        }
      }
    }
    palm(b, top, fx) {
      const x0 = Math.round(this.W * fx), y0 = top[x0], h = Math.round(34 * this.k);
      const trunk = this.landCol('#8a6a48', 0), leaf = this.landCol('#3f8a4e', 0), leafL = lit(leaf, this.night ? 0.04 : 0.14);
      let x = x0;
      for (let j = 0; j < h; j++) { x = x0 - Math.round(Math.pow(j / h, 1.6) * 8 * this.k); b.set(x, y0 - j, j % 3 ? trunk : dim(trunk, 0.15)); b.set(x + 1, y0 - j, dim(trunk, 0.1)); }
      this.palmTop = { x, y: y0 - h, leaf, leafL };
    }
    islandPalms(b, top, L) {
      const c = this.landCol('#5d8a6e', L.haze);
      const cx = Math.round(this.W * L.at);
      for (const dx of [-4, 3]) { const x = cx + Math.round(dx * this.k), y = top[x]; for (let j = 1; j < 6 * this.k; j++) b.set(x + (j > 3 ? 1 : 0), y - j, c); const ty = y - Math.round(6 * this.k); for (let k = -3; k <= 3; k++) { b.set(x + 1 + k, ty + Math.abs(k) * 0.5, c); } }
    }
    coral(b, top) {
      const r = this.rand, cols = this.pal(['#ff8a7a', '#f6c35a', '#c48cf0', '#6fd6c0'], 0.25);
      for (let i = 0; i < this.W / (14 * this.k); i++) {
        const x = Math.round(r() * this.W), y = top[x] + 1, c = cols[i % cols.length], h = Math.round((3 + r() * 4) * this.k);
        for (let j = 0; j < h; j++) for (let dx = -Math.round(j * 0.5); dx <= Math.round(j * 0.5); dx += 2) b.set(x + dx, y - j, c);
      }
    }
    prepWater(front, wa) {
      // things that float on the water (they don't ripple with the reflection)
      const { W, H } = this, r = this.rand, wy = this.wy;
      if (wa.lilies) {
        const pad = this.landCol('#5f9e58', 0), padL = lit(pad, this.night ? 0.04 : 0.15), pink = this.landCol('#ffb3c9', 0);
        this.lilies = [];
        for (let i = 0; i < 9; i++) {
          const x = Math.round(r() * W), y = Math.round(wy + 6 + r() * (H * 0.88 - wy - 10)), rx = Math.round((2.5 + r() * 2.5) * this.k * (0.6 + (y - wy) / (H - wy)));
          for (let dy = -rx; dy <= rx; dy++) for (let dx = -rx; dx <= rx; dx++) { const e = Math.hypot(dx, dy * 2.6); if (e > rx || (dx > 0 && Math.abs(dy) < 1 && dx < rx * 0.9)) continue; front.set(x + dx, y + dy, dy < 0 ? padL : pad); }
          if (r() > 0.45) { front.set(x - 1, y - 1, pink); front.set(x, y - 2, pink); front.set(x + 1, y - 1, pink); front.set(x, y - 1, this.landCol('#ffe27a', 0)); }
          this.lilies.push({ x, y });
        }
      }
    }

    // ---- what moves -----------------------------------------------------------------------------
    prepMoving() {
      const { W, H } = this, r = this.rand, R = this.R;
      // stars at night
      this.stars = [];
      if (this.night && !R.under) {
        const n = Math.round(W * this.hy / (this.world === 'city' ? 500 : 260));
        for (let i = 0; i < n; i++) {
          const x = Math.floor(r() * W), y = Math.floor(Math.pow(r(), 1.3) * this.hy * 0.85);
          if (this.sunAt && Math.hypot(x - this.sunAt.x, y - this.sunAt.y) < this.sunAt.r * 3) continue;
          this.stars.push({ x, y, p: r() * 6.28, s: 0.5 + r() * 2, b: r() > 0.94 ? 2 : r() > 0.6 ? 1 : 0 });
        }
        this.nextShoot = 4 + r() * 10;
      }
      // clouds: a few soft ones by day, faint ones at night
      this.clouds = [];
      if (!R.under) {
        const n = Math.max(3, Math.round(W / (this.night ? 140 : 75)));
        for (let i = 0; i < n; i++) {
          const far = i % 3 !== 0;
          const spr = this.cloud(far ? 14 + r() * 18 : 26 + r() * 30, far);
          this.clouds.push({ spr, x: r() * (W + spr.width) - spr.width, y: Math.round(this.hy * (far ? 0.38 + r() * 0.35 : 0.08 + r() * 0.3)), v: (far ? 0.6 : 1.4) * (0.6 + r() * 0.6) * this.k });
        }
        this.clouds.sort((a, b) => a.v - b.v);
      }
      // grass, reeds and kelp along the front's top edge
      const F = R.front, top = this.frontTop;
      this.blades = [];
      if (F.grass || F.reeds || F.kelp) {
        const base = this.landCol(F.c, 0);
        const shades = [lit(base, this.night ? 0.03 : 0.12), base, dim(base, 0.1), lit(base, this.night ? 0.05 : 0.2)];
        if (F.gold) shades.push(this.landCol('#c7a24e', 0));
        const step = F.reeds || F.kelp ? Math.max(2, Math.round(5 * this.k)) : 1;
        for (let x = 0; x < W; x += step) {
          if (F.grass && r() < 0.25) continue;
          const xx = x + (step > 1 ? Math.round(r() * step) : 0);
          const y = top[Math.min(W - 1, Math.max(0, xx))] + 1;
          let h;
          if (F.kelp) h = Math.round((H - y) * 0 + (20 + r() * 50) * this.k);
          else if (F.reeds) h = Math.round((12 + r() * 22) * this.k);
          else h = Math.round((F.grass === 2 ? 3 + r() * 7 : 2 + r() * 4) * this.k);
          this.blades.push({ x: xx, y, h, c: F.kelp ? this.landCol(r() > 0.5 ? '#3f8a5e' : '#4f9a52', 0.15) : F.reeds ? this.landCol(r() > 0.5 ? '#4f7f46' : '#5d8f4f', 0) : shades[Math.floor(r() * shades.length)], p: r() * 6.28, head: F.reeds && r() > 0.45 });
        }
      }
      // floating bits
      this.motes = [];
      const kind = this.night && ['pollen', 'petals', 'leaves', 'none'].includes(R.motes) && !['beach', 'city', 'mountains'].includes(this.world) ? 'fireflies' : this.night && R.motes === 'sand' ? 'none' : this.night && R.under ? 'glow' : R.motes;
      this.moteKind = kind;
      const counts = { pollen: 26, petals: 30, leaves: 26, snow: 70, sand: 30, bubbles: 22, fireflies: 16, glow: 30, none: 0 };
      for (let i = 0; i < (counts[kind] || 0) * Math.min(1.6, this.k); i++) this.motes.push(this.mote(kind, true));
      this.mist = (R.mist || []).map((y, i) => ({ y: Math.round(y * H), spr: this.mistStrip(i), v: (0.8 + i * 0.5) * this.k }));
      this.sparkles = [];
      this.ripples = [];
    }
    cloud(w, far) {
      const r = this.rand, h = Math.round(w * 0.42), c = G.canvas(Math.round(w) + 4, h + 4), g = c.getContext('2d');
      const base = this.night ? rgb('#2a3866') : far ? mixc(rgb('#ffffff'), this.horizonCol(), 0.25) : rgb('#ffffff');
      const shade = this.night ? rgb('#222c55') : mixc(base, this.sky()[1], 0.35), hi = this.night ? rgb('#36457a') : rgb('#ffffff');
      const blobs = [];
      for (let i = 0; i < 5; i++) blobs.push([w * (0.15 + i * 0.17 + (r() - 0.5) * 0.06), h * (0.55 - Math.sin((i / 4) * Math.PI) * 0.25), h * (0.28 + Math.sin((i / 4) * Math.PI) * 0.22)]);
      const inside = (x, y) => y < h * 0.86 && blobs.some(([bx, by, br]) => Math.hypot(x - bx, (y - by) * 1.1) < br);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        const up = !inside(x, y - 2), down = !inside(x, y + 2);
        g.fillStyle = css(up ? hi : down || y > h * 0.66 ? shade : base, this.night ? 0.7 : 1);
        g.fillRect(x + 2, y + 2, 1, 1);
      }
      return c;
    }
    mistStrip(i) {
      const W = this.W * 2, h = Math.round(this.H * 0.09), c = G.canvas(W, h), g = c.getContext('2d'), n = noise1(this.rand);
      const ink = this.night ? '150,170,210' : '255,255,255';
      for (let x = 0; x < W; x++) {
        const thick = (0.4 + n(x * 0.012 + i * 7) * 0.6) * h;
        for (let y = 0; y < h; y++) { const d = Math.abs(y - h / 2) / (thick / 2 + 0.01); if (d < 1) { g.fillStyle = 'rgba(' + ink + ',' + (Math.pow(1 - d, 1.5) * 0.6).toFixed(2) + ')'; g.fillRect(x, y, 1, 1); } }
      }
      return c;
    }
    mote(kind, anywhere) {
      const r = this.rand, { W, H } = this;
      const m = { k: kind, x: r() * W, y: anywhere ? r() * H : -4, p: r() * 6.28, s: 0.5 + r() };
      if (kind === 'bubbles' || kind === 'glow') { m.y = anywhere ? r() * H : H + 2; }
      if (kind === 'fireflies') { m.y = this.hy + r() * (H - this.hy) * 0.9; m.x = r() * W; }
      if (kind === 'sand') { m.y = this.hy + r() * (H - this.hy); m.x = anywhere ? r() * W : -10; }
      if (kind === 'leaves') m.c = this.pal(['#e07a35', '#d6553a', '#f0b23c', '#c9682f'], 0)[Math.floor(r() * 4)];
      if (kind === 'petals') m.c = rgb(r() > 0.5 ? '#ffc4d6' : '#ffffff');
      return m;
    }

    draw(g, t, still) {
      const { W, H } = this;
      if (still) t = 12.3; // the same calm moment every time
      const dt = this.lastT === undefined || still ? 0 : Math.min(0.2, Math.max(0, t - this.lastT));
      this.lastT = t;
      g.imageSmoothingEnabled = false;
      g.drawImage(this.skyC, 0, 0);
      // stars twinkle; now and then one shoots across
      for (const s of this.stars) {
        const a = s.b === 2 ? 0.85 : (0.35 + s.b * 0.25) * (0.6 + 0.4 * Math.sin(t * s.s + s.p));
        g.fillStyle = 'rgba(255,255,245,' + a.toFixed(2) + ')'; g.fillRect(s.x, s.y, 1, 1);
        if (s.b === 2) { g.fillStyle = 'rgba(255,255,245,' + (0.3 + 0.25 * Math.sin(t * s.s + s.p)).toFixed(2) + ')'; g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1); g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1); }
      }
      if (this.night && !this.R.under && !still) this.shooting(g, t);
      if (this.night && this.R.aurora) this.aurora(g, t);
      if (this.R.under) this.rays(g, t);
      for (const c of this.clouds) {
        if (!still) { c.x += c.v * dt; if (c.x > W + 2) c.x = -c.spr.width; }
        g.drawImage(c.spr, Math.round(c.x), c.y);
      }
      g.drawImage(this.backC, 0, 0);
      if (this.millAt) this.sails(g, t);
      for (const m of this.mist) { const off = Math.round((t * m.v) % W); g.globalAlpha = this.night ? 0.08 : 0.18; g.drawImage(m.spr, -off, m.y - Math.round(m.spr.height / 2)); g.globalAlpha = 1; }
      if (this.R.water) this.water(g, t, still, dt);
      if (this.R.boat) this.boat(g, t);
      g.drawImage(this.frontC, 0, 0);
      if (this.R.front.waves) this.waves(g, t);
      if (this.R.wind) this.wind(g, t);
      if (this.palmTop) this.palmLeaves(g, t);
      if (this.windows && this.night) this.twinkle(g, t);
      if (this.beacons && this.night) for (const bcn of this.beacons) if (Math.sin(t * 2 + bcn.p) > 0.6) { g.fillStyle = '#ff5a5a'; g.fillRect(bcn.x, bcn.y, 1, 1); }
      if (this.lampsAt && this.night) for (const l of this.lampsAt) { g.fillStyle = 'rgba(255,220,150,.12)'; g.fillRect(l.x - 2, l.y + 1, 5, 4); }
      this.sway(g, t);
      this.floaters(g, t, still, dt);
    }
    shooting(g, t) {
      if (!this.shoot && t > (this.nextShootAt || (this.nextShootAt = t + this.nextShoot))) this.shoot = { t0: t, x: this.W * (0.2 + this.rand() * 0.5), y: this.hy * (0.08 + this.rand() * 0.3) };
      if (!this.shoot) return;
      const k = (t - this.shoot.t0) / 0.9;
      if (k > 1) { this.shoot = null; this.nextShootAt = t + 8 + this.rand() * 16; return; }
      for (let i = 0; i < 10; i++) {
        const x = Math.round(this.shoot.x + (k * 50 - i) * this.k), y = Math.round(this.shoot.y + (k * 50 - i) * 0.45 * this.k);
        g.fillStyle = 'rgba(255,255,240,' + ((1 - i / 10) * (1 - k) * 0.9).toFixed(2) + ')'; g.fillRect(x, y, 1, 1);
      }
    }
    aurora(g, t) {
      const { W } = this, hy = this.hy;
      for (let band = 0; band < 2; band++) {
        for (let x = 0; x < W; x++) {
          const y = hy * (0.26 + band * 0.14) + Math.sin(x * 0.018 + t * 0.25 + band * 2) * 7 * this.k + Math.sin(x * 0.051 - t * 0.4) * 3 * this.k;
          const h = (12 + 7 * Math.sin(x * 0.03 + t * 0.3 + band)) * this.k, a = 0.1 + 0.08 * Math.sin(x * 0.07 + t * 0.6 + band * 3);
          if (a <= 0.02) continue;
          for (let s = 0; s < 4; s++) { g.fillStyle = s < 2 ? 'rgba(110,255,180,' + (a * (1 - s * 0.3)).toFixed(3) + ')' : 'rgba(160,120,255,' + (a * 0.6 * (1 - (s - 2) * 0.4)).toFixed(3) + ')'; g.fillRect(x, Math.round(y - h * (s + 1) / 4), 1, Math.ceil(h / 4)); }
        }
      }
    }
    rays(g, t) {
      const { W, H } = this;
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.2) + Math.sin(t * 0.1 + i) * 10 * this.k, a = (this.night ? 0.025 : 0.06) + 0.035 * Math.sin(t * 0.5 + i * 1.7);
        g.fillStyle = 'rgba(220,245,255,' + Math.max(0, a).toFixed(3) + ')';
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 10 * this.k, 0); g.lineTo(x + 40 * this.k + H * 0.15, H * 0.85); g.lineTo(x + H * 0.15, H * 0.85); g.closePath(); g.fill();
      }
    }
    sails(g, t) {
      const m = this.millAt, a0 = t * 0.6;
      g.fillStyle = css(m.c);
      for (let s = 0; s < 4; s++) { const a = a0 + s * Math.PI / 2; for (let i = 1; i <= m.len; i++) g.fillRect(Math.round(m.x + Math.cos(a) * i), Math.round(m.y + Math.sin(a) * i), 1, 1); }
      g.fillRect(m.x, m.y, 1, 1);
    }
    water(g, t, still, dt) {
      const { W, H } = this, wa = this.R.water, wy = this.wy;
      const bottom = this.waterBottom || (this.waterBottom = this.frontTop ? Math.max(...Array.from(this.frontTop).filter((v) => v <= H)) : H);
      // the reflection: the picture above, upside down, wobbling a little more the closer it is
      for (let y = wy; y < bottom; y++) {
        const d = y - wy, src = Math.max(0, wy - 1 - Math.round(d * 1.05));
        const off = Math.round(Math.sin(d * 0.7 + t * 2.1) * (0.4 + d * 0.035) * this.k);
        g.drawImage(g.canvas, 0, src, W, 1, off, y, W, 1);
      }
      const deep = rgb(wa.c), near = wa.near ? rgb(wa.near) : deep;
      const tint = (k) => (this.night ? mixc(mixc(deep, NIGHT_LAND, 0.6), near, k * 0.1) : mixc(deep, near, k));
      const n = Math.max(1, bottom - wy);
      for (let y = wy; y < bottom; y++) { const k = (y - wy) / n; g.fillStyle = css(tint(k), (wa.sea ? 0.55 : 0.42) + k * 0.25); g.fillRect(0, y, W, 1); }
      // a bright line where the water meets the land, and swells on the sea
      g.fillStyle = this.night ? 'rgba(200,215,255,.18)' : 'rgba(255,255,255,.35)'; g.fillRect(0, wy, W, 1);
      if (wa.sea) for (let y = wy + 3; y < bottom; y += Math.max(3, Math.round((y - wy) * 0.25))) {
        const k = (y - wy) / n, len = Math.round((3 + k * 10) * this.k);
        g.fillStyle = this.night ? 'rgba(170,190,240,' + (0.08 + k * 0.1).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.12 + k * 0.18).toFixed(2) + ')';
        for (let x = ((Math.round(t * (2 + k * 6) * this.k) + y * 17) % (len * 3)) - len * 3; x < W; x += len * 3) g.fillRect(x, y, len, 1);
      }
      // sun or moon glitter
      if (!still) {
        if (this.rand() < 0.5) this.sparkles.push({ x: Math.round(this.rand() * W), y: Math.round(wy + 1 + Math.pow(this.rand(), 1.6) * (bottom - wy - 1)), life: 0 });
        this.sparkles = this.sparkles.filter((s) => (s.life += dt) < 0.6);
      }
      for (const s of this.sparkles) { g.fillStyle = this.night ? 'rgba(230,235,255,' + (0.6 - s.life).toFixed(2) + ')' : 'rgba(255,255,255,' + (0.9 - s.life * 1.4).toFixed(2) + ')'; g.fillRect(s.x, s.y, s.life < 0.3 ? 2 : 1, 1); }
      if (wa.ripples) {
        if (!still && this.rand() < dt * 0.7) this.ripples.push({ x: this.rand() * W, y: wy + 4 + this.rand() * (bottom - wy - 8), r: 0 });
        this.ripples = this.ripples.filter((rp) => (rp.r += dt * 6 * this.k) < 12 * this.k);
        for (const rp of this.ripples) {
          g.fillStyle = 'rgba(255,255,255,' + (0.4 * (1 - rp.r / (12 * this.k))).toFixed(2) + ')';
          for (let a = 0; a < 6.28; a += 0.35) g.fillRect(Math.round(rp.x + Math.cos(a) * rp.r), Math.round(rp.y + Math.sin(a) * rp.r * 0.32), 1, 1);
        }
      }
    }
    boat(g, t) {
      const { W } = this, x = Math.round(((t * 1.2 * this.k) % (W + 40)) - 20), y = this.wy - 1, k = this.k;
      g.fillStyle = this.night ? '#2b3250' : '#5a4636'; g.fillRect(x - Math.round(3 * k), y, Math.round(7 * k), 1); g.fillRect(x - Math.round(2 * k), y + 1, Math.round(5 * k), 1);
      g.fillStyle = this.night ? '#8a93b8' : '#ffffff';
      for (let j = 1; j <= 6 * k; j++) g.fillRect(x, y - j, Math.max(1, Math.round((6 * k - j) * 0.5)), 1);
    }
    waves(g, t) {
      const { W } = this, top = this.frontTop;
      for (let x = 0; x < W; x++) {
        const reach = (Math.sin(t * 0.7) * 0.5 + 0.5) * 3 * this.k + Math.sin(x * 0.05 + t * 0.9) * this.k;
        const y = top[x] + Math.round(reach);
        g.fillStyle = this.night ? 'rgba(170,185,220,.35)' : 'rgba(150,120,80,.18)'; g.fillRect(x, top[x], 1, Math.max(1, Math.round(reach)));
        g.fillStyle = this.night ? 'rgba(220,230,255,.55)' : 'rgba(255,255,255,.9)'; g.fillRect(x, y, 1, 1);
        if ((x + Math.round(t * 3)) % 4 === 0) g.fillRect(x, y - 1, 1, 1);
      }
    }
    wind(g, t) { // waves of wind across the field
      const { W } = this, top = this.tops[this.tops.length - 1], end = this.frontTop;
      for (let x = 0; x < W; x++) {
        const v = Math.pow(Math.max(0, Math.sin(x * 0.03 - t * 0.7)), 8);
        if (v < 0.05) continue;
        g.fillStyle = this.night ? 'rgba(200,220,255,' + (v * 0.06).toFixed(3) + ')' : 'rgba(255,255,220,' + (v * 0.16).toFixed(3) + ')';
        g.fillRect(x, top[x] + 2, 1, Math.max(0, end[x] - top[x] - 2));
      }
    }
    palmLeaves(g, t) {
      const p = this.palmTop, k = this.k;
      for (let s = 0; s < 6; s++) {
        const a = -Math.PI / 2 + (s - 2.5) * 0.55 + Math.sin(t * 1.1 + s) * 0.05, len = (12 + (s % 2) * 5) * k;
        for (let i = 1; i <= len; i++) {
          const droop = (i / len) * (i / len) * 7 * k;
          g.fillStyle = css(i < len * 0.4 ? p.leafL : p.leaf);
          g.fillRect(Math.round(p.x + Math.cos(a) * i), Math.round(p.y + Math.sin(a) * i * 0.6 + droop), 1, 2);
        }
      }
    }
    twinkle(g, t) { // a few windows go out and come back on
      const ws = this.windows;
      for (let i = 0; i < ws.length; i += 7) if (Math.sin(t * 0.3 + i * 1.7) > 0.93) { g.fillStyle = 'rgba(30,28,60,.85)'; g.fillRect(ws[i].x, ws[i].y, 1, 1); }
    }
    sway(g, t) {
      const kelp = this.R.front.kelp, reeds = this.R.front.reeds;
      for (const b of this.blades) {
        const amp = kelp ? 4 * this.k : reeds ? 2.2 * this.k : 1.2 * this.k;
        const sp = kelp ? 0.9 : 1.6, wave = Math.sin(t * sp + b.x * 0.06 + b.p * 0.3);
        g.fillStyle = css(b.c);
        for (let j = 0; j < b.h; j++) {
          const f = j / b.h, off = Math.round(wave * amp * f * f + (kelp ? Math.sin(t * 1.3 + j * 0.25 + b.p) * f * 1.5 * this.k : 0));
          g.fillRect(b.x + off, b.y - j, kelp ? 2 : 1, 1);
        }
        if (b.head) { const off = Math.round(wave * amp); g.fillStyle = this.night ? '#3a2a20' : '#7a5232'; g.fillRect(b.x + off, b.y - b.h - Math.round(3 * this.k), 1, Math.round(3 * this.k)); }
      }
    }
    floaters(g, t, still, dt) {
      const { W, H } = this;
      for (const m of this.motes) {
        if (!still) {
          switch (m.k) {
            case 'snow': m.y += (6 + m.s * 8) * this.k * dt; m.x += Math.sin(t * 0.8 + m.p) * 4 * this.k * dt; break;
            case 'leaves': m.y += (5 + m.s * 5) * this.k * dt; m.x += (Math.sin(t * 1.4 + m.p) * 10 + 4) * this.k * dt; break;
            case 'petals': m.y += (3 + m.s * 3) * this.k * dt; m.x += (6 + Math.sin(t + m.p) * 6) * this.k * dt; break;
            case 'pollen': m.y += Math.sin(t * 0.5 + m.p) * 2 * this.k * dt; m.x += (1.5 + Math.sin(t * 0.3 + m.p) * 2) * this.k * dt; break;
            case 'sand': m.x += (20 + m.s * 25) * this.k * dt; m.y += Math.sin(t * 2 + m.p) * 2 * dt; break;
            case 'bubbles': case 'glow': m.y -= (5 + m.s * 7) * this.k * dt * (m.k === 'glow' ? 0.2 : 1); m.x += Math.sin(t * 2 + m.p) * 3 * this.k * dt; break;
            case 'fireflies': m.x += Math.sin(t * 0.4 + m.p) * 5 * this.k * dt; m.y += Math.cos(t * 0.33 + m.p * 1.3) * 3 * this.k * dt; break;
            default: break;
          }
          if (m.y > H + 4 || m.y < -6 || m.x > W + 6 || m.x < -12) Object.assign(m, this.mote(m.k, false), m.k === 'fireflies' || m.k === 'pollen' ? { x: this.rand() * W } : {});
        }
        const x = Math.round(m.x), y = Math.round(m.y);
        switch (m.k) {
          case 'snow': g.fillStyle = this.night ? 'rgba(220,230,255,.8)' : 'rgba(255,255,255,.95)'; g.fillRect(x, y, m.s > 1.2 ? 2 : 1, m.s > 1.2 ? 2 : 1); break;
          case 'leaves': g.fillStyle = css(m.c); g.fillRect(x, y, Math.sin(t * 3 + m.p) > 0 ? 2 : 1, Math.sin(t * 3 + m.p) > 0 ? 1 : 2); break;
          case 'petals': g.fillStyle = css(m.c, 0.95); g.fillRect(x, y, Math.sin(t * 2.5 + m.p) > 0 ? 2 : 1, 1); break;
          case 'pollen': g.fillStyle = 'rgba(255,250,210,' + (0.4 + 0.3 * Math.sin(t * 2 + m.p)).toFixed(2) + ')'; g.fillRect(x, y, 1, 1); break;
          case 'sand': g.fillStyle = 'rgba(255,235,190,.35)'; g.fillRect(x, y, 3, 1); break;
          case 'bubbles': g.fillStyle = 'rgba(220,245,255,.55)'; g.fillRect(x, y, 1, 1); if (m.s > 1.1) { g.fillRect(x + 1, y - 1, 1, 1); g.fillRect(x - 1, y - 1, 1, 1); g.fillRect(x, y - 2, 1, 1); } break;
          case 'glow': g.fillStyle = 'rgba(120,255,230,' + (0.25 + 0.25 * Math.sin(t * 1.5 + m.p)).toFixed(2) + ')'; g.fillRect(x, y, 1, 1); break;
          case 'fireflies': {
            const a = Math.pow(Math.max(0, Math.sin(t * 1.2 + m.p)), 3);
            if (a < 0.05) break;
            g.fillStyle = 'rgba(230,250,140,' + (a * 0.25).toFixed(2) + ')'; g.fillRect(x - 1, y - 1, 3, 3);
            g.fillStyle = 'rgba(245,255,170,' + a.toFixed(2) + ')'; g.fillRect(x, y, 1, 1);
            break;
          }
          default: break;
        }
      }
    }
  }

  // one still picture of a world, for the choosers in Settings and on the website
  const previews = new Map();
  Scape.preview = function (world, night, W, H) {
    const key = world + (night ? 'n' : 'd') + W + 'x' + H;
    if (previews.has(key)) return previews.get(key);
    const c = G.canvas(W, H), s = new Scape({ world, night, W, H, seed: 'preview' });
    s.draw(c.getContext('2d'), 0, true);
    previews.set(key, c);
    return c;
  };
  Scape.NAMES = NAMES;
  G.Scape = Scape;
})();
