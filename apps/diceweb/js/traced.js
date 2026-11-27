// Traced mode: the worlds as if a box full of painters had drawn them by hand, pixel by pixel.
//
// js/scape.js paints each world; in Traced mode (Settings → Look) this file goes over the picture
// before it's shown, and adds what happens in it:
// - the sky in dithered bands with brush strokes and wisps, a ringed sun, or the moon and the Milky Way
// - every hill, tree and roof in short brush strokes, warm where the light hits and cool in the shade
// - an ink line traced round everything that stands in front of something else
// - small painted details in every world: cottages and fields, a lighthouse, a railway, rooftops,
//   mushrooms, a shipwreck, a dock with a rowboat, an igloo, beehives…
// - and little things that happen if you watch: sheep grazing, smoke from a chimney, a balloon, a
//   dolphin, a train far off, a cat flicking its tail, ducks, a frog hopping between lily pads.
// Nothing glows. It's meant to look ordinary, just made by hand.
(function () {
  'use strict';
  const G = window.DiceGfx;
  if (!G || !G.Scape) return;

  // ---- colour ---------------------------------------------------------------------------------------------------
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lit = (c, t) => mixc(c, [255, 255, 255], t);
  const dim = (c, t) => mixc(c, [0, 0, 0], t);
  const css = (c, a) => (a === undefined ? 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')' : 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a + ')');
  const WARM = [255, 214, 150], COOL = [86, 112, 196], INK = [38, 44, 86];
  // ordered dithering: the 4×4 pattern pixel artists use to blend two colours
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
  const bay = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
  function noise2(rand) {
    const n = 64, v = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) v[i] = rand();
    const at = (x, y) => v[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      return (at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx) * (1 - sy) + (at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx) * sy;
    };
  }

  // ---- the painters' colours, one letter each ----------------------------------------------------------------------
  const PAL = {
    R: '#b9533c', r: '#8c3a2b', W: '#efe4cb', w: '#c9ba98', D: '#6b4a32', c: '#87594a', k: '#2c2a30', K: '#55505a',
    B: '#8f6c48', b: '#5b4330', G: '#a3a29b', g: '#727069', s: '#d3d7da', S: '#f6f5ef', Y: '#e6c56c', y: '#b8944a',
    P: '#e8892e', p: '#b45f1f', v: '#4f7f3a', F: '#4f9150', f: '#336a3c', M: '#d6453a', m: '#fff2e0', L: '#c8463a',
    A: '#4f7fbf', a: '#a9cbe8', T: '#2fa59a', O: '#f0a040', I: '#e6f3fb', i: '#a8cce2', Q: '#8a6bd8', Z: '#e9d09c',
    z: '#c4a46c', N: '#ff9fb8', E: '#ffd24a', X: '#d9463c', x: '#99332c', H: '#a5623a', h: '#77462a', J: '#d9b24c',
    n: '#f6dcbc', u: '#3e5f8a', e: '#6c8f3d', t: '#c9b27e',
  };
  // a colour for a letter, faded by distance and darkened at night like the land around it
  function col(S, ch, haze) {
    if (ch === 'o') return S.night ? mixc(rgb('#ffd27a'), S.horizonCol(), haze * 0.4) : S.landCol('#6f90ae', haze); // a window
    if (ch === 'l') return S.night ? rgb('#fff1b8') : S.landCol('#dfe3ea', haze); // a lamp
    if (ch === '1') return rgb('#ff4b3e'); // little lights that stay bright at night
    if (ch === '2') return rgb('#ffffff');
    if (ch === '3') return rgb('#ffe08a');
    return S.landCol(PAL[ch] || '#ff00ff', haze);
  }

  // ---- little pictures --------------------------------------------------------------------------------------------
  // Rows of letters, '.' for nothing. They stand on (x, y): the bottom row sits on y, centred on x.
  const SP = {
    cottage: ['.......cc..', '....RRRcc..', '...RRRRRR..', '..RRRRRRRR.', '.rrrrrrrrrr', '..WWWWWWWw.', '..WoWWDWow.', '..WWWWDWWw.', '..wwwwDwww.'],
    barn: ['....ggggg....', '..ggGGGGGgg..', '.gGGGGGGGGGg.', 'ggggggggggggg', '.XXXXXXXXXXX.', '.XSXXXXXXXSX.', '.XXXXSSSXXXX.', '.XXXXSXSXXXX.', '.XXXXSSSXXXX.', '.xxxxxxxxxxx.'],
    silo: ['.ggg.', 'gGGGg', 'SSSSs', 'SSSSs', 'GGGGg', 'SSSSs', 'SSSSs', 'GGGGg', 'SSSSs', 'SSSSs', 'sssss'],
    farmhouse: ['.......c....', '..RRRRRcRR..', '.RRRRRRRRRR.', 'rrrrrrrrrrrr', '.WWWWWWWWWw.', '.WoWWoWWoWw.', '.WWWWWWWWWw.', '.WoWWDWWoWw.', '.wwwwDwwwww.'],
    cabin: ['.....c.....', '...bbcbb...', '..bbbbbbb..', '.bbbbbbbbb.', 'bbbbbbbbbbb', '.BhBBBBBhB.', '.BoBBDBBoB.', '.hBBBDBBBh.', '.BBBBDBBBB.'],
    lighthouse: ['..k..', '.klk.', 'kkkkk', '.SSs.', '.LLx.', '.SSs.', '.LLx.', 'SSSSs', 'LLLLx', 'SSSSs', 'GGGGg'],
    bale: ['.YY.', 'YyYy', 'yyyy'],
    rock1: ['.gG.', 'gGGs', 'gggg'],
    rock2: ['..G..', '.gGGs', 'gggGs', 'ggggg'],
    rock3: ['.Gs', 'ggg'],
    mossy: ['.FFf.', 'gGGGs', 'ggggg'],
    stump: ['.BYB.', '.BbB.', 'bBBBb'],
    log: ['.BBBBBBBBBBY.', 'BhBBhBBBhBByY', '.bbbbbbbbbbb.'],
    snag: ['k...k..', '.k.k...', '..kk..k', '..k.kk.', '..k....', '..k....', '..k....', '..k....', '.kkk...'],
    mush: ['.MMM.', 'MmMmM', '..n..', '..n..'],
    mush2: ['MMm', '.n.'],
    fern: ['f...f...f', '.f.f.f.f.', '..fFfFf..', '...fFf...'],
    pumpkin: ['.v.', 'PPp', 'pPp'],
    scarecrow: ['..hhh..', '.hhhhh.', '..nnn..', 'XXXXXXX', 'X.XXX.X', '..XXX..', '..AAA..', '..A.A..', '...b...', '...b...'],
    watertower: ['..h..', '.hhh.', 'hhhhh', 'BhBhB', 'BhBhB', 'BhBhB', 'k.k.k', 'kk.kk', 'k.k.k'],
    ac: ['GGg', 'gkg'],
    hydrant: ['.X.', 'XXx', '.X.', 'XXx'],
    bench: ['BBBBBB', 'bbbbbb', 'k....k'],
    mailbox: ['AAA', 'AuA', '.k.', '.k.'],
    planter: ['.FFF.', 'FFFfF', 'FFFff', '.fbf.', '..b..', '.GGG.'],
    sandcastle: ['.z.z.z.', '.ZzZzZ.', '..ZZZ...', '.ZZZZz.', 'ZZZZZZz'],
    umbrella: ['..XSXS..', '.XSXSXS.', 'XSXSXSXS', '...k....', '...k....', '...k....', '.AAAAAA.'],
    starfish: ['.O.', 'OOO', 'O.O'],
    shell: ['nN', 'NN'],
    urchin: ['k.k', '.k.', 'kkk'],
    driftwood: ['....b', 'BBBBb', '.bb..'],
    igloo: ['..SSS..', '.SsSsS.', 'SSSsSSS', 'SsSSSsS', 'SSSkSSS', 'sSSkSSs'],
    flag: ['XX..', 'XXX.', 'k...', 'k...', 'k...'],
    cairn: ['.g.', 'GGs', 'gGg', 'GGGs'],
    wreck: ['......k.......', '......k...k...', '..kkkkkkkkk...', '.kKKKKKKKKKk..', 'kKKKKKKKKKKKk.', '.kKKKKKKKKKk..', '..kkkkkkkkk...'],
    anchor: ['.k.', 'kkk', '.k.', '.k.', 'kkk', 'k.k'],
    chest: ['.hhhh.', 'hJJJJh', 'hhJhhh', 'hBBBBh', 'hhhhhh'],
    hive: ['.YYY.', 'YyYyY', 'YYYYY', 'yYkYy', 'bbbbb'],
    birdbath: ['GGGGG', '.ggg.', '..G..', '..G..', '.GGG.'],
    pot: ['.N.', 'FFF', 'HHH', '.H.'],
    can: ['..k..', 'AAAk.', 'AAA.k', 'AAA..'],
    greenhouse: ['....a....', '..aSaSa..', '.aSaSaSa.', 'aSaSaSaSa', 'aaSaaSaaS', 'aaSaaSaaS', 'SSSSSSSSS'],
    arch: ['.NFNFN.', 'NF...FN', 'F.....F', 'N.....N', 'F.....F', 'b.....b'],
    dock: ['bBbBbBbBbBbBbBbB', 'b...b...b...b...', 'b...b...b...b...'],
    rowboat: ['.........', 'BBBBBBBBB', '.bBBBBBb.'],
    pole: ['bbbbb', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..', '..b..'],
    barrel: ['.F.', 'FfF', 'FfF'],
    bush: ['..FF..', '.FFFf.', 'FFFFff', 'fFfFff'],
    young: ['..f..', '.fFf.', '..f..', '.fFf.', 'fFFff', '..b..'],
    pear: ['N.N..', 'FFN..', 'FfF.F', '.FFFf', '..f..'],
    sage: ['.e.e', 'eGee', '.ee.'],
    turbine: ['..S..', '..S..', '..S..', '..S..', '..S..', '..S..', '..S..', '..S..', '..S..', '.SSS.'],
  };
  // things that move (frames in a list)
  const MV = {
    birdUp: ['k...k', '.k.k.', '..k..'],
    birdDown: ['.....', 'kkkkk', 'k...k'],
    gullUp: ['S.....S', '.S...S.', '..SkS..'],
    gullDown: ['.......', 'SSSkSSS', '.......'],
    plane: ['......s..', 'sssSSSSSk', '...ss....'],
    balloon: ['..XXX..', '.XEXEX.', 'XEXEXEX', 'XEXEXEX', 'XEXEXEX', '.XEXEX.', '..XEX..', '..k.k..', '..k.k..', '..BBB..', '..bbb..'],
    blimp: ['...sssssss...', '.sSSSSSSSSSs.', 'sSSSSSSSSSSSs', '.sSSSSSSSSSs.', '...sskkss....'],
    sheepA: ['.SSSS...', 'SSSSSSkk', 'SSSSSSk.', '.k..k...'],
    sheepB: ['.SSSS...', 'SSSSSSkk', 'SSSSSSk.', '..k..k..'],
    sheepEat: ['.SSSS...', 'SSSSSS..', 'SSSSSSkk', '.k..k.k.'],
    deerA: ['......b.b', '.......b.', '......HHk', '.HHHHHHH.', 'HHHHHHH..', '.H....H..', '.b.b..b.b'],
    deerB: ['......b.b', '.......b.', '......HHk', '.HHHHHHH.', 'HHHHHHH..', '.H....H..', 'b...b.b..'],
    deerEat: ['.........', '.........', '.HHHHHH..', 'HHHHHHHH.', 'HHHHHH.Hb', '.H....H..', '.b.b..b.b'],
    rabbit: ['...ss', '...zs', '.zzzz', 'zzzz.'],
    rabbitUp: ['..ss.', '..zs.', 'zzzz.', '.z.z.'],
    penguinA: ['.kO', 'kSk', 'kSk', 'kSk', 'O.O'],
    penguinB: ['.kO', 'kSk', 'kSk', 'kSk', '.OO'],
    crabA: ['X...X', '.XXX.', 'X.X.X'],
    crabB: ['X...X', '.XXX.', '.X.X.'],
    duck: ['....ffO', '....ff.', 'sBBBBB.', '.BBBB..'],
    duckling: ['..Yy', 'YYY.'],
    frog: ['F.F.', 'FFFF', 'f..f'],
    butterflyA: ['@.@', '.k.'],
    butterflyB: ['.@.', '.k.'],
    catA: ['k.k..', 'kkk..', '.kkk.', '.kkkk'],
    catB: ['k.k.k', 'kkk.k', '.kkk.', '.kkk.'],
    owl: ['b.b', 'EbE', 'bBb', 'b.b'],
    owlBlink: ['b.b', 'bbb', 'bBb', 'b.b'],
    squirrel: ['H..', 'HH.', '.HHh', 'HHHH'],
    squirrelUp: ['HH..', 'HHH.', '.HHh', '.HHH'],
    tumble: ['.zbz.', 'z.b.z', 'bzbzb', 'z.b.z', '.zbz.'],
    tumble2: ['.zbz.', 'zb.bz', 'b.z.b', 'zb.bz', '.zbz.'],
    lizard: ['ee...', '.eeee'],
    jellyA: ['.NNN.', 'NNNNN', 'n.n.n', 'n.n.n', '.n.n.'],
    jellyB: ['.NNN.', 'NNNNN', '.n.n.', 'n.n.n', 'n...n'],
    turtleA: ['..vvv..', '.veVve.', 'FvvvvvF', '.F...F.'],
    turtleB: ['..vvv..', 'FveVveF', '.vvvvv.', 'F.....F'],
    fish: ['OO', 'O.'],
    heron: ['.GG..', 'O.G..', '..G..', '..GG.', '.GGGg', '..Gg.', '..k..', '..k..', '..k..'],
    heronDip: ['.....', '.....', '.....', '..GG.', '.GGGg', 'O.Gg.', '..k..', '..k..', '..k..'],
    pigeon: ['.s', 'GG'],
    pigeon2: ['s.', 'GG'],
    trainEngine: ['..k.......', '.kk..kkkk.', 'XXXXXXXXXk', 'XXXXX2XXXk', 'kkkkkkkkkk', '.k.k..k.k.'],
    trainCar: ['YYYYYYYYY', 'YoYoYoYoY', 'kkkkkkkkk', '.k.....k.'],
    car: ['..@@@@..', '.@aa@a@.', '@@@@@@@@', '.k....k.'],
    whale: ['kk...kk', '.kk.kk.', '..kkk..', '...k...'],
    seal: ['.gg', 'ggg'],
    kite: ['..X..', '.XEX.', 'XEXEX', '.XEX.', '..X..'],
    dragonfly: ['aa.aa', '.TTTTT'],
    snail: ['.HH.', 'HhHz', 'zzzz'],
    vulture: ['kk...kk', '.kkkkk.', '...k...'],
  };

  // a picture into a layer, for good (bottom row on y, centred on x)
  function stamp(S, b, rows, x, y, haze, o) {
    o = o || {};
    const sc = o.sc || 1, h = rows.length, w = Math.max(...rows.map((r) => r.length)), cache = {};
    const x0 = Math.round(x - (w * sc) / 2), y0 = Math.round(y - h * sc + 1);
    for (let j = 0; j < h; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '.') continue;
        const c = (o.cols && o.cols[ch]) || cache[ch] || (cache[ch] = col(S, ch, haze));
        const xi = o.flip ? w - 1 - i : i;
        for (let a = 0; a < sc; a++) for (let q = 0; q < sc; q++) b.set(x0 + xi * sc + a, y0 + j * sc + q, c);
      }
    }
    return { x0, y0, w: w * sc, h: h * sc };
  }
  // a picture as a little canvas, for things that move (made once per scene)
  function spr(S, rows, haze, flip, tint) {
    const key = rows.join('/') + '|' + haze + (flip ? 'f' : '') + (tint || '');
    const m = S._spr || (S._spr = new Map());
    if (m.has(key)) return m.get(key);
    const h = rows.length, w = Math.max(...rows.map((r) => r.length)), c = G.canvas(w, h), g = c.getContext('2d'), cache = {};
    for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
      const ch = rows[j][i];
      if (ch === '.') continue;
      g.fillStyle = cache[ch] || (cache[ch] = css(ch === '@' && tint ? S.landCol(tint, haze) : col(S, ch, haze)));
      g.fillRect(flip ? w - 1 - i : i, j, 1, 1);
    }
    m.set(key, c);
    return c;
  }
  const put = (g, c, x, y, sc) => { sc = sc || 1; g.drawImage(c, Math.round(x - (c.width * sc) / 2), Math.round(y - c.height * sc + 1), c.width * sc, c.height * sc); };
  const px = (g, x, y, c, a) => { g.fillStyle = typeof c === 'string' ? c : css(c, a); g.fillRect(Math.round(x), Math.round(y), 1, 1); };

  // ---- where things can stand ----------------------------------------------------------------------------------------
  const cx = (S, x) => Math.max(0, Math.min(S.W - 1, Math.round(x)));
  // the highest line in front of layer i at x (anything lower than this is hidden)
  function cover(S, i, x) {
    let y = S.H;
    x = cx(S, x);
    for (let j = i + 1; j < S.lays.length; j++) if (S.lays[j].top) y = Math.min(y, S.lays[j].top[x]);
    if (S.wy && !S.lays[i].front) y = Math.min(y, S.wy);
    return y;
  }
  // a spot on layer i, depth pixels into its ground, if you'd see it
  function ground(S, i, x, depth, need) {
    const L = S.lays[i];
    if (!L || !L.top) return null;
    x = cx(S, x);
    if (L.top[x] > S.H) return null;
    const y = L.top[x] + Math.round(depth || 0);
    return y < cover(S, i, x) - (need || 1) && y < S.H - 1 ? y : null;
  }
  // a flat footing for something w wide: the lowest ground under it
  function footing(S, i, x, w) {
    const L = S.lays[i];
    let y = -1;
    for (let dx = -Math.ceil(w / 2); dx <= Math.ceil(w / 2); dx++) y = Math.max(y, L.top[cx(S, x + dx)]);
    return y;
  }
  const nearSc = (S) => Math.max(1, Math.round(S.k * 0.7)); // things at the front are drawn bigger
  const layerAt = (S, i) => (i === 'front' || i < 0 ? S.lays.length - 1 : Math.min(i, S.lays.length - 1));

  // ---- the sky, painted ----------------------------------------------------------------------------------------------
  function paintSky(S, b, r) {
    const { W, H } = S, [top, mid, low] = S.sky(), span = S.R.under ? H : S.hy;
    const at = (t) => (t < 0.55 ? mixc(top, mid, t / 0.55) : mixc(mid, low, (t - 0.55) / 0.45));
    // bands of colour with dithered edges
    const bands = Math.max(12, Math.round(span / (3.4 * S.k)));
    const cols = [];
    for (let i = 0; i <= bands; i++) cols.push(at(i / bands));
    for (let y = 0; y < H; y++) {
      const f = Math.min(1, y / span) * bands;
      for (let x = 0; x < W; x++) b.set(x, y, cols[Math.max(0, Math.min(bands, Math.floor(f + bay(x, y) + 0.5)))]);
    }
    // brush strokes across it
    const n = Math.round((W * span) / 150);
    for (let s = 0; s < n; s++) {
      const x0 = r() * W, y0 = r() * span * 0.98, len = (8 + r() * 26) * S.k * 0.6, t0 = Math.min(1, y0 / span);
      const up = r() < 0.55, c = up ? mixc(lit(at(t0), S.night ? 0.02 : 0.05), WARM, S.night ? 0 : 0.03) : mixc(dim(at(t0), 0.03), COOL, 0.04);
      let y = Math.round(y0);
      for (let j = 0; j < len; j++) { if (r() < 0.05) y += r() < 0.5 ? -1 : 1; b.set(x0 + j, y, c, 0.35 + 0.45 * Math.sin(((j + 0.5) / len) * Math.PI)); }
    }
    // high wisps by day
    if (!S.night && !S.R.under) {
      const nw = 3 + Math.floor(r() * 4);
      for (let w = 0; w < nw; w++) {
        const x0 = r() * W, y0 = span * (0.06 + r() * 0.42), len = (40 + r() * 100) * S.k * 0.6, tilt = (r() - 0.5) * 0.09, c = lit(at(y0 / span), 0.5);
        for (let j = 0; j < len; j++) {
          const th = Math.sin((j / len) * Math.PI), yy = y0 + j * tilt + Math.sin(j * 0.06 + w) * 2 * S.k;
          b.set(x0 + j, yy, c, 0.12 + 0.3 * th * (0.6 + 0.4 * Math.sin(j * 0.8)));
          if (th > 0.55 && (j & 1)) b.set(x0 + j, yy + 1, c, 0.1 + 0.15 * th);
        }
      }
    }
    // the Milky Way, away from city lights
    if (S.night && !S.R.under && S.world !== 'city') {
      const nz = noise2(r), tint = rgb('#a99ad8');
      for (let x = 0; x < W; x++) {
        const yc = span * (0.78 - (x / W) * 0.7), bw = span * 0.13;
        for (let y = Math.max(0, Math.round(yc - bw)); y < Math.min(span, yc + bw); y++) {
          const d = Math.abs(y - yc) / bw, v = nz(x * 0.045, y * 0.06) * (1 - d * d);
          if (v + bay(x, y) * 0.35 > 0.42) b.set(x, y, mixc(b.get(x, y), tint, 0.07 + v * 0.06));
          if (r() < v * v * 0.05) b.set(x, y, lit(b.get(x, y), 0.35 + r() * 0.3));
        }
      }
    }
    // the sun (or moon) in stepped rings
    if (!S.R.under && S.sunAt) {
      const { x: sx, y: sy, r: R } = S.sunAt;
      const glow = S.night ? rgb('#c9d6ff') : rgb(S.world === 'desert' ? '#fff0c0' : '#fff6d8');
      const out = R * 3.4;
      for (let y = -Math.ceil(out); y <= out; y++) for (let x = -Math.ceil(out); x <= out; x++) {
        const d = Math.hypot(x, y) + bay(sx + x, sy + y) * R * 0.45;
        if (d <= R + 0.5 || d > out) continue;
        const a = (d < R * 1.55 ? 0.42 : d < R * 2.3 ? 0.22 : 0.09) * (S.night ? 0.55 : 1);
        b.set(sx + x, sy + y, mixc(b.get(sx + x, sy + y), glow, a));
      }
      const disc = S.night ? rgb('#f2eedb') : rgb(S.world === 'desert' ? '#ffd257' : '#ffe17d');
      const shade = S.night ? rgb('#cfcab5') : mixc(disc, rgb('#ffb347'), 0.45), hi = lit(disc, 0.55);
      for (let y = -R - 1; y <= R + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
        const d = Math.hypot(x, y);
        if (d > R + 0.45) continue;
        let c = disc;
        if (d > R - 1) c = x - y < 0 ? shade : lit(disc, 0.25); // a rim, deeper on the lower left
        else if (S.night) {
          for (const [ox, oy, cr] of [[-0.35, -0.2, 0.28], [0.3, 0.3, 0.2], [0.2, -0.45, 0.14], [-0.1, 0.45, 0.12]]) if (Math.hypot(x / R - ox, y / R - oy) < cr) c = Math.hypot(x / R - ox + 0.06, y / R - oy + 0.06) < cr ? rgb('#d9d3bd') : rgb('#c7c1aa');
          if (x < -R * 0.55 + bay(sx + x, sy + y) * R * 0.3) c = mixc(c, rgb('#9aa0b8'), 0.35);
        } else if (x - y > R * 0.7 && d < R - 1.5) c = hi;
        else if (x - y < -R * 0.9) c = mixc(disc, shade, 0.5);
        b.set(sx + x, sy + y, c);
      }
    }
  }

  // ---- brush strokes over the land ----------------------------------------------------------------------------------
  // Two brushes: broad strokes that model the land, then small dabs on top. Each stroke changes how light
  // a patch is and, separately, its pigment (a touch warmer or cooler), the way painters break up a colour.
  function texture(S, b, r, hz) {
    const { W, H, d, ids } = b, N = W * H, F = new Float32Array(N), P = new Float32Array(N), k = Math.max(1, S.k * 0.5);
    const brush = (count, lmin, lmax, amp, pig) => {
      for (let s = 0; s < count; s++) {
        const x0 = (r() * W) | 0, y0 = (r() * H) | 0, i0 = y0 * W + x0;
        if (!d[i0 * 4 + 3] || !ids[i0]) continue;
        const id = ids[i0], len = (lmin + r() * (lmax - lmin)) * k, v = (r() - 0.5) * amp, hue = (r() - 0.5) * pig;
        const ang = (r() - 0.5) * 0.5 + (r() < 0.12 ? (r() < 0.5 ? 1 : -1) * 0.9 : 0), ca = Math.cos(ang), sa = Math.sin(ang), wide = r() < 0.35 ? 2 : 1;
        for (let j = 0; j < len; j++) {
          const x = Math.round(x0 + ca * j), y = Math.round(y0 + sa * j);
          if (x < 0 || x >= W || y < 0 || y >= H) break;
          const i = y * W + x;
          if (ids[i] !== id) break;
          const tap = Math.sin(((j + 0.5) / len) * Math.PI);
          for (let q = 0; q < wide && y + q < H; q++) if (ids[i + q * W] === id) { F[i + q * W] += v * tap; P[i + q * W] += hue * tap; }
        }
      }
    };
    brush(Math.round(N / 70), 8, 26, 0.16, 0.5);
    brush(Math.round(N / 16), 2, 7, 0.26, 0.3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, p = i * 4;
      if (!d[p + 3] || !ids[i]) continue;
      const lv = Math.max(-3, Math.min(3, Math.round(F[i] * 10 + bay(x, y) * 0.9)));
      const pv = Math.max(-2, Math.min(2, Math.round(P[i] * 7 + bay(x + 2, y + 1) * 0.9)));
      if (!lv && !pv) continue;
      const far = hz[ids[i]] || 0, step = (0.048 - far * 0.04) * (S.night ? 0.55 : 1);
      let c = [d[p], d[p + 1], d[p + 2]];
      if (lv) c = lv > 0 ? lit(c, lv * step) : dim(c, -lv * step * 1.1);
      if (pv) c = mixc(c, pv > 0 ? (S.night ? [150, 160, 210] : WARM) : COOL, Math.abs(pv) * step * 1.3);
      d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2];
    }
  }

  // ---- the ink line: round everything that stands in front of something else -------------------------------------------
  function trace(S, b, hz) {
    const { W, H, d, ids } = b, src = d.slice(0), sid = ids.slice(0);
    const ink = (q, p) => {
      const far = hz[sid[p]] || 0, P = p * 4, Q = q * 4;
      let c = mixc(dim([src[P], src[P + 1], src[P + 2]], 0.46 - far * 0.2), INK, 0.16);
      if (far) c = mixc(c, S.horizonCol(), Math.min(0.75, far * 1.1));
      if (src[Q + 3]) { const s = [src[Q], src[Q + 1], src[Q + 2]]; c = mixc(s, c, 0.82); }
      d[Q] = c[0]; d[Q + 1] = c[1]; d[Q + 2] = c[2]; d[Q + 3] = 255;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!src[i * 4 + 3] || !sid[i]) continue;
      const id = sid[i], behind = (q) => !src[q * 4 + 3] || sid[q] < id;
      if (y > 0 && behind(i - W)) ink(i - W, i);
      if (x > 0 && behind(i - 1)) ink(i - 1, i);
      if (x < W - 1 && behind(i + 1)) ink(i + 1, i);
      if (y < H - 1 && src[(i + W) * 4 + 3] && sid[i + W] < id && sid[i + W]) ink(i + W, i);
    }
  }

  // ---- clouds, in puffs with a line under them ----------------------------------------------------------------------
  function cloud(S, w, far) {
    const r = S.rand, h = Math.round(w * 0.46), W2 = Math.round(w) + 6, H2 = h + 6, c = G.canvas(W2, H2), g = c.getContext('2d');
    const sky = S.sky(), night = S.night;
    const base = night ? rgb('#2d3b6a') : far ? mixc(rgb('#fbfbf7'), S.horizonCol(), 0.24) : rgb('#fbfaf5');
    const hi = night ? rgb('#3c4c84') : rgb('#ffffff'), mid = mixc(base, sky[1], night ? 0.25 : 0.16), lo = night ? rgb('#232c54') : mixc(base, mixc(sky[1], rgb('#8d9cc4'), 0.4), 0.42);
    const ink = night ? rgb('#1a2246') : mixc(lo, rgb('#5a6a98'), 0.4);
    const blobs = [], n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1), arc = Math.sin(f * Math.PI);
      blobs.push([3 + w * (0.12 + f * 0.76 + (r() - 0.5) * 0.06), 3 + h * (0.64 - arc * (0.26 + r() * 0.1)), h * (0.2 + arc * 0.25 + r() * 0.06)]);
    }
    const flat = 3 + h * 0.86;
    const inside = (x, y) => y < flat && blobs.some(([bx, by, br]) => Math.hypot(x - bx, (y - by) * 1.15) < br);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
      if (!inside(x, y)) {
        // traced: a soft line along the bottom and the shaded side
        if ((inside(x, y - 1) || inside(x + 1, y)) && (y > flat - h * 0.45 || inside(x + 1, y))) { g.fillStyle = css(ink, far ? 0.25 : 0.45); g.fillRect(x, y, 1, 1); }
        continue;
      }
      let cc = base;
      if (!inside(x + 2, y - 2) || !inside(x + 1, y - 1)) cc = hi;
      else if (!inside(x - 2, y + 2) || y > flat - 2) cc = lo;
      else if ((y - 3) / h - (x / w) * 0.25 + bay(x, y) * 0.22 > 0.5) cc = mid;
      // the edges of the puffs in front, curling over the ones behind
      for (const [bx, by, br] of blobs) {
        const dd = Math.hypot(x - bx, (y - by) * 1.15);
        if (Math.abs(dd - br) < 0.75 && y < by && blobs.some((o) => o[1] < by - 1 && Math.hypot(x - o[0], (y - o[1]) * 1.15) < o[2] - 1)) { cc = mid; break; }
      }
      g.fillStyle = css(cc, night ? 0.75 : 1);
      g.fillRect(x, y, 1, 1);
    }
    return c;
  }

  // ---- painted details, world by world -------------------------------------------------------------------------------
  function kit(S, r) {
    const k = S.k, W = S.W, H = S.H;
    const K = {
      S, r, k, W, H, night: S.night,
      lay: (i) => S.lays[layerAt(S, i)],
      // put a picture on layer i at fx (0–1 across), standing on the ground; returns where it went
      place(i, fx, rows, o) {
        o = o || {};
        i = layerAt(S, i);
        const L = S.lays[i];
        if (!L || !L.top) return null;
        if (L.front && !o.sc) o = Object.assign({}, o, { sc: nearSc(S) });
        const w = Math.max(...rows.map((q) => q.length)) * (o.sc || 1);
        for (let tries = 0; tries < (o.tries || 12); tries++) {
          const x = Math.round((tries ? fx + (r() - 0.5) * 0.12 * tries : fx) * W);
          if (x < w || x > W - w) continue;
          const y = footing(S, i, x, w) + Math.round(o.depth || 0) + 1;
          const hgt = rows.length * (o.sc || 1);
          if (y >= cover(S, i, x - w / 2) - 1 || y >= cover(S, i, x + w / 2) - 1 || y >= cover(S, i, x) - 1) continue;
          if (o.clear && y - hgt < 0) continue;
          L.b.cur = L.id + (o.flat ? 0 : 2);
          return Object.assign(stamp(S, L.b, rows, x, y, L.haze, o), { x, y, haze: L.haze, i });
        }
        return null;
      },
      // a few of something, scattered over a layer
      scatter(i, list, count, o) {
        o = o || {};
        const out = [];
        for (let q = 0; q < count; q++) {
          const rows = list[Math.floor(r() * list.length)], fx = o.from !== undefined ? o.from + r() * (o.to - o.from) : r();
          const at = K.place(i, fx, rows, { depth: (o.depth || 0) + r() * (o.deep || 0), flat: o.flat, sc: o.sc, flip: r() < 0.5, tries: 4 });
          if (at) out.push(at);
        }
        return out;
      },
      // single pixels and little crosses (flowers, pebbles), not outlined
      dots(i, colours, density, o) {
        o = o || {};
        i = layerAt(S, i);
        const L = S.lays[i];
        if (!L || !L.top) return;
        const n = Math.round(W * density);
        L.b.cur = L.id;
        const cs = colours.map((h) => (h[0] === '#' ? S.landCol(h, L.haze) : col(S, h, L.haze)));
        for (let q = 0; q < n; q++) {
          const x = Math.round(r() * W), y = ground(S, i, x, 2 + r() * (o.deep || 30) * k);
          if (y === null) continue;
          const c = cs[Math.floor(r() * cs.length)];
          L.b.set(x, y, c);
          if (o.cross && r() < 0.7) { const e = o.eye ? col(S, o.eye, L.haze) : c; L.b.set(x - 1, y, c); L.b.set(x + 1, y, c); L.b.set(x, y - 1, c); L.b.set(x, y + 1, c); L.b.set(x, y, e); }
        }
      },
      // a fence along a layer's ground
      fence(i, from, to, depth) {
        i = layerAt(S, i);
        const L = S.lays[i], rail = col(S, 'B', L.haze), post = col(S, 'b', L.haze), gap = Math.max(4, Math.round(4 * k));
        L.b.cur = L.id + 2;
        for (let x = Math.round(from * W); x < to * W; x++) {
          const y = ground(S, i, x, depth * k, 2);
          if (y === null) continue;
          if (x % gap === 0) for (let j = 0; j < Math.round(5 * Math.min(1.5, k * 0.6)); j++) L.b.set(x, y - j, post);
          L.b.set(x, y - 1, rail); L.b.set(x, y - Math.round(3 * Math.min(1.5, k * 0.6)), rail);
        }
      },
      // a dry-stone wall along a contour
      wall(i, from, to, depth) {
        i = layerAt(S, i);
        const L = S.lays[i], a = col(S, 'G', L.haze), b2 = col(S, 'g', L.haze), s = col(S, 's', L.haze);
        L.b.cur = L.id + 2;
        for (let x = Math.round(from * W); x < to * W; x++) {
          const y = ground(S, i, x, depth * k, 2);
          if (y === null) continue;
          L.b.set(x, y, (x >> 1) % 2 ? a : b2); L.b.set(x, y - 1, (x >> 1) % 3 ? a : s);
        }
      },
      // patchwork fields with crop rows and hedgerows between them
      fields(i, tints) {
        i = layerAt(S, i);
        const L = S.lays[i], b = L.b, hedge = col(S, 'f', L.haze);
        let x = 0;
        while (x < W) {
          const w = Math.round((26 + r() * 60) * k), tint = tints[Math.floor(r() * tints.length)], tc = S.landCol(tint, L.haze), rows = r() < 0.6, slope = (r() - 0.5) * 3;
          for (let xx = x; xx < Math.min(W, x + w); xx++) {
            const t0 = L.top[xx], cv = cover(S, i, xx);
            if (t0 > H) continue;
            b.cur = L.id;
            for (let y = t0 + 3; y < cv; y++) {
              if (b.ids[y * W + xx] !== L.id) continue;
              b.set(xx, y, tc, 0.42);
              if (rows && (xx + Math.round((y - t0) * slope)) % Math.max(3, Math.round(3 * k * 0.6)) === 0) b.set(xx, y, dim(tc, 0.12), 0.5);
            }
          }
          // the hedgerow down the side of the field, slanting away like a real field edge, with bushes along it
          b.cur = L.id + 2;
          const lean = (x / W - 0.5) * 0.9;
          for (let y = L.top[cx(S, x)] + 1; ; y++) {
            const xx = Math.round(x + (y - L.top[cx(S, x)]) * lean);
            if (xx < 0 || xx >= W || y >= cover(S, i, xx) || y >= H) break;
            if (r() < 0.9) b.set(xx, y, hedge);
            if (r() < 0.12) { b.set(xx - 1, y, hedge); b.set(xx + 1, y, hedge); b.set(xx, y - 1, lit(hedge, 0.12)); }
          }
          x += w;
        }
      },
      // a path winding down a layer
      path(i, fx, colour) {
        i = layerAt(S, i);
        const L = S.lays[i], b = L.b, c = S.landCol(colour || '#d2bb8c', L.haze), e = dim(c, 0.12), x0 = fx * W;
        b.cur = L.id;
        const t0 = L.top[cx(S, x0)];
        for (let y = t0 + 2; y < S.H; y++) {
          const f = (y - t0) / (S.H - t0), x = Math.round(x0 + Math.sin(y * 0.05 / k + fx * 9) * 14 * k * f), w = Math.max(1, Math.round((1 + f * 5) * k * 0.6));
          if (y >= cover(S, i, x) - 1) break;
          for (let dx = -w; dx <= w; dx++) if (b.ids[y * W + cx(S, x + dx)] === L.id) b.set(x + dx, y, Math.abs(dx) === w ? e : c);
        }
      },
    };
    return K;
  }

  const DETAILS = {
    hills(K) {
      K.fields(1, ['#c9c25c', '#7fae58', '#a8884e', '#6f9c4c', '#d8c879']);
      K.path(2, 0.42);
      const home = K.place(1, 0.62, SP.cottage);
      if (home) K.S.chimneys.push({ x: home.x0 + 7, y: home.y0, haze: home.haze });
      K.place(1, 0.12, SP.barn);
      K.place(2, 0.86, SP.farmhouse);
      K.fence(2, 0.02, 0.36, 4);
      K.wall(1, 0.36, 0.58, 6);
      K.scatter(1, [SP.bale], 6, { from: 0.15, to: 0.55, depth: 3, deep: 10 });
      K.scatter('front', [SP.rock1, SP.rock2, SP.rock3], 5, { depth: 3, deep: 10 });
      K.dots('front', ['S', 'S', 'E', '#c79bff'], 0.12, { cross: true, eye: 'E', deep: 22 });
    },
    mountains(K) {
      const cab = K.place(2, 0.3, SP.cabin);
      if (cab) K.S.chimneys.push({ x: cab.x0 + 5, y: cab.y0, haze: cab.haze });
      K.scatter('front', [SP.rock1, SP.rock2, SP.mossy], 7, { depth: 2, deep: 14 });
      waterfall(K, 1);
      couloirs(K, 0); couloirs(K, 1);
      dock(K, 0.3);
      K.dots('front', ['#ffffff', '#e8d26a', '#b9a3ff'], 0.05, { deep: 18 });
    },
    beach(K) {
      const lh = K.place(0, K.lay(0).L.at + 0.06, SP.lighthouse);
      if (lh) K.S.beacon = { x: lh.x0 + 2, y: lh.y0 + 1, haze: lh.haze };
      K.place('front', 0.3, SP.umbrella, { depth: 10 * K.k });
      K.place('front', 0.56, SP.sandcastle, { depth: 14 * K.k });
      K.scatter('front', [SP.starfish, SP.shell, SP.shell, SP.driftwood], 9, { depth: 6, deep: 30 });
      K.scatter('front', [SP.rock1, SP.rock2], 3, { from: 0.0, to: 0.2, depth: 0 });
      footprints(K);
      K.dots('front', ['#fff6e4', '#d9b47a', '#b98d5a'], 0.25, { deep: 40 });
    },
    city(K) { rooftops(K); street(K); },
    forest(K) {
      const snag = K.place(2, 0.7, SP.snag);
      if (snag) K.S.perch = { x: snag.x0 + 3, y: snag.y0 + 3, haze: snag.haze };
      K.scatter(2, [SP.stump, SP.mush, SP.fern, SP.bush, SP.bush, SP.young, SP.young, SP.young], 26, { depth: 3, deep: 40 });
      K.place('front', 0.22, SP.log, { depth: 8 * K.k });
      K.scatter('front', [SP.mush, SP.mush2, SP.mush2, SP.fern, SP.fern, SP.mossy, SP.stump], 14, { depth: 3, deep: 20 });
      K.path(2, 0.48, '#a98d64');
    },
    autumn(K) {
      K.fields(1, ['#c9a24c', '#b9853e', '#d6b26a', '#9c7a3e']);
      const fh = K.place(1, 0.7, SP.farmhouse);
      if (fh) K.S.chimneys.push({ x: fh.x0 + 7, y: fh.y0, haze: fh.haze });
      const barn = K.place(1, 0.2, SP.barn);
      if (barn) K.place(1, (barn.x0 + barn.w + 4) / K.W, SP.silo, { tries: 2 });
      const sc = K.place(2, 0.5, SP.scarecrow);
      if (sc) K.S.perch = { x: sc.x0 + 1, y: sc.y0 + 3, haze: sc.haze };
      K.scatter(2, [SP.pumpkin, SP.pumpkin, SP.pumpkin], 14, { from: 0.35, to: 0.65, depth: 3, deep: 9 });
      K.scatter(1, [SP.bale], 5, { from: 0.4, to: 0.95, depth: 3, deep: 8 });
      K.fence(2, 0.62, 0.98, 4);
      K.dots('front', ['#e07a35', '#d6553a', '#f0b23c', '#8a4a2a'], 0.3, { deep: 24 });
    },
    desert(K) { strata(K); railway(K); K.scatter('front', [SP.barrel, SP.pear, SP.sage, SP.sage, SP.rock1, SP.rock3], 10, { depth: 2, deep: 16 }); K.scatter(2, [SP.sage, SP.rock3, SP.barrel], 8, { depth: 2, deep: 8 }); },
    garden(K) {
      K.place(0, 0.34, SP.greenhouse);
      K.place(2, 0.2, SP.arch, { depth: 2 });
      K.scatter(2, [SP.hive], 2, { from: 0.75, to: 0.95, depth: 3 });
      const bath = K.place('front', 0.62, SP.birdbath, { depth: 6 * K.k });
      if (bath) K.S.bath = { x: bath.x, y: bath.y0, haze: 0 };
      K.place('front', 0.42, SP.bench, { depth: 4 * K.k });
      K.scatter('front', [SP.pot, SP.pot, SP.can], 5, { depth: 4, deep: 18 });
      stones(K, 0.25);
    },
    ice(K) {
      K.place('front', 0.72, SP.igloo, { depth: 6 * K.k });
      const f = K.place('front', 0.3, SP.flag, { depth: 4 * K.k });
      if (f) { const L = K.lay('front'), c = col(K.S, 'u', 0); L.b.cur = L.id + 2; for (let dx = -3; dx <= 3; dx++) L.b.set(f.x - 4 + dx, f.y + 1, c); }
      K.scatter('front', [SP.cairn, SP.rock3], 3, { depth: 3, deep: 14 });
      cracks(K);
      K.dots('front', ['#ffffff', '#cfe6f5'], 0.2, { deep: 30 });
    },
    deep(K) {
      K.place(0, 0.66, SP.wreck, { depth: 2, sc: Math.max(1, Math.round(K.k * 0.7)) });
      K.place(1, 0.2, SP.anchor, { depth: 2 });
      K.place('front', 0.78, SP.chest, { depth: 6 * K.k });
      K.scatter('front', [SP.starfish, SP.shell, SP.urchin, SP.urchin, SP.rock1, SP.rock3], 12, { depth: 3, deep: 20 });
      K.dots('front', ['#a9a68f', '#7a7a68', '#c9c4a8'], 0.2, { deep: 30 });
    },
    meadow(K) {
      K.place(0, 0.18, SP.barn, { tries: 6 });
      const tb = [];
      for (const fx of [0.46, 0.55, 0.63]) { const t = K.place(0, fx, SP.turbine, { tries: 3, sc: 1 }); if (t) tb.push({ x: t.x, y: t.y0, haze: t.haze }); }
      K.S.turbines = tb;
      K.wall(1, 0.0, 0.45, 5);
      K.scatter(1, [SP.hive, SP.hive], 3, { from: 0.08, to: 0.3, depth: 7 });
      K.scatter(1, [SP.bale], 6, { from: 0.45, to: 0.95, depth: 4, deep: 10 });
      K.dots('front', ['#ffffff', '#ffd24a', '#ff8fae', '#c79bff', '#ff6b4a', '#7fb2ff'], 0.5, { cross: true, deep: 34 });
    },
    pond(K) {
      dock(K, 0.12);
      K.place(1, 0.72, SP.bench, { depth: 1 });
      willow(K, 1, 0.28);
      stones(K, 0.6);
      K.dots('front', ['#ffffff', '#ffe27a', '#c79bff'], 0.06, { deep: 12 });
    },
  };

  // what every world gets: tufts in the grass, ripples in the sand, pebbles
  function groundwork(K) {
    const S = K.S;
    for (let i = 0; i < S.lays.length; i++) {
      const L = S.lays[i];
      if (!L.top || L.haze > 0.32 || S.R.under) continue;
      const kind = L.L.k, grassy = (kind === 'hills' || kind === 'field') && !L.L.snowbank, sandy = kind === 'sand' || kind === 'dunes';
      if (!grassy && !sandy) continue;
      const near = 1 - L.haze * 2, n = Math.round(((K.W * K.H) / (L.front ? 150 : 420)) * near);
      const base = S.landCol(L.L.c, L.haze), dark = dim(base, L.front ? 0.2 : 0.12), light = lit(base, S.night ? 0.05 : 0.18), pebble = S.landCol('#9a958a', L.haze);
      L.b.cur = L.id;
      for (let q = 0; q < n; q++) {
        const x = Math.round(K.r() * K.W), y = ground(S, i, x, 3 + K.r() * (L.front ? S.H - L.top[cx(S, x)] : 40 * K.k), 1);
        if (y === null || L.b.ids[y * K.W + x] !== L.id) continue;
        if (K.r() < 0.05) { L.b.set(x, y, pebble); L.b.set(x + 1, y, lit(pebble, 0.3)); continue; }
        if (grassy) { // a tuft: dark at the root, light at the tip
          const h = 2 + Math.round(K.r() * 2 * Math.max(1, K.k * 0.5) * (L.front ? 1.4 : 1));
          for (const dx of [-1, 0, 1]) { if (dx && K.r() < 0.45) continue; const lean = dx * (K.r() < 0.5 ? 1 : 0); for (let j = 0; j < h; j++) L.b.set(x + dx + (j > h / 2 ? lean : 0), y - j, j >= h - 1 ? light : dark); }
        } else { // ripples in the sand: a light ridge over its shadow
          const len = 3 + Math.round(K.r() * 6 * K.k * 0.6);
          for (let j = 0; j < len; j++) { const yy = y - (j > len * 0.25 && j < len * 0.75 ? 1 : 0); L.b.set(x + j, yy, light); L.b.set(x + j, yy + 1, dark); }
        }
      }
    }
  }

  // details that take more than a picture
  function waterfall(K, i) {
    const L = K.lay(i);
    if (!L || !L.top) return;
    const x = Math.round(K.W * 0.16), top = L.top[x] + Math.round(10 * K.k), bot = cover(K.S, i, x) - 1;
    if (bot - top < 6) return;
    L.b.cur = L.id + 2;
    const w = col(K.S, 'S', L.haze), s = col(K.S, 'i', L.haze);
    for (let y = top; y < bot; y++) { L.b.set(x, y, w); L.b.set(x + 1, y, y % 3 ? s : w); }
    K.S.falls = { x, top, bot, haze: L.haze };
  }
  function couloirs(K, i) {
    const L = K.lay(i);
    if (!L || !L.top || L.L.k !== 'peaks') return;
    const c = K.S.landCol('#ffffff', L.haze * 0.6);
    L.b.cur = L.id;
    const base = Math.round(L.L.y * K.H), amp = L.L.amp * K.H;
    for (let q = 0; q < 24; q++) {
      let x = K.r() * K.W;
      const y0 = L.top[cx(K.S, x)] + 2;
      if (y0 > base - amp * 0.45) continue; // only up where the snow is
      const len = (3 + K.r() * 7) * K.k;
      for (let j = 0; j < len; j++) { x += (K.r() - 0.5) * 1.4; const y = y0 + j; if (y < cover(K.S, i, x) && L.b.ids[y * K.W + cx(K.S, x)] === L.id) L.b.set(x, y, c, 0.45 * (1 - j / len)); }
    }
  }
  function dock(K, fx) {
    const S = K.S, L = K.lay('front');
    if (!S.wy || !L) return;
    const sc = Math.max(1, Math.round(K.k * 0.55)), x = Math.round(fx * S.W), y = L.top[cx(S, x)] - Math.round(5 * K.k);
    if (y <= S.wy + 4) return;
    L.b.cur = L.id + 2;
    stamp(S, L.b, SP.dock, x, y, 0, { sc });
    stamp(S, L.b, SP.rowboat, x + Math.round(16 * sc), y - Math.round(2 * sc), 0, { sc });
    S.dockAt = { x, y };
  }
  function footprints(K) {
    const S = K.S, L = K.lay('front'), c = dim(S.landCol(L.L.c, 0), 0.14);
    L.b.cur = L.id;
    let x = S.W * 0.08, y = L.top[cx(S, x)] + 6 * K.k;
    for (let q = 0; q < 26; q++) {
      x += 5 * K.k; y += Math.sin(q * 0.4) * 1.2 + 0.6 * K.k;
      if (y >= S.H - 2) break;
      const side = q % 2 ? 1 : -1;
      L.b.set(x, y + side, c); L.b.set(x + 1, y + side, c);
    }
  }
  function rooftops(K) {
    const S = K.S;
    S.vents = [];
    S.roofs = [];
    for (let i = 0; i < S.lays.length - 1; i++) {
      const L = S.lays[i];
      if (!L.top) continue;
      let x = 0;
      while (x < S.W) {
        let e = x;
        while (e < S.W - 1 && L.top[e + 1] === L.top[x]) e++;
        const w = e - x + 1, y = L.top[x];
        if (w >= 6 && y < S.H && y < cover(S, i, x + w / 2) - 2) {
          S.roofs.push({ i, x0: x, x1: e, y, haze: L.haze });
          const pick = K.r();
          L.b.cur = L.id + 2;
          if (i === 0 && pick < 0.6) { x = e + 1; continue; }
          if (pick < 0.1 && w >= 8) stamp(S, L.b, SP.watertower, x + w * (0.25 + K.r() * 0.5), y - 1, L.haze);
          else if (pick < 0.5) { const ax = x + Math.round(w * (0.2 + K.r() * 0.6)); stamp(S, L.b, SP.ac, ax, y - 1, L.haze); S.vents.push({ x: ax, y: y - 3, haze: L.haze }); }
          else if (pick < 0.66) { const ax = x + Math.round(w * K.r()), c = col(S, 'k', L.haze), hh = Math.round((3 + K.r() * 6) * K.k * 0.6); for (let j = 1; j <= hh; j++) L.b.set(ax, y - j, c); L.b.set(ax - 1, y - hh + 1, c); L.b.set(ax + 1, y - hh + 1, c); }
          else if (pick < 0.74 && w >= 14 && i === 1) billboard(K, L, x + w / 2, y - 1);
          // a ledge along the roof
          const lc = lit(col(S, 'G', L.haze), 0.1);
          for (let xx = x; xx <= e; xx++) if (L.b.ids[y * S.W + xx] && L.b.ids[y * S.W + xx] < L.id + 2) L.b.set(xx, y, lc);
        }
        x = e + 1;
      }
    }
    // shop fronts along the bottom of the nearest buildings
    const L = S.lays[S.lays.length - 2], y0 = S.lays[S.lays.length - 1].top[0];
    if (L && L.top) {
      const stripes = ['XS', 'AS', 'TS', 'ES', 'QS'];
      let x = 0;
      while (x < S.W) {
        const w = Math.round((10 + K.r() * 14) * K.k), st = stripes[Math.floor(K.r() * stripes.length)], a = col(S, st[0], 0.04), b2 = col(S, st[1], 0.04);
        L.b.cur = L.id + 2;
        const ah = Math.max(2, Math.round(2 * K.k * 0.7)), wy = y0 - Math.round(7 * K.k * 0.8);
        for (let xx = x + 1; xx < Math.min(S.W, x + w - 1); xx++) {
          if (L.top[xx] > wy - 3) continue;
          for (let j = 0; j < ah; j++) L.b.set(xx, wy + j, (Math.floor(xx / 2) % 2) ? a : b2);
          for (let y = wy + ah + 1; y < y0 - 1; y++) L.b.set(xx, y, (xx - x) % 6 === 4 ? col(S, 'k', 0.04) : col(S, 'o', 0.08));
        }
        x += w + Math.round(K.r() * 4 * K.k);
      }
    }
  }
  function billboard(K, L, x, y) {
    const S = K.S, w = Math.round(12 * K.k * 0.7), h = Math.round(6 * K.k * 0.7), x0 = Math.round(x - w / 2), y0 = y - h - 3;
    const sky = col(S, 'a', L.haze), sun = col(S, 'O', L.haze), sea = col(S, 'A', L.haze), frame = col(S, 'k', L.haze);
    for (let j = 0; j < 3; j++) { L.b.set(x0 + 2, y - j, frame); L.b.set(x0 + w - 3, y - j, frame); }
    for (let yy = y0; yy < y0 + h; yy++) for (let xx = x0; xx < x0 + w; xx++) {
      const edge = yy === y0 || yy === y0 + h - 1 || xx === x0 || xx === x0 + w - 1;
      const f = (yy - y0) / h, d = Math.hypot(xx - (x0 + w * 0.7), yy - (y0 + h * 0.45));
      L.b.set(xx, yy, edge ? frame : d < h * 0.25 ? sun : f > 0.62 ? sea : sky);
    }
  }
  function street(K) {
    const S = K.S, L = K.lay('front'), y0 = L.top[0], b = L.b, k = K.k;
    const walk = S.landCol('#8e93a0', 0), curb = S.landCol('#b9bdc6', 0), road = S.landCol('#3a3f4e', 0), line = S.night ? rgb('#c9b56a') : rgb('#e8d27a'), zebra = S.landCol('#e9ebef', 0);
    const sw = Math.max(3, Math.round(3 * k)), mid = Math.round(y0 + sw + (S.H - y0 - sw) / 2);
    b.cur = L.id;
    for (let x = 0; x < S.W; x++) {
      for (let y = y0 + 1; y < y0 + sw; y++) b.set(x, y, (x % Math.round(6 * k)) === 0 ? dim(walk, 0.1) : walk);
      b.set(x, y0 + sw, curb);
      for (let y = y0 + sw + 1; y < S.H; y++) b.set(x, y, road);
      if ((x % Math.round(10 * k)) < Math.round(5 * k)) b.set(x, mid, line);
    }
    const zx = Math.round(S.W * 0.62);
    for (let x = zx; x < zx + 14 * k; x++) if (((x - zx) >> 1) % 2 === 0) for (let y = y0 + sw + 2; y < S.H - 1; y++) b.set(x, y, zebra);
    S.street = { y0, top: y0 + sw + 1, mid, zx };
    // trees in planters, a hydrant, a bench, a mailbox, a traffic light
    b.cur = L.id + 2;
    const sc = Math.max(1, Math.round(k * 0.55));
    for (let x = 30 * k; x < S.W; x += 70 * k) stamp(S, b, SP.planter, x + K.r() * 10 * k, y0 + sw - 1, 0, { sc });
    stamp(S, b, SP.hydrant, S.W * 0.18, y0 + sw - 1, 0, { sc });
    stamp(S, b, SP.bench, S.W * 0.44, y0 + sw - 1, 0, { sc });
    stamp(S, b, SP.mailbox, S.W * 0.83, y0 + sw - 1, 0, { sc });
    const tx = Math.round(zx - 3 * k), th = Math.round(14 * k * 0.8), pc = col(S, 'k', 0);
    for (let j = 0; j < th; j++) b.set(tx, y0 + sw - 1 - j, pc);
    for (let j = 0; j < 7 * sc; j++) for (let q = -1; q <= 1; q++) b.set(tx + q, y0 + sw - th - j, pc);
    S.signal = { x: tx, y: y0 + sw - th - 7 * sc + 1, sc };
  }
  function strata(K) {
    const S = K.S, L = K.lay(0);
    if (!L || !L.top) return;
    const tints = ['#e0a27a', '#b86a4a', '#f2c49a', '#a85a40', '#d48c62'];
    L.b.cur = L.id;
    for (let y = 0; y < S.H; y++) {
      const band = Math.floor((y + Math.sin(y * 0.3) * 0.6) / Math.max(3, Math.round(3.5 * S.k * 0.6)));
      const c = S.landCol(tints[band % tints.length], L.haze);
      for (let x = 0; x < S.W; x++) if (L.b.ids[y * S.W + x] === L.id && y > L.top[x] + 1 && y < cover(S, 0, x)) L.b.set(x, y, c, 0.22 + 0.1 * bay(x, y));
    }
  }
  function railway(K) {
    const S = K.S, L = K.lay(1);
    if (!L || !L.top) return;
    // the line runs across the dunes where you can see it
    const y = Math.round(S.H * (L.L.y + 0.012)), rail = col(S, 'k', L.haze), tie = col(S, 'b', L.haze), gravel = S.landCol('#b58e68', L.haze);
    L.b.cur = L.id + 2;
    let seen = 0;
    for (let x = 0; x < S.W; x++) {
      if (y - 2 < L.top[x] || y + 1 >= cover(S, 1, x)) continue;
      seen++;
      L.b.set(x, y + 1, gravel); L.b.set(x, y, rail);
      if (x % 3 === 0) L.b.set(x, y - 1, tie);
    }
    if (seen < S.W * 0.4) return;
    S.rail = { y, haze: L.haze };
    // telegraph poles and their wires
    const gap = Math.round(46 * S.k), ph = Math.round(10 * S.k * 0.7), wire = col(S, 'K', L.haze);
    let last = null;
    for (let x = Math.round(gap * 0.3); x < S.W + gap; x += gap) {
      const px0 = Math.min(S.W - 1, x), top = y - 2 - ph;
      if (y - 2 >= L.top[px0] && x < S.W) { for (let j = 0; j < ph; j++) L.b.set(px0, y - 2 - j, tie); for (let q = -2; q <= 2; q++) L.b.set(px0 + q, top, tie); }
      if (last !== null) for (let xx = last; xx < x && xx < S.W; xx++) { const f = (xx - last) / (x - last), sag = Math.sin(f * Math.PI) * 2.5 * S.k * 0.6; L.b.set(xx, top + 1 + sag, wire, 0.7); }
      last = x;
    }
  }
  function stones(K, fx) {
    const S = K.S, L = K.lay('front'), c = col(S, 'G', 0), e = col(S, 'g', 0), h = col(S, 's', 0);
    L.b.cur = L.id + 2;
    let x = fx * S.W, y = L.top[cx(S, x)] + 4 * K.k;
    for (let q = 0; q < 7 && y < S.H - 3; q++) {
      const rx = Math.round((2 + q * 0.7) * K.k * 0.7), ry = Math.max(1, Math.round(rx * 0.4));
      for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) L.b.set(x + dx, y + dy, dy === -ry ? h : dy === ry ? e : c);
      x += (q % 2 ? 6 : -4) * K.k; y += (3 + q * 1.6) * K.k;
    }
  }
  function cracks(K) {
    const S = K.S, L = K.lay('front'), c = S.landCol('#9fc4dc', 0);
    L.b.cur = L.id;
    for (let q = 0; q < 6; q++) {
      let x = K.r() * S.W, y = L.top[cx(S, x)] + (4 + K.r() * 30) * K.k;
      for (let j = 0; j < 30 * K.k; j++) { x += 1; y += (K.r() - 0.5) * 1.6; if (y < S.H && y > L.top[cx(S, x)] + 2) L.b.set(x, y, c); if (K.r() < 0.06) { const bx = x, by = y; for (let z = 0; z < 6; z++) L.b.set(bx + z * 0.5, by + z, c); } }
    }
  }
  function willow(K, i, fx) {
    const S = K.S, L = K.lay(i);
    if (!L || !L.top) return;
    const x = Math.round(fx * S.W), y = L.top[x], h = Math.round(16 * S.k * 0.8), trunk = col(S, 'b', L.haze), leaf = S.landCol('#7aa65a', L.haze), leafD = S.landCol('#55874a', L.haze);
    if (y >= cover(S, i, x) - 1) return;
    L.b.cur = L.id + 2;
    for (let j = 0; j < h; j++) { L.b.set(x, y - j, trunk); L.b.set(x + 1, y - j, dim(trunk, 0.15)); }
    const R = Math.round(11 * S.k * 0.8);
    for (let dx = -R; dx <= R; dx++) {
      const top = y - h - Math.round(Math.sqrt(Math.max(0, 1 - (dx / R) ** 2)) * R * 0.5), len = Math.round((0.6 + 0.4 * Math.abs(Math.sin(dx * 1.7))) * h * (1 - Math.abs(dx) / R * 0.3));
      for (let j = 0; j < len; j++) { const yy = top + j; if (yy >= cover(S, i, x + dx) - 1) break; if ((dx + j) % 5 !== 0) L.b.set(x + dx, yy, j > len * 0.7 || dx < -R * 0.3 ? leafD : leaf); }
    }
  }

  // ---- things that happen --------------------------------------------------------------------------------------------
  // Each world gets a few; they live in four depths: the sky, the land behind the water (so it shows in
  // the reflection), on the water, and right at the front.
  function every(r, a, b) { return a + r() * (b - a); }
  function prep(S) {
    const r = S.tr || G.seeded(G.hash(S.world + 'acts')), k = S.k;
    const A = (S.acts = { sky: [], mid: [], water: [], near: [] });
    const add = (where, f) => f && A[where].push(f);
    if (!S.R.under) {
      if (!S.night) { add('sky', plane(S, r)); add('mid', flock(S, r, 'bird')); }
      else if (S.world !== 'city') add('sky', satellite(S, r));
      else add('sky', plane(S, r));
    }
    for (const c of S.chimneys || []) add('mid', smoke(S, r, c));
    (ACTS[S.world] || (() => {}))(S, r, add, k);
  }
  const ACTS = {
    hills(S, r, add) {
      add('mid', walkers(S, r, { lay: 2, n: 5, walk: [MV.sheepA, MV.sheepB], idle: [MV.sheepEat, MV.sheepA, MV.sheepEat], speed: 1.4, depth: [3, 14] }));
      add('mid', walkers(S, r, { lay: 1, n: 3, walk: [MV.sheepA, MV.sheepB], idle: [MV.sheepEat, MV.sheepA], speed: 0.8, depth: [3, 10] }));
      if (!S.night) { add('sky', balloon(S, r)); add('near', flutter(S, r, 4, ['#ffffff', '#ffd24a', '#ff9fb8'])); add('near', hoppers(S, r, 'front')); }
    },
    mountains(S, r, add) {
      if (!S.night) add('sky', circler(S, r, 0.42, 0.25, 'bird'));
      add('mid', walkers(S, r, { lay: 2, n: 2, walk: [MV.deerA, MV.deerB], idle: [MV.deerEat, MV.deerA], speed: 1.2, depth: [2, 6] }));
      if (S.falls) add('mid', falls(S, r));
      add('water', jumper(S, r, 'fish'));
    },
    beach(S, r, add) {
      if (!S.night) { add('mid', gulls(S, r)); add('sky', kite(S, r, 0.18)); }
      add('water', jumper(S, r, 'dolphin'));
      add('near', walkers(S, r, { lay: 'front', n: 2, walk: [MV.crabA, MV.crabB], idle: [MV.crabA], speed: 3, depth: [4, 16], side: true }));
      if (S.beacon) add('mid', beacon(S, r));
    },
    city(S, r, add) {
      if (!S.night) add('sky', blimp(S, r));
      add('near', cars(S, r));
      if (S.signal) add('near', signal(S));
      add('mid', pigeons(S, r));
      for (const v of (S.vents || []).slice(0, 4)) add('mid', smoke(S, r, v, true));
    },
    forest(S, r, add) {
      add('mid', walkers(S, r, { lay: 2, n: 2, walk: [MV.deerA, MV.deerB], idle: [MV.deerEat, MV.deerA, MV.deerEat], speed: 1.2, depth: [3, 8] }));
      add('near', walkers(S, r, { lay: 'front', n: 1, walk: [MV.squirrel, MV.squirrelUp], idle: [MV.squirrelUp, MV.squirrel], speed: 8, depth: [3, 10] }));
      if (S.night) { if (S.perch) add('mid', owl(S, r)); add('sky', bats(S, r)); } else add('near', hoppers(S, r, 'front'));
    },
    autumn(S, r, add) {
      add('near', walkers(S, r, { lay: 'front', n: 1, walk: [MV.squirrel, MV.squirrelUp], idle: [MV.squirrelUp, MV.squirrel], speed: 8, depth: [3, 12] }));
      if (S.night) { if (S.perch) add('mid', owl(S, r)); add('sky', bats(S, r)); } else { add('mid', flock(S, r, 'goose')); if (S.perch) add('mid', crow(S, r)); }
    },
    desert(S, r, add) {
      if (S.rail) add('mid', train(S, r));
      if (!S.night) { add('sky', circler(S, r, 0.3, 0.2, 'vulture')); add('sky', circler(S, r, 0.36, 0.3, 'vulture')); add('sky', balloon(S, r)); }
      add('near', tumbleweed(S, r));
      add('near', walkers(S, r, { lay: 'front', n: 1, walk: [MV.lizard], idle: [MV.lizard], speed: 10, depth: [4, 14] }));
    },
    garden(S, r, add) {
      if (!S.night) { add('near', flutter(S, r, 6, ['#ffffff', '#ffd24a', '#ff9fb8', '#9cc4ff', '#f0a040'])); add('near', bees(S, r)); if (S.bath) add('near', bather(S, r)); }
      add('mid', cat(S, r));
      add('near', walkers(S, r, { lay: 'front', n: 1, walk: [MV.snail], idle: [MV.snail], speed: 0.4, depth: [6, 20] }));
    },
    ice(S, r, add) {
      add('near', walkers(S, r, { lay: 'front', n: 5, walk: [MV.penguinA, MV.penguinB], idle: [MV.penguinA], speed: 2.2, depth: [2, 18], waddle: true }));
      add('water', popper(S, r));
      add('water', jumper(S, r, 'whale'));
    },
    deep(S, r, add) {
      add('mid', school(S, r, 0.5, '#f0a040')); add('mid', school(S, r, 0.72, '#9cc4e8'));
      add('mid', drifters(S, r, 3)); add('mid', turtle(S, r));
      add('near', walkers(S, r, { lay: 'front', n: 1, walk: [MV.crabA, MV.crabB], idle: [MV.crabA], speed: 3, depth: [4, 16], side: true }));
    },
    meadow(S, r, add) {
      if (S.turbines && S.turbines.length) add('mid', turbines(S));
      if (!S.night) { add('sky', kite(S, r, 0.62)); add('near', flutter(S, r, 5, ['#ffffff', '#ffd24a', '#ff9fb8', '#9cc4ff'])); add('near', bees(S, r)); add('near', hoppers(S, r, 1)); }
    },
    pond(S, r, add) {
      add('water', ducks(S, r));
      add('water', frog(S, r));
      add('water', jumper(S, r, 'fish'));
      add('near', heron(S, r));
      if (!S.night) add('near', dragonflies(S, r));
    },
  };

  // something that comes by now and then: wait, cross, wait again
  function now_and_then(r, wait, start) {
    const o = { next: start !== undefined ? start : every(r, wait[0] * 0.2, wait[0]), on: null };
    o.tick = (dt, make) => { if (!o.on && dt && (o.next -= dt) <= 0) o.on = make(); };
    o.done = () => { o.on = null; o.next = every(r, wait[0], wait[1]); };
    return o;
  }
  function plane(S, r) {
    const T = now_and_then(r, [35, 80]);
    return (g, t, dt) => {
      T.tick(dt, () => { const dir = r() < 0.5 ? 1 : -1; return { dir, x: dir > 0 ? -12 : S.W + 12, y: Math.round(S.hy * (0.07 + r() * 0.2)), v: S.W / every(r, 22, 34) }; });
      const p = T.on;
      if (!p) return;
      p.x += p.dir * p.v * dt;
      if (p.x < -90 * S.k || p.x > S.W + 90 * S.k) return T.done();
      if (!S.night) for (let j = 6; j < 80 * S.k; j++) { const a = 0.32 * (1 - j / (80 * S.k)); px(g, p.x - p.dir * j, p.y - 1 + (j > 40 * S.k && j % 3 === 0 ? 1 : 0), [255, 255, 255], a.toFixed(2)); }
      put(g, spr(S, MV.plane, 0.35, p.dir < 0), p.x, p.y);
      if (S.night) { if (Math.sin(t * 6) > 0.3) px(g, p.x, p.y - 1, '#ff4b3e'); if (Math.sin(t * 6 + 2) > 0.5) px(g, p.x + p.dir * 4, p.y, '#ffffff'); }
    };
  }
  function satellite(S, r) {
    const T = now_and_then(r, [30, 70]);
    return (g, t, dt) => {
      T.tick(dt, () => ({ x: -2, y: S.hy * (0.1 + r() * 0.3), v: S.W / every(r, 40, 60) }));
      const p = T.on;
      if (!p) return;
      p.x += p.v * dt; p.y += p.v * dt * 0.08;
      if (p.x > S.W + 2) return T.done();
      px(g, p.x, p.y, [235, 240, 255], 0.8);
    };
  }
  // a V of birds (or geese) crossing
  function flock(S, r, kind) {
    const T = now_and_then(r, kind === 'goose' ? [40, 90] : [20, 50]);
    const up = kind === 'goose' ? ['k...k', '.kSk.', '..k..'] : MV.birdUp, down = kind === 'goose' ? ['.....', 'kkSkk', 'k...k'] : MV.birdDown;
    return (g, t, dt) => {
      T.tick(dt, () => { const dir = r() < 0.5 ? 1 : -1, n = 3 + Math.floor(r() * (kind === 'goose' ? 6 : 4)); return { dir, n, x: dir > 0 ? -30 : S.W + 30, y: S.hy * (0.25 + r() * 0.4), v: (kind === 'goose' ? 9 : 14) * S.k, ph: r() * 6 }; });
      const f = T.on;
      if (!f) return;
      f.x += f.dir * f.v * dt; f.y += Math.sin(t * 0.5) * 0.5 * dt;
      if (f.x < -60 * S.k || f.x > S.W + 60 * S.k) return T.done();
      for (let i = 0; i < f.n; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1, x = f.x - f.dir * row * 5 * S.k * 0.6, y = f.y + side * row * 3 * S.k * 0.5;
        put(g, spr(S, Math.sin(t * 9 + i + f.ph) > 0 ? up : down, 0.3), x, y);
      }
    };
  }
  function gulls(S, r) {
    const list = [0, 1, 2].map(() => ({ x: r() * S.W, y: S.hy * (0.35 + r() * 0.45), p: r() * 6, v: (4 + r() * 5) * S.k * (r() < 0.5 ? -1 : 1) }));
    return (g, t, dt) => {
      for (const b of list) {
        b.x += b.v * dt; if (b.x < -10) b.x = S.W + 10; if (b.x > S.W + 10) b.x = -10;
        const y = b.y + Math.sin(t * 0.7 + b.p) * 4 * S.k;
        put(g, spr(S, Math.sin(t * 3 + b.p) > 0.6 ? MV.gullUp : MV.gullDown, 0.1, b.v < 0), b.x, y);
      }
    };
  }
  // birds of prey riding a thermal in slow circles
  function circler(S, r, fx, fy, kind) {
    const c = { x: S.W * fx, y: S.hy * fy, R: (18 + r() * 14) * S.k, p: r() * 6, v: 0.25 + r() * 0.15 };
    const rows = kind === 'vulture' ? MV.vulture : MV.birdDown;
    return (g, t) => {
      const a = t * c.v + c.p, x = c.x + Math.cos(a) * c.R, y = c.y + Math.sin(a) * c.R * 0.35;
      put(g, spr(S, Math.sin(t * 2 + c.p) > 0.85 ? MV.birdUp : rows, 0.3, Math.sin(a) > 0), x, y);
    };
  }
  function balloon(S, r) {
    const b = { x: r() * S.W, y: S.hy * (0.3 + r() * 0.2), v: S.W / 160, p: r() * 6 };
    return (g, t, dt) => {
      b.x += b.v * dt;
      if (b.x > S.W + 20) b.x = -20;
      put(g, spr(S, MV.balloon, 0.25), b.x, b.y + Math.sin(t * 0.4 + b.p) * 2 * S.k, Math.max(1, Math.round(S.k * 0.5)));
    };
  }
  function blimp(S, r) {
    const b = { x: r() * S.W, y: S.hy * 0.32, v: S.W / 200 };
    return (g, t, dt) => { b.x -= b.v * dt; if (b.x < -40) b.x = S.W + 40; put(g, spr(S, MV.blimp, 0.3), b.x, b.y, Math.max(1, Math.round(S.k * 0.5))); };
  }
  function kite(S, r, fx) {
    const ax = S.W * fx, ay = S.hy * 0.35, sc = Math.max(1, Math.round(S.k * 0.5));
    return (g, t) => {
      const x = ax + Math.sin(t * 0.5) * 8 * S.k, y = ay + Math.sin(t * 0.7) * 5 * S.k;
      // the string runs down out of the picture
      for (let j = 0; j < S.H; j += 2) { const f = j / S.H, xx = x - j * 0.35 + Math.sin(f * 3 + t) * 2; if (y + j > S.H) break; px(g, xx, y + j, [80, 70, 60], 0.45); }
      for (let q = 0; q < 6; q++) px(g, x - q * 2 * sc + Math.sin(t * 4 + q) * sc, y + 4 * sc + q * 2.5 * sc, q % 2 ? '#ffd24a' : '#d9463c');
      put(g, spr(S, MV.kite, 0), x, y + 4 * sc, sc);
    };
  }
  function smoke(S, r, c, steam) {
    const puffs = [];
    let next = 0;
    if (!puffs.length) for (let i = 0; i < 8; i++) puffs.push({ age: i * 0.55, x: 0, y: 0 });
    const tone = steam ? [240, 244, 250] : S.night ? [120, 126, 150] : [200, 200, 205];
    return (g, t, dt) => {
      next -= dt;
      if (dt && next <= 0) { puffs.push({ age: 0, x: 0, y: 0 }); next = 0.5 + r() * 0.3; }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.age += dt;
        if (p.age > 4.5) { puffs.splice(i, 1); continue; }
        const x = c.x + p.age * 1.8 * S.k * 0.6 + Math.sin(p.age * 2 + i) * 0.8, y = c.y - 1 - p.age * 3.2 * S.k * 0.6, s = 1 + Math.floor(p.age / 1.6), a = (1 - p.age / 4.5) * (steam ? 0.45 : 0.6);
        g.fillStyle = css(mixc(tone, S.horizonCol(), c.haze * 0.6), a.toFixed(2));
        g.fillRect(Math.round(x), Math.round(y), s, s);
      }
    };
  }
  // animals wandering along the ground, stopping now and then
  function walkers(S, r, o) {
    const i = layerAt(S, o.lay), L = S.lays[i];
    if (!L || !L.top) return null;
    const sc = L.front ? nearSc(S) : 1, list = [];
    for (let q = 0; q < o.n; q++) {
      for (let tries = 0; tries < 40; tries++) {
        const x = 10 + r() * (S.W - 20), depth = (o.depth[0] + r() * (o.depth[1] - o.depth[0])) * (L.front ? S.k * 0.6 : 1);
        if (ground(S, i, x, depth, 2) !== null) { list.push({ x, depth, dir: r() < 0.5 ? -1 : 1, walk: r() < 0.3, until: r() * 5, ph: r() * 6 }); break; }
      }
    }
    return (g, t, dt) => {
      for (const a of list) {
        if (dt) {
          a.until -= dt;
          if (a.until <= 0) { a.walk = !a.walk; a.until = a.walk ? every(r, 1.5, 5) : every(r, 2, 7); if (a.walk && r() < 0.45) a.dir *= -1; }
          if (a.walk) { const nx = a.x + a.dir * o.speed * S.k * 0.6 * dt; if (nx > 6 && nx < S.W - 6 && ground(S, i, nx, a.depth, 2) !== null) a.x = nx; else a.dir *= -1; }
        }
        const y = L.top[cx(S, a.x)] + Math.round(a.depth), list2 = a.walk ? o.walk : o.idle;
        const fr = list2[Math.floor(a.walk ? t * 6 + a.ph : (t + a.ph * 3) / 2.2) % list2.length];
        put(g, spr(S, fr, L.haze, o.side ? false : a.dir < 0), a.x, y - (o.waddle && a.walk && Math.sin(t * 12 + a.ph) > 0 ? 1 : 0), sc);
      }
    };
  }
  // rabbits that hop across now and then
  function hoppers(S, r, lay) {
    const i = layerAt(S, lay), L = S.lays[i], sc = L.front ? Math.max(1, Math.round(S.k * 0.5)) : 1;
    const T = now_and_then(r, [12, 30], 3);
    return (g, t, dt) => {
      T.tick(dt, () => { for (let q = 0; q < 20; q++) { const x = 20 + r() * (S.W - 40), depth = (4 + r() * 12) * (L.front ? S.k * 0.6 : 1); if (ground(S, i, x, depth, 2) !== null) return { x, depth, dir: r() < 0.5 ? 1 : -1, hops: 4 + Math.floor(r() * 5), ph: 0 }; } return null; });
      const h = T.on;
      if (!h) return;
      h.ph += dt * 2.2;
      if (h.ph >= h.hops) return T.done();
      const f = h.ph % 1, x = h.x + h.dir * h.ph * 5 * S.k * 0.6;
      if (ground(S, i, x, h.depth, 2) === null) return T.done();
      const y = L.top[cx(S, x)] + h.depth - Math.sin(f * Math.PI) * 3 * sc;
      put(g, spr(S, f > 0.15 && f < 0.85 ? MV.rabbitUp : MV.rabbit, L.haze, h.dir < 0), x, y, sc);
    };
  }
  // butterflies weaving over the grass at the front
  function flutter(S, r, n, colours) {
    const L = S.lays[S.lays.length - 1], list = [];
    for (let q = 0; q < n; q++) list.push({ x: r() * S.W, y: 0, h: (6 + r() * 16) * S.k * 0.6, p: r() * 6, v: (3 + r() * 5) * S.k * 0.6 * (r() < 0.5 ? 1 : -1), c: colours[q % colours.length] });
    const sc = Math.max(1, Math.round(S.k * 0.45));
    return (g, t, dt) => {
      for (const b of list) {
        b.x += (b.v + Math.sin(t * 1.3 + b.p) * 6) * dt;
        if (b.x < -5) b.x = S.W + 4; if (b.x > S.W + 5) b.x = -4;
        const y = L.top[cx(S, b.x)] - b.h - Math.sin(t * 2.1 + b.p) * 4 * S.k * 0.6;
        put(g, spr(S, Math.sin(t * 16 + b.p) > 0 ? MV.butterflyA : MV.butterflyB, 0, b.v < 0, b.c), b.x, y, sc);
      }
    };
  }
  function bees(S, r) {
    const L = S.lays[S.lays.length - 1], list = [];
    for (let q = 0; q < 5; q++) list.push({ x: r() * S.W, y: 0, h: (3 + r() * 10) * S.k * 0.6, p: r() * 6 });
    return (g, t) => {
      for (const b of list) {
        const x = b.x + Math.sin(t * 1.7 + b.p) * 10 * S.k + Math.sin(t * 7 + b.p) * 2, y = L.top[cx(S, x)] - b.h + Math.sin(t * 9 + b.p * 2) * 1.5;
        px(g, x, y, '#ffd24a'); px(g, x + 1, y, '#2c2a30');
        if (Math.sin(t * 40 + b.p) > 0) px(g, x, y - 1, [255, 255, 255], 0.6);
      }
    };
  }
  function dragonflies(S, r) {
    const L = S.lays[S.lays.length - 1], list = [0, 1].map(() => ({ x: r() * S.W, p: r() * 6, h: (10 + r() * 14) * S.k * 0.6 }));
    return (g, t) => {
      for (const d of list) {
        const dart = Math.floor(t * 0.5 + d.p) % 3 === 0, x = d.x + Math.sin(t * (dart ? 1.6 : 0.3) + d.p) * 30 * S.k, y = L.top[cx(S, x)] - d.h + Math.sin(t * 2 + d.p) * 3;
        put(g, spr(S, Math.sin(t * 30) > 0 ? MV.dragonfly : ['.....', '.TTTTT'], 0), x, y);
      }
    };
  }
  // a fish (or a dolphin, or a whale's tail) leaping out of the water now and then
  function jumper(S, r, kind) {
    if (!S.wy) return null;
    const low = S.frontTop ? Math.min(...Array.from(S.frontTop).filter((v) => v > S.wy)) : S.H, bottom = () => low;
    const T = now_and_then(r, kind === 'whale' ? [40, 80] : kind === 'dolphin' ? [14, 30] : [8, 20], 4);
    return (g, t, dt) => {
      T.tick(dt, () => {
        const y = S.wy + 3 + r() * Math.max(2, (bottom() - S.wy) * 0.5);
        return { x: S.W * (0.15 + r() * 0.7), y, f: 0, dir: r() < 0.5 ? 1 : -1, ring: 0 };
      });
      const j = T.on;
      if (!j) return;
      const dur = kind === 'whale' ? 5 : kind === 'dolphin' ? 1.8 : 0.9;
      j.f += dt / dur;
      if (j.f >= 1.6) return T.done();
      const near = Math.max(0.5, (j.y - S.wy) / Math.max(1, bottom() - S.wy) * 1.4), sc = Math.max(1, Math.round(S.k * 0.5 * near));
      // rings on the water where it went in and came out
      if (j.f > 0.05) for (const [rx, age] of [[j.x, j.f], [j.x + j.dir * (kind === 'whale' ? 0 : (kind === 'dolphin' ? 26 : 8)) * S.k * 0.6, j.f - 1]]) {
        if (age <= 0 || age > 0.6) continue;
        const R = age * 14 * S.k * 0.6;
        for (let a = 0; a < 6.28; a += 0.4) px(g, rx + Math.cos(a) * R, j.y + Math.sin(a) * R * 0.3, [255, 255, 255], (0.5 * (1 - age / 0.6)).toFixed(2));
      }
      if (j.f >= 1) return;
      if (kind === 'whale') {
        const rise = Math.sin(j.f * Math.PI), h = Math.round(rise * 5 * sc);
        const c = spr(S, MV.whale, 0.2);
        g.save(); g.beginPath(); g.rect(0, 0, S.W, j.y + 1); g.clip(); put(g, c, j.x, j.y + MV.whale.length * sc - h, sc); g.restore();
        return;
      }
      if (kind === 'dolphin' || kind === 'fish') {
        // the body follows its own path through the air, so it curves like the real thing
        const span = (kind === 'dolphin' ? 26 : 8) * S.k * 0.6, high = (kind === 'dolphin' ? 9 : 4) * S.k * 0.6 * near, len = kind === 'dolphin' ? 7 * sc : 3 * sc;
        const body = kind === 'dolphin' ? S.landCol('#7d8fa3', 0.1) : S.landCol('#c9d6e0', 0.1), belly = kind === 'dolphin' ? S.landCol('#d8dee6', 0.1) : body;
        for (let q = 0; q < len; q++) {
          const ff = j.f - q * (0.016 / (kind === 'dolphin' ? 1 : 0.6));
          if (ff < 0 || ff > 1) continue;
          const x = j.x + j.dir * ff * span, y = j.y - Math.sin(ff * Math.PI) * high;
          if (y > j.y) continue;
          g.fillStyle = css(body); g.fillRect(Math.round(x), Math.round(y), 1, kind === 'dolphin' && q > 1 && q < len - 2 ? 2 : 1);
          if (kind === 'dolphin' && q === Math.round(len / 2)) { g.fillRect(Math.round(x), Math.round(y) - 1, 1, 1); g.fillStyle = css(belly); g.fillRect(Math.round(x), Math.round(y) + 2, 1, 1); }
        }
      }
    };
  }
  function popper(S, r) { // a seal's head comes up for a look
    if (!S.wy) return null;
    const T = now_and_then(r, [10, 26], 2);
    return (g, t, dt) => {
      T.tick(dt, () => ({ x: S.W * (0.1 + r() * 0.8), y: S.wy + (4 + r() * 10) * S.k, f: 0 }));
      const p = T.on;
      if (!p) return;
      p.f += dt / 6;
      if (p.f >= 1) return T.done();
      const up = Math.min(1, Math.sin(p.f * Math.PI) * 3), sc = Math.max(1, Math.round(S.k * 0.5));
      g.save(); g.beginPath(); g.rect(0, 0, S.W, p.y + 1); g.clip();
      put(g, spr(S, MV.seal, 0.1, Math.sin(t * 0.8) > 0), p.x, p.y + Math.round((1 - up) * 3 * sc), sc);
      g.restore();
      px(g, p.x - 2 * sc, p.y + 1, [255, 255, 255], 0.4); px(g, p.x + 2 * sc, p.y + 1, [255, 255, 255], 0.4);
    };
  }
  function beacon(S, r) {
    const b = S.beacon;
    return (g, t) => {
      if (!S.night) return;
      const a = t * 0.9, s = Math.cos(a), len = (60 + 40 * Math.abs(s)) * S.k, dir = s >= 0 ? 1 : -1, bright = 0.1 + 0.18 * Math.abs(Math.sin(a));
      for (let j = 2; j < len; j++) {
        const spread = 1 + j * 0.12;
        for (let q = -spread; q <= spread; q += 1) if (((Math.round(b.x + dir * j) + Math.round(b.y + q)) & 1) === 0) px(g, b.x + dir * j, b.y + q, [255, 240, 190], (bright * (1 - j / len)).toFixed(3));
      }
      px(g, b.x, b.y, '#fff1b8');
    };
  }
  function cars(S, r) {
    const st = S.street;
    if (!st) return null;
    const sc = Math.max(1, Math.round(S.k * 0.5)), tints = ['#d9463c', '#4f7fbf', '#f2f2ee', '#3a3f4e', '#f0a040', '#2fa59a', '#8a6bd8'];
    const lanes = [{ y: st.mid - 2, dir: 1 }, { y: S.H - 3, dir: -1 }];
    const list = [];
    for (let q = 0; q < 6; q++) list.push({ lane: lanes[q % 2], x: r() * S.W, v: (16 + r() * 14) * S.k, tint: tints[Math.floor(r() * tints.length)] });
    return (g, t, dt) => {
      for (const c of list) {
        c.x += c.lane.dir * c.v * dt;
        if (c.x > S.W + 20) c.x = -20; if (c.x < -20) c.x = S.W + 20;
        put(g, spr(S, MV.car, 0, c.lane.dir < 0, c.tint), c.x, c.lane.y, sc);
        if (S.night) {
          const fx = c.x + c.lane.dir * 4 * sc, bx = c.x - c.lane.dir * 4 * sc;
          for (let j = 1; j < 10 * sc; j++) px(g, fx + c.lane.dir * j, c.lane.y - sc, [255, 236, 170], (0.35 * (1 - j / (10 * sc))).toFixed(2));
          px(g, fx, c.lane.y - sc, '#fff6c8'); px(g, bx, c.lane.y - sc, '#ff4b3e');
        }
      }
    };
  }
  function signal(S) {
    const s = S.signal;
    return (g, t) => {
      const ph = (t % 14) / 14, on = ph < 0.45 ? 2 : ph < 0.55 ? 1 : 0;
      const lamps = ['#ff4b3e', '#ffc23a', '#4be07a'];
      for (let q = 0; q < 3; q++) { g.fillStyle = q === on ? lamps[q] : '#2a2a30'; g.fillRect(s.x, s.y + q * 2 * s.sc, s.sc, s.sc); }
    };
  }
  function pigeons(S, r) {
    const roofs = (S.roofs || []).filter((q) => q.i === S.lays.length - 2 && q.x1 - q.x0 > 8);
    if (!roofs.length) return null;
    const list = [];
    for (let q = 0; q < 4; q++) { const rf = roofs[Math.floor(r() * roofs.length)]; list.push({ rf, x: rf.x0 + 2 + r() * (rf.x1 - rf.x0 - 4), p: r() * 6 }); }
    return (g, t) => {
      for (const b of list) {
        const hop = Math.floor(t * 0.7 + b.p) % 5 === 0, x = b.x + (hop ? Math.sin(t * 3 + b.p) * 2 : 0);
        put(g, spr(S, Math.sin(t * 2 + b.p) > 0.7 ? MV.pigeon2 : MV.pigeon, b.rf.haze), x, b.rf.y - 1 - (hop && Math.sin(t * 9) > 0 ? 1 : 0));
      }
    };
  }
  function owl(S, r) {
    const p = S.perch;
    return (g, t) => put(g, spr(S, (t + 0.3) % 4 < 0.18 ? MV.owlBlink : MV.owl, p.haze), p.x, p.y);
  }
  function crow(S, r) {
    const p = S.perch;
    return (g, t) => { const caw = Math.floor(t / 3) % 4 === 0 && (t % 3) < 0.4; put(g, spr(S, caw ? ['.k.', 'kkk', '.kk'] : ['.k..', 'kkk.', '.kk.'], p.haze), p.x, p.y - 1); };
  }
  function bats(S, r) {
    const list = [0, 1, 2].map(() => ({ x: r() * S.W, y: S.hy * (0.5 + r() * 0.4), p: r() * 6 }));
    return (g, t) => {
      for (const b of list) {
        const x = b.x + Math.sin(t * 0.9 + b.p) * 30 * S.k + Math.sin(t * 5 + b.p) * 3, y = b.y + Math.sin(t * 1.4 + b.p) * 10 + Math.sin(t * 7 + b.p) * 2;
        put(g, spr(S, Math.sin(t * 14 + b.p) > 0 ? ['k.k.k', '.kkk.'] : ['.....', 'kkkkk'], 0.2), x, y);
      }
    };
  }
  function train(S, r) {
    const rl = S.rail, cars = 5;
    const T = now_and_then(r, [25, 60], 2);
    return (g, t, dt) => {
      T.tick(dt, () => ({ dir: r() < 0.5 ? 1 : -1, x: 0, v: S.W / every(r, 30, 45) }));
      const tr = T.on;
      if (!tr) return;
      tr.x += tr.v * dt;
      const len = (10 + cars * 10) + 10, head = tr.dir > 0 ? tr.x - len : S.W - tr.x + len;
      if (tr.x > S.W + len * 2) return T.done();
      put(g, spr(S, MV.trainEngine, rl.haze, tr.dir < 0), head, rl.y - 1);
      for (let q = 1; q <= cars; q++) put(g, spr(S, MV.trainCar, rl.haze), head - tr.dir * (q * 10 + 1), rl.y - 1);
      // a little smoke from the engine
      for (let q = 0; q < 5; q++) { const age = ((t * 1.2 + q * 0.2) % 1); g.fillStyle = css(mixc([230, 230, 235], S.horizonCol(), rl.haze), (0.5 * (1 - age)).toFixed(2)); g.fillRect(Math.round(head + tr.dir * 2 - tr.dir * age * 14), Math.round(rl.y - 8 - age * 5), 1 + (age > 0.5 ? 1 : 0), 1); }
    };
  }
  function tumbleweed(S, r) {
    const L = S.lays[S.lays.length - 1], sc = Math.max(1, Math.round(S.k * 0.5));
    const T = now_and_then(r, [10, 26], 1);
    return (g, t, dt) => {
      T.tick(dt, () => ({ x: -10, depth: (6 + r() * 20) * S.k * 0.6, v: (18 + r() * 14) * S.k }));
      const w = T.on;
      if (!w) return;
      w.x += w.v * dt;
      if (w.x > S.W + 10) return T.done();
      const y = L.top[cx(S, w.x)] + w.depth - Math.abs(Math.sin(w.x * 0.08)) * 4 * sc;
      put(g, spr(S, Math.floor(w.x / 4) % 2 ? MV.tumble : MV.tumble2, 0), w.x, y, sc);
    };
  }
  function turbines(S) {
    return (g, t) => {
      for (const [q, tb] of S.turbines.entries()) {
        const a0 = t * 1.1 + q * 1.3, c = css(S.landCol('#f6f5ef', tb.haze)), len = Math.round(6 * S.k * 0.6);
        g.fillStyle = c;
        for (let s = 0; s < 3; s++) { const a = a0 + (s * Math.PI * 2) / 3; for (let i = 1; i <= len; i++) g.fillRect(Math.round(tb.x + Math.cos(a) * i), Math.round(tb.y + Math.sin(a) * i), 1, 1); }
      }
    };
  }
  function falls(S, r) {
    const f = S.falls, drops = [];
    for (let q = 0; q < 14; q++) drops.push({ y: f.top + r() * (f.bot - f.top), v: 20 + r() * 20, x: r() < 0.5 ? 0 : 1 });
    return (g, t, dt) => {
      for (const d of drops) { d.y += d.v * dt; if (d.y > f.bot) d.y = f.top; px(g, f.x + d.x, d.y, [255, 255, 255], 0.9); }
      for (let q = 0; q < 6; q++) px(g, f.x - 3 + q + Math.sin(t * 4 + q) * 1.5, f.bot - 1 - Math.abs(Math.sin(t * 3 + q * 2)) * 2, [255, 255, 255], 0.5);
    };
  }
  function cat(S, r) { // a cat on the hedge, flicking its tail
    const L = S.lays[1];
    if (!L || !L.top) return null;
    const x = S.W * 0.86, sc = 1;
    return (g, t) => { const y = L.top[cx(S, x)]; put(g, spr(S, Math.floor(t * 1.5) % 4 === 0 ? MV.catB : MV.catA, L.haze), x, y, sc); };
  }
  function bather(S, r) { // a little bird hopping on the bird bath
    const b = S.bath, sc = Math.max(1, Math.round(S.k * 0.5));
    return (g, t) => {
      const hop = Math.floor(t * 1.1) % 3 === 0, dip = Math.floor(t * 1.7) % 5 === 1;
      put(g, spr(S, dip ? ['.....', 'H.HHk', '.HHH.'] : ['...H.', '.HHHk', 'HHH..'], 0, Math.floor(t / 4) % 2 === 1), b.x + (hop ? 1 : 0) * sc, b.y - 1 - (hop && Math.sin(t * 12) > 0 ? sc : 0), sc);
    };
  }
  function school(S, r, fy, tint) {
    const n = 9, list = [];
    for (let q = 0; q < n; q++) list.push({ dx: (r() - 0.5) * 18 * S.k * 0.6, dy: (r() - 0.5) * 8 * S.k * 0.6, p: r() * 6 });
    const c = { x: r() * S.W, y: S.H * fy, v: (6 + r() * 4) * S.k * (r() < 0.5 ? 1 : -1) };
    return (g, t, dt) => {
      c.x += c.v * dt;
      if (c.x > S.W + 30) c.x = -30; if (c.x < -30) c.x = S.W + 30;
      for (const f of list) { const x = c.x + f.dx + Math.sin(t * 2 + f.p) * 2, y = c.y + f.dy + Math.sin(t * 1.3 + c.x * 0.02 + f.p) * 3; put(g, spr(S, MV.fish, 0.2, c.v < 0, tint), x, y); }
    };
  }
  function drifters(S, r, n) { // jellyfish, pulsing upward
    const list = [];
    for (let q = 0; q < n; q++) list.push({ x: r() * S.W, y: S.H * (0.2 + r() * 0.5), p: r() * 6 });
    return (g, t, dt) => {
      for (const j of list) {
        const pulse = Math.sin(t * 2 + j.p);
        j.y -= (pulse > 0 ? 3 : 0.6) * S.k * 0.5 * dt; j.x += Math.sin(t * 0.3 + j.p) * 0.5 * dt;
        if (j.y < -10) j.y = S.H * 0.8;
        put(g, spr(S, pulse > 0 ? MV.jellyA : MV.jellyB, 0.15), j.x, j.y, Math.max(1, Math.round(S.k * 0.45)));
      }
    };
  }
  function turtle(S, r) {
    const tt = { x: r() * S.W, y: S.H * 0.42, v: 3 * S.k };
    return (g, t, dt) => { tt.x += tt.v * dt; if (tt.x > S.W + 20) tt.x = -20; put(g, spr(S, Math.sin(t * 2) > 0 ? MV.turtleA : MV.turtleB, 0.1), tt.x, tt.y + Math.sin(t * 0.5) * 3, Math.max(1, Math.round(S.k * 0.5))); };
  }
  function ducks(S, r) {
    const bottom = S.frontTop ? Math.min(...Array.from(S.frontTop).filter((v) => v > S.wy)) : S.H;
    const d = { x: r() * S.W, y: S.wy + (bottom - S.wy) * 0.4, v: 3 * S.k * 0.6, dir: 1, p: r() * 6 };
    const sc = Math.max(1, Math.round(S.k * 0.5));
    return (g, t, dt) => {
      d.x += d.dir * d.v * dt;
      if (d.x > S.W - 20 || d.x < 20) d.dir *= -1;
      const y = d.y + Math.sin(t * 0.2 + d.p) * 3;
      // a V of ripples behind
      for (let j = 2; j < 18 * sc; j += 2) { const a = 0.35 * (1 - j / (18 * sc)); px(g, d.x - d.dir * j, y + j * 0.25, [255, 255, 255], a.toFixed(2)); px(g, d.x - d.dir * j, y - j * 0.15 + 1, [255, 255, 255], (a * 0.6).toFixed(2)); }
      put(g, spr(S, MV.duck, 0, d.dir < 0), d.x, y, sc);
      for (let q = 1; q <= 3; q++) put(g, spr(S, MV.duckling, 0, d.dir < 0), d.x - d.dir * (5 + q * 5) * sc, y + Math.sin(t * 3 + q) * 0.5, sc);
    };
  }
  function frog(S, r) {
    const pads = S.lilies || [];
    if (pads.length < 2) return null;
    let at = 0, to = 1, f = 1, rest = 2;
    const sc = Math.max(1, Math.round(S.k * 0.45));
    return (g, t, dt) => {
      if (f >= 1) { rest -= dt; if (dt && rest <= 0) { at = to; to = Math.floor(r() * pads.length); if (to === at) to = (at + 1) % pads.length; f = 0; rest = 3 + r() * 6; } }
      else f = Math.min(1, f + dt / 1.1);
      const A = pads[at], B = pads[to], p = f >= 1 ? B : { x: A.x + (B.x - A.x) * f, y: A.y + (B.y - A.y) * f - Math.sin(f * Math.PI) * 14 * S.k * 0.6 };
      put(g, spr(S, f < 1 ? ['F...F', '.FFF.', 'f...f'] : MV.frog, 0), p.x, p.y - 1, sc);
    };
  }
  function heron(S, r) {
    const L = S.lays[S.lays.length - 1], x = S.W * 0.82, sc = Math.max(1, Math.round(S.k * 0.5));
    return (g, t) => { const y = L.top[cx(S, x)] + 2 * sc; put(g, spr(S, Math.floor(t / 2.5) % 5 === 3 ? MV.heronDip : MV.heron, 0), x, y, sc); };
  }

  // ---- the hooks js/scape.js calls ---------------------------------------------------------------------------------
  const T = {};
  T.paint = function (S, sky, back, front) {
    const r = (S.tr = G.seeded(G.hash(S.world + (S.o.seed || '') + 'traced' + (S.night ? 'n' : 'd'))));
    const hz = new Float32Array(256);
    for (const L of S.lays) for (let j = 0; j < 8; j++) hz[L.id + j] = L.haze;
    S.chimneys = [];
    paintSky(S, sky, r);
    const K = kit(S, r);
    groundwork(K);
    (DETAILS[S.world] || (() => {}))(K);
    texture(S, back, r, hz); texture(S, front, r, hz);
    trace(S, back, hz); trace(S, front, hz);
  };
  T.cloud = cloud;
  T.prep = prep;
  T.act = function (S, where, g, t, still, dt) {
    const list = S.acts && S.acts[where];
    if (!list || !list.length) return;
    for (const f of list) f(g, t, still ? 0 : Math.min(dt, 0.1));
  };
  G.Scape.Traced = T;

  // in Dice: when Traced mode is switched on or off, paint the worlds again
  const D = window.Dice;
  if (D && D.on) {
    let was = D.state && D.state.looks;
    D.on('prefs', () => {
      if (D.state.looks === was) return;
      was = D.state.looks;
      if (D.desk) D.desk.world = null;
      if (D.hero && D.hero.set) D.hero.set(null, true);
    });
  }
})();
