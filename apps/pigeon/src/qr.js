'use strict';
// QR codes, so your phone can pick up a link by pointing its camera at the
// screen. Byte mode, error correction level M, versions 1-10 (links up to 213
// characters). Works in Node and in the browser (as window.pigeonQR).
// Follows ISO/IEC 18004; the structure mirrors Project Nayuki's reference
// implementation.

(function (root) {
  // version: [total codewords, error-correction codewords per block, blocks]  (level M)
  const TABLE = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4], [196, 18, 4], [242, 22, 4], [292, 22, 5], [346, 26, 5]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xff;
  }

  function divisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = gfMul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return r;
  }

  function remainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) {
      const factor = b ^ r.shift();
      r.push(0);
      for (let i = 0; i < div.length; i++) r[i] ^= gfMul(div[i], factor);
    }
    return r;
  }

  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return Array.from(Buffer.from(text, 'utf8'));
  }

  /** Encode text. Returns { size, dark(x, y) }. */
  function encode(text) {
    const bytes = utf8(String(text));
    let ver = 1;
    for (; ver <= 10; ver++) {
      const [total, ecc, blocks] = TABLE[ver];
      const cap = (total - ecc * blocks) * 8;
      if (4 + (ver < 10 ? 8 : 16) + bytes.length * 8 <= cap) break;
    }
    if (ver > 10) throw new Error('That link is too long for a QR code here.');
    const [total, eccLen, numBlocks] = TABLE[ver];
    const dataCap = total - eccLen * numBlocks;

    // the bits: mode, length, bytes, terminator, padding
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, dataCap * 8 - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    for (let pad = 0xec; data.length < dataCap; pad ^= 0xec ^ 0x11) data.push(pad);

    // split into blocks, add error correction, interleave
    const shortBlocks = numBlocks - (total % numBlocks);
    const shortLen = Math.floor(total / numBlocks);
    const div = divisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < numBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
      k += dat.length;
      const ecc = remainder(dat, div);
      if (i < shortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const words = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) words.push(b[i]); });
    }

    // the grid
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          set(x, y, d !== 2 && d !== 4);
        }
      }
    };
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    const al = ALIGN[ver];
    for (let i = 0; i < al.length; i++) {
      for (let j = 0; j < al.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const formatBits = (mask) => {
      const d = (0 << 3) | mask; // level M = 00
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((d << 10) | rem) ^ 0x5412;
    };
    const drawFormat = (mask) => {
      const b = formatBits(mask);
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0); // (reserves the spots; redrawn with the real mask below)
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const dark = ((b >>> i) & 1) !== 0;
        const a = size - 11 + (i % 3);
        const c = Math.floor(i / 3);
        set(a, c, dark);
        set(c, a, dark);
      }
    }
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - v : v;
          if (!fn[y][x] && n < words.length * 8) {
            mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
            n++;
          }
        }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x];
    };
    let best = 0;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m);
      drawFormat(m);
      const s = penalty(mod, size);
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m); // undo
    }
    applyMask(best);
    drawFormat(best);
    return { size, version: ver, dark: (x, y) => mod[y][x], modules: mod };
  }

  function penalty(m, size) {
    let score = 0;
    const runs = (get) => {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b <= size; b++) {
          if (b < size && get(a, b) === get(a, b - 1)) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
      }
    };
    runs((y, x) => m[y][x]);
    runs((x, y) => m[y][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
    const pat1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const pat2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    const look = (get) => {
      for (let a = 0; a < size; a++) for (let b = 0; b + 11 <= size; b++) {
        let p1 = true;
        let p2 = true;
        for (let k = 0; k < 11; k++) { const v = get(a, b + k) ? 1 : 0; if (v !== pat1[k]) p1 = false; if (v !== pat2[k]) p2 = false; }
        if (p1) score += 40;
        if (p2) score += 40;
      }
    };
    look((y, x) => m[y][x]);
    look((x, y) => m[y][x]);
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (m[y][x]) dark++;
    const total = size * size;
    score += Math.max(0, Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }

  /**
   * Terminal lines: two rows of modules per line, dark on light, with a quiet
   * border. `paint(text, fg, bg)` colours a run (pass null for no colour).
   */
  function lines(text, { quiet = 2, paint = null } = {}) {
    const q = encode(text);
    const n = q.size + quiet * 2;
    const at = (x, y) => x >= quiet && y >= quiet && x < q.size + quiet && y < q.size + quiet && q.dark(x - quiet, y - quiet);
    const out = [];
    for (let y = 0; y < n; y += 2) {
      let s = '';
      for (let x = 0; x < n; x++) {
        const t = at(x, y);
        const b = y + 1 < n ? at(x, y + 1) : false;
        if (paint) s += paint(t && b ? '█' : t ? '▀' : b ? '▄' : ' ', '#000000', '#ffffff');
        else s += t && b ? '█' : t ? '▀' : b ? '▄' : ' ';
      }
      out.push(s);
    }
    return out;
  }

  const api = { encode, lines };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.pigeonQR = api;
})(typeof window !== 'undefined' ? window : this);
