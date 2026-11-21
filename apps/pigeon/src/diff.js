/* What changed between two versions of a text file, line by line (Rewind).
 * Myers' diff (the one git uses), with a limit so huge or totally different
 * files don't take forever. One file for Node and the browser.
 */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make();
  else root.PigeonDiff = make();
})(this, function () {
  'use strict';

  /** Lines of a and b -> [{ t: ' ' | '-' | '+', s: line }], or null if it would take too long. */
  function lines(a, b, limit) {
    limit = limit || 4000;
    var n = a.length, m = b.length, max = n + m, off = max + 1;
    var v = new Int32Array(2 * max + 3), trace = [];
    for (var d = 0; d <= max; d++) {
      if (d > limit) return null;
      trace.push(v.slice());
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        var y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) return walk(trace, a, b, off, d);
      }
    }
    return null;
  }
  function walk(trace, a, b, off, d) {
    var out = [], x = a.length, y = b.length;
    for (; d > 0; d--) {
      var v = trace[d], k = x - y;
      var prevK = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? k + 1 : k - 1;
      var px = v[off + prevK], py = px - prevK;
      while (x > px && y > py) { out.push({ t: ' ', s: a[x - 1] }); x--; y--; }
      if (x === px) out.push({ t: '+', s: b[y - 1] }); else out.push({ t: '-', s: a[x - 1] });
      x = px; y = py;
    }
    while (x > 0 && y > 0) { out.push({ t: ' ', s: a[x - 1] }); x--; y--; }
    return out.reverse();
  }

  /** Group changes into hunks with `ctx` unchanged lines around each: [{ aStart, bStart, rows }] (line numbers from 0). */
  function hunks(ops, ctx) {
    ctx = ctx === undefined ? 3 : ctx;
    var changed = [], aAt = [], bAt = [], ai = 0, bi = 0, i;
    for (i = 0; i < ops.length; i++) {
      aAt.push(ai); bAt.push(bi);
      if (ops[i].t !== ' ') changed.push(i);
      if (ops[i].t !== '+') ai++;
      if (ops[i].t !== '-') bi++;
    }
    if (!changed.length) return [];
    var groups = [], s = changed[0], e = changed[0];
    for (i = 1; i < changed.length; i++) {
      if (changed[i] - e <= ctx * 2 + 1) e = changed[i];
      else { groups.push([s, e]); s = e = changed[i]; }
    }
    groups.push([s, e]);
    return groups.map(function (g) {
      var from = Math.max(0, g[0] - ctx), to = Math.min(ops.length - 1, g[1] + ctx);
      return { aStart: aAt[from], bStart: bAt[from], rows: ops.slice(from, to + 1) };
    });
  }

  /** a, b: whole texts. Returns { added, removed, hunks } or null when too different to show line by line. */
  function texts(a, b) {
    var A = String(a).split('\n'), B = String(b).split('\n');
    if (A.length + B.length > 60000) return null;
    var ops = lines(A, B);
    if (!ops) return null;
    var added = 0, removed = 0;
    ops.forEach(function (o) { if (o.t === '+') added++; else if (o.t === '-') removed++; });
    return { added: added, removed: removed, hunks: hunks(ops, 3) };
  }

  /** Looks like text (not a photo or a zip)? */
  function isText(bytes) {
    var n = Math.min(bytes.length, 8000), odd = 0;
    for (var i = 0; i < n; i++) { var c = bytes[i]; if (c === 0) return false; if (c < 9 || (c > 13 && c < 32)) odd++; }
    return odd < n * 0.02;
  }

  return { lines: lines, hunks: hunks, texts: texts, isText: isText };
});
