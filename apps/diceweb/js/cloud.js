// Dice Cloud: your notes, your Axiom planner, SereneTab's shortcuts and a few
// settings, the same on every computer running DiceOS or DiceWeb.
//
// Turning it on makes a Dice Cloud code (like 7K2QM-…). Type the same code on
// another computer and they share. Everything is locked on this computer with
// that code (AES-GCM) before it goes to the website, so the website only
// keeps a scrambled box it can't open. Lose the code and the box can't be
// opened by anyone, us included.
(function () {
  'use strict';
  const D = window.Dice, L = D.L;
  const C = D.cloud = { busy: false, error: '' };
  const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O or U: easy to read out and type
  const te = new TextEncoder(), td = new TextDecoder();
  const st = () => D.state.cloud || null;
  const pick = (o, keys) => { const out = {}; keys.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; };

  // what's shared, and how to put it back
  const notesDir = () => D.home() + '/notes';
  // your name decides your home folder, so a new name carries the folder with it (as in Settings)
  function setName(v) {
    if (!v || v === D.state.name) return;
    const was = D.user();
    D.state.name = v;
    const homes = L.walk(D.state.disk, '/home');
    if (homes && homes.kids[was] && was !== D.user() && !homes.kids[D.user()]) { homes.kids[D.user()] = homes.kids[was]; delete homes.kids[was]; }
  }
  // (settings first, so notes land in the right home folder)
  const SECTIONS = {
    settings: { get: () => pick(D.state, ['name', 'look', 'world', 'cities']), set: (v) => { v = v || {}; setName(v.name); Object.assign(D.state, pick(v, ['look', 'world', 'cities'])); } },
    notes: {
      get: () => { const n = L.walk(D.state.disk, notesDir()); return n && n.kids ? Object.fromEntries(Object.entries(n.kids).filter(([, v]) => v.type === 'file').map(([k, v]) => [k, v.text || ''])) : {}; },
      set: (v) => { if (!L.walk(D.state.disk, notesDir())) L.makeDir(D.state.disk, notesDir()); Object.entries(v || {}).forEach(([k, text]) => L.writeFile(D.state.disk, notesDir() + '/' + k, String(text))); },
    },
    axiom: { get: () => D.state.axiom || null, set: (v) => { if (v) D.state.axiom = v; } },
    serenetab: { get: () => pick(D.state.st, ['shortcuts', 'engine', 'city', 'units', 'place', 'note']), set: (v) => { D.state.st = Object.assign(D.state.st || {}, v || {}); } },
    home: { get: () => D.state.home || null, set: (v) => { if (v) D.state.home = v; } },
  };
  C.what = 'your notes, Axiom, SereneTab\'s shortcuts and note, Dice Home\'s buttons, your name, the look and the background';

  // ---- the code and the lock ----
  C.newCode = function () {
    const b = crypto.getRandomValues(new Uint8Array(20));
    const s = [...b].map((x) => ABC[x & 31]).join('');
    return s.match(/.{5}/g).join('-');
  };
  C.clean = (code) => String(code || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/[^0-9A-Z]/g, '');
  C.valid = (code) => C.clean(code).length === 20 && [...C.clean(code)].every((ch) => ABC.includes(ch));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function keys(code) {
    const c = C.clean(code);
    const id = hex(await crypto.subtle.digest('SHA-256', te.encode('dice-cloud-id:' + c))).slice(0, 32);
    const raw = await crypto.subtle.digest('SHA-256', te.encode('dice-cloud-key:' + c));
    return { id, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
  }
  async function lock(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, te.encode(JSON.stringify(obj)));
    return { v: 1, iv: b64(iv), ct: b64(ct) };
  }
  async function unlock(key, box) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
    return JSON.parse(td.decode(pt));
  }
  C.keys = keys; C.lock = lock; C.unlock = unlock; // for the tests
  const hash = async (s) => hex(await crypto.subtle.digest('SHA-256', te.encode(s))).slice(0, 24);
  const url = (id) => D.origin + '/dice/cloud/' + id;

  // ---- syncing: for each part, the newer side wins ----
  // one sync at a time: asking while one is running waits for it, then goes again
  C.sync = function (opts) {
    if (C.busy && C.pending) return C.pending.then(() => C.sync(opts));
    C.pending = run(opts);
    return C.pending;
  };
  async function run(opts) {
    opts = opts || {};
    const c = st();
    if (!c || !c.code) return false;
    if (!window.crypto || !crypto.subtle) { C.error = 'This browser can\'t lock things safely here (it needs https).'; D.emit('cloud'); return false; }
    C.busy = true; C.error = ''; D.emit('cloud');
    try {
      const { id, key } = await keys(c.code);
      let remote = { sections: {} };
      const r = await fetch(url(id), { cache: 'no-store' });
      if (r.status === 200) remote = await unlock(key, await r.json());
      else if (r.status === 404 && opts.joining) throw new Error('There\'s nothing in Dice Cloud with that code. Check it and try again.');
      else if (r.status !== 404) throw new Error('The website answered ' + r.status + '.');
      c.meta = c.meta || {};
      let took = false, give = false;
      for (const [name, s] of Object.entries(SECTIONS)) {
        const local = s.get(), h = await hash(JSON.stringify(local === undefined ? null : local));
        const m = c.meta[name] || (c.meta[name] = { hash: null, at: 0 });
        if (m.hash !== h && !opts.joining) { m.hash = h; m.at = Date.now(); }
        const rs = remote.sections && remote.sections[name];
        if (rs && (opts.joining || rs.at > m.at)) { s.set(rs.data); m.hash = await hash(JSON.stringify(s.get() === undefined ? null : s.get())); m.at = rs.at; took = true; }
        else if (!rs || m.at > rs.at) { if (local !== null) { (remote.sections = remote.sections || {})[name] = { at: m.at || Date.now(), data: local }; give = true; } }
      }
      if (give || r.status === 404) {
        const box = await lock(key, remote);
        const p = await fetch(url(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(box) });
        if (!p.ok) throw new Error(p.status === 413 ? 'There\'s too much to keep in Dice Cloud (the limit is about 500 KB).' : 'The website answered ' + p.status + '.');
      }
      c.last = Date.now();
      D.save();
      if (took) { D.emit('disk'); D.emit('state', 'cloud'); D.applyLook(true); }
      return true;
    } catch (e) {
      C.error = e && e.name === 'OperationError' ? 'That code doesn\'t open this box. Check it and try again.' : (e && e.message) || 'Couldn\'t reach Dice Cloud. It needs the internet.';
      return false;
    } finally { C.busy = false; D.emit('cloud'); }
  }
  C.turnOn = async function (code) {
    const joining = !!code;
    D.state.cloud = { code: joining ? C.clean(code).match(/.{5}/g).join('-') : C.newCode(), meta: {}, last: 0 };
    D.save();
    const ok = await C.sync({ joining });
    if (!ok && joining) { D.state.cloud = null; D.save(); }
    return ok;
  };
  C.turnOff = async function (forget) {
    const c = st();
    if (c && forget) { try { const { id } = await keys(c.code); await fetch(url(id), { method: 'DELETE' }); } catch (e) { /* it'll be tidied away in a year anyway */ } }
    D.state.cloud = null; D.save(); D.emit('cloud');
  };
  C.on = () => !!(st() && st().code);

  // quietly keep up: soon after starting, every few minutes, and when you come back to the window
  setTimeout(() => { if (C.on()) C.sync(); }, 4000);
  setInterval(() => { if (C.on() && !document.hidden) C.sync(); }, 3 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C.on() && Date.now() - (st().last || 0) > 60000) C.sync(); });
})();
