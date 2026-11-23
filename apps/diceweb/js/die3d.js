// The Dice die: a black die with rounded edges and white dots, drawn in 3D
// (each pixel works out which part of the die it sees and how the light
// falls on it), then turned into crisp pixel art with a handful of greys.
// Works in the browser (window.DiceDie) and in Node (to draw the boot splash).
(function (root) {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

  // A turn is three columns: where the die's own x, y and z point on screen.
  // The resting pose is the logo's view (seen from 30 degrees up, a corner
  // pointing at you): the 1 on the left, the 2 on top, the 3 on the right.
  function restPose() {
    const c = Math.SQRT1_2, s = 0.5, k = Math.sqrt(3) / 2;
    const left = [-c, -s * c, k * c], top = [0, k, s];
    return [left, top, cross(left, top)];
  }
  const REST = restPose();
  // turn about an axis (Rodrigues), as columns
  function axisTurn(axis, angle) {
    const [x, y, z] = norm(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
    return [[t * x * x + c, t * x * y + s * z, t * x * z - s * y], [t * x * y - s * z, t * y * y + c, t * y * z + s * x], [t * x * z + s * y, t * y * z - s * x, t * z * z + c]];
  }
  // apply A then B (both as columns): the result maps die space to screen
  function then(A, B) { return A.map((col) => [0, 1, 2].map((r) => B[0][r] * col[0] + B[1][r] * col[1] + B[2][r] * col[2])); }
  const pose = (axis, angle) => (angle ? then(REST, axisTurn(axis, angle)) : REST);

  // which number is on each side; opposite sides add up to 7
  const FACES = { '+x': 1, '-x': 6, '+y': 2, '-y': 5, '+z': 4, '-z': 3 };
  const PIPS = {
    1: [[0, 0]], 2: [[-0.5, -0.5], [0.5, 0.5]], 3: [[-0.5, 0.5], [0, 0], [0.5, -0.5]], 4: [[-0.5, -0.5], [-0.5, 0.5], [0.5, -0.5], [0.5, 0.5]],
    5: [[-0.5, -0.5], [-0.5, 0.5], [0, 0], [0.5, -0.5], [0.5, 0.5]], 6: [[-0.5, -0.5], [-0.5, 0], [-0.5, 0.5], [0.5, -0.5], [0.5, 0], [0.5, 0.5]],
  };
  let R = 0.3, B = 1 - R; // how round the edges are (sharper when small, so it still reads as a cube)
  let PIP = 0.235;
  const LIGHT = norm([-0.5, 0.7, 0.6]), HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

  // the distance from a point to the die's surface (a box with rounded edges)
  function sd(x, y, z) {
    const qx = Math.abs(x) - B, qy = Math.abs(y) - B, qz = Math.abs(z) - B;
    const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
    return Math.hypot(ox, oy, oz) + Math.min(Math.max(qx, qy, qz), 0) - R;
  }

  // What one ray sees: its brightness 0..1, or null if it misses the die.
  // SMALL: drawn for a few pixels, so flat sides, bright dots, no shine.
  let lastPip = 0, SMALL = false;
  function shade(M, x, y) {
    if (x * x + y * y > 3.1) return null;
    // the ray, in the die's own space (M is a pure turn, so its inverse is its transpose)
    const ox = M[0][0] * x + M[0][1] * y + M[0][2] * 4, oy = M[1][0] * x + M[1][1] * y + M[1][2] * 4, oz = M[2][0] * x + M[2][1] * y + M[2][2] * 4;
    const dx = -M[0][2], dy = -M[1][2], dz = -M[2][2];
    let t = 2, hit = false, px = 0, py = 0, pz = 0;
    for (let i = 0; i < 48; i++) {
      px = ox + dx * t; py = oy + dy * t; pz = oz + dz * t;
      const d = sd(px, py, pz);
      if (d < 0.0015) { hit = true; break; }
      t += d;
      if (t > 6.5) break;
    }
    if (!hit) return null;
    // the surface's direction, in the die's space then on screen
    const qx = Math.max(Math.abs(px) - B, 0) * Math.sign(px), qy = Math.max(Math.abs(py) - B, 0) * Math.sign(py), qz = Math.max(Math.abs(pz) - B, 0) * Math.sign(pz);
    let nl = Math.hypot(qx, qy, qz) > 1e-6 ? norm([qx, qy, qz]) : null;
    const ax = Math.abs(px), ay = Math.abs(py), az = Math.abs(pz);
    let face, u, v;
    if (ax >= ay && ax >= az) { face = px > 0 ? '+x' : '-x'; u = py; v = pz; if (!nl) nl = [Math.sign(px), 0, 0]; }
    else if (ay >= az) { face = py > 0 ? '+y' : '-y'; u = px; v = pz; if (!nl) nl = [0, Math.sign(py), 0]; }
    else { face = pz > 0 ? '+z' : '-z'; u = px; v = py; if (!nl) nl = [0, 0, Math.sign(pz)]; }
    const n = [M[0][0] * nl[0] + M[1][0] * nl[1] + M[2][0] * nl[2], M[0][1] * nl[0] + M[1][1] * nl[1] + M[2][1] * nl[2], M[0][2] * nl[0] + M[1][2] * nl[1] + M[2][2] * nl[2]];
    const diff = Math.max(0, dot(n, LIGHT)), spec = Math.pow(Math.max(0, dot(n, HALF)), 20), rim = Math.pow(1 - Math.max(0, n[2]), 3);
    // a dot? only on the flat part of a side
    let pip = 0;
    if (Math.abs(u) < B + 0.02 && Math.abs(v) < B + 0.02) {
      for (const [a, b] of PIPS[FACES[face]]) {
        const d = Math.hypot(u - a * 1.08, v - b * 1.08);
        if (d < PIP) { pip = d < PIP * 0.72 ? 1 : 0.6; break; }
      }
    }
    lastPip = pip;
    let val;
    if (SMALL) val = pip ? 0.72 + 0.22 * diff : 0.01 + 0.16 * diff + (Math.hypot(qx, qy, qz) > 1e-6 ? 0.07 : 0) + spec * 0.05;
    else if (pip) val = (0.42 + 0.58 * diff) * (pip === 1 ? 0.98 : 0.7) + spec * 0.05; // the dots: white in the light, grey in the shade
    else val = 0.05 + 0.15 * diff + spec * 0.24 + rim * 0.1; // the body: black, with a soft shine on the rounded edges
    return Math.min(1, val);
  }

  // The die as pixel art: size x size pixels, {w, h, data: RGBA}.
  // opts: ss (samples per pixel across), pal (number of greys), outline
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const SMALL_PAL = [0.01, 0.07, 0.14, 0.24, 0.66, 0.9];
  function render(size, M, opts) {
    M = M || REST;
    opts = opts || {};
    SMALL = opts.small !== undefined ? opts.small : size < 40;
    R = SMALL ? 0.18 : 0.3; B = 1 - R;
    const ss = opts.ss || 2, levels = opts.pal || (SMALL ? 6 : 8), span = 3.6, jitter = opts.dither === undefined ? (size >= 40 ? 0.34 : 0) : opts.dither;
    PIP = opts.pip || (size < 40 ? 0.29 : 0.235);
    const data = new Uint8ClampedArray(size * size * 4);
    const cover = new Float32Array(size * size), val = new Float32Array(size * size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      let c = 0, s = 0, pc = 0, ps = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = ((px + (sx + 0.5) / ss) / size - 0.5) * span, y = (0.5 - (py + (sy + 0.5) / ss) / size) * span;
        const v = shade(M, x, y);
        if (v !== null) { c++; if (lastPip) { pc++; ps += v; } else s += v; }
      }
      const i = py * size + px;
      cover[i] = c / (ss * ss);
      // small: each pixel is either dot or body, never a muddy mix of the two
      if (SMALL) val[i] = pc >= c * 0.4 && pc ? ps / pc : c - pc ? s / (c - pc) : ps / Math.max(1, pc);
      else val[i] = c ? (s + ps) / c : 0;
    }
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const i = py * size + px;
      if (cover[i] < 0.5) continue;
      // a few greys, with a checkerboard where two meet (only where the light
      // curves round an edge: flat sides stay one clean grey)
      const nb = (x, y) => (x >= 0 && y >= 0 && x < size && y < size && cover[y * size + x] >= 0.5 ? val[y * size + x] : val[i]);
      const grad = Math.max(Math.abs(nb(px + 1, py) - val[i]), Math.abs(nb(px - 1, py) - val[i]), Math.abs(nb(px, py + 1) - val[i]), Math.abs(nb(px, py - 1) - val[i]));
      const f = val[i] * (levels - 1) + (BAYER[(py % 4) * 4 + (px % 4)] / 16 - 0.5) * jitter * (grad > 0.004 && grad < 0.11 ? 1 : 0);
      // small: a palette picked by hand: three blacks for the sides, a lighter edge, and the dots
      const g = SMALL && !opts.pal ? SMALL_PAL.reduce((a, b) => (Math.abs(b - val[i]) < Math.abs(a - val[i]) ? b : a)) : Math.round(Math.max(0, Math.min(levels - 1, f))) / (levels - 1);
      const gray = Math.round(14 + g * 236);
      // a whisper of cool blue in the shadows keeps the black from looking flat
      data[i * 4] = gray; data[i * 4 + 1] = gray; data[i * 4 + 2] = Math.min(255, gray + (g < 0.3 ? 6 : 0)); data[i * 4 + 3] = 255;
    }
    if (opts.outline) { // a darker edge so it reads on black too
      const out = data.slice();
      for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
        const i = py * size + px;
        if (data[i * 4 + 3]) continue;
        const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const x = px + a, y = py + b; return x >= 0 && y >= 0 && x < size && y < size && data[(y * size + x) * 4 + 3]; });
        if (near) { out.set(opts.outline, i * 4); out[i * 4 + 3] = 255; }
      }
      return { w: size, h: size, data: out };
    }
    return { w: size, h: size, data };
  }

  // A die tumbling down onto the floor and settling into its resting pose.
  // k runs 0 (still spinning) to 1 (resting).
  function tumble(k, axis) {
    const ease = 1 - Math.pow(1 - Math.min(1, k), 3);
    return pose(axis || [0.6, 1, 0.25], (1 - ease) * Math.PI * 3.2);
  }

  // The logo: the die drawn flat, pixel by pixel, in the classic isometric
  // view (the 2 on top, the 1 on the left, the 3 on the right). No lighting
  // maths, just three clean greys, a lit edge and round dots, so it stays
  // sharp at 16 pixels where the 3D one turns to mush.
  // opts: outline [r,g,b] (a ring so it shows on dark), ss (samples across)
  const ISO = {
    top: [0x3b, 0x3b, 0x45], left: [0x2a, 0x2a, 0x32], right: [0x1b, 0x1b, 0x21], rim: [0x5a, 0x5a, 0x66],
    ptop: [0xf6, 0xf6, 0xf8], pleft: [0xe4, 0xe4, 0xe9], pright: [0xc4, 0xc4, 0xcc],
  };
  const ISO_PIPS = { top: [[0.27, 0.73], [0.73, 0.27]], left: [[0.5, 0.5]], right: [[0.24, 0.76], [0.5, 0.5], [0.76, 0.24]] };
  // at 16 pixels every pixel counts, so that one is drawn by hand
  // (t top, l left, r right, m the lit edge, P Q S the dots on each side)
  const ISO16 = [
    '................',
    '......tttt......',
    '....tttttttt....',
    '..tttttttttttt..',
    '.tttPPttttPPttt.',
    '.llmmttttttmmrr.',
    '.llllmmttmmrrSS.',
    '.llllllmmrrrrSS.',
    '.lllllllrrSSrrr.',
    '.lllQQllrrSSrrr.',
    '.lllQQllrrrrrrr.',
    '.lllllllSSrrrrr.',
    '...lllllSSrrr...',
    '.....lllrrr.....',
    '.......lr.......',
    '................'];
  const ISO_KEY = { t: 'top', l: 'left', r: 'right', m: 'rim', P: 'ptop', Q: 'pleft', S: 'pright' };
  function iso(size, opts) {
    opts = opts || {};
    if (size === 16 && !opts.drawn) return ring(fromRows(ISO16), 16, opts.outline);
    const ss = opts.ss || 5, N = size;
    // the outline (hexagon) in pixels: width W, top diamond W/2 tall, sides H tall
    const W = N - 2, H = Math.min(Math.round(W * 0.58), N - 2 - W / 2), cx = N / 2, y0 = (N - (W / 2 + H)) / 2;
    const T = [cx, y0], Rr = [cx + W / 2, y0 + W / 4], Bf = [cx, y0 + W / 2], L = [cx - W / 2, y0 + W / 4];
    const hex = [T, Rr, [Rr[0], Rr[1] + H], [Bf[0], Bf[1] + H], [L[0], L[1] + H], L];
    // corners rounded by r pixels: shrink the hexagon by r, then grow it back round
    const r = opts.round !== undefined ? opts.round : Math.max(0.9, N * 0.075);
    const inset = hex.map((p, i) => {
      const a = hex[(i + 5) % 6], b = hex[(i + 1) % 6];
      const e1 = norm2([p[0] - a[0], p[1] - a[1]]), e2 = norm2([b[0] - p[0], b[1] - p[1]]);
      const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]]; // inward normals (clockwise on screen)
      const bis = norm2([n1[0] + n2[0], n1[1] + n2[1]]), k = r / Math.max(0.2, bis[0] * n1[0] + bis[1] * n1[1]);
      return [p[0] + bis[0] * k, p[1] + bis[1] * k];
    });
    const inside = (x, y) => {
      let inn = true, best = Infinity;
      for (let i = 0; i < 6; i++) {
        const a = inset[i], b = inset[(i + 1) % 6], ex = b[0] - a[0], ey = b[1] - a[1];
        if (ex * (y - a[1]) - ey * (x - a[0]) < 0) inn = false;
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
      }
      return inn || best <= r;
    };
    // which side a point is on, and where on that side (s, t from 0 to 1)
    const solve = (o, a, b, x, y) => { // o + s*a + t*b = (x, y)
      const det = a[0] * b[1] - a[1] * b[0], dx = x - o[0], dy = y - o[1];
      return [(dx * b[1] - dy * b[0]) / det, (a[0] * dy - a[1] * dx) / det];
    };
    const sideOf = (x, y) => {
      let s, t;
      if (y <= Bf[1] - Math.abs(x - cx) / 2) { [s, t] = solve(T, [Rr[0] - T[0], Rr[1] - T[1]], [L[0] - T[0], L[1] - T[1]], x, y); return ['top', s, t]; }
      if (x < cx) { [s, t] = solve(L, [Bf[0] - L[0], Bf[1] - L[1]], [0, H], x, y); return ['left', s, t]; }
      [s, t] = solve(Bf, [Rr[0] - Bf[0], Rr[1] - Bf[1]], [0, H], x, y); return ['right', s, t];
    };
    const PR = opts.pip || (N <= 18 ? 0.15 : N <= 26 ? 0.14 : 0.13);
    const rimW = opts.rim !== undefined ? opts.rim : Math.max(0.75, N / 30);
    const data = new Uint8ClampedArray(N * N * 4);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const votes = {};
      let hits = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const x = px + (sx + 0.5) / ss, y = py + (sy + 0.5) / ss;
        if (!inside(x, y)) continue;
        hits++;
        const [side, s, t] = sideOf(x, y);
        let what = side;
        // the dots are circles on the face, so they squash with it
        const pips = ISO_PIPS[side];
        for (const [a, b] of pips) if (Math.hypot(s - a, t - b) < PR) { what = 'p' + side; break; }
        // the two front edges of the top catch the light
        if (what === 'top' && (Bf[1] - Math.abs(x - cx) / 2) - y < rimW) what = 'rim';
        votes[what] = (votes[what] || 0) + 1;
      }
      if (hits * 2 < ss * ss) continue;
      // each pixel takes whatever most of it shows (dots win ties, so they never vanish)
      let pick = null, n = -1;
      for (const k in votes) { const v = votes[k] + (k[0] === 'p' ? 0.5 + votes[k] * 0.35 : 0); if (v > n) { n = v; pick = k; } }
      const c = ISO[pick], i = (py * N + px) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
    return ring(data, N, opts.outline);
  }
  function fromRows(rows) {
    const N = rows.length, data = new Uint8ClampedArray(N * N * 4);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ISO_KEY[ch]) { const c = ISO[ISO_KEY[ch]], i = (y * N + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255; } }));
    return data;
  }
  // a one-pixel ring round the die, so it shows on dark backgrounds
  function ring(data, N, colour) {
    if (!colour) return { w: N, h: N, data };
    const out = data.slice();
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const i = py * N + px;
      if (data[i * 4 + 3]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const x = px + a, y = py + b; return x >= 0 && y >= 0 && x < N && y < N && data[(y * N + x) * 4 + 3]; });
      if (near) { out.set(colour, i * 4); out[i * 4 + 3] = 255; }
    }
    return { w: N, h: N, data: out };
  }
  function norm2(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

  const api = { REST, pose, axisTurn, then, tumble, render, iso, ISO16, FACES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DiceDie = api;
})(this);
