// Dice Cloud: your notes, Axiom, SereneTab, Dice Home, the Watch list, your desktop
// widgets and a few settings, the same on every computer running DiceOS or DiceWeb.
//
// Turning it on makes a Dice Cloud code (like 7K2QM-…). Type the same code on
// another computer, or add it with a short code shown on the TV, and they share.
// Everything is locked on this computer with that code (AES-GCM) before it goes to
// the website, so the website only keeps a scrambled box it can't open. Lose the
// code and the box can't be opened by anyone, us included.
//
// Inside the box:
//   sections  every part, item by item (each note, each Axiom task and class...), so
//             a change on the TV and a different change on the laptop both survive:
//             for each item, the newer change wins, and deleting is a change too
//   devices   the computers sharing it (name, kind, when last seen)
//   drops     Dice Drop: links and bits of text sent from one computer to another
//   removed   computers taken out of the list
//
// The website keeps the last few versions of the box, and only saves on top of the
// version this computer saw (If-Match), so two computers saving at once can't lose
// each other's changes. Checking for news is cheap (If-None-Match: 304 when there
// isn't any), so a link sent from the laptop shows up on the TV in seconds.
(function () {
  'use strict';
  const D = window.Dice, L = D.L;
  const C = D.cloud = { busy: false, error: '', LIMIT: 600 * 1024 };
  const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // no I, L, O or U: easy to read out and type
  const te = new TextEncoder(), td = new TextDecoder();
  const st = () => D.state.cloud || null;
  const pick = (o, keys) => { const out = {}; keys.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; };
  const rid = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
  const DAY = 86400000;

  // ---- what's shared, item by item ------------------------------------------------------------
  const notesDir = () => D.home() + '/notes';
  // your name decides your home folder, so a new name carries the folder with it (as in Settings)
  function setName(v) {
    if (!v || v === D.state.name) return;
    const was = D.user();
    D.state.name = v;
    const homes = L.walk(D.state.disk, '/home');
    if (homes && homes.kids[was] && was !== D.user() && !homes.kids[D.user()]) { homes.kids[D.user()] = homes.kids[was]; delete homes.kids[was]; }
  }
  // a part synced whole is one item, called _
  const whole = (get, set) => ({ whole: true, split: (v) => (v === null || v === undefined ? {} : { _: v }), items: () => { const v = get(); return v === null || v === undefined ? {} : { _: v }; }, put: (ch) => { if (ch._ !== undefined) set(ch._); } });
  const LOOK = ['name', 'avatar', 'look', 'world', 'cities'];
  const AX = ['classes', 'tasks', 'notes'];
  function axSplit(a) {
    const out = {};
    if (!a || typeof a !== 'object') return out;
    AX.forEach((k) => (Array.isArray(a[k]) ? a[k] : []).forEach((it, i) => {
      if (it && it.id) { const c = Object.assign({}, it); delete c.rang; out[k + ':' + it.id] = c; } else out[k + ':#' + i] = it;
    }));
    (Array.isArray(a.study) ? a.study : []).forEach((s) => { if (s && s.day) (out['study:' + s.day] = out['study:' + s.day] || []).push(s); });
    const rest = Object.assign({}, a);
    AX.concat(['study', 'digest', 'migrated']).forEach((k) => delete rest[k]);
    if (Object.keys(rest).length) out.rest = rest;
    return out;
  }
  function axPut(ch) {
    const a = D.state.axiom || (D.state.axiom = { classes: [], tasks: [], notes: [], theme: 'dawn' });
    AX.forEach((k) => { if (!Array.isArray(a[k])) a[k] = []; });
    a.migrated = true;
    for (const [key, v] of Object.entries(ch)) {
      if (key === 'rest') { if (v) Object.assign(a, v); continue; }
      const cut = key.indexOf(':'), list = key.slice(0, cut), id = key.slice(cut + 1);
      if (list === 'study') { a.study = (Array.isArray(a.study) ? a.study : []).filter((s) => s.day !== id).concat(Array.isArray(v) ? v : []); continue; }
      if (!AX.includes(list)) continue;
      const arr = a[list], i = id[0] === '#' ? -1 : arr.findIndex((x) => x && x.id === id);
      if (v === undefined) { if (i >= 0) arr.splice(i, 1); continue; }
      const item = Object.assign({}, v);
      if (i >= 0 && arr[i].rang) item.rang = true; // reminders already shown here stay shown
      if (i >= 0) arr[i] = item; else arr.push(item);
    }
  }
  // (settings first, so notes land in the right home folder)
  const SECTIONS = {
    settings: Object.assign(whole(() => pick(D.state, LOOK), (v) => { v = v || {}; setName(v.name); Object.assign(D.state, pick(v, LOOK.slice(1))); }),
      { name: 'Your name, picture and look', legacy: () => pick(D.state, ['name', 'look', 'world', 'cities']) }),
    notes: {
      name: 'Notes',
      split: (v) => (v && typeof v === 'object' ? Object.assign({}, v) : {}),
      items: () => { const n = L.walk(D.state.disk, notesDir()); return n && n.kids ? Object.fromEntries(Object.entries(n.kids).filter(([, v]) => v.type === 'file').map(([k, v]) => [k, v.text || ''])) : {}; },
      put: (ch) => {
        if (!L.walk(D.state.disk, notesDir())) L.makeDir(D.state.disk, notesDir());
        Object.entries(ch).forEach(([k, text]) => { if (text === undefined) L.remove(D.state.disk, notesDir() + '/' + k); else L.writeFile(D.state.disk, notesDir() + '/' + k, String(text)); });
      },
      legacy() { return this.items(); },
    },
    axiom: { name: 'Axiom', split: axSplit, items: () => axSplit(D.state.axiom), put: axPut, legacy: () => D.state.axiom || null },
    serenetab: Object.assign(whole(() => pick(D.state.st, ['shortcuts', 'engine', 'city', 'units', 'place', 'note']), (v) => { D.state.st = Object.assign(D.state.st || {}, v || {}); }),
      { name: 'SereneTab', legacy: () => pick(D.state.st, ['shortcuts', 'engine', 'city', 'units', 'place', 'note']) }),
    home: Object.assign(whole(() => D.state.home || null, (v) => { if (v) D.state.home = v; }), { name: 'Dice Home', legacy: () => D.state.home || null }),
    watch: Object.assign(whole(() => (Array.isArray(D.state.watch) ? D.state.watch : null), (v) => { if (Array.isArray(v)) D.state.watch = v; }), { name: 'The Watch list on DiceTV' }),
    widgets: Object.assign(whole(() => (Array.isArray(D.state.widgets) ? D.state.widgets : null), (v) => { if (Array.isArray(v)) D.state.widgets = v; }), { name: 'Desktop widgets and sticky notes' }),
    news: Object.assign(whole(() => (Array.isArray(D.state.news) ? D.state.news : null), (v) => { if (Array.isArray(v)) D.state.news = v; }), { name: 'News channels you added' }),
  };
  C.SECTIONS = SECTIONS;
  C.what = 'your notes, Axiom, SereneTab, Dice Home, the Watch list, your widgets, your name and the look';
  C.shares = (name) => { const c = st(); return !(c && c.skip && c.skip.includes(name)); };
  C.setShare = function (name, on) {
    const c = st(); if (!c) return;
    c.skip = (c.skip || []).filter((n) => n !== name);
    if (!on) c.skip.push(name);
    D.save(); C.soon(500);
  };

  // ---- the code and the lock ----------------------------------------------------------------------
  C.newCode = function () {
    const b = crypto.getRandomValues(new Uint8Array(20));
    return [...b].map((x) => ABC[x & 31]).join('').match(/.{5}/g).join('-');
  };
  C.clean = (code) => String(code || '').toUpperCase().replace(/[IL]/g, '1').replace(/O/g, '0').replace(/U/g, 'V').replace(/[^0-9A-Z]/g, '');
  C.valid = (code) => C.clean(code).length === 20 && [...C.clean(code)].every((ch) => ABC.includes(ch));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64 = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function derive(what, code) {
    const c = C.clean(code);
    const id = hex(await crypto.subtle.digest('SHA-256', te.encode('dice-' + what + '-id:' + c))).slice(0, 32);
    const raw = await crypto.subtle.digest('SHA-256', te.encode('dice-' + what + '-key:' + c));
    return { id, key: await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) };
  }
  const keys = (code) => derive('cloud', code);
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
  // the same thing always hashes the same, whatever order its keys are in
  const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  const hash = async (s) => hex(await crypto.subtle.digest('SHA-256', te.encode(s))).slice(0, 24);
  const url = (id) => D.origin + '/dice/cloud/' + id;
  const tagOf = (r) => (r.headers.get('ETag') || '').replace(/^W\//, '').replace(/"/g, '') || null;

  // ---- this computer ----------------------------------------------------------------------------------
  function defaultName() {
    if (D.sys && !(D.sys.info && D.sys.info.emulated)) {
      const s = D.sys.status || {}, m = s.model || '';
      return /raspberry/i.test(m) ? 'Raspberry Pi' : s.host || 'DiceOS';
    }
    if (D.sys) return 'The DiceOS emulator';
    const ua = navigator.userAgent;
    const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
    const os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'Chromebook' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iPad' : /Linux/.test(ua) ? 'Linux' : '';
    return b + (os ? ' on ' + os : '');
  }
  C.me = function () {
    const c = st();
    if (!c) return null;
    if (!c.device || !c.device.id) { c.device = { id: rid(), name: defaultName() }; D.save(); }
    return c.device;
  };
  C.rename = function (name) { const m = C.me(); if (!m || !name) return; m.name = String(name).trim().slice(0, 40) || m.name; D.save(); C.soon(300); };
  const myInfo = () => ({ name: C.me().name, kind: D.sys ? (D.sys.info && D.sys.info.emulated ? 'Emulator' : 'DiceOS') : 'DiceWeb', tv: !(D.desk && D.desk.on), v: D.sys ? D.sys.info.version : D.version, seen: Date.now() });
  C.devices = function () {
    const c = st();
    if (!c) return [];
    const all = Object.entries(c.devices || {}).map(([id, d]) => Object.assign({ id }, d));
    const me = C.me();
    if (!all.some((d) => d.id === me.id)) all.push(Object.assign({ id: me.id }, myInfo()));
    return all.map((d) => Object.assign(d, { me: d.id === me.id, name: d.id === me.id ? me.name : d.name })).sort((a, b) => (b.me - a.me) || (b.seen || 0) - (a.seen || 0));
  };
  // taking a computer out: it stops sharing next time it looks. (It still knows the code,
  // so for one that's lost or not yours any more, change the code too.)
  C.removeDevice = function (id) {
    const c = st(); if (!c) return;
    if (id === C.me().id) return C.turnOff(false);
    c.removing = (c.removing || []).concat([id]);
    log('Took ' + who(id) + ' out');
    if (c.devices) delete c.devices[id];
    D.save(); return C.sync();
  };

  // ---- the log: what happened lately, in words ------------------------------------------------------
  function log(text) {
    const c = st(); if (!c) return;
    c.log = [{ at: Date.now(), text }].concat(c.log || []).slice(0, 14);
  }
  const who = (id) => { const c = st(); return (c && c.devices && c.devices[id] && c.devices[id].name) || 'another computer'; };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

  // ---- syncing ----------------------------------------------------------------------------------------------
  // one sync at a time: asking while one is running waits for it, then goes again
  C.sync = function (opts) {
    if (C.busy && C.pending) return C.pending.then(() => C.sync(opts));
    C.pending = run(opts || {});
    return C.pending;
  };
  // the meta for a part: when each item last changed here, and what it looked like then
  async function metaOf(c, name, S) {
    c.meta = c.meta || {};
    let m = c.meta[name];
    if (m && m.items) return m;
    // from Dice Cloud 1, which kept one time for each whole part: if the part hasn't
    // changed since, its items keep that time, so newer changes elsewhere still win
    let at = Date.now();
    if (m && m.hash && S.legacy) { const old = S.legacy(); if ((await hash(JSON.stringify(old === undefined ? null : old))) === m.hash) at = m.at || 0; }
    else if (!m) at = null;
    m = c.meta[name] = { items: {}, from: at };
    return m;
  }
  // a part as it is in the box: v2 has items; v1 had the whole thing and one time
  function remoteItems(S, sec) {
    if (!sec) return {};
    if (sec.items) return sec.items;
    const out = {};
    Object.entries(S.split(sec.data)).forEach(([k, v]) => { out[k] = { at: sec.at || 0, data: v }; });
    return out;
  }

  async function run(opts) {
    const c = st();
    if (!c || !c.code) return false;
    if (!window.crypto || !crypto.subtle) { C.error = 'This browser can\'t lock things safely here (it needs https).'; D.emit('cloud'); return false; }
    C.busy = true; C.error = ''; D.emit('cloud');
    const now = Date.now(), me = C.me();
    try {
      const { id, key } = await keys(c.code);
      // 1. what changed on this computer since last time
      const local = {};
      let changed = 0;
      for (const [name, S] of Object.entries(SECTIONS)) {
        if (!C.shares(name)) continue;
        const items = S.items(), m = await metaOf(c, name, S);
        local[name] = items;
        for (const [k, v] of Object.entries(items)) {
          const hh = await hash(stable(v)), mi = m.items[k];
          if (!mi || mi.h !== hh) {
            // something new here; when joining (or the first time), what's already in Dice Cloud comes first
            m.items[k] = { h: hh, at: opts.joining ? 0 : mi || m.from === undefined ? now : m.from === null ? 0 : m.from };
            if (!opts.joining) changed++;
          }
        }
        if (!S.whole) for (const k of Object.keys(m.items)) if (!(k in items) && !m.items[k].gone) { m.items[k] = { h: null, at: now, gone: true }; changed++; }
        delete m.from;
      }
      const owe = changed || opts.force || opts.joining || opts.restore || !c.etag || (c.outbox || []).length || (c.removing || []).length || !c.devices || !c.devices[me.id] || now - (c.devices[me.id].seen || 0) > 6 * 3600000;

      // 2. what's in Dice Cloud (or just "nothing new", which is cheap)
      const r = await fetch(url(id), { cache: 'no-store', headers: !owe && c.etag ? { 'If-None-Match': '"' + c.etag + '"' } : {} });
      if (r.status === 304) { c.last = now; D.save(); return true; }
      let remote = { v: 2, sections: {} }, etag = null;
      if (r.status === 200) { etag = tagOf(r); remote = await unlock(key, await r.json()); }
      else if (r.status === 404 && opts.joining) throw new Error('There\'s nothing in Dice Cloud with that code. Check it and try again.');
      else if (r.status !== 404) throw new Error('The website answered ' + r.status + '.');
      if (opts.restore) remote = Object.assign({}, remote, { sections: opts.restore.sections || {} });
      remote.v = 2; remote.sections = remote.sections || {};

      // was this computer taken out of the list?
      remote.removed = remote.removed || {};
      if (remote.removed[me.id] && !opts.joining) {
        D.state.cloud = null; D.save(); D.emit('cloud');
        D.notify({ icon: 'cloud', c: '#3a9be8', title: 'Dice Cloud is off here', text: 'This computer was taken out of Dice Cloud on another one. Everything here stays.' });
        return false;
      }
      if (opts.joining) delete remote.removed[me.id];

      // 3. each item: the newer change wins
      let give = r.status === 404, took = 0, gave = 0;
      const tookFrom = {};
      for (const [name, S] of Object.entries(SECTIONS)) {
        if (!C.shares(name)) continue;
        const items = local[name], m = c.meta[name], rem = remoteItems(S, remote.sections[name]);
        if (remote.sections[name] && !remote.sections[name].items) give = true; // a Dice Cloud 1 part: send it back item by item
        const out = {}, ch = {};
        for (const k of new Set([...Object.keys(items), ...Object.keys(m.items), ...Object.keys(rem)])) {
          const R = rem[k], M = m.items[k];
          if (opts.restore && M && !R) { m.items[k] = { h: null, at: now, gone: true }; if (k in items) ch[k] = undefined; out[k] = { at: now, by: me.id, gone: true }; give = true; continue; }
          // the same time on both sides but not the same thing (two computers starting out
          // with their own copies): Dice Cloud's copy wins, so they end up the same
          const tie = R && M && R.at === M.at && !R.gone && !M.gone && k in items && M.h !== (await hash(stable(R.data)));
          if (R && (opts.restore || !M || R.at > M.at || tie)) {
            if (R.gone) { if (k in items) { ch[k] = undefined; took++; } m.items[k] = { h: null, at: opts.restore ? now : R.at, gone: true }; }
            else { ch[k] = R.data; m.items[k] = { h: null, at: opts.restore ? now : R.at }; took++; if (R.by && R.by !== me.id) tookFrom[R.by] = (tookFrom[R.by] || 0) + 1; }
            out[k] = opts.restore ? Object.assign({}, R, { at: now, by: me.id }) : R;
            if (opts.restore) give = true;
          } else if (M && (!R || M.at > R.at)) {
            if (M.gone && !R) continue; // never in Dice Cloud: nothing to say
            out[k] = M.gone ? { at: M.at, by: me.id, gone: true } : { at: M.at, by: me.id, data: items[k] };
            give = true; gave++;
          } else if (R) out[k] = R;
        }
        // deleted things are remembered for two months, then forgotten
        for (const k of Object.keys(out)) if (out[k].gone && now - out[k].at > 60 * DAY) delete out[k];
        for (const k of Object.keys(m.items)) if (m.items[k].gone && now - m.items[k].at > 60 * DAY) delete m.items[k];
        if (Object.keys(ch).length) {
          S.put(ch);
          const after = S.items();
          for (const k of Object.keys(ch)) if (ch[k] !== undefined && m.items[k]) m.items[k].h = k in after ? await hash(stable(after[k])) : null;
        }
        remote.sections[name] = { items: out };
      }

      // 4. the computers sharing it
      remote.devices = remote.devices || {};
      (c.removing || []).forEach((rid2) => { delete remote.devices[rid2]; remote.removed[rid2] = now; give = true; });
      Object.keys(remote.removed).forEach((k) => { if (now - remote.removed[k] > 90 * DAY) delete remote.removed[k]; });
      const mine = remote.devices[me.id], info = myInfo();
      if ((c.removing || []).includes(me.id)) { /* saying goodbye */ } else if (!mine || give || now - (mine.seen || 0) > 6 * 3600000 || mine.name !== info.name || mine.v !== info.v || mine.tv !== info.tv) { remote.devices[me.id] = info; give = true; }

      // 5. Dice Drop: things sent here, and things this computer is sending
      const seen = new Set(c.seenDrops || []), fresh = [];
      remote.drops = (remote.drops || []).filter((d) => now - d.at < 7 * DAY);
      remote.drops.forEach((d) => {
        if (d.from === me.id || seen.has(d.id) || (d.to !== me.id && d.to !== 'all')) return;
        seen.add(d.id); fresh.push(d);
      });
      const before = remote.drops.length;
      remote.drops = remote.drops.filter((d) => !(d.to === me.id && seen.has(d.id))); // delivered: gone from the box
      if (remote.drops.length !== before) give = true;
      const out = c.outbox || [];
      if (out.length) { remote.drops = remote.drops.concat(out).slice(-30); give = true; }

      // 6. save the box, only on top of the version we just read
      if (give) {
        const box = await lock(key, remote), body = JSON.stringify(box);
        if (body.length > C.LIMIT) throw new Error('There\'s too much to keep in Dice Cloud (the limit is about 600 KB). Turn off a part you don\'t need, or make your notes smaller.');
        const p = await fetch(url(id), { method: 'PUT', headers: Object.assign({ 'Content-Type': 'application/json' }, etag ? { 'If-Match': '"' + etag + '"' } : { 'If-None-Match': '*' }), body });
        if (p.status === 412 && (opts.tries || 0) < 4) {
          // another computer saved first: look again (what we took is kept), then try again
          C.busy = false;
          return run(Object.assign({}, opts, { tries: (opts.tries || 0) + 1, joining: false }));
        }
        if (!p.ok) throw new Error(p.status === 413 ? 'There\'s too much to keep in Dice Cloud (the limit is about 600 KB).' : 'The website answered ' + p.status + '.');
        const j = await p.json().catch(() => ({}));
        c.etag = j.etag || tagOf(p) || null;
        c.size = body.length;
        c.outbox = []; c.removing = [];
        if (out.length) log('Sent ' + (out.length === 1 ? (out[0].title || out[0].url || 'a note') : plural(out.length, 'thing')) + ' to ' + (out[0].to === 'all' ? 'every computer' : who(out[0].to)));
        if (gave && !opts.restore) log('Sent ' + plural(gave, 'change'));
      } else {
        c.etag = etag;
      }
      c.devices = remote.devices;
      c.seenDrops = [...seen].slice(-200);
      if (fresh.length) { c.inbox = fresh.slice().reverse().concat(c.inbox || []).slice(0, 40); fresh.forEach((d) => log('Got ' + (d.title || d.url || 'a note') + ' from ' + (d.fromName || who(d.from)))); }
      if (took && !opts.restore) {
        const froms = Object.keys(tookFrom);
        log('Got ' + plural(took, 'change') + (froms.length === 1 ? ' from ' + who(froms[0]) : opts.joining ? ' from Dice Cloud' : ''));
      }
      c.last = Date.now();
      D.save();
      if (took) { D.emit('disk'); D.emit('state', 'cloud'); D.emit('look'); D.applyLook(true); }
      fresh.forEach((d) => D.emit('drop', d));
      return true;
    } catch (e) {
      C.error = e && e.name === 'OperationError' ? 'That code doesn\'t open this box. Check it and try again.' : (e && e.message && !/fetch|network/i.test(e.message) ? e.message : 'Couldn\'t reach Dice Cloud. It needs the internet.');
      return false;
    } finally { C.busy = false; D.emit('cloud'); }
  }

  // ---- turning it on and off ---------------------------------------------------------------------------
  C.turnOn = async function (code) {
    const joining = !!code;
    const old = st();
    D.state.cloud = { code: joining ? C.clean(code).match(/.{5}/g).join('-') : C.newCode(), meta: {}, last: 0, device: (old && old.device) || null, log: [] };
    C.me();
    log(joining ? 'Joined Dice Cloud' : 'Turned on Dice Cloud');
    D.save();
    const ok = await C.sync({ joining });
    if (!ok && joining) { D.state.cloud = null; D.save(); }
    return ok;
  };
  C.turnOff = async function (forget) {
    const c = st();
    if (c && forget) { try { const { id } = await keys(c.code); await fetch(url(id), { method: 'DELETE' }); } catch (e) { /* it'll be tidied away in a year anyway */ } }
    else if (c) {
      // say goodbye, so the others stop listing this computer
      try { c.removing = [C.me().id]; await run({ force: true, bye: true }); } catch (e) { /* offline: it'll fade from the list */ }
    }
    D.state.cloud = null; D.save(); D.emit('cloud');
  };
  C.on = () => !!(st() && st().code);

  // A new code for everything (when a computer is lost, or the code got out). Every
  // computer still on the list has to be given the new code again.
  C.changeCode = async function () {
    const c = st(); if (!c) return false;
    const oldCode = c.code;
    const ok = await C.sync({ force: true });
    if (!ok) return false;
    try {
      const o = await keys(oldCode);
      const r = await fetch(url(o.id), { cache: 'no-store' });
      const box = await unlock(o.key, await r.json());
      box.devices = { [C.me().id]: myInfo() }; box.drops = []; box.removed = {};
      const code = C.newCode(), n = await keys(code);
      const put = await fetch(url(n.id), { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' }, body: JSON.stringify(await lock(n.key, box)) });
      if (!put.ok) throw new Error('The website answered ' + put.status + '.');
      await fetch(url(o.id), { method: 'DELETE' });
      c.code = code; c.etag = (await put.json().catch(() => ({}))).etag || null; c.devices = box.devices;
      log('Made a new code. The old one opens nothing now.');
      D.save(); D.emit('cloud');
      return true;
    } catch (e) { C.error = (e && e.message) || 'Couldn\'t change the code.'; D.emit('cloud'); return false; }
  };

  // ---- older versions (the website keeps the last few) ------------------------------------------------
  C.versions = async function () {
    const c = st(); if (!c) return [];
    const { id } = await keys(c.code);
    const r = await fetch(url(id) + '/history', { cache: 'no-store' });
    if (!r.ok) throw new Error('The website answered ' + r.status + '.');
    return ((await r.json()).versions || []).map((v) => Object.assign(v, { at: v.at * 1000 }));
  };
  // what an older version had, part by part (to show before going back to it)
  C.peek = async function (n) {
    const c = st(); const { id, key } = await keys(c.code);
    const r = await fetch(url(id) + '/history/' + n, { cache: 'no-store' });
    if (!r.ok) throw new Error('That version isn\'t kept any more.');
    const box = await unlock(key, await r.json());
    const counts = {};
    Object.entries(SECTIONS).forEach(([name, S]) => { counts[name] = Object.values(remoteItems(S, (box.sections || {})[name])).filter((x) => !x.gone).length; });
    return { box, counts };
  };
  C.restore = async function (n) {
    const { box } = await C.peek(n);
    const ok = await C.sync({ restore: { sections: box.sections || {} } });
    if (ok) { log('Went back to an older version'); D.save(); }
    return ok;
  };

  // ---- adding a computer with a short code -----------------------------------------------------------
  // On the new computer (often a TV, where typing 20 letters with a remote is no fun):
  // C.pairStart() shows an 8-letter code and waits. On a computer that already has
  // Dice Cloud, C.pairSend(that code) leaves the real code for it, locked with the short
  // one, for ten minutes at most.
  const pairUrl = (id) => D.origin + '/dice/cloud/pair/' + id;
  C.pairStart = function (onDone) {
    const b = crypto.getRandomValues(new Uint8Array(8));
    const short = [...b].map((x) => ABC[x & 31]).join('');
    const ctl = { code: short.slice(0, 4) + '-' + short.slice(4), stopped: false, until: Date.now() + 10 * 60000 };
    ctl.stop = () => { ctl.stopped = true; };
    (async () => {
      const { id, key } = await derive('pair', short);
      while (!ctl.stopped && Date.now() < ctl.until) {
        await new Promise((r) => setTimeout(r, 2500));
        if (ctl.stopped) return;
        try {
          const r = await fetch(pairUrl(id), { cache: 'no-store' });
          if (r.status !== 200) continue;
          const got = await unlock(key, await r.json());
          fetch(pairUrl(id), { method: 'DELETE' }).catch(() => {});
          if (!got || !C.valid(got.code)) continue;
          ctl.stopped = true;
          const ok = await C.turnOn(got.code);
          if (ok) log('Added by ' + (got.from || 'another computer'));
          onDone && onDone(ok, got.from);
          return;
        } catch (e) { /* offline for a moment, or not for us: keep waiting */ }
      }
      if (!ctl.stopped) onDone && onDone(false, null, 'time');
    })();
    return ctl;
  };
  C.pairSend = async function (short) {
    const c = st(); if (!c) return false;
    const clean = C.clean(short);
    if (clean.length !== 8) throw new Error('That code is 8 letters and numbers, like 7K2Q-M4XA.');
    const { id, key } = await derive('pair', clean);
    const r = await fetch(pairUrl(id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(await lock(key, { code: c.code, from: C.me().name })) });
    if (!r.ok) throw new Error('The website answered ' + r.status + '.');
    log('Added a computer with a short code');
    D.save();
    return true;
  };

  // ---- Dice Drop: send a link or a bit of text to another computer ----------------------------------
  C.send = async function (to, what) {
    const c = st(); if (!c) return false;
    const d = { id: rid(), from: C.me().id, fromName: C.me().name, to: to || 'all', at: Date.now(), title: String(what.title || '').slice(0, 200), url: what.url ? String(what.url).slice(0, 2000) : '', text: String(what.text || '').slice(0, 4000) };
    c.outbox = (c.outbox || []).concat([d]);
    D.save();
    return C.sync();
  };
  C.inbox = () => ((st() && st().inbox) || []);
  C.forget = function (dropId) { const c = st(); if (!c) return; c.inbox = (c.inbox || []).filter((d) => d.id !== dropId); D.save(); D.emit('cloud'); };
  // when something arrives: on DiceTV, ask right away; on the desktop, a notification
  C.open = function (d) {
    if (d.url) { if (D.app('browser')) D.launch('browser', { arg: d.url, swap: true }); else window.open(d.url, '_blank', 'noopener'); return; }
    D.launch('cloud', { arg: 'drop:' + d.id, swap: true });
  };
  D.on('drop', (d) => {
    const from = d.fromName || who(d.from);
    if (D.desk && D.desk.on) { D.notify({ icon: 'cloud', c: '#3a9be8', title: 'From ' + from, text: d.title || d.url || d.text.slice(0, 80) }); return; }
    if (D.booting || D.asleep) return;
    D.ask({ title: 'From ' + from, text: (d.title ? d.title + '\n' : '') + (d.url || d.text).slice(0, 300), buttons: [{ label: d.url ? 'Open it' : 'Show it', value: true, go: true }, { label: 'Later', value: false }] })
      .then((y) => { if (y) C.open(d); });
  });

  // ---- keeping up, quietly ------------------------------------------------------------------------------
  // soon after starting; a few seconds after anything changes here; a quick look for
  // news every 20 seconds while you're using it (every 2 minutes when it's hidden)
  let soonT = 0;
  C.soon = function (ms) { clearTimeout(soonT); soonT = setTimeout(() => { if (C.on() && !C.busy) C.sync(); }, ms || 6000); };
  const save0 = D.save;
  D.save = function () {
    const r = save0.apply(D, arguments);
    if (C.on() && !C.busy && !document.hidden) C.soon();
    return r;
  };
  setTimeout(() => { if (C.on()) C.sync(); }, 4000);
  let lastLook = 0;
  setInterval(() => {
    if (!C.on() || C.busy) return;
    const gap = document.hidden ? 120000 : 20000;
    if (Date.now() - Math.max(lastLook, (st().last || 0)) < gap) return;
    lastLook = Date.now();
    C.sync();
  }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && C.on() && Date.now() - (st().last || 0) > 15000) C.sync(); });
})();
