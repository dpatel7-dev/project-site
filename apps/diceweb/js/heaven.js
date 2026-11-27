// Heavenly looks: a layer of light over your world, for when you want everything to glow.
//
// Over the landscape (js/scape.js) it paints what you'd see on the best evening of the year:
// sunbeams fanning down through the clouds (moonbeams at night), deep lit clouds drifting in
// three layers, a warm bloom round the sun, motes of light rising through the air, glints,
// and at night soft starlight, aurora veils and the odd shooting star. Under the sea it's
// shafts of light and rising bubbles. The landscapes themselves are drawn finer too, and the
// glass and tiles get deeper (css/dice.css, html[data-looks=heaven]).
//
// It's drawn at half the screen's size (light is soft anyway), at up to 30 frames a second, and
// eases off by itself if the computer can't keep up. "Less motion" keeps one still, lit moment.
// window.DiceHeaven is the painter on its own, so the website's dice.json preview can use it too.
(function () {
  'use strict';

  // ---- little pictures, made once -------------------------------------------------------------------
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  function glowSprite(rgb, size, core) {
    const c = cv(size, size), g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(core || 0.18, 'rgba(' + rgb + ',.55)'); gr.addColorStop(0.5, 'rgba(' + rgb + ',.14)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }
  function glintSprite(rgb, size) { // a four-pointed sparkle
    const c = cv(size, size), g = c.getContext('2d'), r = size / 2;
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[size, size * 0.06], [size * 0.06, size]]) {
      const gr = g.createRadialGradient(r, r, 0, r, r, r);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',.35)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(r - w / 2, r - h / 2, w, h);
    }
    g.drawImage(glowSprite(rgb, size * 0.5, 0.3), r - size * 0.25, r - size * 0.25);
    return c;
  }
  // a cloud: lots of soft puffs in a cumulus shape, lit from the sun's side
  function cloudSprite(rand, w, h, look) {
    const c = cv(w, h), g = c.getContext('2d');
    const puffs = [];
    const n = 9 + Math.floor(rand() * 9);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = w * (0.12 + u * 0.76) + (rand() - 0.5) * w * 0.08;
      const hump = Math.sin(Math.PI * u) * (0.6 + rand() * 0.4);
      const r = h * (0.18 + hump * 0.3 + rand() * 0.08);
      puffs.push({ x, y: h * 0.78 - r * (0.55 + rand() * 0.3), r });
    }
    for (let i = 0; i < n * 0.7; i++) puffs.push({ x: w * (0.15 + rand() * 0.7), y: h * (0.62 + rand() * 0.12), r: h * (0.12 + rand() * 0.1) });
    // the body, in the shadow colour
    for (const p of puffs) {
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      gr.addColorStop(0, look.body); gr.addColorStop(0.78, look.body); gr.addColorStop(1, look.edge);
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    // the light on its sunny side, kept inside the cloud
    g.globalCompositeOperation = 'source-atop';
    const lx = look.from > 0 ? w : 0;
    const lg = g.createLinearGradient(lx, 0, w - lx, h);
    lg.addColorStop(0, look.lit); lg.addColorStop(0.55, look.mid); lg.addColorStop(1, look.shade);
    g.fillStyle = lg; g.fillRect(0, 0, w, h);
    // a bright rim along the tops
    for (const p of puffs) {
      const gr = g.createRadialGradient(p.x + look.from * p.r * 0.35, p.y - p.r * 0.45, 0, p.x, p.y - p.r * 0.3, p.r * 0.9);
      gr.addColorStop(0, look.rim); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
    }
    // a flat, darker underside
    const ug = g.createLinearGradient(0, h * 0.55, 0, h);
    ug.addColorStop(0, 'rgba(0,0,0,0)'); ug.addColorStop(1, look.under);
    g.fillStyle = ug; g.fillRect(0, 0, w, h);
    return c;
  }

  // something drifting on the breeze for each world: petals, leaves, snow, sand, spray
  const DRIFT = { hills: ['255,214,226', '255,246,250'], meadow: ['255,240,170', '255,255,255'], garden: ['255,190,214', '255,236,180'], pond: ['255,200,220', '240,255,240'], forest: ['230,255,190', '255,244,200'],
    autumn: ['232,128,58', '214,90,48', '245,180,70'], ice: ['240,248,255', '220,236,255'], desert: ['255,226,170'], beach: ['255,255,255', '210,240,255'], city: ['255,236,200'], mountains: ['255,255,255', '226,238,255'] };
  function petalSprite(rgb, size, leaf) {
    const c = cv(size, size), g = c.getContext('2d'), r = size / 2;
    const gr = g.createRadialGradient(r * 0.8, r * 0.7, 0, r, r, r);
    gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',.95)'); gr.addColorStop(1, 'rgba(' + rgb + ',.6)');
    g.fillStyle = gr;
    g.beginPath();
    if (leaf) { g.moveTo(r, size * 0.08); g.quadraticCurveTo(size * 0.95, r, r, size * 0.92); g.quadraticCurveTo(size * 0.05, r, r, size * 0.08); }
    else g.ellipse(r, r, r * 0.92, r * 0.5, 0, 0, 7);
    g.fill();
    return c;
  }

  const LOOKS = {
    day: { body: 'rgba(255,255,255,.92)', edge: 'rgba(255,255,255,0)', lit: 'rgba(255,248,230,.9)', mid: 'rgba(250,244,240,.5)', shade: 'rgba(196,210,236,.85)', rim: 'rgba(255,250,232,.95)', under: 'rgba(150,168,205,.5)',
      ray: '255,238,196', mote: '255,234,170', glint: '255,250,225', bloom: '255,236,190', haze: '255,244,226' },
    gold: { body: 'rgba(255,246,236,.9)', edge: 'rgba(255,240,230,0)', lit: 'rgba(255,214,160,.92)', mid: 'rgba(255,198,170,.55)', shade: 'rgba(190,150,190,.8)', rim: 'rgba(255,226,170,.95)', under: 'rgba(160,110,150,.5)',
      ray: '255,214,150', mote: '255,214,140', glint: '255,236,200', bloom: '255,200,140', haze: '255,226,196' },
    night: { body: 'rgba(120,136,190,.75)', edge: 'rgba(120,136,190,0)', lit: 'rgba(214,226,255,.75)', mid: 'rgba(150,166,214,.45)', shade: 'rgba(50,60,110,.8)', rim: 'rgba(230,238,255,.8)', under: 'rgba(24,30,70,.55)',
      ray: '196,212,255', mote: '186,226,255', glint: '230,240,255', bloom: '200,214,255', haze: '150,170,230' },
    deep: { ray: '190,240,255', mote: '210,245,255', glint: '230,250,255', bloom: '170,230,255', haze: '120,200,230' },
  };

  class Heaven {
    constructor(canvas) { this.c = canvas; this.g = canvas.getContext('2d'); this.key = ''; this.q = 1; this.slow = 0; }
    // o: { W, H (in screen pixels), scale, night, world, sun: {x, y (0..1), r}, horizon (0..1), under, warm }
    setup(o) {
      const scale = o.scale || 0.5, W = Math.round(o.W * scale), H = Math.round(o.H * scale);
      const key = [W, H, o.night, o.world, o.under, o.warm, o.sun ? Math.round(o.sun.x * 100) + ',' + Math.round(o.sun.y * 100) : '-', Math.round((o.horizon || 0.6) * 100), this.q].join('|');
      if (key === this.key) return;
      this.key = key;
      this.o = o; this.W = W; this.H = H; this.s = scale;
      this.c.width = W; this.c.height = H;
      const look = this.look = o.under ? LOOKS.deep : o.night ? LOOKS.night : o.warm ? LOOKS.gold : LOOKS.day;
      let seed = 0;
      for (const ch of String(o.world || 'hills') + (o.night ? 'n' : 'd')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
      const rand = this.rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      this.sun = o.sun ? { x: o.sun.x * W, y: o.sun.y * H, r: Math.max(6, (o.sun.r || 20) * scale) } : { x: W * 0.8, y: H * 0.12, r: 20 * scale };
      this.hy = (o.horizon || 0.6) * H;
      // the sprites
      this.mote = glowSprite(look.mote, 64, 0.12);
      this.glint = glintSprite(look.glint, 48);
      this.bloom = glowSprite(look.bloom, 512, 0.06);
      // the rays, drawn small and blown up: soft for free
      this.rayC = cv(W / 4, H / 4); this.rayG = this.rayC.getContext('2d');
      this.rays = [];
      const nr = this.q > 0.6 ? 9 : 5;
      // (fanning away from the middle of the sky: down and to the left when the sun's on the right)
      const fan = this.sun.x > W / 2 ? 2.05 : 1.1;
      for (let i = 0; i < nr; i++) this.rays.push({ a: (o.under ? 1.35 : fan) + (i / (nr - 1) - 0.5) * (o.under ? 0.9 : 1.3) + (rand() - 0.5) * 0.12, w: 0.03 + rand() * 0.07, p: rand() * 7, s: 0.15 + rand() * 0.25, k: 0.5 + rand() * 0.5 });
      // lit cloud banks low in the sky, and high thin ones, kept off the sun so its light comes through
      this.clouds = [];
      if (!o.under) {
        const lk = Object.assign({ from: this.sun.x > W / 2 ? 1 : -1 }, look);
        [[0.5, 3, 0.11, 0.003, 0.62, 0.9], [0.75, 3, 0.15, 0.006, 0.4, 0.72], [0.4, 2, 0.08, 0.009, 0.12, 0.3]].forEach(([alpha, n, size, speed, ylo, yhi], layer) => {
          for (let i = 0; i < Math.round(n * (this.q > 0.6 ? 1 : 0.6)); i++) {
            const h = H * size * (0.7 + rand() * 0.5), w = h * (3 + rand() * 2.4);
            let x = rand() * (W + w) - w;
            const y = this.hy * (ylo + rand() * (yhi - ylo)) - h * 0.6;
            if (Math.abs(x + w / 2 - this.sun.x) < w * 0.55 + this.sun.r * 3 && Math.abs(y + h / 2 - this.sun.y) < h + this.sun.r * 3) x = (x + W * 0.45) % W - w * 0.3;
            this.clouds.push({ spr: cloudSprite(rand, w, h, lk), x, y, v: speed * W * (0.7 + rand() * 0.6), a: alpha * (o.night ? 0.8 : 1), layer });
          }
        });
      }
      // the sun's warmth over everything, from its corner
      this.wash = cv(W, H);
      const wg = this.wash.getContext('2d'), wr = Math.hypot(W, H) * 0.75;
      const wgr = wg.createRadialGradient(this.sun.x, this.sun.y, 0, this.sun.x, this.sun.y, wr);
      wgr.addColorStop(0, 'rgba(' + look.bloom + ',' + (o.under ? 0.12 : o.night ? 0.12 : 0.3) + ')'); wgr.addColorStop(0.4, 'rgba(' + look.bloom + ',' + (o.night ? 0.04 : 0.09) + ')'); wgr.addColorStop(1, 'rgba(' + look.bloom + ',0)');
      wg.fillStyle = wgr; wg.fillRect(0, 0, W, H);
      // motes of light (bubbles under the sea), and the odd glint
      const nm = Math.round((o.under ? 60 : 90) * this.q * Math.min(1.4, (W * H) / (960 * 540)));
      this.motes = [];
      for (let i = 0; i < nm; i++) this.motes.push(this.newMote(true));
      // the haze at the horizon and the soft edges, once
      this.veil = cv(W, H);
      const vg = this.veil.getContext('2d');
      const hz = vg.createLinearGradient(0, this.hy - H * 0.22, 0, this.hy + H * 0.08);
      hz.addColorStop(0, 'rgba(' + look.haze + ',0)'); hz.addColorStop(0.7, 'rgba(' + look.haze + ',' + (o.night ? 0.1 : 0.22) + ')'); hz.addColorStop(1, 'rgba(' + look.haze + ',0)');
      vg.fillStyle = hz; vg.fillRect(0, 0, W, H);
      if (!o.night && !o.under) { // a faint lilac high up, like the sky in old paintings
        const top = vg.createLinearGradient(0, 0, 0, this.hy * 0.6);
        top.addColorStop(0, o.warm ? 'rgba(255,190,210,.16)' : 'rgba(214,200,255,.14)'); top.addColorStop(1, 'rgba(214,200,255,0)');
        vg.fillStyle = top; vg.fillRect(0, 0, W, this.hy);
      }
      const vn = vg.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.78);
      vn.addColorStop(0, 'rgba(0,0,0,0)'); vn.addColorStop(1, o.night ? 'rgba(4,6,24,.38)' : 'rgba(40,30,60,.14)');
      vg.fillStyle = vn; vg.fillRect(0, 0, W, H);
      // the clouds' shadows, crossing the land
      this.shadows = [];
      if (!o.under && !o.night) {
        this.shade = glowSprite('20,30,60', 256, 0.45);
        for (let i = 0; i < 4; i++) this.shadows.push({ x: rand() * W * 1.4 - W * 0.2, y: this.hy + rand() * (H - this.hy) * 0.8, w: W * (0.25 + rand() * 0.3), v: W * (0.008 + rand() * 0.008) });
      }
      // petals, leaves, snow… on the breeze
      const kinds = DRIFT[o.world] || DRIFT.hills;
      this.drifters = [];
      if (!o.under) {
        const nd = Math.round((o.world === 'ice' ? 40 : 16) * this.q);
        this.petals = kinds.map((rgb) => petalSprite(rgb, 24, o.world === 'autumn' || o.world === 'forest'));
        for (let i = 0; i < nd; i++) this.drifters.push(this.newDrifter(true));
      }
      this.stars = [];
      if (o.night && !o.under) for (let i = 0; i < 26; i++) this.stars.push({ x: rand() * W, y: rand() * this.hy * 0.7, r: 3 + rand() * 6, p: rand() * 7, s: 0.4 + rand() * 1.2 });
      this.shoot = null; this.nextShoot = 6 + rand() * 10;
    }
    newDrifter(anywhere) {
      const { W, H, rand } = this, z = rand(), snow = this.o.world === 'ice' || (this.o.night && this.o.world === 'mountains');
      return { x: anywhere ? rand() * W : -20 - rand() * W * 0.3, y: anywhere ? rand() * H * 0.9 : rand() * H * 0.6, z, s: (snow ? 3 : 5) + z * (snow ? 5 : 9), vx: W * (0.02 + z * 0.03), vy: H * (0.02 + rand() * 0.03), rot: rand() * 7, vr: (rand() - 0.5) * 2.4, p: rand() * 7, k: Math.floor(rand() * 9), snow };
    }
    newMote(anywhere) {
      const { W, H, rand } = this, z = rand();
      return { x: rand() * W, y: anywhere ? rand() * H : H + 10, z, r: (this.o.under ? 2.5 : 2) + z * z * (this.o.under ? 10 : 13), v: (0.012 + z * 0.03) * H, sw: 6 + rand() * 22, sp: 0.2 + rand() * 0.6, p: rand() * 7, tw: 0.6 + rand() * 2.2, glint: !this.o.under && rand() < 0.16 };
    }
    draw(t, still) {
      const { g, W, H, look, o } = this;
      if (!W) return;
      if (still) t = 18.5;
      const dt = this.lastT === undefined || still ? 0 : Math.min(0.1, Math.max(0, t - this.lastT));
      this.lastT = t;
      g.clearRect(0, 0, W, H);
      const breathe = 0.86 + 0.14 * Math.sin(t * 0.42);
      // starlight and aurora (night)
      if (this.stars.length) {
        g.globalCompositeOperation = 'lighter';
        for (const s of this.stars) { const a = 0.18 + 0.22 * Math.sin(t * s.s + s.p); if (a > 0) { g.globalAlpha = a; g.drawImage(this.mote, s.x - s.r, s.y - s.r, s.r * 2, s.r * 2); } }
        this.aurora(t);
        if (!still) this.shooting(t, dt);
        g.globalAlpha = 1;
      }
      // the clouds, drifting (the sun's light goes over them, below)
      g.globalCompositeOperation = 'source-over';
      for (const c of this.clouds) {
        if (dt) { c.x += c.v * dt; if (c.x > W + 4) { c.x = -c.spr.width - this.rand() * W * 0.2; } }
        g.globalAlpha = c.a;
        g.drawImage(c.spr, c.x, c.y + Math.sin(t * 0.15 + c.layer) * H * 0.004);
      }
      g.globalAlpha = 1;
      // shadows of clouds passing over the land
      for (const s of this.shadows) {
        if (dt) { s.x += s.v * dt; if (s.x > W + s.w) s.x = -s.w * 1.2; }
        g.globalAlpha = 0.085;
        g.drawImage(this.shade, s.x - s.w / 2, s.y - s.w * 0.1, s.w, s.w * 0.2);
      }
      g.globalAlpha = 1;
      g.drawImage(this.veil, 0, 0);
      // the bloom round the sun (or the moon), and its warmth over everything
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = breathe;
      g.drawImage(this.wash, 0, 0);
      const sr = this.sun.r * (o.night ? 9 : 13) * (0.94 + 0.06 * breathe);
      g.globalAlpha = (o.night ? 0.4 : o.under ? 0.3 : 0.7) * breathe;
      if (!o.under) g.drawImage(this.bloom, this.sun.x - sr, this.sun.y - sr, sr * 2, sr * 2);
      // a long soft streak across it, and two faint ghosts toward the middle
      if (!o.under) {
        g.globalAlpha = (o.night ? 0.12 : 0.18) * breathe;
        g.drawImage(this.bloom, this.sun.x - sr * 2.2, this.sun.y - sr * 0.08, sr * 4.4, sr * 0.16);
        for (const [k, rr] of [[0.55, 0.35], [1.25, 0.6]]) { const gx = this.sun.x + (W / 2 - this.sun.x) * k, gy = this.sun.y + (H / 2 - this.sun.y) * k; g.globalAlpha = 0.06 * breathe; g.drawImage(this.bloom, gx - sr * rr * 0.3, gy - sr * rr * 0.3, sr * rr * 0.6, sr * rr * 0.6); }
      }
      // the rays, fanning down over everything
      this.beams(t, breathe);
      g.globalAlpha = 1;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.rayC, 0, 0, W, H);
      // motes of light, rising and swaying, twinkling
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if (dt) { m.y -= m.v * dt; if (m.y < -20) this.motes[i] = this.newMote(false); }
        const x = m.x + Math.sin(t * m.sp + m.p) * m.sw, a = (0.25 + 0.75 * Math.max(0, Math.sin(t * m.tw + m.p))) * (0.25 + m.z * 0.6) * breathe;
        if (a < 0.03) continue;
        g.globalAlpha = Math.min(1, a);
        if (m.glint && a > 0.5) g.drawImage(this.glint, x - m.r * 1.6, m.y - m.r * 1.6, m.r * 3.2, m.r * 3.2);
        else g.drawImage(this.mote, x - m.r, m.y - m.r, m.r * 2, m.r * 2);
      }
      // and petals, leaves or snow, tumbling on the breeze
      g.globalCompositeOperation = 'source-over';
      for (let i = 0; i < this.drifters.length; i++) {
        const d = this.drifters[i];
        if (dt) { d.x += d.vx * dt * (1 + 0.6 * Math.sin(t * 0.7 + d.p)); d.y += d.vy * dt + Math.sin(t * 1.3 + d.p) * 0.4; d.rot += d.vr * dt; if (d.x > W + 30 || d.y > H + 30) this.drifters[i] = this.newDrifter(false); }
        g.globalAlpha = (0.55 + d.z * 0.45) * (this.o.night ? 0.6 : 1);
        if (d.snow) { g.globalCompositeOperation = 'lighter'; g.drawImage(this.mote, d.x - d.s, d.y - d.s, d.s * 2, d.s * 2); g.globalCompositeOperation = 'source-over'; continue; }
        const spr = this.petals[d.k % this.petals.length], sq = Math.abs(Math.cos(t * 1.7 + d.p)) * 0.75 + 0.25;
        g.save(); g.translate(d.x, d.y); g.rotate(d.rot); g.scale(1, sq);
        g.drawImage(spr, -d.s / 2, -d.s / 2, d.s, d.s);
        g.restore();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    beams(t, breathe) {
      const rg = this.rayG, w = this.rayC.width, h = this.rayC.height, sx = this.sun.x / 4, sy = this.sun.y / 4, len = Math.hypot(w, h) * 1.1;
      rg.clearRect(0, 0, w, h);
      rg.globalCompositeOperation = 'lighter';
      const base = this.o.under ? 0.24 : this.o.night ? 0.16 : 0.34;
      for (const r of this.rays) {
        const a = r.a + Math.sin(t * 0.05 + r.p) * 0.035, wd = r.w * (1 + 0.25 * Math.sin(t * r.s + r.p));
        const k = base * r.k * breathe * (0.55 + 0.45 * Math.sin(t * r.s * 1.3 + r.p * 2));
        if (k <= 0.01) continue;
        const ox = this.o.under ? w * (0.1 + ((r.p * 0.13) % 0.8)) : sx, oy = this.o.under ? -h * 0.05 : sy;
        const gr = rg.createRadialGradient(ox, oy, 0, ox, oy, len * (this.o.under ? 0.9 : 0.75));
        gr.addColorStop(0, 'rgba(' + this.look.ray + ',' + k.toFixed(3) + ')'); gr.addColorStop(0.45, 'rgba(' + this.look.ray + ',' + (k * 0.45).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(' + this.look.ray + ',0)');
        rg.fillStyle = gr;
        rg.beginPath(); rg.moveTo(ox, oy);
        rg.lineTo(ox + Math.cos(a - wd) * len, oy + Math.sin(a - wd) * len);
        rg.lineTo(ox + Math.cos(a + wd) * len, oy + Math.sin(a + wd) * len);
        rg.closePath(); rg.fill();
      }
    }
    aurora(t) {
      const { g, W } = this, hy = this.hy;
      // a curtain is one strip, drawn stretched, column by column
      if (!this.curtains) this.curtains = [['120,255,190', '120,200,255'], ['170,130,255', '120,200,255']].map(([a, b]) => {
        const c = cv(1, 64), cg = c.getContext('2d'), gr = cg.createLinearGradient(0, 0, 0, 64);
        gr.addColorStop(0, 'rgba(' + a + ',0)'); gr.addColorStop(0.35, 'rgba(' + a + ',1)'); gr.addColorStop(1, 'rgba(' + b + ',0)');
        cg.fillStyle = gr; cg.fillRect(0, 0, 1, 64); return c;
      });
      g.globalCompositeOperation = 'lighter';
      for (let band = 0; band < 2; band++) {
        const top = hy * (0.12 + band * 0.12), spr = this.curtains[band];
        for (let x = 0; x < W; x += 5) {
          const y = top + Math.sin(x * 0.006 + t * 0.12 + band * 2) * hy * 0.05 + Math.sin(x * 0.017 - t * 0.2) * hy * 0.015;
          const hgt = hy * (0.14 + 0.06 * Math.sin(x * 0.01 + t * 0.15 + band));
          const a = 0.05 + 0.04 * Math.sin(x * 0.02 + t * 0.3 + band * 3);
          if (a <= 0.01) continue;
          g.globalAlpha = a; g.drawImage(spr, x, y, 5, hgt);
        }
      }
      g.globalAlpha = 1;
    }
    shooting(t, dt) {
      const { g, W } = this;
      this.nextShoot -= dt;
      if (!this.shoot && this.nextShoot <= 0) this.shoot = { x: W * (0.15 + this.rand() * 0.5), y: this.hy * (0.05 + this.rand() * 0.3), k: 0 };
      if (!this.shoot) return;
      const s = this.shoot;
      s.k += dt / 1.1;
      if (s.k >= 1) { this.shoot = null; this.nextShoot = 9 + this.rand() * 18; return; }
      const L = W * 0.18, x = s.x + s.k * L, y = s.y + s.k * L * 0.42, fade = Math.sin(s.k * Math.PI);
      const gr = g.createLinearGradient(x, y, x - L * 0.45, y - L * 0.19);
      gr.addColorStop(0, 'rgba(255,255,245,' + (0.9 * fade).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(255,255,245,0)');
      g.strokeStyle = gr; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * 0.45, y - L * 0.19); g.stroke();
      g.globalAlpha = fade; g.drawImage(this.glint, x - 10, y - 10, 20, 20); g.globalAlpha = 1;
    }
  }
  window.DiceHeaven = Heaven;

  // ---- in DiceOS: over the world behind DiceTV, the desktop and the ambient screen --------------------------
  const D = window.Dice;
  if (!D) return;
  const H = D.heaven = { el: null, r: null, last: 0, frames: [], hostKey: '' };
  H.on = () => D.state.looks === 'heaven';
  function host() {
    if (D.wall && D.wall.on) return null;
    if (D.ambient && D.ambient.on && D.ambient.scene) return { parent: D.ambient.el, after: D.ambient.el && D.ambient.el.querySelector('canvas'), scene: D.ambient.scene, cell: D.ambient.cell, h: innerHeight, k: 'amb' };
    if (D.desk && D.desk.on) { const root = D.$('#desk'); return { parent: root, after: root && root.querySelector('.wall'), scene: D.desk.world, cell: D.scapeCell(), h: innerHeight, k: 'desk' }; }
    if (D.$('#app.running')) return null;
    return { parent: D.$('#app'), after: D.$('#hero'), scene: D.hero && D.hero.world, cell: D.scapeCell(), h: innerHeight, k: 'tv' };
  }
  H.frame = function (now) {
    const hs = H.on() && !document.hidden ? host() : null;
    if (!hs || !hs.scene || !hs.parent || !hs.after) { if (H.el) H.el.hidden = true; return; }
    if (!H.el) { H.el = document.createElement('canvas'); H.el.id = 'heaven'; H.el.setAttribute('aria-hidden', 'true'); H.r = new Heaven(H.el); }
    if (H.el.previousElementSibling !== hs.after) hs.after.after(H.el);
    H.el.hidden = false;
    const still = D.reduced();
    if (!still && now - H.last < 1000 / 30 - 2) return;
    if (still && H.last && H.hostKey === hs.k + H.r.key) return;
    // easing off when the computer can't keep up
    if (H.last) { H.frames.push(now - H.last); if (H.frames.length > 90) H.frames.shift(); }
    if (H.frames.length === 90) {
      const avg = H.frames.reduce((a, b) => a + b, 0) / 90;
      if (avg > 55 && H.r.q > 0.5) { H.r.q = 0.5; H.r.key = ''; H.frames = []; } else if (avg < 36 && H.r.q < 1) { H.r.q = 1; H.r.key = ''; H.frames = []; }
    }
    H.last = now;
    const sc = hs.scene, cell = hs.cell || 2, hr = new Date().getHours();
    H.r.setup({ W: innerWidth, H: innerHeight, scale: 0.5, night: sc.night, world: sc.world, under: !!(sc.R && sc.R.under), warm: !sc.night && (hr >= 17 || hr < 8),
      sun: sc.sunAt ? { x: sc.sunAt.x * cell / innerWidth, y: sc.sunAt.y * cell / innerHeight, r: sc.sunAt.r * cell } : null, horizon: (sc.hy || sc.H * 0.6) * cell / innerHeight });
    H.r.draw(now / 1000, still);
    H.hostKey = hs.k + H.r.key;
  };
  D.on('prefs', () => { H.last = 0; if (H.r) H.r.key = ''; D.desk && (D.desk.world = null); if (D.hero) D.hero.set(null, true); });
})();
