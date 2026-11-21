/* pigeon's wire: how every request travels to a pigeon website, sealed.
 *
 * HTTPS already scrambles traffic on the way, but anything that opens HTTPS up
 * in the middle (a company or school network that inspects it, a proxy that
 * keeps logs, the host's own access logs) could still read what was asked:
 * which file, which device, the login proof. So pigeon seals each request
 * itself, with keys only your device and your pigeon site know:
 *
 *   - Once per run, your device and the site agree on fresh keys with a
 *     Diffie-Hellman handshake (the 2048-bit group from RFC 3526). The site's
 *     half is fixed, and pigeon remembers it the first time (like SSH does),
 *     so a stand-in can't swap it later without pigeon noticing.
 *   - Every request then goes to the same address (/api/w) as one scrambled
 *     blob: what you asked, your sign-in, everything. The answer comes back the
 *     same way. Watching the wire shows only sizes and times.
 *   - The scrambling is HMAC-SHA256 in counter mode, with an HMAC-SHA256 seal
 *     on top (encrypt-then-MAC), because it works the same with nothing to
 *     install in Python (the site), Node (your terminal) and any browser.
 *   - Each message carries a fresh random number and the time, so an old
 *     message can't be played back later.
 *
 * Your files were already locked before this (AES-256-GCM on your device, see
 * crypto.js); this hides the conversation around them too.
 *
 * One file for Node and the browser: in Node it's a module, in a web page it
 * sets window.PigeonWire.
 */
(function (root, make) {
  if (typeof module === 'object' && module.exports) module.exports = make(require('crypto'));
  else root.PigeonWire = make(null);
})(this, function (nodeCrypto) {
  'use strict';

  var P = BigInt('0x' +
    'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183995497CEA956AE515D2261898FA051015728E5A8AACAA68FFFFFFFFFFFFFFFF');
  var G = BigInt(2);
  var GROUP_BYTES = 256;
  var SKEW_MS = 15 * 60 * 1000;
  var enc = new TextEncoder(), dec = new TextDecoder();

  // ── bytes ──
  function random(n) {
    if (nodeCrypto) return new Uint8Array(nodeCrypto.randomBytes(n));
    var a = new Uint8Array(n); crypto.getRandomValues(a); return a;
  }
  function concat(list) {
    var n = 0, i, o = 0;
    for (i = 0; i < list.length; i++) n += list[i].length;
    var out = new Uint8Array(n);
    for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
    return out;
  }
  function view(b) {
    if (!b) return new Uint8Array(0);
    if (b instanceof ArrayBuffer) return new Uint8Array(b);
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  function hex(a) { var s = ''; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16); return s; }
  function unhex(s) { var a = new Uint8Array(s.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(s.substr(i * 2, 2), 16); return a; }
  function u32(n) { return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }
  function readU32(a, o) { return ((a[o] << 24) >>> 0) + (a[o + 1] << 16) + (a[o + 2] << 8) + a[o + 3]; }
  function same(a, b) { if (a.length !== b.length) return false; var d = 0; for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
  function toBig(a) { return a.length ? BigInt('0x' + hex(a)) : BigInt(0); }
  function fromBig(n, len) { var h = n.toString(16); while (h.length < len * 2) h = '0' + h; return unhex(h); }

  // ── SHA-256 and HMAC, written out so they run anywhere, synchronously ──
  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var W = new Int32Array(64);
  /** One 64-byte block (at offset o of bytes `m`) into the state `h` (Int32Array(8)). */
  function compress(h, m, o) {
    var i, t1, t2;
    for (i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
    for (i = 16; i < 64; i++) {
      var a = W[i - 15], b = W[i - 2];
      var s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      var s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    var A = h[0], B = h[1], C = h[2], D = h[3], E = h[4], F = h[5], GG = h[6], H = h[7];
    for (i = 0; i < 64; i++) {
      t1 = (H + (((E >>> 6) | (E << 26)) ^ ((E >>> 11) | (E << 21)) ^ ((E >>> 25) | (E << 7))) + ((E & F) ^ (~E & GG)) + K[i] + W[i]) | 0;
      t2 = ((((A >>> 2) | (A << 30)) ^ ((A >>> 13) | (A << 19)) ^ ((A >>> 22) | (A << 10))) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
      H = GG; GG = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
    }
    h[0] = (h[0] + A) | 0; h[1] = (h[1] + B) | 0; h[2] = (h[2] + C) | 0; h[3] = (h[3] + D) | 0;
    h[4] = (h[4] + E) | 0; h[5] = (h[5] + F) | 0; h[6] = (h[6] + GG) | 0; h[7] = (h[7] + H) | 0;
  }
  function out32(h) { var o = new Uint8Array(32); for (var i = 0; i < 8; i++) { o[i * 4] = h[i] >>> 24; o[i * 4 + 1] = h[i] >>> 16; o[i * 4 + 2] = h[i] >>> 8; o[i * 4 + 3] = h[i]; } return o; }
  /** SHA-256 of `m`, continuing from state `h` that has already taken in `done` bytes. */
  function finish(h, m, done) {
    var full = m.length - (m.length % 64), i;
    for (i = 0; i < full; i += 64) compress(h, m, i);
    var rest = m.length - full, total = (done + m.length) * 8;
    var tail = new Uint8Array(rest < 56 ? 64 : 128);
    tail.set(m.subarray(full)); tail[rest] = 0x80;
    var hi = Math.floor(total / 4294967296), lo = total >>> 0, L = tail.length;
    tail[L - 8] = hi >>> 24; tail[L - 7] = hi >>> 16; tail[L - 6] = hi >>> 8; tail[L - 5] = hi;
    tail[L - 4] = lo >>> 24; tail[L - 3] = lo >>> 16; tail[L - 2] = lo >>> 8; tail[L - 1] = lo;
    for (i = 0; i < tail.length; i += 64) compress(h, tail, i);
    return out32(h);
  }
  function sha256(m) { return finish(Int32Array.from(IV), m, 0); }

  /** An HMAC-SHA256 key, with its two padded blocks already taken in (fast for many short messages). */
  function HmacKey(key) {
    if (key.length > 64) key = sha256(key);
    var ip = new Uint8Array(64), op = new Uint8Array(64);
    for (var i = 0; i < 64; i++) { ip[i] = (key[i] || 0) ^ 0x36; op[i] = (key[i] || 0) ^ 0x5c; }
    this.inner = Int32Array.from(IV); compress(this.inner, ip, 0);
    this.outer = Int32Array.from(IV); compress(this.outer, op, 0);
  }
  HmacKey.prototype.mac = function (m) {
    var inner = finish(Int32Array.from(this.inner), m, 64);
    return finish(Int32Array.from(this.outer), inner, 64);
  };
  function hmac(key, m) { return new HmacKey(key).mac(m); }

  /** The scrambling: XOR with HMAC(key, nonce || counter) blocks. The same call unscrambles. */
  function stream(hk, nonce, data) {
    var out = new Uint8Array(data.length), blk = new Uint8Array(20), n = 0;
    blk.set(nonce);
    for (var o = 0; o < data.length; o += 32) {
      blk[16] = n >>> 24; blk[17] = n >>> 16; blk[18] = n >>> 8; blk[19] = n; n++;
      var ks = hk.mac(blk), end = Math.min(32, data.length - o);
      for (var i = 0; i < end; i++) out[o + i] = data[o + i] ^ ks[i];
    }
    return out;
  }

  /** HKDF-SHA256 (RFC 5869). */
  function hkdf(ikm, salt, info, len) {
    var prk = hmac(salt, ikm), hk = new HmacKey(prk), out = [], prev = new Uint8Array(0), got = 0;
    for (var i = 1; got < len; i++) { prev = hk.mac(concat([prev, info, new Uint8Array([i])])); out.push(prev); got += prev.length; }
    return concat(out).subarray(0, len);
  }

  function modpow(b, e, m) {
    var r = BigInt(1); b %= m;
    while (e > BigInt(0)) { if (e & BigInt(1)) r = (r * b) % m; e >>= BigInt(1); b = (b * b) % m; }
    return r;
  }

  /** Both sides' keys from the shared secret. */
  function keysFrom(secret, yc, ys) {
    var k = hkdf(fromBig(secret, GROUP_BYTES), enc.encode('pigeon-wire-1'), concat([yc, ys]), 128);
    return { cEnc: new HmacKey(k.subarray(0, 32)), cMac: new HmacKey(k.subarray(32, 64)), sEnc: new HmacKey(k.subarray(64, 96)), sMac: new HmacKey(k.subarray(96, 128)) };
  }

  /** A site's public half, checked: a hex number strictly between 1 and p-1. */
  function serverHalf(h) {
    if (!/^[0-9a-f]{512}$/i.test(String(h || ''))) throw new WireError("This pigeon site didn't send a usable key.", 0, 'nokey');
    var y = BigInt('0x' + h);
    if (y <= BigInt(1) || y >= P - BigInt(1)) throw new WireError("This pigeon site didn't send a usable key.", 0, 'nokey');
    return fromBig(y, GROUP_BYTES);
  }
  /** A short fingerprint of a site's key, to remember it. */
  function fingerprint(h) { return hex(sha256(serverHalf(h))).slice(0, 32); }

  function WireError(msg, status, code) { var e = new Error(msg); e.status = status || 0; e.code = code || ''; e.name = 'WireError'; return e; }

  /**
   * A conversation with one pigeon site.
   *   new Wire({ url: 'https://site/pigeon/api/w', serverKey: '<hex>', fetch })
   *   await wire.call('list', {}, { token, raw }) -> { result, raw }
   */
  function Wire(o) {
    this.url = o.url;
    this.ys = serverHalf(o.serverKey);
    this.fetch = o.fetch || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    this.timeout = o.timeout || 60000;
    this.ch = null;
  }
  Wire.prototype.channel = function () {
    if (this.ch) return this.ch;
    var x = toBig(random(32)) | BigInt(1);
    var yc = fromBig(modpow(G, x, P), GROUP_BYTES);
    var keys = keysFrom(modpow(toBig(this.ys), x, P), yc, this.ys);
    this.ch = { yc: yc, cid: sha256(yc).subarray(0, 16), keys: keys, open: false };
    return this.ch;
  };
  /** Seal one request. Returns { frame, nonce, ch }. */
  Wire.prototype.seal = function (what, msg, token, raw) {
    var ch = this.channel();
    var body = { a: what, m: msg || {}, t: Date.now() };
    if (token) body.k = token;
    var nonce = random(16);
    var ct = stream(ch.keys.cEnc, nonce, enc.encode(JSON.stringify(body)));
    var head = concat([ch.open ? enc.encode('N') : enc.encode('O'), ch.open ? ch.cid : ch.yc, nonce, u32(ct.length), ct]);
    var tag = ch.keys.cMac.mac(head);
    return { frame: concat([head, tag, view(raw)]), nonce: nonce, ch: ch };
  };
  /** Open a sealed answer. */
  Wire.prototype.open = function (bytes, sent) {
    var ch = sent.ch;
    if (bytes.length < 53 || bytes[0] !== 82 /* R */) throw WireError("pigeon's website sent something unexpected.", 502, 'bad');
    var nonce = bytes.subarray(1, 17), len = readU32(bytes, 17);
    if (21 + len + 32 > bytes.length) throw WireError("pigeon's website sent something unexpected.", 502, 'bad');
    var head = bytes.subarray(0, 21 + len), tag = bytes.subarray(21 + len, 53 + len);
    if (!same(ch.keys.sMac.mac(concat([sent.nonce, head])), tag)) throw WireError("An answer from the website didn't check out, so pigeon ignored it.", 502, 'tag');
    var obj = JSON.parse(dec.decode(stream(ch.keys.sEnc, nonce, bytes.subarray(21, 21 + len))));
    return { obj: obj, raw: bytes.subarray(53 + len) };
  };
  Wire.prototype.call = function (what, msg, opts) {
    opts = opts || {};
    var self = this;
    var tries = 0;
    function go() {
      var sent = self.seal(what, msg, opts.token, opts.raw);
      var ac = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ac ? setTimeout(function () { ac.abort(); }, opts.timeout || self.timeout) : null;
      if (opts.signal && ac) opts.signal.addEventListener('abort', function () { ac.abort(); });
      return self.fetch(self.url, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: sent.frame, signal: ac ? ac.signal : undefined, cache: 'no-store' })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          var type = res.headers.get('content-type') || '';
          if (type.indexOf('application/x-pigeon') < 0) {
            return res.text().then(function (t) {
              var j = {}; try { j = JSON.parse(t); } catch (e) { /* not JSON */ }
              if (j.wire === 'again' && tries++ < 1) { self.ch = null; return go(); } // the site forgot this channel (it restarted): start a new one
              throw WireError(j.error || ('The site answered ' + res.status + '.'), res.status, j.wire || 'http');
            });
          }
          return res.arrayBuffer().then(function (buf) {
            var r = self.open(new Uint8Array(buf), sent);
            sent.ch.open = true;
            if (r.obj.s >= 400) throw WireError(r.obj.e || 'The site answered ' + r.obj.s + '.', r.obj.s, r.obj.c || '');
            return { result: r.obj.r, raw: r.raw };
          });
        }, function (e) {
          if (timer) clearTimeout(timer);
          if (opts.signal && opts.signal.aborted) throw e;
          var why = e && e.name === 'AbortError' ? 'it took too long' : (e && e.cause && (e.cause.code || e.cause.message)) || (e && e.message) || 'no answer';
          throw WireError("Couldn't reach the pigeon website (" + why + '). Check your internet connection.', 0, 'net');
        });
    }
    return go();
  };

  return {
    Wire: Wire, WireError: WireError, sha256: sha256, hmac: hmac, HmacKey: HmacKey, stream: stream, hkdf: hkdf,
    modpow: modpow, concat: concat, view: view, fingerprint: fingerprint, serverHalf: serverHalf, hex: hex, unhex: unhex, P: P, G: G, SKEW_MS: SKEW_MS,
  };
});
