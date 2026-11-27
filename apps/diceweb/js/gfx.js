// DiceWeb's pictures: pixel icons, the mascots, and the little living worlds
// behind everything. Every world is drawn at a few hundred pixels across and
// blown up with sharp edges, so it stays pixel art at any screen size.
(function () {
  'use strict';
  const G = {};
  window.DiceGfx = G;

  const mix = (a, b, t) => mixHex(a, b, Math.max(0, Math.min(1, t)));
  const rnd = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  function seeded(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
  function hash(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  G.seeded = seeded; G.hash = hash; G.mix = mix;
  G.canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };

  // ---- Sprites -----------------------------------------------------------------
  // A grid of letters plus an ink for each letter, as a canvas with one pixel per cell.
  const sprites = new Map();
  G.sprite = function (grid, ink, key, flip) {
    const k = key ? key + (flip ? '|f' : '') : null;
    if (k && sprites.has(k)) return sprites.get(k);
    const w = Math.max(...grid.map((r) => r.length)), h = grid.length;
    const c = G.canvas(w, h), g = c.getContext('2d');
    grid.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = ink[ch];
      if (!col) return;
      g.fillStyle = col;
      g.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }));
    if (k) sprites.set(k, c);
    return c;
  };
  G.nightNow = () => (typeof Dice !== 'undefined' && Dice.night ? Dice.night() : typeof djp7Night === 'function' ? djp7Night() : false);
  // ---- The Dice die, as pixel art (see die3d.js) -----------------------
  const dice = new Map();
  G.die = function (size, M, opts) {
    const key = size + ':' + (opts && opts.key ? opts.key : JSON.stringify(M || 'rest')) + ':' + (opts && opts.outline ? 'o' : '');
    if (dice.has(key)) return dice.get(key);
    // resting: the flat logo die (sharp at any size); turning: the 3D one
    const img = !M && !(opts && opts.ray) ? DiceDie.iso(size, opts) : DiceDie.render(size, M || DiceDie.REST, Object.assign({ ss: size < 40 ? 4 : 3 }, opts || {}));
    const c = G.canvas(img.w, img.h);
    c.getContext('2d').putImageData(new ImageData(img.data, img.w, img.h), 0, 0);
    if (dice.size > 200) dice.clear();
    dice.set(key, c);
    return c;
  };
  // the die gently turning back and forth, for the worlds
  G.dieWobble = function (size, t) {
    const n = 16, k = Math.floor(((t * 1.2) % n + n) % n);
    const ang = Math.sin(k / n * Math.PI * 2) * 0.12;
    return G.die(size, DiceDie.pose([0, 1, 0], ang), { key: 'w' + k + (G.nightNow() ? 'n' : ''), outline: G.nightNow() ? [44, 44, 52] : null });
  };
  // The mascots, trimmed to their edges, plus a copy with the eyes shut.
  function mascotOf(who) {
    if (who === 'cubby') return CATALOG.cubby;
    return ART.mascots[who] || null;
  }
  G.mascot = function (who, opts) {
    opts = opts || {};
    if (who === 'cubby') return G.die(24, null, { key: 'mascot' });
    const m = mascotOf(who);
    if (!m) return null;
    const grid = trimGrid(m.grid);
    if (!opts.blink) return G.sprite(grid, m.ink, 'm:' + who, opts.flip);
    // eyes shut: each eye pixel takes the colour of the face just above it
    const shut = grid.map((row, y) => [...row].map((ch, x) => {
      if (ch !== 'E' && !(who === 'cubby' && ch === 'e')) return ch;
      for (let yy = y - 1; yy >= 0; yy--) { const up = grid[yy][x]; if (up !== 'E' && up !== 'e' && up !== '.') return up; }
      return ch;
    }).join(''));
    return G.sprite(shut, m.ink, 'mb:' + who, opts.flip);
  };
  // A friend's face: the top of the mascot, square, for avatars.
  G.face = function (who, size, bg) {
    const m = mascotOf(who);
    const c = G.canvas(size, size), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, size, size); }
    if (who === 'cubby') { const d = G.die(Math.round(size * 0.86), null, { key: 'face' }); g.drawImage(d, Math.round((size - d.width) / 2), Math.round((size - d.height) / 2)); return c; }
    if (!m) return c;
    const s = G.mascot(who);
    const scale = Math.max(1, Math.floor(size / Math.max(s.width, s.height) * 1.0));
    const w = s.width * scale, h = s.height * scale;
    g.drawImage(s, Math.round((size - w) / 2), Math.round((size - h) / 2 + size * 0.04), w, h);
    return c;
  };
  G.colourOf = (who) => (who === 'cubby' ? '#8a8a96' : (mascotOf(who) || {}).color || '#ff707a');

  // ---- Icons ----------------------------------------------------------------------
  // K is the ink (dark by day, light at night), k the ink faded, A the accent.
  const ICONS = {
    home: ['............', '.....AA.....', '....AAAA....', '...AAAAAA...', '..AAAAAAAA..', '.AAAAAAAAAA.', '..KKKKKKKK..', '..K......K..', '..K.KK.KK.K.', '..K.KK.KK.K.', '..K.KK....K.', '..KKKKKKKKK.'],
    library: ['............', '....AAA.....', 'KKK.AkA.....', 'KkK.AAA.KKK.', 'KKK.AAA.KkK.', 'KKK.AAA.KKK.', 'KkK.AkA.KKK.', 'KKK.AAA.KKK.', 'KKK.AAA.KkK.', 'KKK.AAA.KKK.', 'KKKKKKKKKKKK', '............'],
    store: ['............', '....KKKK....', '...K....K...', '...K....K...', '.AAAAAAAAAA.', '.AAAAAAAAAA.', '.AAAKAAKAAA.', '.AAAAAAAAAA.', '.AAAAAAAAAA.', '.AAAAAAAAAA.', '.AAAAAAAAAA.', '............'],
    music: ['............', '.....KKKKKK.', '.....KKKKKK.', '.....K....K.', '.....K....K.', '.....K....K.', '.....K....K.', '..AAAK.AAAK.', '.AAAAKAAAAK.', '.AAAA.AAAA..', '..AA...AA...', '............'],
    gear: ['.....KK.....', '..KK.KK.KK..', '..KKKKKKKK..', '...KKAAKK...', 'KKKKA..AKKKK', 'KKKA....AKKK', 'KKKA....AKKK', 'KKKKA..AKKKK', '...KKAAKK...', '..KKKKKKKK..', '..KK.KK.KK..', '.....KK.....'],
    power: ['.....AA.....', '..K..AA..K..', '.KK..AA..KK.', 'KK...AA...KK', 'K....AA....K', 'K..........K', 'K..........K', 'KK........KK', '.KK......KK.', '..KKKKKKKK..', '............', '............'],
    trophy: ['..AAAAAAAA..', 'KKAAAAAAAAKK', 'K.AAAAAAAA.K', 'K.AAAAAAAA.K', '.KAAAAAAAAK.', '...AAAAAA...', '....AAAA....', '.....AA.....', '.....AA.....', '....KKKK....', '...KKKKKK...', '............'],
    desktop: ['............', 'KKKKKKKKKKKK', 'KAAAAAAAAAAK', 'KAAAAAAAAAAK', 'KAAAAAAAAAAK', 'KAAAAAAAAAAK', 'KAAAAAAAAAAK', 'KKKKKKKKKKKK', '.....KK.....', '...KKKKKK...', '............', '............'],
    pad: ['............', '............', '..KKK..KKK..', '.KKKKKKKKKK.', 'KK.KKKKKKAKK', 'K...KKKKA.AK', 'KK.KKKKKKAKK', 'KKKKKKKKKKKK', 'KKKK....KKKK', '.KK......KK.', '............', '............'],
    bell: ['.....KK.....', '....KKKK....', '...KKKKKK...', '...KKKKKK...', '...KKKKKK...', '..KKKKKKKK..', '..KKKKKKKK..', '.KKKKKKKKKK.', 'KKKKKKKKKKKK', '............', '.....KK.....', '............'],
    friends: ['............', '...KK.......', '..KKKK..kk..', '..KKKK.kkkk.', '...KK..kkkk.', '........kk..', '.KKKKKK.....', 'KKKKKKKKkkk.', 'KKKKKKKkkkkk', 'KKKKKKKkkkkk', '............', '............'],
    person: ['............', '....KKKK....', '...KKKKKK...', '...KKKKKK...', '...KKKKKK...', '....KKKK....', '............', '..KKKKKKKK..', '.KKKKKKKKKK.', '.KKKKKKKKKK.', '.KKKKKKKKKK.', '............'],
    search: ['............', '..KKKK......', '.K....K.....', 'K......K....', 'K......K....', 'K......K....', 'K......K....', '.K....K.....', '..KKKKKK....', '......KKK...', '.......KKK..', '........KK..'],
    wifi: ['............', '..........KK', '..........KK', '.......KK.KK', '.......KK.KK', '....KK.KK.KK', '....KK.KK.KK', '.KK.KK.KK.KK', '.KK.KK.KK.KK', '............'],
    nowifi: ['............', '..........kk', '..........kk', '.......kk.kk', '.......kk.kk', '....kk.kk.kk', '....kk.kk.kk', '.KK.kk.kk.kk', '.KK.kk.kk.kk', '............'],
    sun: ['.....K......', '.K...K...K..', '..K.....K...', '....KKK.....', '...KKKKK....', 'KK.KKKKK.KK.', '...KKKKK....', '....KKK.....', '..K.....K...', '.K...K...K..', '.....K......'],
    moon: ['....KKK.....', '..KKKK......', '.KKKK.......', '.KKK........', 'KKKK........', 'KKKK........', 'KKKK.......K', '.KKKK.....KK', '.KKKKK..KKK.', '..KKKKKKKK..', '....KKKK....'],
    chart: ['K...........', 'K.........A.', 'K........AA.', 'K...A...A...', 'K..AAA.A....', 'K.A...A.....', 'KA..........', 'K...........', 'KKKKKKKKKKKK'],
    help: ['...KKKKK....', '..KK...KK...', '..KK...KK...', '.......KK...', '......KK....', '.....KK.....', '.....KK.....', '............', '.....KK.....', '.....KK.....'],
    volume: ['....K.......', '...KK...K...', 'KKKKK....K..', 'KKKKK.K..K..', 'KKKKK.K..K..', 'KKKKK....K..', '...KK...K...', '....K.......'],
    mute: ['....K.......', '...KK.......', 'KKKKK.K...K.', 'KKKKK..K.K..', 'KKKKK...K...', 'KKKKK..K.K..', '...KK.K...K.', '....K.......'],
    restart: ['...KKKKK....', '..K.....K.K.', '.K.......KK.', 'K.......KKK.', 'K...........', 'K...........', 'K..........K', '.K........K.', '..K......K..', '...KKKKKK...'],
    exit: ['KKKKKK......', 'K....K......', 'K....K..A...', 'K....K...A..', 'K..K.KAAAAA.', 'K....K...A..', 'K....K..A...', 'K....K......', 'KKKKKK......'],
    dots: ['............', '............', '............', '............', 'KK...KK...KK', 'KK...KK...KK', '............', '............'],
    die: ['.KKKKKKKKKK.', 'KK........KK', 'K.RR....BB.K', 'K.RR....BB.K', 'K..........K', 'K....YY....K', 'K....YY....K', 'K..........K', 'K.GG....PP.K', 'K.GG....PP.K', 'KK........KK', '.KKKKKKKKKK.'],
    play: ['..K.........', '..KK........', '..KKK.......', '..KKKK......', '..KKKKK.....', '..KKKKKK....', '..KKKKK.....', '..KKKK......', '..KKK.......', '..KK........', '..K.........'],
    pause: ['............', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..', '..KKK..KKK..'],
    next: ['............', '.K.....K..KK', '.KK....KK.KK', '.KKK...KKKKK', '.KKKK..KKKKK', '.KKK...KKKKK', '.KK....KK.KK', '.K.....K..KK'],
    prev: ['............', 'KK..K.....K.', 'KK.KK....KK.', 'KKKKK...KKK.', 'KKKKK..KKKK.', 'KKKKK...KKK.', 'KK.KK....KK.', 'KK..K.....K.'],
    cloud: ['.....KKK....', '....KAAAK...', '..KKAAAAAK..', '.KAAAAAAAAK.', 'KAAAAAAAAAAK', 'KAAAAAAAAAAK', '.KKKKKKKKKK.'],
    plus: ['....KK....', '....KK....', '....KK....', 'KKKKKKKKKK', 'KKKKKKKKKK', '....KK....', '....KK....', '....KK....'],
    lock: ['...KKKK...', '..K....K..', '..K....K..', '.KKKKKKKK.', '.KKKKKKKK.', '.KKKkkKKK.', '.KKKkkKKK.', '.KKKKKKKK.', '.KKKKKKKK.'],
    trash: ['...KKKK...', 'KKKKKKKKKK', '..........', '.KKKKKKKK.', '.K.K.K.KK.', '.K.K.K.KK.', '.K.K.K.KK.', '.K.K.K.KK.', '..KKKKKK..'],
    close: ['K......K', '.K....K.', '..K..K..', '...KK...', '...KK...', '..K..K..', '.K....K.', 'K......K'],
    bright: ['.....K.....', '.K...K...K.', '..K.....K..', '....KKK....', '...K...K...', 'KK.K...K.KK', '...K...K...', '....KKK....', '..K.....K..', '.K...K...K.', '.....K.....'],
    copy: ['...KKKKKKK', '...K.....K', 'KKKKKKK..K', 'K.....K..K', 'K.....K..K', 'K.....K..K', 'K.....KKKK', 'K.....K...', 'KKKKKKK...'],
    link: ['......KKKK', '.......KKK', '......K.KK', '.....K...K', '....K.....', 'KK.K......', 'K...KKKKKK', 'K........K', 'KKKKKKKKKK'],
    bt: ['.....K......', '.....KK.....', '..K..K.K....', '...K.K..K...', '....KK.K....', '.....KK.....', '....KK.K....', '...K.K..K...', '..K..K.K....', '.....KK.....', '.....K......'],
    timer: ['.KKKKKKKKKK.', '..K......K..', '..K.AAAA.K..', '...K.AA.K...', '....K..K....', '.....KK.....', '....K..K....', '...K....K...', '..K..AA..K..', '..K.AAAA.K..', '.KKKKKKKKKK.'],
    camera: ['............', '...KKKK.....', '.KKKKKKKKKK.', 'KK........KK', 'K...KKKK...K', 'K..K....K..K', 'K..K.AA.K..K', 'K..K....K..K', 'K...KKKK...K', 'KK........KK', '.KKKKKKKKKK.'],
    warm: ['...KKKKKK...', '..K......K..', '.K........K.', 'KKKKKKKKKKKK', '.....KK.....', '..A..KK..A..', '.A...KK...A.', '.....KK.....', '.....KK.....', '...KKKKKK...'],
    quiet: ['...KKKKKK...', '..K......K..', '.K........K.', 'K..........K', 'K.KKKKKKKK.K', 'K.KKKKKKKK.K', 'K..........K', '.K........K.', '..K......K..', '...KKKKKK...'],
    keys: ['............', 'KKKKKKKKKKKK', 'K..........K', 'K.K.K.K.K..K', 'K..........K', 'K.K.K.K.K.KK', 'K..........K', 'K..KKKKKK..K', 'K..........K', 'KKKKKKKKKKKK'],
    box: ['.....KK.....', '.....KK.....', '...K.KK.K...', '....KKKK....', '.....KK.....', 'K..........K', 'K..........K', 'KKKKKKKKKKKK', 'KKKKKKKKKKKK'],
    tv: ['..K......K..', '...K....K...', '....K..K....', 'KKKKKKKKKKKK', 'K..........K', 'K..........K', 'K..........K', 'K..........K', 'K..........K', 'KKKKKKKKKKKK'],
    shield: ['.....KK.....', '..KKKKKKKK..', 'KKKKAAAAKKKK', 'KKKAAAAAAKKK', 'KKKAAAAAAKKK', 'KKKAAAAAAKKK', '.KKKAAAAKKK.', '.KKKKAAKKKK.', '..KKKKKKKK..', '...KKKKKK...', '.....KK.....'],
    spark: ['.....A......', '.....A......', '....AAA.....', 'AAAAAKAAAAA.', '....AAA.....', '.....A...K..', '.....A..KKK.', '.........K..', '..K.........', '.KKK........', '..K.........'],
    loop: ['....KKKKK...', '..KK.....KK.', '.K.......AAA', '.K........A.', 'K...........', 'K...........', '...........K', '.A........K.', 'AAA.......K.', '.KK.....KK..', '...KKKKK....'],
  };
  const PIPS = { R: '#ff707a', B: '#7cc4ff', Y: '#f5c431', G: '#8fd16a', P: '#d39cf5' };
  const iconCache = new Map();
  G.iconNames = Object.keys(ICONS);
  // An icon as a picture address, `scale` screen pixels per cell.
  G.icon = function (name, ink, accent, scale) {
    scale = scale || 2;
    const key = name + ink + (accent || '') + scale;
    if (iconCache.has(key)) return iconCache.get(key);
    if (name === 'die') {
      const n = 12 * scale, night = ink !== '#141416' && ink !== '#000000';
      const c = G.die(n, null, { key: 'icon', outline: night ? [70, 70, 80] : null, dither: 0 });
      iconCache.set(key, { url: c.toDataURL(), w: n, h: n });
      return iconCache.get(key);
    }
    const grid = ICONS[name] || ICONS.help;
    const pal = Object.assign({ K: ink, k: hexA(ink, 0.4), A: accent || ink }, PIPS);
    const w = Math.max(...grid.map((r) => r.length)), h = grid.length;
    const c = G.canvas(w * scale, h * scale), g = c.getContext('2d');
    grid.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x * scale, y * scale, scale, scale); } }));
    const url = c.toDataURL();
    iconCache.set(key, { url, w: w * scale, h: h * scale });
    return iconCache.get(key);
  };
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    return 'rgba(' + [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ',' + a + ')';
  }
  G.hexA = hexA;
  // <img> markup for an icon in the current ink
  G.img = function (name, accent, scale, cls) {
    const ic = G.icon(name, Dice.ink(), accent, scale);
    return '<img class="ico ' + (cls || '') + '" alt="" src="' + ic.url + '" width="' + ic.w + '" height="' + ic.h + '">';
  };

  // ---- Die faces (Roll and the boot screen) --------------------------------
  // ---- App icons: a white picture on a rounded tile of the app's colour -----------------
  // Clean and flat, so they read at a glance in the dock and the app grid.
  const TILES = { files: '#e39a32', home: '#e39a32', browser: '#3d86d6', terminal: '#2b2f3a', notes: '#e8913a', music: '#a862dc', store: '#ef5f74',
    settings: '#66789c', calculator: '#4a5568', calendar: '#d4a857', clock: '#2f9e8f', monitor: '#3a9d68', gaming: '#2a2a32',
    channels: '#e0753a', weather: '#3a9be8', photos: '#d9576b', sketch: '#9b4fc9', cloud: '#4b7bec', code: '#1f2430', cloudpc: '#3550b8' };
  function glyph(id, day) {
    const g = [];
    for (let i = 0; i < 16; i++) g.push(new Array(16).fill(''));
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < 16 && y < 16) g[y][x] = c; };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); };
    const disc = (cx, cy, r, c) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= r) set(x, y, c); };
    const line = (x0, y0, x1, y1, c) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) set(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c); };
    const DIG = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111' };
    const text = (s, x, y, c) => [...s].forEach((ch, k) => [...DIG[ch]].forEach((b, i) => { if (b === '1') set(x + k * 4 + (i % 3), y + Math.floor(i / 3), c); }));
    switch (id) {
      case 'home': case 'files':
        rect(2, 3, 5, 1, 'w'); rect(1, 4, 14, 10, 'w'); rect(1, 6, 14, 8, 'W');
        if (id === 'home') { rect(6, 9, 4, 4, 'A'); line(5, 9, 8, 6, 'A'); line(10, 9, 8, 7, 'A'); rect(7, 11, 2, 2, 'W'); }
        break;
      case 'browser':
        disc(7.5, 7.5, 6.6, 'W');
        for (let y = 2; y <= 13; y++) { const dx = 3.2 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 7.5) / 6.6, 2))); set(7.5 - dx, y, 'A'); set(7.5 + dx, y, 'A'); }
        for (let x = 2; x <= 13; x++) { set(x, 7, 'A'); if (Math.hypot(x - 7.5, 4 - 7.5) < 6) set(x, 4, 'A'); if (Math.hypot(x - 7.5, 11 - 7.5) < 6) set(x, 11, 'A'); }
        rect(7, 1, 2, 14, 'A'); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'A' && Math.hypot(x - 7.5, y - 7.5) > 6.6) g[y][x] = '';
        break;
      case 'terminal':
        rect(1, 2, 14, 12, 'W'); rect(2, 4, 12, 9, 'D'); rect(3, 2, 1, 1, 'w'); rect(5, 2, 1, 1, 'w');
        line(4, 6, 6, 8, 'G'); line(6, 8, 4, 10, 'G'); rect(8, 10, 4, 1, 'W');
        break;
      case 'cloudpc': // a screen with a cloud on it
        rect(1, 2, 14, 10, 'W'); rect(2, 3, 12, 8, 'A'); rect(6, 12, 4, 1, 'W'); rect(4, 13, 8, 1, 'W');
        disc(6, 7.6, 1.5, 'W'); disc(8.6, 6.6, 2, 'W'); disc(10.7, 7.9, 1.3, 'W'); rect(5, 8, 7, 2, 'W');
        break;
      case 'notes':
        rect(3, 1, 10, 14, 'W'); for (const y of [5, 8, 11]) rect(5, y, 6, 1, 'A'); rect(5, 13, 3, 1, 'A'); for (const x of [5, 8, 11]) rect(x, 0, 1, 2, 'w');
        break;
      case 'music':
        rect(5, 3, 1, 9, 'W'); rect(11, 2, 1, 9, 'W'); line(5, 3, 11, 2, 'W'); line(5, 4, 11, 3, 'W'); line(5, 5, 11, 4, 'W');
        disc(3.6, 12, 1.9, 'W'); disc(9.6, 11, 1.9, 'W');
        break;
      case 'store':
        rect(2, 5, 12, 10, 'W'); rect(5, 2, 1, 4, 'w'); rect(10, 2, 1, 4, 'w'); rect(5, 1, 6, 1, 'w'); rect(5, 8, 1, 2, 'A'); rect(10, 8, 1, 2, 'A'); line(5, 10, 7, 12, 'A'); line(10, 10, 8, 12, 'A'); rect(7, 12, 2, 1, 'A');
        break;
      case 'settings':
        disc(7.5, 7.5, 5.2, 'W');
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; rect(Math.round(7.5 + Math.cos(a) * 6.3 - 1), Math.round(7.5 + Math.sin(a) * 6.3 - 1), 2, 2, 'W'); }
        disc(7.5, 7.5, 2.2, 'A');
        break;
      case 'calculator':
        rect(3, 1, 10, 14, 'W'); rect(4, 2, 8, 3, 'A'); rect(8, 3, 3, 1, 'G');
        for (const y of [7, 10, 13]) for (const x of [4, 7, 10]) rect(x, y, 2, y === 13 ? 1 : 2, x === 10 ? 'O' : 'A');
        break;
      case 'clock': {
        disc(7.5, 7.5, 6.8, 'W');
        for (const [x, y] of [[7.5, 1.6], [13.4, 7.5], [7.5, 13.4], [1.6, 7.5]]) set(x, y, 'A');
        line(7.5, 7.5, 7.5, 3.5, 'A'); line(7.5, 7.5, 10.5, 9.5, 'A'); set(7.5, 7.5, 'R');
        break;
      }
      case 'monitor':
        rect(1, 2, 14, 10, 'W'); rect(2, 3, 12, 8, 'D');
        [[2, 9], [4, 8], [5, 9], [7, 5], [9, 7], [11, 4], [13, 6]].reduce((p, q) => { line(p[0], p[1], q[0], q[1], 'G'); return q; });
        rect(6, 12, 4, 1, 'w'); rect(4, 13, 8, 1, 'w');
        break;
      case 'channels':
        line(5, 1, 8, 4, 'W'); line(11, 1, 8, 4, 'W'); rect(1, 4, 14, 10, 'W'); rect(2, 5, 12, 8, 'D');
        rect(3, 7, 3, 5, 'R'); rect(6, 7, 3, 5, 'O'); rect(9, 7, 3, 5, 'G'); rect(5, 14, 6, 1, 'w');
        break;
      case 'weather':
        disc(10.5, 5, 3.4, 'O'); disc(5, 10, 3, 'W'); disc(9, 9, 3.6, 'W'); disc(12.5, 11, 2.5, 'W'); rect(4, 11, 10, 3, 'W');
        break;
      case 'photos':
        rect(1, 3, 14, 11, 'W'); rect(2, 4, 12, 9, 'A'); disc(11, 6.5, 1.6, 'O');
        for (let x = 2; x <= 13; x++) { const top = 12 - Math.round(5 * Math.max(0, 1 - Math.abs(x - 6) / 4.5)); rect(x, top, 1, 13 - top, 'G'); }
        break;
      case 'code':
        rect(1, 2, 14, 12, 'W'); rect(2, 4, 12, 9, 'D'); rect(2, 2, 12, 1, 'w');
        line(4, 6, 6, 8, 'G'); line(6, 8, 4, 10, 'G'); rect(8, 10, 4, 1, 'O'); rect(8, 6, 2, 1, 'A');
        break;
      case 'cloud':
        disc(5, 9.5, 3.2, 'W'); disc(8.5, 7, 4.2, 'W'); disc(12, 9.8, 2.8, 'W'); rect(4, 9, 9, 4, 'W');
        rect(6, 9, 1, 3, 'A'); rect(5, 9, 3, 1, 'A'); rect(10, 9, 1, 3, 'A'); rect(9, 11, 3, 1, 'A');
        break;
      case 'sketch':
        disc(7.5, 8, 6.4, 'W'); disc(10.5, 11.5, 1.6, '');
        disc(4.6, 6.5, 1.3, 'R'); disc(8, 4.4, 1.3, 'O'); disc(11.4, 6.4, 1.3, 'G'); disc(4.6, 10.4, 1.3, 'A');
        break;
      default:
        disc(7.5, 7.5, 5, 'W');
    }
    return g;
  }
  const appIcons = new Map();
  G.TILES = TILES;
  // ---- SereneTab's mark: a little cube with arrows out along its three edges -------------
  // (shapes in a 64 x 64 box; drawn as an SVG for pages and onto canvas for app icons)
  const SERENE = [
    ['top', 'M32 17L46 25L32 33L18 25Z'], ['left', 'M18 25L32 33L32 49L18 41Z'], ['right', 'M32 33L46 25L46 41L32 49Z'],
    ['up', 'M30.5 17.5L33.5 17.5L33.5 10.5L30.5 10.5ZM27 11L37 11L32 3Z'],
    ['west', 'M18.74 42.3L17.26 39.7L10.32 43.67L11.8 46.27ZM4.98 48.44L13.29 48.88L8.83 41.06Z'],
    ['east', 'M45.26 42.3L46.74 39.7L53.68 43.67L52.2 46.27ZM59.02 48.44L50.71 48.88L55.17 41.06Z'],
  ];
  const SERENE_INK = {
    tile: { top: '#ffffff', left: 'rgba(255,255,255,.78)', right: 'rgba(255,255,255,.52)', up: '#ffd66e', west: '#ff9d87', east: '#80f0c6' },
    light: { top: '#e4f0ff', left: '#9fc6f3', right: '#5c97dc', up: '#f0b02c', west: '#ec6a55', east: '#28b884' },
    dark: { top: '#eef5ff', left: '#a9cdf6', right: '#6aa3e6', up: '#ffd66e', west: '#ff9d87', east: '#80f0c6' },
  };
  // Axiom's mark: a cube cut into three slabs, orange, dark, orange, seen from above
  G.drawAxiom = function (g, x, y, size) {
    const k = size / 64, P = (pts) => { g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo : g.moveTo).call(g, x + px * k, y + py * k)); g.closePath(); g.fill(); };
    const T = [32, 9], R = [53, 21], F = [32, 33], Lf = [11, 21], hgt = 25, gap = 2.6, sh = (hgt - gap * 2) / 3;
    const ink = [['#ffb784', '#f0945a', '#c26a3a'], ['#5a5754', '#3b3936', '#232120'], ['#ffb784', '#f0945a', '#c26a3a']];
    const off = (p, dy) => [p[0], p[1] + dy];
    for (let i = 2; i >= 0; i--) { // bottom slab first, so the ones above cover it
      const y0 = i * (sh + gap), y1 = y0 + sh, [top, left, right] = ink[i];
      g.fillStyle = top; P([off(T, y0), off(R, y0), off(F, y0), off(Lf, y0)]);
      g.fillStyle = left; P([off(Lf, y0), off(F, y0), off(F, y1), off(Lf, y1)]);
      g.fillStyle = right; P([off(F, y0), off(R, y0), off(R, y1), off(F, y1)]);
    }
  };
  // ---- The Dice family's marks: DiceOS, DiceWeb, DiceTV, Dice Home, Dice Cloud, Dice Emulator ----
  // Each is the logo die inside the thing it is (a window, a TV, a house, a cloud, a screen).
  const PRODUCTS = { os: '#d3d7e0', web: '#5a6cf0', tv: '#7a4fd8', home: '#2f9e6e', cloud: '#3a9be8', emulator: '#e0753a' };
  G.PRODUCTS = PRODUCTS;
  const products = new Map();
  G.productIcon = function (id, size) {
    const dpr = Math.min(3, Math.max(1, Math.round((typeof window !== 'undefined' && window.devicePixelRatio) || 1)));
    const key = id + size + dpr;
    let src = products.get(key);
    if (!src) {
      const S = size * dpr, cv = G.canvas(S, S), g = cv.getContext('2d'), tile = PRODUCTS[id] || PRODUCTS.os, r = Math.round(S * 0.24);
      const round = (x, y, w, hh, rr) => { g.beginPath(); g.moveTo(x + rr, y); g.arcTo(x + w, y, x + w, y + hh, rr); g.arcTo(x + w, y + hh, x, y + hh, rr); g.arcTo(x, y + hh, x, y, rr); g.arcTo(x, y, x + w, y, rr); g.closePath(); };
      const grad = g.createLinearGradient(0, 0, 0, S);
      grad.addColorStop(0, mix(tile, '#ffffff', 0.18)); grad.addColorStop(1, mix(tile, '#000000', 0.08));
      round(0, 0, S, S, r); g.fillStyle = grad; g.fill();
      g.save(); round(0, 0, S, S, r); g.clip(); g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, S, Math.max(1, dpr)); g.restore();
      const u = S / 64, white = 'rgba(255,255,255,.96)', soft = 'rgba(255,255,255,.35)';
      g.lineJoin = 'round'; g.lineCap = 'round';
      // where the die goes, and how big (whole pixels, so it stays sharp)
      let box = [16, 16, 32];
      if (id === 'web') { round(9 * u, 12 * u, 46 * u, 40 * u, 7 * u); g.fillStyle = white; g.fill(); g.fillStyle = tile; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc((16 + i * 6) * u, 18 * u, 1.8 * u, 0, 7); g.fill(); } g.fillStyle = mix(tile, '#ffffff', 0.85); g.fillRect(10 * u, 23 * u, 44 * u, 28 * u); box = [21, 24, 22]; }
      else if (id === 'tv') { round(7 * u, 12 * u, 50 * u, 34 * u, 6 * u); g.fillStyle = white; g.fill(); g.fillStyle = mix(tile, '#000000', 0.35); round(11 * u, 16 * u, 42 * u, 26 * u, 3 * u); g.fill(); g.strokeStyle = white; g.lineWidth = 3 * u; g.beginPath(); g.moveTo(24 * u, 54 * u); g.lineTo(40 * u, 54 * u); g.moveTo(32 * u, 46 * u); g.lineTo(32 * u, 54 * u); g.stroke(); box = [21, 18, 22]; }
      else if (id === 'home') { g.fillStyle = white; g.beginPath(); g.moveTo(32 * u, 8 * u); g.lineTo(57 * u, 29 * u); g.lineTo(52 * u, 29 * u); g.lineTo(52 * u, 55 * u); g.lineTo(12 * u, 55 * u); g.lineTo(12 * u, 29 * u); g.lineTo(7 * u, 29 * u); g.closePath(); g.fill(); box = [21, 28, 22]; }
      else if (id === 'cloud') { g.fillStyle = white; g.beginPath(); g.arc(23 * u, 37 * u, 12 * u, 0, 7); g.arc(35 * u, 29 * u, 15 * u, 0, 7); g.arc(46 * u, 38 * u, 11 * u, 0, 7); g.fill(); g.fillRect(14 * u, 37 * u, 36 * u, 12 * u); g.beginPath(); g.arc(14 * u, 43 * u, 6 * u, 0, 7); g.arc(50 * u, 43 * u, 6 * u, 0, 7); g.fill(); box = [22, 22, 20]; }
      else if (id === 'emulator') { round(6 * u, 14 * u, 52 * u, 36 * u, 6 * u); g.fillStyle = white; g.fill(); g.fillStyle = mix(tile, '#ffffff', 0.82); round(10 * u, 18 * u, 40 * u, 28 * u, 3 * u); g.fill(); g.fillStyle = tile; g.beginPath(); g.arc(54 * u, 32 * u, 1.8 * u, 0, 7); g.fill(); g.setLineDash([3 * u, 3 * u]); g.strokeStyle = soft; g.lineWidth = 1.5 * u; round(2 * u, 10 * u, 60 * u, 44 * u, 9 * u); g.stroke(); g.setLineDash([]); box = [19, 21, 22]; }
      const want = box[2] * u, k = Math.max(1, Math.floor(want / 16)), n = want < 16 ? Math.max(8, Math.round(want)) : 16 * k;
      const die = G.die(want < 16 && id !== 'os' ? n : 16, null, { key: 'product' + (want < 16 && id !== 'os' ? n : 16) });
      g.imageSmoothingEnabled = false;
      const dx = Math.round(box[0] * u + (want - n) / 2), dy = Math.round(box[1] * u + (want - n) / 2);
      if (id === 'os') { const k2 = Math.max(1, Math.floor(S * 0.62 / 16)); g.drawImage(die, Math.round((S - 16 * k2) / 2), Math.round((S - 16 * k2) / 2), 16 * k2, 16 * k2); }
      else g.drawImage(die, dx, dy, n, n);
      products.set(key, src = cv);
    }
    const c = G.canvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    c.style.width = c.style.height = size + 'px';
    c.className = 'appicon';
    return c;
  };
  G.sereneSvg = function (size, look) {
    const ink = SERENE_INK[look || 'light'];
    return '<svg class="serene" width="' + size + '" height="' + size + '" viewBox="0 0 64 64" aria-hidden="true"><g transform="translate(0 6)">' +
      SERENE.map(([k, d]) => '<path d="' + d + '" fill="' + ink[k] + '"/>').join('') + '</g></svg>';
  };
  G.drawSerene = function (g, x, y, size, look) {
    const ink = SERENE_INK[look || 'tile'];
    g.save(); g.translate(x, y); g.scale(size / 64, size / 64); g.translate(0, 6);
    for (const [k, d] of SERENE) { g.fillStyle = ink[k]; g.fill(new Path2D(d)); }
    g.restore();
  };
  G.appIcon = function (id, size, c) {
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const day = new Date().getDate();
    const key = id + size + dpr + (id === 'calendar' ? day : '') + (c || '');
    if (appIcons.has(key)) return appIcons.get(key);
    const S = size * dpr, cv = G.canvas(S, S), g = cv.getContext('2d');
    const tile = TILES[id] || c || '#7c9cff';
    // the tile: rounded, a gentle light-to-dark fall, a soft top edge
    const r = Math.round(S * 0.24);
    const path = () => { g.beginPath(); g.moveTo(r, 0); g.arcTo(S, 0, S, S, r); g.arcTo(S, S, 0, S, r); g.arcTo(0, S, 0, 0, r); g.arcTo(0, 0, S, 0, r); g.closePath(); };
    const grad = g.createLinearGradient(0, 0, 0, S);
    grad.addColorStop(0, mix(tile, '#ffffff', 0.16)); grad.addColorStop(1, mix(tile, '#000000', 0.06));
    path(); g.fillStyle = grad; g.fill();
    g.save(); path(); g.clip();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, 0, S, Math.max(1, dpr));
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, S - Math.max(1, dpr), S, Math.max(1, dpr));
    g.restore();
    if (id === 'calendar') {
      g.shadowColor = 'rgba(60,40,10,.25)'; g.shadowOffsetY = Math.max(1, S * 0.02); g.shadowBlur = S * 0.03;
      G.drawAxiom(g, S * 0.15, S * 0.12, S * 0.7);
      g.shadowColor = 'transparent';
    } else if (id === 'browser') {
      // SereneTab's mark, drawn smooth (it's a logo, not a picture)
      g.shadowColor = 'rgba(0,0,0,.18)'; g.shadowOffsetY = Math.max(1, S * 0.02); g.shadowBlur = S * 0.03;
      G.drawSerene(g, S * 0.13, S * 0.1, S * 0.74, 'tile');
      g.shadowColor = 'transparent';
    } else if (id === 'gaming') {
      const n = Math.round(S * 0.7), d = G.die(Math.max(16, Math.min(64, Math.round(n / dpr))), null, { key: 'appicon', outline: [70, 70, 82] });
      g.imageSmoothingEnabled = false; g.drawImage(d, Math.round((S - n) / 2), Math.round((S - n) / 2), n, n);
    } else {
      const gl = glyph(id), cell = Math.max(1, Math.floor((S * 0.64) / 16)), off = Math.round((S - cell * 16) / 2);
      const pal = { W: '#ffffff', w: 'rgba(255,255,255,.72)', A: mix(tile, '#000000', 0.12), D: '#1d2028', G: '#8fe07a', R: '#e5534b', O: '#f0a43a', P: '#4a4846', o: '#f0945a', q: '#c06a3a', K: '#34322f', k: '#211f1d' };
      // a soft shadow under the picture, one cell down
      g.fillStyle = 'rgba(0,0,0,.14)';
      gl.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'W' || ch === 'w') g.fillRect(off + x * cell, off + (y + 1) * cell, cell, cell); }));
      gl.forEach((row, y) => row.forEach((ch, x) => { if (ch) { g.fillStyle = pal[ch]; g.fillRect(off + x * cell, off + y * cell, cell, cell); } }));
    }
    cv.style.width = cv.style.height = size + 'px';
    appIcons.set(key, cv);
    return cv;
  };
  // a fresh copy (a canvas can only be in one place on the page at a time)
  G.appIconEl = function (id, size, c) {
    const src = G.appIcon(id, size, c), cv = G.canvas(src.width, src.height);
    cv.getContext('2d').drawImage(src, 0, 0); cv.style.width = cv.style.height = size + 'px'; cv.className = 'appicon';
    return cv;
  };

  G.PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };

  // ---- The worlds -----------------------------------------------------------------
  // A world: sky, something far away, the ground, a mascot, and things that
  // move (clouds, stars, water, bubbles, leaves, fireflies, a blink).
  const GROUND = { grass: '#7ab25a', gold: '#b9a64e', stone: '#9a9aa4', sand: '#ecd59c', snow: '#eef4fa', dune: '#e8c27a', seabed: '#d9c28f', felt: '#2f8a57' };
  const LAND = {
    hills: { ground: 'grass' }, park: { ground: 'grass' }, forest: { ground: 'grass' }, autumn: { ground: 'gold' }, mountains: { ground: 'grass' },
    city: { ground: 'stone' }, town: { ground: 'stone' }, beach: { ground: 'sand' }, ice: { ground: 'snow' }, deep: { ground: 'seabed' },
    pond: { ground: 'grass' }, garden: { ground: 'grass' }, meadow: { ground: 'grass' }, desert: { ground: 'dune' }, table: { ground: 'felt' },
    flight: { ground: 'grass' }, concert: { ground: 'stone' }, screen: {}, paper: {}, gears: { ground: 'grass' }, market: { ground: 'stone' }, menu: {},
  };

  class World {
    // o: {land, c, who, night, W, H, layout: 'hero'|'cover'|'wide'|'wall', seed, gang}
    constructor(o) {
      this.o = o;
      this.W = o.W; this.H = o.H;
      this.land = LAND[o.land] ? o.land : 'hills';
      this.rand = seeded(hash(o.land + o.c + (o.seed || '')));
      this.c = o.c;
      this.night = !!o.night;
      // where the ground starts. Behind Home only the top of the world shows, so the horizon is high there.
      this.gy = Math.round(this.H * (o.layout === 'cover' ? 0.8 : o.layout === 'wall' ? 0.84 : o.layout === 'hero' ? (o.ground || 0.37) : o.layout === 'stage' ? 0.62 : 0.8));
      this.S = o.layout === 'hero' ? this.gy / 0.8 : this.H; // how tall the sky would be in a normal picture
      this.base = G.canvas(this.W, this.H);
      this.movers = [];
      this.build();
    }
    // colours
    skyTop() {
      const { c, night } = this;
      if (this.land === 'deep') return night ? mix('#0b2a4a', c, 0.12) : mix('#8fd3f5', c, 0.2);
      return night ? mix(c, '#000000', 0.88) : mix(c, '#ffffff', 0.5);
    }
    skyLow() {
      const { c, night } = this;
      if (this.land === 'deep') return night ? mix('#020a18', c, 0.1) : mix('#2a6fb0', c, 0.22);
      return night ? mix(c, '#000000', 0.66) : mix(c, '#ffffff', 0.85);
    }
    groundCol() {
      const base = GROUND[(LAND[this.land] || {}).ground] || GROUND.grass;
      // tint the ground with the world's colour; less for warm colours on grass, which would turn it muddy
      const rgb = [1, 3, 5].map((i) => parseInt(this.c.slice(i, i + 2), 16));
      const warm = rgb[0] > rgb[1] + 40 && rgb[0] > rgb[2];
      const grassy = (LAND[this.land] || {}).ground === 'grass';
      let col = this.land === 'table' ? mix(base, this.c, 0.12) : mix(base, this.c, grassy && warm ? 0.1 : 0.3);
      if (this.night) col = mix(mix(col, '#000000', 0.5), '#1a2a5a', 0.18);
      return col;
    }
    px(g, x, y, col, w, h) { g.fillStyle = col; g.fillRect(x, y, w || 1, h || 1); }

    build() {
      const g = this.base.getContext('2d');
      const { W, H, gy } = this;
      const L = this.land;
      if ((L === 'screen' || L === 'menu' || L === 'paper') && this.o.layout === 'hero') return this.buildFramed(g);
      if (L === 'screen' || L === 'menu') return this.buildScreen(g);
      if (L === 'paper') return this.buildPaper(g);
      if (L === 'table') return this.buildTable(g);
      // sky
      const top = this.skyTop(), low = this.skyLow();
      skyGradient(g, W, gy, top, low);
      if (L !== 'deep') this.buildSun(g);
      if (this.night && L !== 'deep') this.makeStars();
      // something far away
      const far = { hills: 'hills', park: 'hills', forest: 'pines', autumn: 'trees', mountains: 'peaks', city: 'city', town: 'town', beach: 'sea',
        ice: 'ice', deep: 'deep', pond: 'reeds', garden: 'hedge', meadow: 'hills', desert: 'dunes', flight: 'hills', concert: 'stage', gears: 'hills', market: 'town' }[L];
      this['far_' + far](g);
      // the ground
      this.buildGround(g);
      this.props(g);
      // clouds by day (not underwater, not on stage)
      if (!this.night && !['deep', 'concert'].includes(L)) this.makeClouds();
      this.placeMascot();
    }

    buildSun(g) {
      const { W, H } = this;
      const lay = this.o.layout;
      const sx = Math.round(W * (lay === 'cover' ? 0.76 : lay === 'wall' ? 0.84 : 0.86)), sy = Math.round(H * (lay === 'cover' ? 0.14 : 0.19));
      const R = Math.max(2, Math.round(Math.min(W, this.S) * (this.land === 'desert' ? 0.085 : 0.06)));
      this.sun = { x: sx, y: sy, r: R };
      if (this.night) {
        // a soft glow, in two steps
        for (const [k, a] of [[2.4, 0.05], [1.7, 0.06]]) {
          g.globalAlpha = a;
          for (let y = -Math.ceil(R * k); y <= R * k; y++) for (let x = -Math.ceil(R * k); x <= R * k; x++) if (x * x + y * y < k * k * R * R) this.px(g, sx + x, sy + y, '#f6f0d8');
        }
        g.globalAlpha = 1;
        for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
          if (x * x + y * y > R * R + 1) continue;
          const bx = x + R * 0.55, by = y - R * 0.3;
          if (bx * bx + by * by < R * R * 0.62) continue; // the bite out of the moon
          this.px(g, sx + x, sy + y, '#f6f0d8');
        }

      } else {
        const sunC = this.land === 'desert' ? '#ffcf4a' : '#ffd96b';
        for (let y = -R - 2; y <= R + 2; y++) for (let x = -R - 2; x <= R + 2; x++) {
          const d = x * x + y * y;
          if (d <= R * R + 1) this.px(g, sx + x, sy + y, sunC);
          else if (d <= (R + 1) * (R + 1) + 1) this.px(g, sx + x, sy + y, 'rgba(255,230,150,.6)');
          else if (d <= (R + 2) * (R + 2) + 2 && (x + y) % 2 === 0) this.px(g, sx + x, sy + y, 'rgba(255,230,150,.35)');
        }
      }
    }
    makeStars() {
      const n = Math.round(this.W * this.gy / 90);
      for (let i = 0; i < n; i++) {
        const x = Math.floor(this.rand() * this.W), y = Math.floor(this.rand() * this.gy * 0.72);
        if (this.sun && Math.abs(x - this.sun.x) < this.sun.r * 2 && Math.abs(y - this.sun.y) < this.sun.r * 2) continue;
        this.movers.push({ k: 'star', x, y, p: this.rand() * 6.28, s: 0.6 + this.rand() * 2.2, big: this.rand() > 0.93 });
      }
      this.movers.push({ k: 'shooting', next: 6 + this.rand() * 10 });
    }
    makeClouds() {
      const n = Math.max(2, Math.round(this.W / 45));
      for (let i = 0; i < n; i++) {
        const big = this.rand() > 0.5;
        this.movers.push({ k: 'cloud', x: this.rand() * this.W, y: Math.round(this.S * (0.06 + this.rand() * 0.26)), v: 0.6 + this.rand() * 1.2, big });
      }
      if (this.o.layout !== 'cover') this.movers.push({ k: 'birds', next: 3 + this.rand() * 8 });
    }
    hillLine(seed, amp, base, freq) {
      const out = [];
      for (let x = 0; x < this.W; x++) out.push(Math.round(base - amp * (0.55 * Math.sin(x * freq + seed) + 0.3 * Math.sin(x * freq * 2.3 + seed * 1.7) + 0.15 * Math.sin(x * freq * 5.1 + seed * 0.3))));
      return out;
    }
    fillBelow(g, line, col, until) {
      for (let x = 0; x < this.W; x++) { g.fillStyle = col; g.fillRect(x, line[x], 1, (until || this.gy) - line[x]); }
    }
    far_hills(g) {
      const low = this.skyLow(), gc = this.groundCol();
      this.fillBelow(g, this.hillLine(this.rand() * 9, this.S * 0.07, this.gy - this.S * 0.12, 0.045), mix(gc, low, 0.62));
      this.fillBelow(g, this.hillLine(this.rand() * 9, this.S * 0.05, this.gy - this.S * 0.04, 0.07), mix(gc, low, 0.32));
    }
    far_peaks(g) {
      const low = this.skyLow();
      const rock = this.night ? mix('#3a4258', this.c, 0.15) : mix('#8a96b0', this.c, 0.2);
      for (let layer = 0; layer < 2; layer++) {
        const col = mix(rock, low, layer ? 0.15 : 0.5);
        const n = 3 + Math.round(this.W / 60);
        for (let i = 0; i < n; i++) {
          const px = Math.round((i + this.rand() * 0.8) * this.W / (n - 1)) - 10, ph = Math.round(this.S * (0.22 + this.rand() * 0.2) * (layer ? 0.8 : 1));
          const top = this.gy - ph - (layer ? 0 : this.S * 0.06);
          for (let y = Math.round(top); y < this.gy; y++) {
            const half = (y - top) * (0.9 + (layer ? 0.3 : 0.1)) + (rnd(i, y) > 0.7 ? 1 : 0);
            g.fillStyle = (y - top < ph * 0.22) ? (this.night ? '#c9d2e6' : '#ffffff') : col;
            g.fillRect(Math.round(px - half), y, Math.round(half * 2) + 1, 1);
          }
        }
      }
    }
    far_pines(g, dark) {
      const low = this.skyLow(), gc = this.groundCol();
      this.far_hills(g);
      const tree = (x, base, h, col) => {
        for (let y = 0; y < h; y++) {
          const half = Math.floor((y % Math.max(3, Math.floor(h / 3))) * 0.8 + y * 0.22);
          g.fillStyle = col; g.fillRect(x - half, base - h + y, half * 2 + 1, 1);
        }
        g.fillStyle = mix('#6b4a2e', low, this.night ? 0.6 : 0.3); g.fillRect(x, base, 1, 2);
      };
      const lay = this.o.layout;
      for (let i = 0; i < this.W / 4; i++) {
        const x = Math.round(this.rand() * this.W);
        if (lay !== 'cover' && x > this.W * 0.55 && x < this.W * 0.85 && this.rand() > 0.3) continue;
        tree(x, this.gy - 2 - Math.round(this.rand() * 3), 8 + Math.round(this.rand() * 10), mix(mix('#2f6a4a', this.c, 0.2), low, 0.25 + this.rand() * 0.25 + (this.night ? 0.2 : 0)));
      }
    }
    far_trees(g) {
      // round autumn trees
      const low = this.skyLow();
      this.far_hills(g);
      const cols = ['#e8913a', '#d9553b', '#f2c14e', '#c4602a'];
      for (let i = 0; i < this.W / 7; i++) {
        const x = Math.round(this.rand() * this.W), r = 3 + Math.round(this.rand() * 4), base = this.gy - 2;
        if (this.o.layout === 'hero' && x > this.W * 0.58 && x < this.W * 0.82) continue;
        const col = mix(mix(cols[i % 4], this.c, 0.2), low, this.night ? 0.55 : 0.2);
        g.fillStyle = mix('#6b4a2e', low, this.night ? 0.6 : 0.3); g.fillRect(x, base - r, 1, r + 2);
        for (let y = -r; y <= r; y++) for (let xx = -r; xx <= r; xx++) if (xx * xx + y * y <= r * r + rnd(x + xx, y) * 2) this.px(g, x + xx, base - r * 2 + y, rnd(xx, y + x) > 0.85 ? mix(col, '#000000', 0.15) : col);
      }
      for (let i = 0; i < 14; i++) this.movers.push({ k: 'leaf', x: this.rand() * this.W, y: this.rand() * this.gy, v: 2 + this.rand() * 3, p: this.rand() * 6, col: cols[i % 4] });
    }
    far_city(g, town) {
      const low = this.skyLow();
      const n = this.W;
      let x = -2;
      this.windows = [];
      for (let layer = 0; layer < 2; layer++) {
        x = -2 - layer * 3;
        while (x < n) {
          const w = 5 + Math.floor(this.rand() * (town ? 7 : 9)), h = Math.round(this.S * (town ? 0.1 + this.rand() * 0.16 : 0.16 + this.rand() * 0.3) * (layer ? 0.75 : 1));
          const body = this.night ? mix(mix('#1c2033', this.c, 0.15), low, layer ? 0.1 : 0.45) : mix(mix('#b8bcc8', this.c, 0.25), low, layer ? 0.15 : 0.5);
          const top = this.gy - h;
          g.fillStyle = body; g.fillRect(x, top, w, h);
          if (town && layer) { // a pointed roof
            for (let k = 1; k <= Math.ceil(w / 2); k++) { g.fillStyle = mix(this.c, low, this.night ? 0.6 : 0.2); g.fillRect(x + k - 1, top - Math.ceil(w / 2) + k, w - 2 * (k - 1), 1); }
          } else if (this.rand() > 0.6) { g.fillStyle = body; g.fillRect(x + Math.floor(w / 2), top - 3, 1, 3); }
          if (layer) for (let wy = top + 2; wy < this.gy - 2; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) {
            const lit = this.night ? this.rand() > 0.6 : this.rand() > 0.5;
            if (!lit) continue;
            const col = this.night ? (this.rand() > 0.2 ? '#ffd96b' : '#9fd3ff') : mix(body, '#ffffff', 0.45);
            g.fillStyle = col; g.fillRect(wx, wy, 1, 1);
            if (this.night) this.windows.push([wx, wy, col]);
          }
          x += w + (layer ? 1 + Math.floor(this.rand() * 3) : 0);
        }
      }
      if (this.night && this.windows.length) this.movers.push({ k: 'windows' });
    }
    far_town(g) { this.far_city(g, true); }
    far_sea(g, icy) {
      const hz = Math.round(this.gy - this.S * 0.22);
      const sea = this.night ? mix('#0e2a4a', this.c, 0.12) : mix('#4fa9d9', this.c, 0.2);
      for (let y = hz; y < this.gy; y++) { g.fillStyle = mix(mix(sea, '#ffffff', this.night ? 0 : 0.25), sea, (y - hz) / (this.gy - hz)); g.fillRect(0, y, this.W, 1); }
      this.sea = { top: hz, col: sea };
      if (icy) {
        for (let i = 0; i < 4; i++) {
          const x = Math.round(this.rand() * this.W), w = 6 + Math.round(this.rand() * 10), h = 3 + Math.round(this.rand() * 6);
          for (let y = 0; y < h; y++) { const ww = Math.max(2, Math.round(w * (0.45 + 0.55 * y / h))); g.fillStyle = y < 1 ? '#ffffff' : (y > h * 0.6 ? (this.night ? '#7f94b3' : '#bfe0f4') : (this.night ? '#9fb4d1' : '#e6f4fc')); g.fillRect(x - (ww >> 1), hz - h + y + 2, ww, 1); }
        }
        for (let i = 0; i < 40; i++) this.movers.push({ k: 'snow', x: this.rand() * this.W, y: this.rand() * this.H, v: 3 + this.rand() * 4, p: this.rand() * 6 });
      }
      this.movers.push({ k: 'shimmer' });
    }
    far_ice(g) { this.far_sea(g, true); }
    far_deep(g) {
      // under the sea: light from above, rocks, kelp and bubbles
      if (!this.night) for (let i = 0; i < 5; i++) {
        const x0 = this.rand() * this.W;
        g.fillStyle = 'rgba(255,255,255,.07)';
        for (let y = 0; y < this.gy; y++) g.fillRect(Math.round(x0 + y * 0.35), y, 3 + Math.round(y / 30), 1);
      }
      for (let i = 0; i < this.W / 14; i++) this.movers.push({ k: 'kelp', x: Math.round(this.rand() * this.W), h: 8 + Math.round(this.rand() * this.S * 0.3), p: this.rand() * 6 });
      for (let i = 0; i < 18; i++) this.movers.push({ k: 'bubble', x: this.rand() * this.W, y: this.rand() * this.H, v: 3 + this.rand() * 5, p: this.rand() * 6 });
      this.float = true;
    }
    far_reeds(g) {
      this.far_hills(g);
      // a pond in front, with lily pads
      const cx = Math.round(this.W * (this.o.layout === 'cover' ? 0.5 : 0.42)), cy = this.gy + Math.round(this.H * 0.09), rx = Math.round(this.W * 0.22), ry = Math.round(this.H * 0.06);
      this.pond = { cx, cy, rx, ry };
    }
    far_hedge(g) {
      this.far_hills(g);
      const col = mix(mix('#3f7d45', this.c, 0.15), '#000000', this.night ? 0.55 : 0);
      for (let x = 0; x < this.W; x++) {
        const h = Math.round(this.S * 0.07 + Math.sin(x * 0.5) * 1.2 + rnd(x, 3) * 1.5);
        g.fillStyle = col; g.fillRect(x, this.gy - h, 1, h);
        if (rnd(x, 9) > 0.8) { g.fillStyle = mix(col, '#ffffff', 0.15); g.fillRect(x, this.gy - h + 1, 1, 1); }
      }
    }
    far_dunes(g) {
      const low = this.skyLow(), gc = this.groundCol();
      this.fillBelow(g, this.hillLine(this.rand() * 9, this.S * 0.05, this.gy - this.S * 0.07, 0.03), mix(gc, low, 0.45));
      this.fillBelow(g, this.hillLine(this.rand() * 9, this.S * 0.03, this.gy - this.S * 0.02, 0.05), mix(gc, low, 0.2));
    }
    far_stage(g) {
      // a little concert: a back wall, lights and speakers
      const wall = this.night ? mix(this.c, '#000000', 0.82) : mix(this.c, '#ffffff', 0.72);
      g.fillStyle = wall; g.fillRect(0, 0, this.W, this.gy);
      for (let y = 0; y < this.gy; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < this.W; x += 4) this.px(g, x, y, mix(wall, this.night ? '#ffffff' : '#000000', 0.05));
      this.movers.push({ k: 'eq' }, { k: 'lights' });
    }
    buildGround(g) {
      const { W, H, gy } = this;
      const turf = this.groundCol();
      const deep = mix(turf, '#000000', 0.2), edge = mix(turf, '#ffffff', this.night ? 0.12 : 0.3);
      for (let y = gy; y < H; y++) for (let x = 0; x < W; x++) {
        const fleck = (x * 7 + y * 13) % 19 === 0 || (y - gy > 2 && (x * 3 + y * 5) % 17 === 0);
        g.fillStyle = y === gy ? edge : (fleck ? deep : turf);
        g.fillRect(x, y, 1, 1);
      }
      const L = this.land;
      if (['city', 'town', 'concert', 'market'].includes(L)) { // paving
        for (let y = gy + 2; y < H; y += 3) for (let x = (y % 2) * 3; x < W; x += 6) this.px(g, x, y, deep);
      } else if (!['beach', 'ice', 'desert', 'deep', 'table'].includes(L)) {
        for (let x = 0; x < W; x++) if (rnd(x, 7) < 0.22) this.px(g, x, gy - 1, edge);
      }
      if (this.pond) {
        const { cx, cy, rx, ry } = this.pond;
        const water = this.night ? mix('#123a5a', this.c, 0.15) : mix('#5fb6e0', this.c, 0.2);
        for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) this.px(g, cx + x, cy + y, y === -ry || (x * x) / (rx * rx) + (y * y) / (ry * ry) > 0.85 ? mix(water, '#ffffff', 0.25) : water);
        for (let i = 0; i < 4; i++) { const lx = cx - rx + 4 + Math.round(this.rand() * (rx * 2 - 8)), ly = cy - 1 + Math.round(this.rand() * 3); this.px(g, lx, ly, '#5aa354', 3, 1); this.px(g, lx + 1, ly - 1, i === 1 ? '#f4a3c8' : '#5aa354'); }
        this.sea = { top: cy - ry, col: water, pond: this.pond };
        this.movers.push({ k: 'shimmer' });
      }
    }
    props(g) {
      const L = this.land, gy = this.gy;
      const plant = (name, x, y) => { const p = ART.plants[name]; if (p) g.drawImage(G.sprite(p.grid, p.ink, 'p:' + name), x, y); };
      const names = ['tulip', 'sunflower', 'rose', 'lavender', 'clover', 'moonflower', 'fern'];
      if (['garden', 'meadow', 'park', 'flight'].includes(L)) {
        const n = Math.round(this.W / (L === 'garden' ? 9 : 16));
        for (let i = 0; i < n; i++) {
          const x = Math.round(this.rand() * (this.W - 6)), y = gy - 5 + Math.round(this.rand() * (this.H - gy - 2));
          if (this.o.layout !== 'cover' && x > this.W * 0.6 && x < this.W * 0.8 && y < gy + 4) continue;
          plant(names[Math.floor(this.rand() * names.length)], x, y);
        }
      }
      if (L === 'desert') for (let i = 0; i < 3; i++) plant('cactus', Math.round(this.rand() * (this.W - 6)), gy - 4 + Math.round(this.rand() * 4));
      if (L === 'forest' || L === 'pond') for (let i = 0; i < 3; i++) plant(['mushroom', 'fern', 'pine'][i], Math.round(this.rand() * (this.W - 6)), gy - 4 + Math.round(this.rand() * 5));
      if (L === 'beach') { // shells and a few waves on the shore
        for (let i = 0; i < 5; i++) this.px(g, Math.round(this.rand() * this.W), gy + 2 + Math.round(this.rand() * (this.H - gy - 4)), i % 2 ? '#f6a6b8' : '#ffffff');
      }
      if (L === 'meadow' || L === 'garden') for (let i = 0; i < 12; i++) this.movers.push({ k: 'fly', x: this.rand() * this.W, y: gy - 3 - this.rand() * this.S * 0.3, p: this.rand() * 6, glow: this.night });
      if (L === 'flight') { // the flower towers Bumble flies between
        const stem = this.night ? '#3f6b3a' : '#5aa354';
        for (let i = 0; i < 3; i++) {
          const x = Math.round(this.W * (0.18 + i * 0.34)), gap = Math.round(this.S * 0.18), mid = Math.round(this.S * (0.35 + this.rand() * 0.15));
          g.fillStyle = stem; g.fillRect(x, 0, 3, mid - gap); g.fillRect(x, mid + gap, 3, gy - mid - gap);
          plant(names[i], x - 1, mid - gap - 4); plant(names[i + 2], x - 1, mid + gap - 2);
        }
      }
      if (L === 'market') this.buildStall(g);
      if (L === 'gears') this.movers.push({ k: 'gear' });
      if (L === 'concert') { // speakers
        const sp = this.night ? '#1d1d24' : '#3a3d4a';
        for (const sx of [2, this.W - 10]) { g.fillStyle = sp; g.fillRect(sx, gy - 14, 8, 14); g.fillStyle = mix(sp, '#ffffff', 0.25); g.fillRect(sx + 2, gy - 12, 4, 4); g.fillRect(sx + 2, gy - 6, 4, 4); }
      }
    }
    buildStall(g) {
      const W = this.W, gy = this.gy;
      const x0 = Math.round(W * (this.o.layout === 'cover' ? 0.08 : 0.5)), x1 = Math.round(W * (this.o.layout === 'cover' ? 0.92 : 0.94));
      const top = Math.round(this.S * 0.32);
      const cols = CATALOG.suite.map((a) => a.c);
      for (let x = x0; x <= x1; x++) { // the striped awning
        const col = cols[Math.floor((x - x0) / 3) % cols.length];
        g.fillStyle = this.night ? mix(col, '#000000', 0.35) : col; g.fillRect(x, top, 1, 5);
        if ((x - x0) % 3 === 1) g.fillRect(x, top + 5, 1, 1);
      }
      const wood = this.night ? '#4a3424' : '#8a5a3c';
      g.fillStyle = wood; g.fillRect(x0, top + 5, 1, gy - top - 5); g.fillRect(x1, top + 5, 1, gy - top - 5);
      const counter = gy - Math.round(this.S * 0.1);
      g.fillStyle = mix(wood, '#ffffff', 0.15); g.fillRect(x0, counter, x1 - x0 + 1, 2);
      g.fillStyle = wood; g.fillRect(x0, counter + 2, x1 - x0 + 1, gy - counter - 2);
      // little boxes on the counter, one per app colour
      for (let i = 0, x = x0 + 2; x < x1 - 3; i++, x += 4) { g.fillStyle = cols[i % cols.length]; g.fillRect(x, counter - 3, 3, 3); }
      this.stall = { x0, x1, counter };
    }
    buildTable(g) {
      // a card table seen from above: green felt under a lamp, a wooden rim, dice and chips
      const { W, H } = this;
      const cover = this.o.layout === 'cover' || this.o.layout === 'square';
      const felt = mix(this.night ? '#1d5a3c' : '#2f8a57', this.c, 0.06);
      const shades = [mix(felt, '#ffffff', 0.14), mix(felt, '#ffffff', 0.06), felt, mix(felt, '#000000', 0.14), mix(felt, '#000000', 0.3)];
      const hero = this.o.layout === 'hero';
      const cx = W * (cover ? 0.5 : 0.7), cy = H * (cover ? 0.55 : hero ? 0.22 : 0.52);
      const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.sqrt(Math.pow((x - cx) / (W * (cover ? 0.75 : 0.55)), 2) + Math.pow((y - cy) / (H * (hero ? 0.45 : 0.7)), 2));
        const lvl = Math.max(0, Math.min(4, Math.floor(d * 4.2 + B[(y % 4) * 4 + (x % 4)] / 16 - 0.4)));
        g.fillStyle = shades[lvl];
        if (rnd(x, y) > 0.97) g.fillStyle = mix(shades[lvl], '#ffffff', 0.08);
        g.fillRect(x, y, 1, 1);
      }
      // the rim
      const rw = Math.max(2, Math.round(Math.min(W, H) * 0.045));
      const wood = this.night ? '#3a2618' : '#7a4a2a', hi = mix(wood, '#ffffff', 0.28), lo = mix(wood, '#000000', 0.3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const e = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (e >= rw || hero) continue;
        g.fillStyle = e === rw - 1 ? hi : (rnd(x * 0.3, y) > 0.8 ? lo : wood);
        g.fillRect(x, y, 1, 1);
      }
      if (this.o.plain) return;
      // chips: little stacks in the suite's colours
      const chip = (x, y, n, col) => { for (let i = 0; i < n; i++) { g.fillStyle = mix(col, '#000000', 0.3); g.fillRect(x, y - i * 2 + 1, 5, 1); g.fillStyle = col; g.fillRect(x, y - i * 2, 5, 1); g.fillStyle = mix(col, '#ffffff', 0.4); g.fillRect(x + 1, y - i * 2, 3, 1); } };
      // dice and chips, kept away from the words on the left
      const s = Math.max(8, Math.round(Math.min(W, H) * (cover ? 0.2 : 0.17)));
      if (cover) {
        this.drawDie(g, Math.round(W * 0.6), Math.round(H * 0.14), s, 5);
        chip(Math.round(W * 0.16), Math.round(H * 0.3), 3, '#ff707a'); chip(Math.round(W * 0.26), Math.round(H * 0.26), 2, '#7cc4ff');
      } else {
        const top = hero ? 0.06 : 0.18;
        this.drawDie(g, Math.round(W * 0.55), Math.round(H * top), Math.round(s * (hero ? 0.75 : 1)), 5);
        this.drawDie(g, Math.round(W * 0.88), Math.round(H * (top + 0.16)), Math.round(s * (hero ? 0.6 : 0.8)), 3);
        chip(Math.round(W * 0.84), Math.round(H * (top + 0.02)) + 6, 4, '#ff707a'); chip(Math.round(W * 0.84) + 7, Math.round(H * (top + 0.04)) + 6, 2, '#7cc4ff'); chip(Math.round(W * 0.6), Math.round(H * (top + 0.3)), 3, '#f5c431');
      }
      this.placeMascot();
    }
    drawDie(g, x, y, s, face) {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x + 2, y + 2, s, s);
      g.fillStyle = '#2a2833'; g.fillRect(x, y, s, s);
      g.fillStyle = '#f7f4ec'; g.fillRect(x + 1, y + 1, s - 2, s - 2);
      g.fillStyle = '#ffffff'; g.fillRect(x + 1, y + 1, s - 2, 1);
      const p = Math.max(1, Math.round(s / 6));
      const cols = ['#ff707a', '#7cc4ff', '#8fd16a', '#f5c431', '#d39cf5', '#2bc4b2'];
      G.PIPS[face].forEach(([a, b], i) => { g.fillStyle = cols[i]; g.fillRect(x + Math.round(s * (0.22 + a * 0.28)) - (p >> 1) + 1, y + Math.round(s * (0.22 + b * 0.28)) - (p >> 1) + 1, p, p); });
    }
    // Behind Home, a Terminal or a page of notes sits in its own world: a
    // window (or a sheet of paper) up in the sky, with Cubby beside it.
    buildFramed(g) {
      const { W, H, gy } = this;
      skyGradient(g, W, gy, this.skyTop(), this.skyLow());
      if (this.night) this.makeStars(); else this.makeClouds();
      this.far_hills(g);
      this.buildGround(g);
      const w = Math.round(W * 0.28), hh = Math.round(this.S * 0.52);
      const x = Math.round(W * 0.5), y = Math.max(2, gy - hh - Math.round(this.S * 0.08));
      const inner = new World({ land: this.land, c: this.c, who: null, night: this.night, W: w, H: hh, layout: 'square', seed: this.o.seed });
      g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x + 2, y + 2, w, hh);
      g.drawImage(inner.base, x, y);
      g.fillStyle = this.night ? '#3a3a44' : '#2a2833';
      g.fillRect(x, y - 1, w, 1); g.fillRect(x, y + hh, w, 1); g.fillRect(x - 1, y, 1, hh); g.fillRect(x + w, y, 1, hh);
      // a stand under the window
      if (this.land !== 'paper') { g.fillStyle = this.night ? '#3a3a44' : '#5f5f69'; g.fillRect(x + (w >> 1) - 1, y + hh + 1, 3, gy - y - hh - 1); g.fillRect(x + (w >> 1) - 5, gy - 1, 11, 2); }
      this.o.who = 'cubby';
      this.placeMascot();
      this.mx = Math.round(x + w + 6); this.my = gy - G.mascot('cubby').height + 1;
    }
    buildScreen(g) {
      // a Terminal window: the page itself is the picture
      const { W, H } = this;
      const menu = this.land === 'menu';
      const bg = this.night || menu ? (menu ? '#16161c' : '#101014') : '#fbfbfc', bar = this.night || menu ? '#24242c' : '#ececf0';
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = bar; g.fillRect(0, 0, W, Math.max(3, Math.round(H * 0.07)));
      ['#ff6b6b', '#f2c14e', '#8fd16a'].forEach((c, i) => { g.fillStyle = c; g.fillRect(2 + i * 3, 1, 2, Math.max(1, Math.round(H * 0.07) - 2)); });
      const r = this.rand;
      const ink = this.night || menu ? '#3e3e48' : '#d9d9e0';
      let y = Math.round(H * 0.07) + 3;
      const cols = menu ? CATALOG.suite.map((a) => a.c) : ['#8fd16a', '#7cc4ff', '#d39cf5', '#f2c14e', '#ff707a'];
      let i = 0;
      while (y < H - 4) {
        let x = 3;
        if (menu) {
          if (i === 2) { g.fillStyle = '#2c2c36'; g.fillRect(1, y - 1, W - 2, 4); g.fillStyle = '#8fd16a'; g.fillRect(x - 1, y, 1, 2); }
          g.fillStyle = cols[i % cols.length]; g.fillRect(x + 1, y, 2, 2);
          g.fillStyle = i === 2 ? '#c9c9d2' : ink; g.fillRect(x + 5, y, 8 + Math.round(r() * (W * 0.4)), 2);
        } else {
          g.fillStyle = cols[0]; g.fillRect(x, y, 2, 1); x += 4;
          const words = 1 + Math.floor(r() * 4);
          for (let w = 0; w < words && x < W - 6; w++) { const len = 2 + Math.round(r() * 7); g.fillStyle = r() > 0.7 ? cols[1 + Math.floor(r() * 4)] : ink; g.fillRect(x, y, len, 1); x += len + 2; }
        }
        y += menu ? 4 : 3; i++;
      }
      this.cursor = { x: 7, y: H - 5 };
      this.movers.push({ k: 'cursor' });
      if (!menu) this.who = null;
    }
    buildPaper(g) {
      const { W, H } = this;
      const paper = this.night ? '#14141a' : '#fffdf7', line = this.night ? '#26324a' : '#cfe0f5', margin = this.night ? '#5a2a35' : '#f4a6b0';
      g.fillStyle = paper; g.fillRect(0, 0, W, H);
      for (let y = Math.round(H * 0.16); y < H; y += 4) { g.fillStyle = line; g.fillRect(0, y, W, 1); }
      g.fillStyle = margin; g.fillRect(Math.round(W * 0.14), 0, 1, H);
      // handwriting
      const r = this.rand, ink = this.night ? '#a3a3ad' : '#3a3d4a';
      for (let y = Math.round(H * 0.16) - 2, n = 0; y < H * 0.72; y += 4, n++) {
        let x = Math.round(W * 0.14) + 3;
        const words = 2 + Math.floor(r() * 4);
        for (let w = 0; w < words && x < W - 4; w++) { const len = 2 + Math.round(r() * 6); for (let k = 0; k < len; k++) this.px(g, x + k, y + ((k + n) % 3 === 0 ? 0 : 1), ink); x += len + 2; }
      }
      const p = ART.plants.tulip; g.drawImage(G.sprite(p.grid, p.ink, 'p:tulip'), Math.round(W * 0.7), Math.round(H * 0.74));
      // a pencil
      const px0 = Math.round(W * 0.2), py0 = Math.round(H * 0.9);
      for (let k = 0; k < Math.round(W * 0.4); k++) { this.px(g, px0 + k, py0 - Math.round(k * 0.35), '#f2c14e', 1, 2); }
      this.px(g, px0 - 1, py0 + 1, '#3a3d4a');
      this.who = null;
    }
    placeMascot() {
      const who = this.o.who === undefined ? null : this.o.who;
      if (!who) return;
      const s = G.mascot(who);
      if (!s) return;
      const lay = this.o.layout, W = this.W;
      let x, y;
      if (who === 'cubby') this.dieFloat = true;
      if (this.land === 'flight') { x = Math.round(W * (lay === 'cover' ? 0.5 : 0.68) - s.width / 2); y = Math.round(this.S * 0.4 - s.height / 2); this.float = true; }
      else if (this.land === 'market' && this.stall) { x = Math.round((lay === 'cover' ? W * 0.5 : (this.stall.x0 + this.stall.x1) / 2) - s.width / 2); y = this.stall.counter - s.height + 4; }
      else if (this.land === 'table') { x = Math.round(W * (lay === 'cover' || lay === 'square' ? 0.5 : 0.71) - s.width / 2); y = Math.round(this.H * (lay === 'cover' || lay === 'square' ? 0.66 : lay === 'hero' ? 0.24 : 0.62) - s.height / 2); }
      else {
        x = Math.round(W * (lay === 'cover' || lay === 'square' || lay === 'stage' ? 0.5 : lay === 'wide' ? 0.64 : 0.74) - s.width / 2);
        y = this.gy - s.height + 1 + (this.land === 'pond' ? -1 : 0);
        if (this.pond && lay !== 'cover' && lay !== 'square') x = Math.round(this.pond.cx + this.pond.rx + 4);
        if (this.float) y = Math.round(this.S * 0.48 - s.height / 2);
      }
      this.who = who; this.mx = x; this.my = y;
      this.blinkAt = 1.5 + this.rand() * 3;
    }

    // Everything that moves, drawn over the still picture. t is in seconds.
    draw(g, t, still) {
      g.imageSmoothingEnabled = false;
      g.drawImage(this.base, 0, 0);
      const W = this.W, H = this.H, gy = this.gy;
      for (const m of this.movers) {
        switch (m.k) {
          case 'star': {
            const a = still ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(t * m.s + m.p));
            g.globalAlpha = a; g.fillStyle = m.big ? '#fff6c8' : '#ffffff'; g.fillRect(m.x, m.y, 1, 1);
            if (m.big && a > 0.85) { g.globalAlpha = a * 0.35; g.fillRect(m.x - 1, m.y, 3, 1); g.fillRect(m.x, m.y - 1, 1, 3); }
            g.globalAlpha = 1; break;
          }
          case 'shooting': {
            if (still) break;
            const cyc = t % 14, at = m.next % 14;
            if (cyc > at && cyc < at + 0.7) {
              const k = (cyc - at) / 0.7, x0 = W * 0.15 + (m.next * 37 % (W * 0.5)), y0 = this.S * 0.08;
              for (let i = 0; i < 6; i++) { g.globalAlpha = (1 - i / 6) * (1 - k); g.fillStyle = '#ffffff'; g.fillRect(Math.round(x0 + k * W * 0.3 - i), Math.round(y0 + k * H * 0.15 - i * 0.5), 1, 1); }
              g.globalAlpha = 1;
            }
            break;
          }
          case 'cloud': {
            const x = still ? m.x : ((m.x + t * m.v) % (W + 24)) - 12;
            drawCloud(g, Math.round(x), m.y, m.big, this.c);
            break;
          }
          case 'birds': {
            if (still) break;
            const cyc = (t + m.next) % 22;
            if (cyc < 9) {
              const bx = Math.round(-6 + cyc / 9 * (W + 12)), by = Math.round(this.S * 0.24 + Math.sin(cyc) * 2);
              const flap = Math.floor(t * 5) % 2;
              g.fillStyle = this.night ? '#c9d2e6' : '#3a3d4a';
              for (const [ox, oy] of [[0, 0], [5, 2], [9, -1]]) { g.fillRect(bx + ox, by + oy, 1, 1); g.fillRect(bx + ox - 1, by + oy - flap, 1, 1); g.fillRect(bx + ox + 1, by + oy - flap, 1, 1); }
            }
            break;
          }
          case 'leaf': {
            const y = still ? m.y : (m.y + t * m.v) % (gy + 4);
            const x = m.x + Math.sin(t * 1.3 + m.p) * 3;
            g.fillStyle = this.night ? mix(m.col, '#000000', 0.5) : m.col; g.fillRect(Math.round(x), Math.round(y), 1, 1);
            break;
          }
          case 'snow': {
            const y = still ? m.y : (m.y + t * m.v) % H;
            g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(Math.round(m.x + Math.sin(t + m.p) * 2), Math.round(y), 1, 1);
            break;
          }
          case 'shimmer': {
            const s = this.sea; if (!s) break;
            const n = s.pond ? 6 : Math.round(W / 6);
            for (let i = 0; i < n; i++) {
              let x, y;
              if (s.pond) { const a = rnd(i, 1) * 6.28; x = s.pond.cx + Math.cos(a) * s.pond.rx * 0.6 * rnd(i, 2); y = s.pond.cy + Math.sin(a) * s.pond.ry * 0.5; }
              else { x = rnd(i, 3) * W; y = s.top + 1 + rnd(i, 4) * (gy - s.top - 2); }
              const on = still ? rnd(i, 5) > 0.5 : Math.sin(t * 2 + i * 1.7) > 0.3;
              if (!on) continue;
              g.fillStyle = this.night ? 'rgba(246,240,216,.55)' : 'rgba(255,255,255,.75)';
              g.fillRect(Math.round(x + (still ? 0 : Math.sin(t * 0.7 + i) * 1.5)), Math.round(y), 2 + (i % 2), 1);
            }
            if (this.night && this.sun && !s.pond) { // the moon's path on the water
              for (let y = s.top + 1; y < gy; y += 2) { g.fillStyle = 'rgba(246,240,216,.35)'; g.fillRect(Math.round(this.sun.x - 2 + Math.sin(t * 2 + y) * (still ? 0 : 1.5)), y, 4 - ((y - s.top) % 4 ? 1 : 0), 1); }
            }
            break;
          }
          case 'kelp': {
            const col = this.night ? '#1f4a3a' : mix('#3f9a5a', this.c, 0.2);
            for (let i = 0; i < m.h; i++) { const sway = Math.round(Math.sin((still ? 0 : t) * 1.2 + m.p + i * 0.25) * (i / m.h) * 3); g.fillStyle = i % 4 === 0 ? mix(col, '#ffffff', 0.15) : col; g.fillRect(m.x + sway, gy - i, 1, 1); if (i % 5 === 2) g.fillRect(m.x + sway + 1, gy - i, 1, 1); }
            break;
          }
          case 'bubble': {
            const y = still ? m.y : H - ((H - m.y + t * m.v * 2) % (H + 4));
            const x = m.x + Math.sin(t * 2 + m.p) * 1.5;
            g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
            if ((m.p * 10 | 0) % 3 === 0) { g.fillRect(Math.round(x) + 1, Math.round(y) - 1, 1, 1); }
            break;
          }
          case 'fly': {
            const x = m.x + (still ? 0 : Math.sin(t * 0.7 + m.p) * 6), y = m.y + (still ? 0 : Math.cos(t * 1.1 + m.p * 2) * 3);
            if (m.glow) {
              const a = still ? 0.8 : 0.4 + 0.6 * Math.abs(Math.sin(t * 1.8 + m.p));
              g.globalAlpha = a * 0.35; g.fillStyle = '#e8ff8a'; g.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); g.fillRect(Math.round(x), Math.round(y) - 1, 1, 3);
              g.globalAlpha = a; g.fillRect(Math.round(x), Math.round(y), 1, 1); g.globalAlpha = 1;
            } else if (m.p < 2.5) { // butterflies by day
              const flap = Math.floor(t * 6 + m.p) % 2;
              g.fillStyle = ['#f6a6b8', '#f5c431', '#7cc4ff'][Math.floor(m.p) % 3];
              g.fillRect(Math.round(x) - 1, Math.round(y) - flap, 1, 1); g.fillRect(Math.round(x) + 1, Math.round(y) - flap, 1, 1);
              g.fillStyle = '#3a3d4a'; g.fillRect(Math.round(x), Math.round(y), 1, 1);
            }
            break;
          }
          case 'windows': {
            if (still) break;
            const k = Math.floor(t / 1.5);
            for (let i = 0; i < 5; i++) { const w = this.windows[Math.floor(rnd(k, i) * this.windows.length)]; if (w) { g.fillStyle = mix(this.skyLow(), '#000000', 0.4); g.fillRect(w[0], w[1], 1, 1); } }
            break;
          }
          case 'eq': {
            // bars from the middle out: the low notes in the middle, the high ones at the edges
            const n = Math.floor(W / 4), half = Math.ceil(n / 2), lvl = Dice.music ? Dice.music.levels(half) : null;
            for (let i = 0; i < n; i++) {
              const k = Math.min(half - 1, Math.abs(i - (n - 1) / 2) | 0);
              const v = lvl ? lvl[k] : (still ? 0.4 + 0.3 * rnd(k, 1) : 0.2 + 0.2 * Math.abs(Math.sin(t * (1.5 + rnd(k, 2) * 2) + k)));
              const h = Math.round(v * gy * 0.55);
              for (let y = 0; y < h; y += 2) { g.fillStyle = mix(this.c, '#ffffff', this.night ? y / gy * 0.8 : 0.1 + y / gy * 0.4); g.globalAlpha = this.night ? 0.85 : 0.55; g.fillRect(i * 4 + 1, gy - 2 - y, 3, 1); }
            }
            g.globalAlpha = 1;
            break;
          }
          case 'lights': {
            if (still) break;
            const cols = ['#ff707a', '#7cc4ff', '#8fd16a', '#f5c431'];
            for (let i = 0; i < 4; i++) {
              const x0 = Math.round(W * (0.15 + i * 0.23)), sway = Math.sin(t * 0.8 + i) * W * 0.06;
              g.globalAlpha = this.night ? 0.14 : 0.07; g.fillStyle = cols[i];
              for (let y = 0; y < gy; y++) { const w = 1 + Math.round(y * 0.06); g.fillRect(Math.round(x0 + sway * y / gy - w / 2), y, w, 1); }
            }
            g.globalAlpha = 1;
            break;
          }
          case 'cursor': {
            if (still || Math.floor(t * 2) % 2 === 0) { g.fillStyle = '#8fd16a'; g.fillRect(this.cursor.x, this.cursor.y, 2, 2); }
            break;
          }
          case 'gear': {
            const hz = this.o.layout === 'hero', gk = hz ? 0.15 : 0.22, gyc = hz ? 0.36 : 0.42;
            drawGear(g, Math.round(W * (hz ? 0.72 : 0.5)), Math.round(this.S * gyc), Math.round(Math.min(W, this.S) * gk), still ? 0 : t * 0.5, this.night ? '#c9d2e6' : mix(this.c, '#000000', 0.35), this.night ? '#000000' : '#ffffff');
            drawGear(g, Math.round(W * (hz ? 0.72 : 0.5) + Math.min(W, this.S) * (hz ? 0.2 : 0.3)), Math.round(this.S * gyc + Math.min(W, this.S) * (hz ? 0.17 : 0.24)), Math.round(Math.min(W, this.S) * (hz ? 0.08 : 0.12)), still ? 0 : -t * 0.9, this.night ? '#8a96b0' : this.c, this.night ? '#000000' : '#ffffff');
            break;
          }
        }
      }
      // the Dice die floats over the ground, turning a little, its shadow under it
      if (this.who === 'cubby' && this.dieFloat) {
        // smaller in the big scene behind Home, where the ground sits near the top
        const ds = this.o.layout === 'hero' ? 18 : 24;
        const d = still ? G.die(ds, null, { key: 'mascot' + ds }) : G.dieWobble(ds, t);
        const lift = (ds < 24 ? 3 : 5) + (still ? 0 : Math.sin(t * 1.6) * (ds < 24 ? 1 : 2));
        const groundY = this.land === 'table' ? this.my + d.height + 2 : this.gy;
        const sw = Math.round(d.width * (0.62 - lift * 0.02));
        for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(0,0,0,' + (k ? 0.1 : 0.16) + ')'; g.fillRect(this.mx + Math.round((d.width - sw) / 2) - k * 2, groundY + k, sw + k * 4, 1); }
        g.drawImage(d, this.mx, Math.round(groundY - d.height - lift));
      } else if (this.who) {
      // the mascot: breathing, and blinking now and then
        const blinking = !still && (t % 4.2) > this.blinkAt && (t % 4.2) < this.blinkAt + 0.14;
        const s = G.mascot(this.who, { blink: blinking });
        const bob = still ? 0 : this.float ? Math.round(Math.sin(t * 2.2) * 1.6) : (Math.floor(t * 1.6) % 2);
        if (!this.float) { // a little shadow
          g.fillStyle = this.land === 'table' ? 'rgba(0,0,0,.22)' : 'rgba(0,0,0,.14)';
          g.fillRect(this.mx + 3, this.land === 'table' ? this.my + s.height : this.gy + 1, s.width - 6, 1);
        }
        if (this.float || !bob) g.drawImage(s, this.mx, this.my + (this.float ? bob : 0));
        else { // breathing: everything above the feet dips by a pixel, the feet stay put
          g.drawImage(s, 0, 0, s.width, s.height - 1, this.mx, this.my + 1, s.width, s.height - 1);
          g.drawImage(s, 0, s.height - 1, s.width, 1, this.mx, this.my + s.height - 1, s.width, 1);
        }
      }
      // the gang on the desktop: friends wandering about
      if (this.o.gang && !this.gangers) this.makeGang();
      if (this.gangers) this.drawGang(g, t, still);
    }
    makeGang() {
      const ids = Object.keys(ART.mascots);
      const r = seeded(hash('gang' + this.W));
      this.gangers = [];
      const n = Math.min(ids.length, Math.max(4, Math.floor(this.W / 34)));
      const pick = ids.sort(() => r() - 0.5).slice(0, n).concat(this.o.gangDie === false ? [] : ['cubby']); // the die bounces along too, unless told not to
      pick.forEach((id, i) => this.gangers.push({ id, x: (i + 0.5) / pick.length * this.W, dir: r() > 0.5 ? 1 : -1, speed: 2 + r() * 3, rest: r() * 4, seed: r() * 10 }));
    }
    drawGang(g, t, still) {
      for (const m of this.gangers) {
        const s = G.mascot(m.id);
        const span = this.W - s.width;
        // walk a while, rest a while, turn round at the edges
        const phase = (t + m.seed) % 10;
        const walking = !still && phase > m.rest && phase < m.rest + 5;
        const travel = (Math.floor((t + m.seed) / 10) * 5 + (walking ? phase - m.rest : (phase >= m.rest + 5 ? 5 : 0))) * m.speed;
        let pos = ((m.x + travel * m.dir) % (2 * span) + 2 * span) % (2 * span);
        let dir = m.dir;
        if (pos > span) { pos = 2 * span - pos; dir = -dir; }
        if (m.id === 'cubby') { // the die doesn't walk: it bounces along, and its shadow shrinks as it goes up
          const up = walking ? Math.round(Math.abs(Math.sin((t + m.seed) * 5)) * 5) : 0;
          const d = walking ? G.dieWobble(24, t) : s;
          g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(Math.round(pos) + 4 + (up >> 1), this.gy + 1, s.width - 8 - up, 1);
          g.drawImage(d, Math.round(pos), this.gy - s.height + 2 - up);
          continue;
        }
        const hop = walking && Math.floor(t * 6 + m.seed) % 2 ? 1 : 0;
        const sp = G.mascot(m.id, { flip: dir < 0 });
        g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(Math.round(pos) + 3, this.gy + 1, s.width - 6, 1);
        g.drawImage(sp, Math.round(pos), this.gy - s.height + 1 - hop);
      }
    }
  }
  function drawCloud(g, x, y, big, c) {
    const C = big ? ['....WWW.......', '..WWWWWWW.WW..', '.WWWWWWWWWWWW.', 'WWWWWWWWWWWWWW', '.wwwwwwwwwwww.'] : ['...WWW....', '.WWWWWWW.W', 'WWWWWWWWWW', '.wwwwwwww.'];
    C.forEach((row, r) => [...row].forEach((ch, k) => {
      if (ch === '.') return;
      g.fillStyle = ch === 'W' ? 'rgba(255,255,255,.92)' : 'rgba(255,255,255,.62)';
      g.fillRect(x + k, y + r, 1, 1);
    }));
  }
  function drawGear(g, cx, cy, R, a, col, hole) {
    const teeth = 8;
    for (let y = -R - 3; y <= R + 3; y++) for (let x = -R - 3; x <= R + 3; x++) {
      const d = Math.sqrt(x * x + y * y), ang = Math.atan2(y, x) - a;
      const tooth = Math.cos(ang * teeth) > 0.35;
      if (d <= R || (tooth && d <= R + 3)) {
        g.fillStyle = d < R * 0.4 ? hole : (d < R * 0.55 ? mix(col, '#ffffff', 0.2) : col);
        if (d < R * 0.4) continue;
        g.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
  G.World = World;

  // ---- Covers ------------------------------------------------------------------------
  // A still picture of an app's world, cached per look, as a canvas.
  const covers = new Map();
  G.cover = function (app, layout, night) {
    const key = app.id + layout + (night ? 'n' : 'd');
    if (covers.has(key)) return covers.get(key);
    const size = layout === 'cover' ? [40, 60] : layout === 'wide' ? [96, 54] : [64, 64];
    const w = new World({ land: app.land, c: app.c, who: app.who === undefined ? app.id : app.who, night, W: size[0], H: size[1], layout, seed: app.id });
    const c = G.canvas(size[0], size[1]);
    w.draw(c.getContext('2d'), 0, true);
    covers.set(key, c);
    return c;
  };
  G.clearCovers = () => covers.clear();

  // ---- Dissolving from one world to the next ------------------------------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const masks = new Map();
  G.mask = function (W, H, step) { // step 0..16: how much of the new picture shows
    const key = W + 'x' + H + ':' + step;
    if (masks.has(key)) return masks.get(key);
    const c = G.canvas(W, H), g = c.getContext('2d'), img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (BAYER[(y % 4) * 4 + (x % 4)] < step) img.data[(y * W + x) * 4 + 3] = 255;
    g.putImageData(img, 0, 0);
    if (masks.size > 40) masks.clear();
    masks.set(key, c);
    return c;
  };
})();
