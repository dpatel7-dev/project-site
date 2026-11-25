// Dice Cloud Drive: your files in Dice Cloud (photos, songs, videos, documents), the same
// on every computer and TV that shares your Dice Cloud.
//
// Each file is cut into parts of 4 MB, and each part is locked here, before it leaves,
// with a key made just for that file (AES-GCM). The website keeps numbered, scrambled
// parts and nothing else. Which parts make which file, the files' names and folders and
// their keys are in the list of files, and that list travels inside your locked Dice
// Cloud box like your notes do (item by item, so two computers adding files at once
// both keep theirs).
//
// Sharing one file makes a link with that file's key after the #. Browsers never send
// that part to the website, so the website still can't open it; whoever has the link can.
(function () {
  'use strict';
  const D = window.Dice, C = D.cloud;
  const CHUNK = 4000000;
  const F = D.drive = { uploads: [], CHUNK };
  const st = () => D.state.drive || (D.state.drive = { items: {} });
  const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const b64u = (a) => btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', heic: 'image/heic', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac', opus: 'audio/ogg', aac: 'audio/aac',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html', pdf: 'application/pdf', zip: 'application/zip' };
  F.typeOf = (name, given) => given || TYPES[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';
  F.kind = (it) => { const t = it.type || F.typeOf(it.name); return /^image\//.test(t) ? 'photo' : /^video\//.test(t) ? 'video' : /^audio\//.test(t) ? 'song' : /^text\/|json|pdf/.test(t) ? 'doc' : 'file'; };
  F.size = (n) => (n < 1024 ? n + ' bytes' : n < 1048576 ? Math.round(n / 1024) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');

  // ---- the list of files ---------------------------------------------------------------------------
  // items: 'f:<id>' a file {name, dir, size, type, mod, at, key, parts, thumb, by}; 'd:<path>' a folder
  const norm = (dir) => { const p = '/' + String(dir || '/').split('/').filter((x) => x && x !== '.' && x !== '..').join('/'); return p; };
  F.norm = norm;
  const parent = (dir) => norm(dir.split('/').slice(0, -1).join('/'));
  F.on = () => !!(C && C.on());
  F.files = () => Object.entries(st().items).filter(([k, v]) => k.startsWith('f:') && v).map(([k, v]) => Object.assign({ id: k.slice(2) }, v));
  F.item = (id) => { const v = st().items['f:' + id]; return v ? Object.assign({ id }, v) : null; };
  F.find = (dir, name) => F.files().find((f) => norm(f.dir) === norm(dir) && f.name.toLowerCase() === String(name).toLowerCase()) || null;
  F.folders = function () {
    const all = new Set(['/']);
    Object.keys(st().items).forEach((k) => { if (k.startsWith('d:') && st().items[k]) all.add(norm(k.slice(2))); });
    F.files().forEach((f) => { let d = norm(f.dir); while (d !== '/') { all.add(d); d = parent(d); } });
    [...all].forEach((d) => { let p = d; while (p !== '/') { p = parent(p); all.add(p); } });
    return [...all].sort();
  };
  F.list = function (dir) {
    dir = norm(dir);
    const folders = F.folders();
    if (dir !== '/' && !folders.includes(dir)) throw new Error('That folder isn\'t in Dice Cloud.');
    const kids = folders.filter((d) => d !== '/' && parent(d) === dir).map((d) => ({ name: d.split('/').pop(), dir: true, size: 0, mtime: 0 }));
    const files = F.files().filter((f) => norm(f.dir) === dir).map((f) => ({ name: f.name, dir: false, size: f.size, mtime: Math.round((f.mod || f.at || 0) / 1000), id: f.id, type: f.type, thumb: !!f.thumb, by: f.by }));
    return kids.sort((a, b) => a.name.localeCompare(b.name)).concat(files.sort((a, b) => a.name.localeCompare(b.name)));
  };
  F.recent = (n, kinds) => F.files().filter((f) => !kinds || kinds.includes(F.kind(f))).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, n || 12);
  F.photos = () => F.files().filter((f) => F.kind(f) === 'photo').sort((a, b) => (b.mod || b.at || 0) - (a.mod || a.at || 0));
  F.at = (path) => { const p = norm(path), dir = parent(p), name = p.split('/').pop(); return F.find(dir, name); };
  const changed = () => { D.save(); D.emit('drive'); if (C.on()) C.soon(800); };

  // ---- talking to the website -----------------------------------------------------------------------
  let boxId = null, boxCode = null;
  async function base() {
    const c = D.state.cloud;
    if (!c || !c.code) throw new Error('Turn on Dice Cloud first.');
    if (!window.crypto || !crypto.subtle) throw new Error('This browser can\'t lock files safely here (it needs https).');
    if (boxCode !== c.code) { boxId = (await C.keys(c.code)).id; boxCode = c.code; }
    return D.origin + '/dice/cloud/' + boxId;
  }
  const why = async (r) => { const j = await r.json().catch(() => ({})); return j.error || 'The website answered ' + r.status + '.'; };
  const keyOf = (it) => crypto.subtle.importKey('raw', unb64u(it.key), 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function seal(key, bytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
    return out;
  }
  const unseal = async (key, buf) => { const a = new Uint8Array(buf); return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: a.slice(0, 12) }, key, a.slice(12))); };
  F.seal = seal; F.unseal = unseal; // for the tests
  async function putPart(b, key, bytes) {
    const p = hex(16);
    const r = await fetch(b + '/files/' + p, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: await seal(key, bytes) });
    if (!r.ok) throw new Error(await why(r));
    return p;
  }
  const dropParts = (b, it) => [...(it.parts || []), it.thumb].filter(Boolean).forEach((p) => fetch(b + '/files/' + p, { method: 'DELETE' }).catch(() => {}));

  F.room = async function () {
    const r = await fetch((await base()) + '/files', { cache: 'no-store' });
    if (!r.ok) throw new Error(await why(r));
    const j = await r.json();
    F.lastRoom = { used: j.used, quota: j.quota, at: Date.now() };
    return F.lastRoom;
  };

  // a small picture to show in lists (and on the TV) before the whole photo comes
  async function thumbOf(file) {
    if (!/^image\/(png|jpeg|gif|webp|avif|bmp)/.test(file.type) || typeof createImageBitmap !== 'function') return null;
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  }

  // ---- putting a file in ------------------------------------------------------------------------------
  const cleanName = (n) => String(n || 'File').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'File';
  F.upload = async function (dir, file, opts) {
    opts = opts || {};
    dir = norm(dir);
    const name = cleanName(opts.name || file.name), size = file.size, type = F.typeOf(name, file.type);
    const job = { name, size, done: 0 };
    F.uploads.push(job); D.emit('drive');
    const b = await base();
    try {
      const room = await F.room().catch(() => null);
      if (room && room.used + size + 64 * Math.ceil(size / CHUNK + 1) > room.quota) throw new Error('There isn\'t room for ' + name + ' (' + F.size(size) + '). ' + F.size(Math.max(0, room.quota - room.used)) + ' is free.');
      const raw = crypto.getRandomValues(new Uint8Array(32));
      const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
      const parts = [];
      try {
        let off = 0;
        do {
          const bytes = new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer());
          parts.push(await putPart(b, key, bytes));
          off += CHUNK;
          job.done = Math.min(1, off / Math.max(1, size));
          D.emit('drive');
        } while (off < size);
      } catch (e) { dropParts(b, { parts }); throw e; }
      let thumb = null;
      try { const t = await thumbOf(file.type ? file : new Blob([file], { type })); if (t) thumb = await putPart(b, key, new Uint8Array(await t.arrayBuffer())); } catch (e) { /* no small picture: the list shows a letter */ }
      const old = F.find(dir, name);
      const id = old ? old.id : hex(6);
      st().items['f:' + id] = { name, dir, size, type, mod: file.lastModified || Date.now(), at: Date.now(), key: b64u(raw), parts, thumb, by: C.me() ? C.me().name : '' };
      if (old) { dropParts(b, old); forgetCached(id); }
      changed();
      return id;
    } finally {
      F.uploads = F.uploads.filter((j) => j !== job); D.emit('drive');
    }
  };

  // ---- getting it back ------------------------------------------------------------------------------
  // recent files stay here for a while (up to 80 MB), so going back and forth is quick
  const cache = new Map(), urls = new Map(), thumbs = new Map();
  let cached = 0;
  function remember(id, blob) {
    cache.set(id, blob); cached += blob.size;
    for (const [k, v] of cache) {
      if (cached <= 80 * 1048576 || k === id) break;
      cache.delete(k); cached -= v.size;
      if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
    }
  }
  function forgetCached(id) {
    if (cache.has(id)) { cached -= cache.get(id).size; cache.delete(id); }
    [urls, thumbs].forEach((m) => { if (m.has(id)) { Promise.resolve(m.get(id)).then((u) => u && URL.revokeObjectURL(u)); m.delete(id); } });
  }
  F.blob = async function (id, progress) {
    if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v; }
    const it = F.item(id);
    if (!it) throw new Error('That file isn\'t in Dice Cloud any more.');
    const key = await keyOf(it), b = await base(), out = [];
    for (let i = 0; i < it.parts.length; i++) {
      const r = await fetch(b + '/files/' + it.parts[i]);
      if (!r.ok) throw new Error(r.status === 404 ? 'Part of ' + it.name + ' is missing from Dice Cloud.' : await why(r));
      out.push(await unseal(key, await r.arrayBuffer()));
      if (progress) progress((i + 1) / it.parts.length);
    }
    const blob = new Blob(out, { type: it.type || F.typeOf(it.name) });
    remember(id, blob);
    return blob;
  };
  F.file = async (id) => { const it = F.item(id), blob = await F.blob(id); return new File([blob], it.name, { type: blob.type, lastModified: it.mod || Date.now() }); };
  F.url = async function (id) {
    if (urls.has(id) && cache.has(id)) return urls.get(id);
    const u = URL.createObjectURL(await F.blob(id));
    urls.set(id, u);
    return u;
  };
  F.thumbUrl = function (id) {
    if (thumbs.has(id)) return thumbs.get(id);
    const it = F.item(id);
    if (!it || !it.thumb) return Promise.resolve(null);
    const p = (async () => {
      const key = await keyOf(it), r = await fetch((await base()) + '/files/' + it.thumb);
      if (!r.ok) return null;
      return URL.createObjectURL(new Blob([await unseal(key, await r.arrayBuffer())], { type: 'image/jpeg' }));
    })().catch(() => null);
    thumbs.set(id, p);
    return p;
  };

  // ---- folders, names, taking things out -----------------------------------------------------------
  F.mkdir = function (path) {
    const p = norm(path);
    if (p === '/') throw new Error('That name won\'t work.');
    if (F.folders().includes(p)) throw new Error('There\'s already a folder called ' + p.split('/').pop() + '.');
    st().items['d:' + p] = { at: Date.now() };
    changed();
  };
  F.rename = function (path, to) {
    to = cleanName(to);
    const p = norm(path), it = F.at(p);
    if (!to || /\//.test(to)) throw new Error('That name won\'t work.');
    if (it) {
      if (F.find(it.dir, to) && to.toLowerCase() !== it.name.toLowerCase()) throw new Error('Something called ' + to + ' is already there.');
      st().items['f:' + it.id] = Object.assign({}, st().items['f:' + it.id], { name: to, type: F.typeOf(to, it.type) });
      return changed();
    }
    if (!F.folders().includes(p)) throw new Error('It isn\'t there any more.');
    const np = norm(parent(p) + '/' + to);
    if (F.folders().includes(np)) throw new Error('Something called ' + to + ' is already there.');
    moveFolder(p, np);
    changed();
  };
  function moveFolder(from, to) {
    const items = st().items;
    F.files().forEach((f) => { const d = norm(f.dir); if (d === from || d.startsWith(from + '/')) items['f:' + f.id] = Object.assign({}, items['f:' + f.id], { dir: to + d.slice(from.length) }); });
    Object.keys(items).forEach((k) => { if (!k.startsWith('d:')) return; const d = norm(k.slice(2)); if (d === from || d.startsWith(from + '/')) { delete items[k]; items['d:' + to + d.slice(from.length)] = { at: Date.now() }; } });
  }
  F.move = function (id, dir) {
    const it = F.item(id);
    if (!it) return;
    dir = norm(dir);
    if (F.find(dir, it.name)) throw new Error('Something called ' + it.name + ' is already there.');
    st().items['f:' + id] = Object.assign({}, st().items['f:' + id], { dir });
    changed();
  };
  F.remove = async function (path) {
    const p = norm(path), it = F.at(p), b = await base(), items = st().items;
    const gone = it ? [it] : F.files().filter((f) => { const d = norm(f.dir); return d === p || d.startsWith(p + '/'); });
    if (!it && !F.folders().includes(p)) throw new Error('It isn\'t there any more.');
    gone.forEach((f) => { dropParts(b, f); delete items['f:' + f.id]; forgetCached(f.id); });
    if (!it) Object.keys(items).forEach((k) => { if (k.startsWith('d:')) { const d = norm(k.slice(2)); if (d === p || d.startsWith(p + '/')) delete items[k]; } });
    changed();
    return gone.length;
  };

  // ---- sharing one file with a link ------------------------------------------------------------------
  F.share = async function (id, days) {
    const it = F.item(id), b = await base();
    if (!it) throw new Error('That file isn\'t in Dice Cloud any more.');
    days = Math.max(1, Math.min(30, days || 7));
    for (const p of it.parts) {
      const r = await fetch(b + '/share/' + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }) });
      if (!r.ok) throw new Error(await why(r));
    }
    st().items['f:' + id] = Object.assign({}, st().items['f:' + id], { shared: Date.now() + days * 86400000 });
    changed();
    return F.link(id);
  };
  F.link = (id) => { const it = F.item(id); return D.origin + '/dice/get#' + new URLSearchParams({ n: it.name, t: it.type || '', p: it.parts.join(','), k: it.key }).toString(); };
  F.unshare = async function (id) {
    const it = F.item(id), b = await base();
    if (!it) return;
    await Promise.all(it.parts.map((p) => fetch(b + '/share/' + p, { method: 'DELETE' }).catch(() => {})));
    const v = Object.assign({}, st().items['f:' + id]); delete v.shared;
    st().items['f:' + id] = v;
    changed();
  };
  F.sharedNow = (it) => !!(it && it.shared && it.shared > Date.now());

  // ---- tidying: parts nobody's list mentions (an upload cut off halfway) -----------------------------
  F.tidy = async function () {
    if (!C.on() || !C.shares('files')) return 0;
    await C.sync();
    const c = D.state.cloud;
    if (!c || Date.now() - (c.last || 0) > 120000) return 0;
    const b = await base(), r = await fetch(b + '/files', { cache: 'no-store' });
    if (!r.ok) return 0;
    const known = new Set();
    F.files().forEach((f) => { (f.parts || []).forEach((p) => known.add(p)); if (f.thumb) known.add(f.thumb); });
    const stale = (await r.json()).parts.filter((p) => !known.has(p.p) && Date.now() / 1000 - p.at > 86400);
    for (const p of stale) await fetch(b + '/files/' + p.p, { method: 'DELETE' }).catch(() => {});
    if (stale.length) F.room().catch(() => {});
    return stale.length;
  };
  setTimeout(() => { const c = D.state.cloud; if (c && (!c.tidied || Date.now() - c.tidied > 7 * 86400000)) F.tidy().then(() => { if (D.state.cloud) { D.state.cloud.tidied = Date.now(); D.save(); } }).catch(() => {}); }, 60000);

  // ---- asking for files from the person (a browser's file picker) ------------------------------------
  F.pick = function (accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file'; i.multiple = true; if (accept) i.accept = accept;
      i.onchange = () => res([...i.files]);
      i.click();
    });
  };
  // put several in, with one toast for the lot
  F.add = async function (dir, files) {
    files = [...files];
    if (!files.length) return 0;
    let ok = 0;
    for (const f of files) {
      try { await F.upload(dir, f); ok++; } catch (e) { D.toast({ icon: 'cloud', c: '#e5534b', title: 'Couldn\'t add ' + f.name, text: e.message }); if (/room|full/i.test(e.message)) break; }
    }
    if (ok) D.toast({ icon: 'cloud', c: '#3a9be8', title: 'In Dice Cloud', text: (ok === 1 ? files[0].name : ok + ' files') + (norm(dir) === '/' ? '' : ', in ' + norm(dir).split('/').pop()) + '. Your other computers see ' + (ok === 1 ? 'it' : 'them') + ' in a few seconds.' });
    return ok;
  };
})();
