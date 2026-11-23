// SereneTab's skylines: New York, London, Santorini and Dubai in pixel art,
// each under its own sky right now. The sun and moon sit where they really
// are over that city (so London can be dark while New York has its sunset),
// the sky follows the sun through the day, and the city's real weather
// shows: clouds, rain, snow or fog. Windows light up after dark.
//
// Like the backgrounds (scape.js), a scene is painted once into layers at a
// few screen pixels per art pixel, then each frame adds what moves: drifting
// clouds, rippling reflections, rain, the Santorini windmill, blinking lights.
(function () {
  'use strict';
  const G = window.DiceGfx, L = window.DiceLogic;
  const rgb = (h) => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lit = (c, t) => mixc(c, [255, 255, 255], t);
  const dim = (c, t) => mixc(c, [0, 0, 0], t);
  const css = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a === undefined ? 1 : a) + ')';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  class Buf {
    constructor(W, H) { this.W = W; this.H = H; this.d = new Uint8ClampedArray(W * H * 4); }
    set(x, y, c, a) {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
      const i = (y * this.W + x) * 4, d = this.d;
      if (a !== undefined && a < 1) { if (a <= 0) return; const k = 1 - a; d[i] = d[i] * k + c[0] * a; d[i + 1] = d[i + 1] * k + c[1] * a; d[i + 2] = d[i + 2] * k + c[2] * a; d[i + 3] = Math.max(d[i + 3], 255 * a); return; }
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    get(x, y) { const i = (clamp(y | 0, 0, this.H - 1) * this.W + clamp(x | 0, 0, this.W - 1)) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
    rect(x, y, w, h, c, a) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a); }
    canvas() { const c = G.canvas(this.W, this.H); c.getContext('2d').putImageData(new ImageData(this.d, this.W, this.H), 0, 0); return c; }
  }

  // ---- the four cities ----------------------------------------------------------------
  // face: the compass direction you're looking in (so the sun is in the picture when it's that way)
  const CITIES = {
    newyork: { name: 'New York', lat: 40.71, lon: -74.01, tz: 'America/New_York', face: 280, ground: 0.78, water: '#3c5f86' },
    london: { name: 'London', lat: 51.507, lon: -0.122, tz: 'Europe/London', face: 235, ground: 0.8, water: '#4b6476' },
    santorini: { name: 'Santorini', lat: 36.462, lon: 25.376, tz: 'Europe/Athens', face: 255, ground: 0.66, water: '#1f5f9e' },
    dubai: { name: 'Dubai', lat: 25.197, lon: 55.274, tz: 'Asia/Dubai', face: 250, ground: 0.82, water: '#2a7ea1' },
  };

  // The sky by how high the sun is (degrees): top, middle, horizon.
  const SKY = [
    [-18, ['#05081a', '#0b1433', '#18244d']], // night
    [-10, ['#0d1640', '#26306a', '#5a4a80']], // blue hour
    [-4, ['#27367a', '#7a5a9a', '#f08a6a']], // dusk
    [1, ['#3a5aa8', '#c98aa0', '#ffb070']], // sunset
    [7, ['#3f74c8', '#8fb5e0', '#ffd6a0']], // golden hour
    [16, ['#3b7bd4', '#78b0ea', '#cde6f6']], // day
  ];
  function skyAt(alt) {
    if (alt <= SKY[0][0]) return SKY[0][1].map(rgb);
    for (let i = 1; i < SKY.length; i++) {
      if (alt <= SKY[i][0]) {
        const t = smooth(SKY[i - 1][0], SKY[i][0], alt);
        return SKY[i][1].map((h, k) => mixc(rgb(SKY[i - 1][1][k]), rgb(h), t));
      }
    }
    return SKY[SKY.length - 1][1].map(rgb);
  }
  const grey = (c, t) => { const g = (c[0] + c[1] + c[2]) / 3; return mixc(c, [g, g, g + 4], t); };

  class Skyline {
    // o: {city, W, H, now (Date), weather: {kind, code}}
    constructor(o) {
      this.city = CITIES[o.city] ? o.city : 'newyork';
      this.C = CITIES[this.city];
      this.W = o.W; this.H = o.H;
      this.k = Math.min(this.W / 480, this.H / 350); // landmarks keep their shape at any size, and leave the top of the sky open
      this.now = o.now || new Date();
      this.weather = o.weather || { kind: 'clear' };
      this.rand = G.seeded(G.hash('skyline-' + this.city + '-' + this.W));
      this.build();
    }
    s(v) { return Math.max(1, Math.round(v * this.k)); }
    build() {
      const { W, H, C } = this;
      this.gy = Math.round(H * C.ground);
      this.sun = L.sunPos(this.now, C.lat, C.lon);
      this.moon = L.moonPos(this.now, C.lat, C.lon);
      this.day = smooth(-8, 6, this.sun.alt); // 0 at night, 1 by day
      this.gold = this.sun.alt > -5 && this.sun.alt < 10 ? 1 - Math.abs(this.sun.alt - 2) / 8 : 0; // the warm light round sunrise and sunset
      const wk = this.weather.kind;
      this.cover = { clear: 0, some: 0.25, cloud: 0.75, fog: 0.6, rain: 0.8, snow: 0.7, storm: 0.95 }[wk] || 0;
      let [top, mid, low] = skyAt(this.sun.alt);
      if (this.cover > 0.4) { const t = (this.cover - 0.3) * 0.75; top = grey(top, t); mid = grey(mid, t); low = grey(low, t * 0.9); }
      this.skyCols = [top, mid, low];
      this.night = this.day < 0.35;
      // the sun or moon, if it's up and in front of you
      const place = (p) => {
        const rel = ((p.az - C.face + 540) % 360) - 180;
        if (p.alt < -2 || Math.abs(rel) > 75) return null;
        return { x: Math.round(W * (0.5 + rel / 170)), y: Math.round(this.gy - (this.gy * 0.9) * Math.min(1, Math.max(-0.02, p.alt) / 55)) - this.s(4), rel };
      };
      this.sunAt = place(this.sun);
      this.moonAt = this.sun.alt < 4 ? place(this.moon) : null;
      this.lightLeft = this.sunAt ? this.sunAt.rel < 0 : ((this.sun.az - C.face + 540) % 360) - 180 < 0;
      this.lights = []; this.blinkers = []; this.windows = [];
      this.skyC = this.buildSky();
      const city = new Buf(W, H);
      this['draw_' + this.city](city);
      this.cityC = city.canvas();
      this.cityBuf = city;
      this.buildWater();
      this.prepMoving();
    }

    // ---- sky ----------------------------------------------------------------------------
    buildSky() {
      const { W, H } = this, b = new Buf(W, H), [top, mid, low] = this.skyCols, span = this.gy;
      for (let y = 0; y < H; y++) {
        const t = Math.min(1, y / span), c = t < 0.6 ? mixc(top, mid, t / 0.6) : mixc(mid, low, (t - 0.6) / 0.4);
        for (let x = 0; x < W; x++) b.set(x, y, c);
      }
      // a warm wash on the side of the sky the sun is on, round sunset
      if (this.gold > 0 && this.cover < 0.8) {
        const sx = this.sunAt ? this.sunAt.x : this.lightLeft ? -W * 0.2 : W * 1.2, warm = rgb('#ffb27a');
        for (let y = 0; y < this.gy; y++) for (let x = 0; x < W; x++) {
          const d = Math.hypot((x - sx) / W, (y - this.gy) / this.gy * 0.8);
          b.set(x, y, warm, Math.max(0, 0.45 - d * 0.55) * this.gold * (1 - this.cover));
        }
      }
      const disc = (at, r, body, glowC, glowA, phase) => {
        const gr = Math.ceil(r * 3.4);
        for (let y = -gr; y <= gr; y++) for (let x = -gr; x <= gr; x++) {
          const d = Math.hypot(x, y);
          if (d > r && d <= gr) b.set(at.x + x, at.y + y, glowC, Math.pow(1 - (d - r) / (gr - r), 2.4) * glowA);
        }
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          const d = Math.hypot(x, y);
          if (d > r + 0.2) continue;
          let c = body;
          if (phase) { // the moon: only the lit part, with a faint dark side
            const lx = x / r, half = Math.sqrt(Math.max(0, 1 - (y / r) * (y / r))), edge = (1 - 2 * phase.lit) * half;
            const litHere = phase.waxing ? lx > edge : lx < -edge;
            c = litHere ? (Math.hypot(x / r + 0.3, y / r + 0.25) < 0.22 || Math.hypot(x / r - 0.25, y / r - 0.3) < 0.16 ? dim(body, 0.08) : body) : mixc(this.skyCols[0], body, 0.12);
          } else if (d > r - 1) c = lit(body, 0.3);
          b.set(at.x + x, at.y + y, c);
        }
      };
      const vis = 1 - this.cover * 0.85;
      if (this.sunAt && this.sun.alt > -1.5) {
        const low = smooth(12, -1, this.sun.alt);
        disc(this.sunAt, this.s(7), mixc(rgb('#fff1b8'), rgb('#ff9a52'), low), mixc(rgb('#fff6d8'), rgb('#ffb070'), low), 0.55 * vis);
      }
      if (this.moonAt && this.moon.lit > 0.03) disc(this.moonAt, this.s(5), rgb('#f2eedc'), rgb('#c9d6ff'), 0.3 * vis * (1 - this.day), this.moon);
      return b.canvas();
    }

    // ---- building blocks ------------------------------------------------------------------
    // colours for a layer: far ones fade into the sky
    tone(hex, far, glow) { // glow: how much a pale thing still shows by moonlight
      const day = rgb(hex), night = mixc(rgb('#141a33'), day, 0.18 + (glow || 0));
      let c = mixc(night, day, this.day);
      if (this.gold && this.day > 0.2) c = mixc(c, rgb('#d99a7a'), this.gold * 0.18);
      return mixc(c, this.skyCols[2], far || 0);
    }
    // a plain tower: windows, a lit side, maybe something on the roof
    tower(b, x, w, h, col, o) {
      o = o || {};
      const gy = o.base !== undefined ? o.base : this.gy, y0 = gy - h, side = this.s(1.5);
      b.rect(x, y0, w, h, col);
      const sunny = lit(col, 0.12 + this.gold * 0.1), shade = dim(col, 0.1);
      if (this.day > 0.3) { if (this.lightLeft) b.rect(x, y0, Math.min(side, w), h, sunny); else b.rect(x + w - Math.min(side, w), y0, Math.min(side, w), h, sunny); }
      else b.rect(x + w - 1, y0, 1, h, shade);
      if (o.windows !== false && w >= 4) this.windowsOn(b, x + 1, y0 + 2, w - 2, h - 3, col, o.far ? 0.5 : 1);
      if (o.roof === 'antenna') { b.rect(x + Math.floor(w / 2), y0 - this.s(8), 1, this.s(8), col); this.blinkers.push({ x: x + Math.floor(w / 2), y: y0 - this.s(8) }); }
      if (o.roof === 'tank' && w > 6) { b.rect(x + 2, y0 - 3, 3, 3, dim(col, 0.15)); b.rect(x + 2, y0 - 4, 3, 1, dim(col, 0.25)); }
      if (o.roof === 'step') b.rect(x + 2, y0 - this.s(4), Math.max(1, w - 4), this.s(4), col);
    }
    windowsOn(b, x, y, w, h, col, k) {
      const r = this.rand, gapX = 2, gapY = this.k > 1.6 ? 3 : 2;
      const dayWin = mixc(col, this.skyCols[1], 0.35), nightOff = dim(col, 0.25);
      for (let j = 0; j < h; j += gapY) for (let i = 0; i < w; i += gapX) {
        const px = x + i, py = y + j;
        if (this.day > 0.5) { if (r() < 0.8) b.set(px, py, dayWin, 0.55 * k); continue; }
        const on = r() < (0.28 + (1 - this.day) * 0.14) * k;
        if (on) {
          const warm = r() < 0.8 ? rgb('#ffd88a') : rgb('#c9e6ff'), c = mixc(nightOff, warm, (0.6 + r() * 0.4) * (1 - this.day * 0.6));
          b.set(px, py, c);
          if (r() < 0.04) this.windows.push({ x: px, y: py, c, p: r() * 100 });
        } else b.set(px, py, nightOff, 0.6);
      }
    }
    // a row of ordinary buildings between x0 and x1
    filler(b, x0, x1, hMin, hMax, pal, o) {
      o = o || {};
      const r = this.rand;
      let x = x0;
      while (x < x1) {
        const w = this.s(6 + r() * (o.wide || 10)), h = this.s(hMin + Math.pow(r(), o.pow || 1.6) * (hMax - hMin));
        const col = this.tone(pal[Math.floor(r() * pal.length)], o.far);
        const roof = r() < 0.12 ? 'antenna' : r() < 0.2 ? 'tank' : r() < 0.3 ? 'step' : null;
        this.tower(b, x, Math.min(w, x1 - x), h, col, { far: o.far, roof: o.far ? null : roof, base: o.base });
        x += w + (r() < 0.25 ? this.s(1) : 0);
      }
    }
    poly(b, pts, col) { // a filled polygon (points in art pixels)
      let y0 = Infinity, y1 = -Infinity;
      pts.forEach((p) => { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        const xs = [];
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], c = pts[(i + 1) % pts.length];
          if ((a[1] <= y + 0.5 && c[1] > y + 0.5) || (c[1] <= y + 0.5 && a[1] > y + 0.5)) xs.push(a[0] + (y + 0.5 - a[1]) / (c[1] - a[1]) * (c[0] - a[0]));
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x++) b.set(x, y, col);
      }
    }
    glowAt(b, x, y, r, c, a) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = Math.hypot(i, j) / r; if (d < 1) b.set(x + i, y + j, c, (1 - d) * (1 - d) * a); } }

    // ---- New York: One World Trade Center, the Empire State and the Chrysler, over the river
    draw_newyork(b) {
      const { W, gy } = this, s = (v) => this.s(v), far = ['#8e9bb0', '#9aa6ba', '#a7b0c0'], near = ['#5d6b84', '#6a7790', '#56637a', '#77839a', '#4f5b70'];
      this.filler(b, 0, W, 18, 70, far, { far: 0.55, pow: 1.2 });
      this.filler(b, 0, W, 14, 64, near, { pow: 2 });
      const x1 = Math.round(W * 0.15), x2 = Math.round(W * 0.43), x3 = Math.round(W * 0.6);
      // One World Trade Center: a glass tower that narrows as it rises, with a mast
      const glass = this.tone('#7f9cc0'), glass2 = this.tone('#a9c0dc'), h1 = s(160), base = s(22);
      for (let y = 0; y < h1; y++) {
        const t = y / h1, half = (base / 2) * (1 - t * 0.48), cx = x1;
        for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
          const facet = (x - cx) / Math.max(1, half) < (t * 2 - 1) * 0.9;
          b.set(x, gy - y, facet ? glass2 : glass);
        }
      }
      b.rect(x1 - s(2), gy - s(6), s(4), s(6), dim(glass, 0.2));
      b.rect(x1, gy - h1 - s(40), 1, s(40), this.tone('#c6ccd6'));
      this.blinkers.push({ x: x1, y: gy - h1 - s(40) });
      if (this.night) for (let y = gy - h1 + 2; y < gy - 6; y += 3) for (let x = x1 - 6; x <= x1 + 6; x += 2) if (this.rand() < 0.25) b.set(x, y, rgb('#d9ecff'), 0.7);
      // the Empire State: setbacks, then the mast; its top is floodlit at night
      const es = this.tone('#8a8478'), esTop = s(6);
      const steps = [[30, 44], [24, 36], [18, 46], [12, 16], [8, 8], [4, 8]];
      let y = gy;
      steps.forEach(([w, hh], i) => {
        const ww = s(w), h = s(hh);
        this.tower(b, x2 - Math.floor(ww / 2), ww, h, es, { base: y, windows: i < 4 });
        y -= h;
      });
      b.rect(x2, y - s(20), 1, s(20), this.tone('#b9b3a6'));
      this.blinkers.push({ x: x2, y: y - s(20) });
      if (this.night) { this.glowAt(b, x2, y + esTop, s(10), rgb('#ffd9a0'), 0.35); b.rect(x2 - s(4), y, s(8), s(8), rgb('#f6d9a8')); b.rect(x2 - s(2), y - s(6), s(4), s(6), rgb('#ffe9c4')); }
      // the Chrysler: a crown of stacked arches with little triangle windows, and a needle
      const ch = this.tone('#9a9ca6'), crown = this.night ? rgb('#e8eef8') : lit(ch, 0.3), shaft = s(112);
      this.tower(b, x3 - s(8), s(16), shaft, ch, {});
      let cy = gy - shaft;
      for (let i = 0; i < 6; i++) {
        const w = s(16 - i * 2.3), h = s(5);
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
          const u = xx / Math.max(1, w - 1) - 0.5, v = yy / h;
          if (v < Math.abs(u) * 1.3 - 0.35) continue; // the arched top of each step
          b.set(x3 - Math.floor(w / 2) + xx, cy - h + yy, (xx + yy) % 3 === 0 ? (this.night ? rgb('#fff6d0') : dim(crown, 0.18)) : crown);
        }
        cy -= h - 1;
      }
      b.rect(x3, cy - s(16), 1, s(16), crown);
      if (this.night) this.glowAt(b, x3, cy + s(10), s(12), rgb('#e9f1ff'), 0.25);
      // a few more tall ones in front, so the skyline isn't a row of three
      [[0.27, 92], [0.33, 74], [0.52, 84], [0.7, 98], [0.78, 70], [0.88, 80], [0.95, 60]].forEach(([fx, hh], i) => {
        const w = s(10 + (i % 3) * 3), col = this.tone(near[i % near.length]);
        this.tower(b, Math.round(W * fx) - Math.floor(w / 2), w, s(hh), col, { roof: i % 2 ? 'antenna' : 'step' });
      });
      // the river wall
      b.rect(0, gy, W, s(2), this.tone('#3d4656'));
    }

    // ---- London: Westminster and its clock tower, the Eye, St Paul's and the Shard, on the Thames
    draw_london(b) {
      const { W, gy } = this, s = (v) => this.s(v);
      this.filler(b, 0, W, 10, 40, ['#98a2ae', '#a4acb6', '#8f99a6'], { far: 0.5, pow: 1.4 });
      this.filler(b, Math.round(W * 0.42), W, 10, 34, ['#6f7480', '#7a7f8a', '#666b76'], { pow: 2.2, wide: 8 });
      const stone = this.tone('#c2a878'), stoneD = dim(stone, 0.14), gold = this.night ? rgb('#ffe2a0') : this.tone('#d9bf86');
      // the Palace of Westminster: a long gothic front with pinnacles, and the Victoria Tower at the far end
      const p0 = Math.round(W * 0.03), p1 = Math.round(W * 0.36), ph = s(26);
      b.rect(p0, gy - ph, p1 - p0, ph, stone);
      for (let x = p0; x < p1; x += s(5)) { b.rect(x, gy - ph - s(4), 1, s(4), stoneD); b.rect(x + s(2), gy - ph + s(4), 1, ph - s(8), stoneD); }
      for (let x = p0 + 1; x < p1; x += 2) if (this.night) b.set(x, gy - Math.round(ph * 0.55), rgb('#ffd98a'), 0.8);
      const vx = p0 + s(4), vw = s(16), vh = s(70);
      b.rect(vx, gy - vh, vw, vh, stone); b.rect(vx + vw - s(2), gy - vh, s(2), vh, stoneD);
      for (const dx of [0, vw - s(2)]) b.rect(vx + dx, gy - vh - s(6), s(2), s(6), stone);
      b.rect(vx + Math.floor(vw / 2), gy - vh - s(12), 1, s(8), stoneD);
      // the clock tower (Elizabeth Tower): shaft, clock faces, belfry, a tall pointed roof
      const ex = Math.round(W * 0.34), ew = s(12);
      let y = gy - s(70);
      b.rect(ex - Math.floor(ew / 2), y, ew, s(70), stone);
      b.rect(ex + Math.floor(ew / 2) - s(2), y, s(2), s(70), stoneD);
      for (let yy = y + s(4); yy < gy - 2; yy += s(5)) b.rect(ex - Math.floor(ew / 2) + s(3), yy, ew - s(6), s(2), stoneD);
      const cw = s(16); y -= s(16);
      b.rect(ex - Math.floor(cw / 2), y, cw, s(16), stone);
      const face = this.night ? rgb('#fff0c0') : rgb('#f4efe2'), fr = s(5);
      for (let j = -fr; j <= fr; j++) for (let i = -fr; i <= fr; i++) if (Math.hypot(i, j) <= fr) b.set(ex + i, y + s(8) + j, face);
      b.rect(ex, y + s(8) - s(4), 1, s(4), rgb('#2a2a2a')); b.rect(ex, y + s(8), s(3), 1, rgb('#2a2a2a'));
      if (this.night) this.glowAt(b, ex, y + s(8), s(12), rgb('#ffe4a0'), 0.3);
      y -= s(8);
      b.rect(ex - Math.floor(ew / 2), y, ew, s(8), stoneD);
      for (let i = 0; i < 3; i++) b.rect(ex - Math.floor(ew / 2) + s(2) + i * s(3.5), y + s(2), s(2), s(5), this.night ? rgb('#ffe4a0') : dim(stone, 0.3));
      this.poly(b, [[ex - ew / 2 - 1, y], [ex + ew / 2 + 1, y], [ex + 0.5, y - s(30)]], gold);
      b.rect(ex, y - s(34), 1, s(4), gold);
      // the London Eye: a big thin wheel with its little pods, leaning on its legs
      const lx = Math.round(W * 0.57), R = s(52), hubY = gy - R - s(6);
      const rim = this.night ? rgb('#8fb8ff') : this.tone('#e6eaf0'), spoke = this.night ? rgb('#5f7fd0') : this.tone('#c3c9d2');
      for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2; for (let r = 0; r < R; r += 0.7) b.set(lx + Math.cos(ang) * r, hubY + Math.sin(ang) * r, spoke, 0.55); }
      for (let a = 0; a < 720; a++) { const ang = a / 720 * Math.PI * 2; b.set(lx + Math.cos(ang) * R, hubY + Math.sin(ang) * R, rim); b.set(lx + Math.cos(ang) * (R - 1), hubY + Math.sin(ang) * (R - 1), rim, 0.6); }
      for (let a = 0; a < 32; a++) { const ang = a / 32 * Math.PI * 2; b.rect(Math.round(lx + Math.cos(ang) * (R + 1)) - 1, Math.round(hubY + Math.sin(ang) * (R + 1)), 2, 2, this.night ? rgb('#d8e6ff') : this.tone('#f4f6f8')); }
      const leg = this.tone('#b9c0ca');
      for (let t = 0; t <= 1; t += 0.01) { b.set(lx - s(4) - t * s(22), hubY + t * (gy - hubY), leg); b.set(lx - s(3) - t * s(14), hubY + t * (gy - hubY), leg); }
      b.rect(lx - 1, hubY - 1, 3, 3, leg);
      if (this.night) this.glowAt(b, lx, hubY, R + s(6), rgb('#6f8cff'), 0.12);
      // St Paul's: a drum of columns, the great dome, a lantern and its cross
      const sx = Math.round(W * 0.73), dome = this.tone('#b7b4a8'), domeL = lit(dome, 0.12);
      b.rect(sx - s(14), gy - s(26), s(28), s(26), this.tone('#c9c3b2'));
      b.rect(sx - s(11), gy - s(34), s(22), s(8), this.tone('#d2ccbb'));
      for (let i = 0; i < 6; i++) b.rect(sx - s(10) + i * s(4), gy - s(33), 1, s(6), dim(dome, 0.15));
      const dr = s(11);
      for (let j = 0; j <= dr; j++) for (let i = -dr; i <= dr; i++) if (Math.hypot(i, j * 1.05) <= dr) b.set(sx + i, gy - s(34) - j, (this.lightLeft ? i < -dr * 0.3 : i > dr * 0.3) && this.day > 0.3 ? domeL : dome);
      b.rect(sx - s(2), gy - s(34) - dr - s(7), s(4), s(7), dome);
      b.rect(sx, gy - s(34) - dr - s(12), 1, s(5), gold); b.rect(sx - 1, gy - s(34) - dr - s(10), 3, 1, gold);
      if (this.night) this.glowAt(b, sx, gy - s(40), s(16), rgb('#ffe6b0'), 0.25);
      // the Shard: a tall glass spike that breaks into splinters at the top
      const shx = Math.round(W * 0.88), shH = s(170), shB = s(30), gl = this.tone('#9fb3c8'), gl2 = lit(gl, 0.18);
      for (let yy = 0; yy < shH; yy++) {
        const t = yy / shH, half = shB / 2 * (1 - t);
        for (let x = Math.round(shx - half); x <= Math.round(shx + half); x++) b.set(x, gy - yy, (x - shx) / Math.max(1, half) < -0.2 + t * 0.4 ? gl2 : gl);
      }
      for (const [dx, hh] of [[-2, 6], [1, 9], [3, 4]]) b.rect(shx + s(dx * 0.6), gy - shH - s(hh), 1, s(hh), gl2);
      this.blinkers.push({ x: shx, y: gy - shH - s(9) });
      if (this.night) for (let yy = s(10); yy < shH - s(20); yy += 3) for (let x = -s(10); x <= s(10); x += 2) if (Math.abs(x) < shB / 2 * (1 - yy / shH) - 1 && this.rand() < 0.3) b.set(shx + x, gy - yy, rgb('#e6f2ff'), 0.7);
      b.rect(0, gy, W, s(2), this.tone('#4c5060'));
    }

    // ---- Santorini: white houses and blue domes on the cliff, a windmill, the sea ----------
    draw_santorini(b) {
      const { W, H, gy } = this, s = (v) => this.s(v), r = this.rand;
      // a far island on the horizon
      const isl = this.tone('#7a7f93', 0.45);
      for (let x = Math.round(W * 0.58); x < W; x++) { const u = (x / W - 0.58) / 0.42, h = Math.round(s(14) * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (0.8 + 0.2 * Math.sin(u * 17))); for (let y = 0; y < h; y++) b.set(x, gy - y, isl); }
      // the cliff: layers of red and dark volcanic rock, falling to the sea
      const rock = [this.tone('#8f5442'), this.tone('#7a4a3e'), this.tone('#9a6048'), this.tone('#6e4640')];
      const crack = this.tone('#4f3434'), sunRock = this.tone('#b07656');
      const wob = (x) => Math.sin(x * 0.045) * 0.6 + Math.sin(x * 0.13 + 2) * 0.3 + Math.sin(x * 0.31 + 5) * 0.15;
      const topAt = (x) => { const u = x / W; const t = H * 0.5 + wob(x) * s(4) + u * s(14); return Math.round(u < 0.52 ? t : t + Math.pow((u - 0.52) / 0.17, 1.6) * H * 0.24 + wob(x * 3) * s(3)); };
      this.cliff = topAt;
      for (let x = 0; x < W; x++) {
        const t0 = topAt(x);
        if (t0 >= H) continue;
        const slope = topAt(x + 2) - topAt(x - 2);
        for (let y = t0; y < H; y++) {
          const d = y - t0, band = Math.floor((d + wob(x * 1.7) * s(5)) / s(7));
          let c = rock[(band * 7 + 3) % rock.length];
          if (d < 2) c = this.tone('#c7ad8e');
          else if (slope > 3 && d < s(3) && this.day > 0.3) c = sunRock; // the cliff face catches the light
          else if ((x * 13 + band * 29) % 47 === 0 && d > s(6)) c = crack;
          b.set(x, y, c);
        }
      }
      // dark streaks running down the rock
      for (let i = 0; i < W / 9; i++) { const x = Math.floor(r() * W * 0.72), t0 = topAt(x) + s(8), len = s(6 + r() * 26); for (let y = t0; y < Math.min(H, t0 + len); y++) b.set(x, y, crack, 0.5); }
      // the village along the top: white cubes, blue doors, a few blue domes and a bell tower
      const white = this.tone('#f6f3ec', 0, 0.22), whiteS = dim(white, 0.1), blue = this.tone('#2f6fc0', 0, 0.1), blueL = lit(blue, 0.15);
      const houses = [];
      for (let x = 0; x < W * 0.66; x += s(4 + r() * 5)) {
        for (let row = 0; row < 5; row++) {
          const w = s(6 + r() * 8), h = s(5 + r() * 6), base = topAt(x) + row * s(6) + s(3) - Math.round(r() * 2);
          if (base > H * 0.86 || r() < 0.22 * row) continue;
          houses.push({ x, w, h, base });
        }
      }
      houses.sort((p, q) => q.base - p.base); // back rows first, front rows on top... front ones are lower down
      houses.reverse().forEach((hs) => {
        b.rect(hs.x, hs.base - hs.h, hs.w, hs.h, white);
        b.rect(this.lightLeft ? hs.x + hs.w - 1 : hs.x, hs.base - hs.h, 1, hs.h, whiteS);
        b.rect(hs.x, hs.base - hs.h, hs.w, 1, lit(white, 0.2));
        if (hs.w > s(7)) { const dx = hs.x + Math.floor(hs.w / 2) - 1; b.rect(dx, hs.base - s(4), s(2), s(4), r() < 0.6 ? blue : this.tone('#c9744a')); }
        if (this.night) for (let k = 0; k < hs.w - 2; k += 3) if (r() < 0.45) b.set(hs.x + 1 + k, hs.base - hs.h + 2 + (k % 2), rgb('#ffd27a'));
      });
      const domes = [[0.22, 9], [0.36, 7], [0.5, 8]];
      domes.forEach(([fx, rr]) => {
        const cx = Math.round(W * fx), base = topAt(cx) - s(2), R = s(rr), bw = s(rr * 2 + 4);
        b.rect(cx - Math.floor(bw / 2), base - s(10), bw, s(12), white);
        for (let j = 0; j <= R; j++) for (let i = -R; i <= R; i++) if (Math.hypot(i, j) <= R) b.set(cx + i, base - s(10) - j, (this.lightLeft ? i < -R * 0.3 : i > R * 0.3) ? blueL : blue);
        b.rect(cx, base - s(10) - R - s(5), 1, s(5), white); b.rect(cx - 1, base - s(10) - R - s(3), 3, 1, white);
        if (this.night) this.glowAt(b, cx, base - s(4), s(8), rgb('#ffd88a'), 0.3);
      });
      // a bell tower with two arches
      const bx = Math.round(W * 0.43), bb = topAt(bx) - s(2);
      b.rect(bx, bb - s(20), s(8), s(20), white); b.rect(bx + s(1), bb - s(17), s(2), s(4), blue); b.rect(bx + s(5), bb - s(17), s(2), s(4), blue);
      b.rect(bx + s(3), bb - s(25), s(2), s(5), white);
      // the windmill (its sails turn: drawn each frame)
      const mx = Math.round(W * 0.09), mb = topAt(mx) - s(1);
      b.rect(mx - s(5), mb - s(22), s(10), s(22), white);
      b.rect(this.lightLeft ? mx + s(4) : mx - s(5), mb - s(22), 1, s(22), whiteS);
      b.rect(mx - 1, mb - s(8), s(3), s(6), this.tone('#6b4a35'));
      this.poly(b, [[mx - s(6), mb - s(22)], [mx + s(6), mb - s(22)], [mx, mb - s(30)]], this.tone('#9b7a54'));
      this.mill = { x: mx, y: mb - s(24), r: s(17) };
      // the sea runs to the bottom here: no wall
    }

    // ---- Dubai: the Burj Khalifa, the Burj Al Arab's sail, towers and the gulf ------------
    draw_dubai(b) {
      const { W, gy } = this, s = (v) => this.s(v);
      // desert haze behind the city
      for (let y = gy - s(18); y < gy; y++) for (let x = 0; x < W; x++) b.set(x, y, this.tone('#d8c2a0', 0.55), smooth(gy - s(18), gy, y) * 0.8);
      this.filler(b, 0, W, 24, 80, ['#a8b6c4', '#b2bdc8', '#9fafbe'], { far: 0.5, pow: 1.3 });
      this.filler(b, 0, Math.round(W * 0.74), 20, 96, ['#6c8296', '#7d90a2', '#5f7488', '#8898a8'], { pow: 1.6, wide: 8 });
      // two towers with sloped tops (like the Emirates Towers)
      [[0.16, 104, 12], [0.21, 84, 10]].forEach(([fx, hh, ww]) => {
        const x = Math.round(W * fx), w = s(ww), h = s(hh), col = this.tone('#8ea3b6');
        this.tower(b, x, w, h - s(10), col, {});
        this.poly(b, [[x, gy - h + s(10)], [x + w, gy - h + s(10)], [x + w, gy - h - s(2)]], col);
        b.rect(x + w - 1, gy - h - s(8), 1, s(8), col);
      });
      // a twisted tower: its windows wind round it
      const tx = Math.round(W * 0.28), tw = s(12), th = s(110), tc = this.tone('#7f95a8');
      b.rect(tx, gy - th, tw, th, tc);
      for (let y = 0; y < th; y += 2) { const ph = ((y / th) * 2.2) % 1; b.set(tx + Math.round(ph * (tw - 1)), gy - y, lit(tc, 0.22)); b.set(tx + Math.round(((ph + 0.5) % 1) * (tw - 1)), gy - y, dim(tc, 0.12)); }
      // the Burj Khalifa: tier after tier, narrowing to a needle
      const kx = Math.round(W * 0.45), kc = this.tone('#a9b8c8'), kl = lit(kc, 0.22), kd = dim(kc, 0.12);
      const tiers = [[30, 34], [25, 32], [21, 30], [17, 28], [14, 26], [11, 24], [8, 20], [6, 16], [4, 14], [3, 12]];
      const fit = Math.min(1, (gy * 0.74) / (282 * this.k)); // the tallest building in the world still has to fit
      let y = gy;
      tiers.forEach(([w, hh], i) => {
        const ww = s(w), h = Math.max(2, Math.round(hh * this.k * fit)), x = kx - Math.floor(ww / 2);
        b.rect(x, y - h, ww, h, kc);
        b.rect(this.lightLeft ? x : x + ww - s(2), y - h, s(2), h, this.day > 0.3 ? kl : kd);
        b.rect(x + Math.floor(ww / 2), y - h, 1, h, kd);
        if (i < 8) for (let yy = y - h + 1; yy < y; yy += 2) for (let xx = x + 1; xx < x + ww - 1; xx += 2) if (this.day < 0.5 ? this.rand() < 0.35 : this.rand() < 0.5) b.set(xx, yy, this.day < 0.5 ? rgb('#e2eeff') : mixc(kc, this.skyCols[1], 0.4), this.day < 0.5 ? 0.75 : 0.5);
        y -= h;
      });
      const sp = Math.round(46 * this.k * fit);
      b.rect(kx, y - sp, 1, sp, kc); b.rect(kx - 1, y - Math.round(sp * 0.4), 3, Math.round(sp * 0.4), kc);
      this.blinkers.push({ x: kx, y: y - sp });
      if (this.night) this.glowAt(b, kx, gy - s(120), s(30), rgb('#b9d4ff'), 0.12);
      // more towers to the right, and the beach
      [[0.56, 120, 12], [0.61, 92, 10], [0.66, 104, 14], [0.71, 78, 10]].forEach(([fx, hh, ww], i) => this.tower(b, Math.round(W * fx), s(ww), s(hh), this.tone(['#7c90a3', '#90a2b4', '#6e8398', '#8396a8'][i]), { roof: i % 2 ? 'antenna' : null }));
      b.rect(0, gy, Math.round(W * 0.78), s(2), this.tone('#d9c49e'));
      // the Burj Al Arab: a white sail on its own island, with the round helipad
      const ax = Math.round(W * 0.88), ab = gy + s(4), ah = s(86), white = this.night ? rgb('#e8ecff') : this.tone('#f3f4f6'), rib = dim(white, 0.1);
      b.rect(ax - s(26), ab, s(36), s(3), this.tone('#d9c49e'));
      for (let yy = 0; yy < ah; yy++) {
        const t = yy / ah, wx = Math.round(s(24) * Math.sqrt(Math.max(0, 1 - t * t)));
        for (let x = ax - wx; x <= ax; x++) b.set(x, ab - yy, (yy % s(6) === 0 || x === ax - wx) ? rib : white);
      }
      b.rect(ax, ab - ah - s(8), s(2), ah + s(8), rib);
      b.rect(ax + s(2), ab - ah - s(4), 1, s(6), rib);
      const hx = ax - s(17), hy = ab - Math.round(ah * 0.72);
      b.rect(hx - s(5), hy, s(10), s(2), rib); b.rect(hx - s(1), hy + s(2), s(2), s(4), rib);
      if (this.night) { this.glowAt(b, ax - s(8), ab - s(40), s(30), this.rand() < 0.5 ? rgb('#9aa8ff') : rgb('#ff9ad0'), 0.18); }
      this.blinkers.push({ x: ax, y: ab - ah - s(8) });
    }

    // ---- water: the city upside down, darker, and moving a little ------------------------
    buildWater() {
      const { W, H, gy, C } = this;
      if (this.city === 'santorini') { this.wy = gy; } else this.wy = gy + this.s(2);
      const wy = this.wy, rows = H - wy;
      if (rows <= 0) { this.waterC = null; return; }
      const b = new Buf(W, rows), sky = new Buf(W, H), base = this.tone(C.water);
      sky.d.set(this.skyC.getContext('2d').getImageData(0, 0, W, H).data);
      const deep = mixc(base, this.skyCols[2], 0.25);
      for (let y = 0; y < rows; y++) {
        const src = wy - 1 - y, t = y / rows;
        for (let x = 0; x < W; x++) {
          let c = mixc(deep, dim(base, 0.25), t);
          const city = this.cityBuf.get(x, src), sk = sky.get(x, src);
          const refl = city[3] > 0 && !(this.city === 'santorini' && x < W * 0.62) ? city : sk;
          c = mixc(c, refl, (0.38 - t * 0.22) * (y % 3 === 2 ? 0.7 : 1)); // fainter further down, with thin ripple lines
          b.set(x, y, c);
        }
      }
      // a path of light on the water under the sun or moon
      const lamp = this.sunAt && this.sun.alt > -1 && this.sun.alt < 30 ? { at: this.sunAt, c: rgb('#ffd8a0'), a: 0.6 } : this.moonAt && this.moon.alt > 0 && this.night ? { at: this.moonAt, c: rgb('#e6ecff'), a: 0.4 * this.moon.lit } : null;
      if (lamp && this.cover < 0.8) {
        for (let y = 0; y < rows; y++) {
          const spread = this.s(3) + y * 0.35;
          for (let x = -spread; x <= spread; x++) if (((y * 7 + Math.round(x) * 3) % 5) < 2) b.set(lamp.at.x + x, y, lamp.c, lamp.a * (1 - Math.abs(x) / spread) * (1 - y / rows * 0.5));
        }
      }
      // lit windows reflect as short streaks
      if (this.night) for (let x = 0; x < W; x++) for (let y = 0; y < Math.min(rows, this.s(30)); y += 2) {
        const c = this.cityBuf.get(x, wy - 1 - y);
        if (c[3] && c[0] > 200 && c[1] > 170) b.set(x, y, c, 0.35);
      }
      this.waterC = b.canvas();
    }

    // ---- what moves ---------------------------------------------------------------------
    prepMoving() {
      const { W, H } = this, r = this.rand;
      this.stars = [];
      if (this.day < 0.4 && this.cover < 0.6) {
        const n = Math.round(W * this.gy / 220 * (1 - this.day * 2) * (1 - this.cover));
        for (let i = 0; i < n; i++) {
          const x = Math.floor(r() * W), y = Math.floor(Math.pow(r(), 1.4) * this.gy * 0.8);
          if (this.cityBuf.get(x, y)[3]) continue;
          this.stars.push({ x, y, p: r() * 6.3, s: 0.6 + r() * 1.8, b: r() > 0.93 ? 2 : r() > 0.55 ? 1 : 0 });
        }
      }
      // clouds: how many and how grey come from the weather
      this.clouds = [];
      const nC = Math.round((2 + this.cover * 9) * (W / 480));
      const body = this.night ? mixc(this.skyCols[1], rgb('#7c86a8'), 0.4) : this.gold ? mixc(rgb('#ffffff'), rgb('#ffc2a0'), this.gold * 0.6) : rgb('#ffffff');
      const cc = this.cover > 0.5 ? grey(dim(body, this.cover * 0.18), 0.4) : body;
      for (let i = 0; i < nC; i++) {
        const w = Math.round((22 + r() * 50) * this.k * (1 + this.cover * 0.8)), h = Math.round(w * (0.22 + r() * 0.12));
        this.clouds.push({ x: r() * W, y: Math.round(r() * this.gy * (this.cover > 0.5 ? 0.45 : 0.6)), v: (1 + r() * 2) * this.k, spr: this.cloud(w, h, cc) });
      }
      // rain and snow
      this.drops = [];
      const kind = this.weather.kind, n = kind === 'snow' ? Math.round(W * H / 900) : kind === 'rain' || kind === 'storm' ? Math.round(W * H / 500) : 0;
      for (let i = 0; i < n; i++) this.drops.push({ x: r() * W, y: r() * H, v: kind === 'snow' ? 8 + r() * 10 : 120 + r() * 80, p: r() * 6.3 });
      this.flash = 0; this.nextFlash = 3 + r() * 6;
    }
    cloud(w, h, col) {
      const c = G.canvas(w + 4, h + 4), g = c.getContext('2d'), r = this.rand;
      const blobs = [];
      for (let i = 0; i < 5; i++) blobs.push({ x: w * (0.15 + i * 0.18 + (r() - 0.5) * 0.06), y: h * (0.62 - Math.sin(i / 4 * Math.PI) * 0.3), r: h * (0.35 + Math.sin(i / 4 * Math.PI) * 0.3) });
      const inside = (x, y) => y < h && blobs.some((b) => Math.hypot(x - b.x, (y - b.y) * 1.25) < b.r);
      const shade = dim(col, 0.08), hi = lit(col, 0.2);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (!inside(x, y)) continue;
        g.fillStyle = css(!inside(x, y - 2) ? hi : y > h * 0.7 ? shade : col, this.night ? 0.75 : 0.95);
        g.fillRect(x + 2, y + 2, 1, 1);
      }
      return c;
    }

    // ---- each frame -----------------------------------------------------------------------
    draw(g, t, still) {
      const { W, H } = this;
      if (still) t = 10;
      const dt = this.lastT === undefined || still ? 0 : Math.min(0.2, Math.max(0, t - this.lastT));
      this.lastT = t;
      g.imageSmoothingEnabled = false;
      g.drawImage(this.skyC, 0, 0);
      for (const s of this.stars) {
        const a = s.b === 2 ? 0.9 : (0.3 + s.b * 0.25) * (0.6 + 0.4 * Math.sin(t * s.s + s.p));
        g.fillStyle = 'rgba(255,255,240,' + a.toFixed(2) + ')'; g.fillRect(s.x, s.y, 1, 1);
      }
      for (const c of this.clouds) {
        if (!still) { c.x += c.v * dt; if (c.x > W + 2) c.x = -c.spr.width; }
        g.drawImage(c.spr, Math.round(c.x), c.y);
      }
      g.drawImage(this.cityC, 0, 0);
      // a few windows go on and off; the tallest masts blink red
      if (this.night) {
        for (const w of this.windows) if (Math.sin(t * 0.3 + w.p) < -0.6) { g.fillStyle = css(dim(w.c, 0.6)); g.fillRect(w.x, w.y, 1, 1); }
        for (const bl of this.blinkers) if ((t + bl.x * 0.01) % 2 < 0.25) { g.fillStyle = '#ff4a4a'; g.fillRect(bl.x, bl.y, 1, 1); g.fillStyle = 'rgba(255,74,74,.3)'; g.fillRect(bl.x - 1, bl.y - 1, 3, 3); }
      }
      if (this.mill) this.sails(g, t);
      if (this.waterC) {
        const rows = this.waterC.height;
        for (let y = 0; y < rows; y++) {
          const off = Math.round(Math.sin(t * 1.3 + y * 0.6) * (0.4 + y / rows * 1.4));
          g.drawImage(this.waterC, 0, y, W, 1, off, this.wy + y, W, 1);
          if (off) g.drawImage(this.waterC, off > 0 ? 0 : W - 1, y, 1, 1, off > 0 ? 0 : W + off, this.wy + y, Math.abs(off), 1);
        }
        // whatever stands in the water (Santorini's cliff, the Burj Al Arab's island) goes back on top
        g.drawImage(this.cityC, 0, this.wy, W, H - this.wy, 0, this.wy, W, H - this.wy);
      }
      const kind = this.weather.kind;
      if (this.drops.length) {
        if (kind === 'snow') {
          g.fillStyle = 'rgba(255,255,255,.85)';
          for (const d of this.drops) { if (!still) { d.y += d.v * this.k * dt; d.x += Math.sin(t + d.p) * 6 * this.k * dt; if (d.y > H) { d.y = -2; d.x = Math.random() * W; } } g.fillRect(Math.round(d.x), Math.round(d.y), 1, 1); }
        } else {
          g.fillStyle = this.night ? 'rgba(170,190,230,.35)' : 'rgba(220,232,245,.45)';
          for (const d of this.drops) { if (!still) { d.y += d.v * this.k * dt; d.x -= d.v * 0.15 * this.k * dt; if (d.y > H) { d.y = -4; d.x = Math.random() * (W + 20); } } g.fillRect(Math.round(d.x), Math.round(d.y), 1, 3); }
        }
      }
      if (kind === 'fog') { const gr = g.createLinearGradient(0, this.gy - H * 0.35, 0, H); gr.addColorStop(0, 'rgba(220,224,230,0)'); gr.addColorStop(0.6, this.night ? 'rgba(90,100,120,.45)' : 'rgba(225,228,234,.55)'); gr.addColorStop(1, this.night ? 'rgba(90,100,120,.3)' : 'rgba(225,228,234,.4)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
      if (kind === 'storm' && !still) {
        this.nextFlash -= dt;
        if (this.nextFlash < 0) { this.flash = 1; this.nextFlash = 4 + Math.random() * 9; }
        if (this.flash > 0) { g.fillStyle = 'rgba(235,240,255,' + (this.flash * 0.35).toFixed(2) + ')'; g.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt * 3); }
      }
    }
    sails(g, t) {
      const m = this.mill, a0 = t * 0.6, wood = css(this.tone('#6b4a35')), cloth = css(this.night ? rgb('#b8bccb') : this.tone('#f2eee4'));
      for (let i = 0; i < 6; i++) {
        const a = a0 + i * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
        g.fillStyle = wood;
        for (let r = 0; r < m.r; r++) g.fillRect(Math.round(m.x + ca * r), Math.round(m.y + sa * r), 1, 1);
        g.fillStyle = cloth;
        for (let r = Math.round(m.r * 0.3); r < m.r; r++) { const w = Math.round((r / m.r) * 3 * this.k); for (let k = 1; k <= w; k++) g.fillRect(Math.round(m.x + ca * r - sa * k), Math.round(m.y + sa * r + ca * k), 1, 1); }
      }
      g.fillStyle = wood; g.fillRect(m.x - 1, m.y - 1, 3, 3);
    }
  }
  Skyline.CITIES = CITIES;
  Skyline.skyAt = skyAt;
  G.Skyline = Skyline;
})();
