// gossip's end-to-end encryption, for the browser: the same as gossip's src/e2e.js, so DiceOS's gossip
// and gossip in Terminal can talk to each other through the same relay.
//
//   identity key   Ed25519            (the browser's WebCrypto)
//   exchange key   X25519             (WebCrypto)
//   message body   ChaCha20-Poly1305  (below: WebCrypto doesn't have it)
//   key wrapping   X25519 + HKDF-SHA256, one wrap per recipient
//
// Private keys never leave this computer. Tested against gossip's own code in test/gossip.test.js.
(function (root) {
  'use strict';
  const subtle = (root.crypto || globalThis.crypto).subtle;
  const rnd = (n) => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));
  const enc = new TextEncoder(), dec = new TextDecoder();
  const DH_CONTEXT = 'gossip/v1/dh-key\n';

  // ---- base64url ---------------------------------------------------------------------------------------------------
  function b64(u8) { let s = ''; u8 = new Uint8Array(u8); for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  const cat = (...xs) => { const n = xs.reduce((a, x) => a + x.length, 0), out = new Uint8Array(n); let o = 0; xs.forEach((x) => { out.set(x, o); o += x.length; }); return out; };
  const sha256 = async (...parts) => new Uint8Array(await subtle.digest('SHA-256', cat(...parts.map((p) => (typeof p === 'string' ? enc.encode(p) : p)))));

  // ---- ChaCha20-Poly1305 (RFC 8439) ----------------------------------------------------------------------------------
  const rotl = (v, c) => (v << c) | (v >>> (32 - c));
  function qr(s, a, b, c, d) {
    s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 16); s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 12);
    s[a] = (s[a] + s[b]) | 0; s[d] = rotl(s[d] ^ s[a], 8); s[c] = (s[c] + s[d]) | 0; s[b] = rotl(s[b] ^ s[c], 7);
  }
  const le32 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24);
  function block(key, counter, nonce) {
    const st = new Int32Array([0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, le32(key, 0), le32(key, 4), le32(key, 8), le32(key, 12), le32(key, 16), le32(key, 20), le32(key, 24), le32(key, 28), counter | 0, le32(nonce, 0), le32(nonce, 4), le32(nonce, 8)]);
    const w = st.slice();
    for (let i = 0; i < 10; i++) { qr(w, 0, 4, 8, 12); qr(w, 1, 5, 9, 13); qr(w, 2, 6, 10, 14); qr(w, 3, 7, 11, 15); qr(w, 0, 5, 10, 15); qr(w, 1, 6, 11, 12); qr(w, 2, 7, 8, 13); qr(w, 3, 4, 9, 14); }
    const out = new Uint8Array(64);
    for (let i = 0; i < 16; i++) { const v = (w[i] + st[i]) | 0; out[i * 4] = v & 255; out[i * 4 + 1] = (v >>> 8) & 255; out[i * 4 + 2] = (v >>> 16) & 255; out[i * 4 + 3] = (v >>> 24) & 255; }
    return out;
  }
  function chacha(key, counter, nonce, data) {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 64) { const ks = block(key, counter + i / 64, nonce); for (let j = 0; j < 64 && i + j < data.length; j++) out[i + j] = data[i + j] ^ ks[j]; }
    return out;
  }
  const leBig = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i]); return n; };
  function poly1305(key, msg) {
    const r = leBig(key.subarray(0, 16)) & 0x0ffffffc0ffffffc0ffffffc0fffffffn, s = leBig(key.subarray(16, 32)), p = (1n << 130n) - 5n;
    let acc = 0n;
    for (let i = 0; i < msg.length; i += 16) { const c = msg.subarray(i, i + 16); acc = ((acc + leBig(c) + (1n << BigInt(8 * c.length))) * r) % p; }
    acc = (acc + s) & ((1n << 128n) - 1n);
    const out = new Uint8Array(16);
    for (let i = 0; i < 16; i++) { out[i] = Number(acc & 255n); acc >>= 8n; }
    return out;
  }
  const pad16 = (n) => new Uint8Array((16 - (n % 16)) % 16);
  const le64 = (n) => { const b = new Uint8Array(8); let v = BigInt(n); for (let i = 0; i < 8; i++) { b[i] = Number(v & 255n); v >>= 8n; } return b; };
  const macData = (aad, ct) => cat(aad, pad16(aad.length), ct, pad16(ct.length), le64(aad.length), le64(ct.length));
  function aeadSeal(key, nonce, plain, aad) {
    const ct = chacha(key, 1, nonce, plain);
    return cat(ct, poly1305(block(key, 0, nonce).subarray(0, 32), macData(aad, ct)));
  }
  function aeadOpen(key, nonce, boxed, aad) {
    if (boxed.length < 16) throw Object.assign(new Error('bad_ciphertext'), { code: 'bad_ciphertext' });
    const ct = boxed.subarray(0, boxed.length - 16), tag = boxed.subarray(boxed.length - 16);
    const want = poly1305(block(key, 0, nonce).subarray(0, 32), macData(aad, ct));
    let diff = 0; for (let i = 0; i < 16; i++) diff |= want[i] ^ tag[i];
    if (diff) throw Object.assign(new Error('bad_ciphertext'), { code: 'bad_ciphertext' });
    return chacha(key, 1, nonce, ct);
  }

  // ---- keys ----------------------------------------------------------------------------------------------------------
  const pub = (crv, x) => subtle.importKey('jwk', { kty: 'OKP', crv, x }, { name: crv }, true, crv === 'Ed25519' ? ['verify'] : []);
  const priv = (crv, x, d) => subtle.importKey('jwk', { kty: 'OKP', crv, x, d }, { name: crv }, false, crv === 'Ed25519' ? ['sign'] : ['deriveBits']);
  async function createIdentity() {
    const s = await subtle.exportKey('jwk', (await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])).privateKey);
    const d = await subtle.exportKey('jwk', (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])).privateKey);
    const id = { signPub: s.x, signKey: s.d, dhPub: d.x, dhKey: d.d };
    id.dhSig = await signText(id, DH_CONTEXT + id.dhPub);
    return id;
  }
  async function signBytes(identity, bytes) { return b64(await subtle.sign('Ed25519', await priv('Ed25519', identity.signPub, identity.signKey), bytes)); }
  const signText = (identity, text) => signBytes(identity, enc.encode(text));
  async function verifyBytes(signPub, bytes, sig) {
    try { if (!/^[A-Za-z0-9_-]{86}$/.test(sig || '')) return false; return await subtle.verify('Ed25519', await pub('Ed25519', signPub), unb64(sig), bytes); } catch (e) { return false; }
  }
  const verifyText = (signPub, text, sig) => verifyBytes(signPub, enc.encode(text), sig);
  const bundleOf = (id) => ({ signPub: id.signPub, dhPub: id.dhPub, dhSig: id.dhSig });
  async function validBundle(b) {
    if (!b || !/^[A-Za-z0-9_-]{43}$/.test(b.signPub || '') || !/^[A-Za-z0-9_-]{43}$/.test(b.dhPub || '')) return false;
    return verifyText(b.signPub, DH_CONTEXT + b.dhPub, b.dhSig);
  }
  const authProof = (identity, nonce, name) => signText(identity, 'gossip/v1/auth\n' + nonce + '\n' + name);
  async function dh(privX, privD, pubX) { return new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: await pub('X25519', pubX) }, await priv('X25519', privX, privD), 256)); }
  async function wrapKeyFor(shared, ephRaw, recipientRaw, id, name) {
    const salt = await sha256(ephRaw, recipientRaw);
    const k = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    const okm = new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('gossip/v1/wrap\n' + id + '\n' + name) }, k, 44 * 8));
    return { key: okm.subarray(0, 32), nonce: okm.subarray(32, 44) };
  }
  const aadFor = (env, senderSignPub) => enc.encode(['gossip/v1/msg', env.id, env.from, senderSignPub, env.conv, String(env.ts), env.eph].join('\n'));
  const transcript = (aad, nonce, ct) => sha256('gossip/v1/sig\n', aad, '\n', nonce, ct);
  const randomId = () => b64(rnd(12));

  // payload → a sealed envelope for everyone in recipients [{ name, dhPub }]
  async function seal({ identity, from, conv, recipients, payload, id, ts }) {
    const eph = await subtle.exportKey('jwk', (await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])).privateKey);
    const env = { v: 1, id: id || randomId(), from, conv, ts: ts || Date.now(), eph: eph.x };
    const aad = aadFor(env, identity.signPub);
    const messageKey = rnd(32), nonce = rnd(12);
    const ct = aeadSeal(messageKey, nonce, enc.encode(JSON.stringify(payload)), aad);
    env.n = b64(nonce); env.ct = b64(ct); env.keys = {};
    for (const r of recipients) {
      const w = await wrapKeyFor(await dh(eph.x, eph.d, r.dhPub), unb64(eph.x), unb64(r.dhPub), env.id, r.name);
      env.keys[r.name] = b64(aeadSeal(w.key, w.nonce, messageKey, aad));
    }
    env.sig = await signBytes(identity, await transcript(aad, nonce, ct));
    return env;
  }
  // an envelope for `me` → the payload. senderSignPub comes from YOUR People, never the envelope.
  async function open({ identity, me, env, senderSignPub }) {
    const err = (code) => Object.assign(new Error(code), { code });
    if (!env || env.v !== 1 || !env.keys) throw err('bad_envelope');
    const aad = aadFor(env, senderSignPub), nonce = unb64(env.n), ct = unb64(env.ct);
    if (!(await verifyBytes(senderSignPub, await transcript(aad, nonce, ct), env.sig))) throw err('bad_signature');
    const wrapped = Object.prototype.hasOwnProperty.call(env.keys, me) ? env.keys[me] : null;
    if (!wrapped) throw err('not_for_me');
    const w = await wrapKeyFor(await dh(identity.dhPub, identity.dhKey, env.eph), unb64(env.eph), unb64(identity.dhPub), env.id, me);
    const messageKey = aeadOpen(w.key, w.nonce, unb64(wrapped), aad);
    try { return JSON.parse(dec.decode(aeadOpen(messageKey, nonce, ct, aad))); } catch (e) { throw e.code ? e : err('bad_payload'); }
  }
  // the numbers two people compare to be sure nobody swapped a key
  async function safetyNumber(a, b) {
    const [x, y] = [a, b].sort(), hsh = await sha256('gossip/v1/safety\n' + x + '\n' + y), out = [];
    for (let i = 0; i < 6; i++) { let v = 0; for (let j = 0; j < 5; j++) v = v * 256 + hsh[i * 5 + j]; out.push(String(v % 100000).padStart(5, '0')); }
    return out.join(' ');
  }
  const dmConv = (a, b) => (a < b ? 'dm:' + a + ':' + b : 'dm:' + b + ':' + a);
  const api = { b64, unb64, aeadSeal, aeadOpen, createIdentity, bundleOf, validBundle, signText, verifyText, authProof, seal, open, safetyNumber, randomId, dmConv,
    NAME_RE: /^[a-z0-9][a-z0-9_-]{2,19}$/, RESERVED: ['you', 'me', 'system', 'server', 'admin', 'gossip', 'everyone', 'all', 'here', 'root', 'support', 'home', 'help', 'null', 'undefined'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GossipCrypto = api;
})(typeof window !== 'undefined' ? window : globalThis);
