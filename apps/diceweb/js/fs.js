// The Dice disk: DiceWeb's own files, when it runs in a browser (on DiceOS, Files uses
// the computer's real disk instead).
//
// Folders, names and small text files (notes, code) live in the disk tree that Terminal,
// Notes and Code already use. Everything else (photos, songs, videos, PDFs, big files)
// is kept as it is, byte for byte, in the browser's own database (IndexedDB), and the
// tree just points at it. So it holds real files, as big as the browser allows, and they
// stay after the page is closed.
//
// The Trash is a hidden folder, ~/.Trash: things in it remember where they came from, so
// they can go back.
(function () {
  'use strict';
  const D = window.Dice, L = D.L;
  const DB = (window.DICE_SYS && window.DICE_SYS.emulated ? 'diceweb-emu' : 'diceweb') + '-files';
  const INLINE = 64 * 1024; // text files up to this size stay in the tree, readable by Terminal and Notes
  const TEXT = /\.(txt|md|json|js|mjs|ts|py|sh|html|css|csv|log|conf|cfg|ini|yaml|yml|xml|svg)$/i;
  const STANDARD = ['Documents', 'Downloads', 'Music', 'Pictures', 'Videos'];
  const FS = D.disk = {};
  const now = () => Date.now();

  // ---- the database for file contents ---------------------------------------------------------------
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('This browser can\'t keep files.'));
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('The browser wouldn\'t open its file store.'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  async function tx(mode, f) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction('blobs', mode), s = t.objectStore('blobs');
      let out;
      Promise.resolve(f(s)).then((r) => { out = r; });
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = t.onabort = () => rej(t.error || new Error('The browser wouldn\'t save it (is it full?).'));
    });
  }
  const putBlob = (id, blob) => tx('readwrite', (s) => { s.put(blob, id); });
  const getBlob = (id) => tx('readonly', (s) => s.get(id));
  const allIds = () => tx('readonly', (s) => s.getAllKeys());
  const dropIds = (ids) => tx('readwrite', (s) => { ids.forEach((id) => s.delete(id)); });

  // ---- paths --------------------------------------------------------------------------------------
  const home = () => D.home();
  const real = (p) => { p = String(p || '~'); return L.resolve(home(), p.replace(/^~(?=\/|$)/, home()), home()); };
  const show = (p) => (p === home() || p.startsWith(home() + '/') ? '~' + p.slice(home().length) : p);
  FS.real = real; FS.show = show;
  const split = (p) => { const r = real(p), i = r.lastIndexOf('/'); return { dir: L.walk(D.state.disk, r.slice(0, i) || '/'), name: r.slice(i + 1), path: r }; };
  const err = (m) => { throw new Error(m); };
  const changed = () => { D.save(); D.emit('disk'); };
  const sizeOf = (n) => (n.type === 'dir' ? 0 : n.blob ? n.size || 0 : (n.text || '').length);
  const freeName = (dir, name) => {
    if (!dir.kids[name]) return name;
    const m = name.match(/^(.*?)(\.[^.]*)?$/);
    for (let i = 2; ; i++) { const n = m[1] + ' (' + i + ')' + (m[2] || ''); if (!dir.kids[n]) return n; }
  };
  const okName = (n) => n && n.length <= 200 && !/[/\x00]/.test(n) && n !== '.' && n !== '..';
  FS.mime = (name, given) => (given && given !== 'application/octet-stream' ? given : D.drive ? D.drive.typeOf(name) : 'application/octet-stream');

  // the usual folders, made the first time (and after "rm -r")
  FS.tidyHome = function () {
    const h = L.walk(D.state.disk, home());
    if (!h || h.type !== 'dir') return;
    let made = false;
    STANDARD.concat(['.Trash']).forEach((n) => { if (!h.kids[n]) { h.kids[n] = { type: 'dir', kids: {} }; made = true; } });
    if (made) D.save();
  };

  // ---- reading ------------------------------------------------------------------------------------
  FS.list = async function (p) {
    const r = real(p), node = L.walk(D.state.disk, r);
    if (!node || node.type !== 'dir') err('That folder isn\'t there.');
    const items = Object.keys(node.kids).filter((n) => !n.startsWith('.')).map((n) => {
      const k = node.kids[n];
      return { name: n, dir: k.type === 'dir', size: sizeOf(k), mtime: Math.round((k.t || now()) / 1000), mime: k.mime || '', count: k.type === 'dir' ? Object.keys(k.kids).filter((x) => !x.startsWith('.')).length : undefined };
    });
    return { path: show(r), real: r, home: home(), items, drives: [] };
  };
  FS.read = async function (p) {
    const n = L.walk(D.state.disk, real(p));
    if (!n) err('It isn\'t there any more.');
    if (n.type === 'dir') err('That\'s a folder.');
    const name = real(p).split('/').pop();
    if (!n.blob) return new Blob([n.text || ''], { type: FS.mime(name, TEXT.test(name) ? 'text/plain' : '') });
    const b = await getBlob(n.blob);
    if (!b) err('This file\'s contents are missing (the browser may have cleared its storage).');
    return b.type ? b : new Blob([b], { type: FS.mime(name, n.mime) });
  };

  // ---- writing ------------------------------------------------------------------------------------
  FS.write = async function (p, data, opts) {
    const { dir, name, path } = split(p);
    if (!dir || dir.type !== 'dir') err('That folder isn\'t there.');
    if (!okName(name)) err('That name won\'t work.');
    if (dir.kids[name] && dir.kids[name].type === 'dir') err(name + ' is a folder.');
    const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
    const t = (opts && opts.t) || (data && data.lastModified) || now();
    if (TEXT.test(name) && blob.size <= INLINE) {
      dir.kids[name] = { type: 'file', text: await blob.text(), t };
    } else {
      const id = 'b' + now().toString(36) + Math.random().toString(36).slice(2, 8);
      await putBlob(id, blob);
      dir.kids[name] = { type: 'file', blob: id, size: blob.size, mime: FS.mime(name, blob.type), t };
      if (navigator.storage && navigator.storage.persist && !FS.asked) { FS.asked = true; navigator.storage.persist().catch(() => {}); }
    }
    changed();
    return { ok: true, path: show(path) };
  };
  FS.upload = (p, file) => FS.write(p, file);
  FS.mkdir = function (p) {
    const { dir, name } = split(p);
    if (!dir || dir.type !== 'dir') err('That folder isn\'t there.');
    if (!okName(name)) err('That name won\'t work.');
    if (dir.kids[name]) err('Something called ' + name + ' is already there.');
    dir.kids[name] = { type: 'dir', kids: {}, t: now() };
    changed();
  };
  FS.rename = function (p, to) {
    const { dir, name } = split(p);
    to = String(to || '').trim();
    if (!dir || !dir.kids[name]) err('It isn\'t there any more.');
    if (!okName(to)) err('That name won\'t work.');
    if (to === name) return;
    if (dir.kids[to]) err('Something called ' + to + ' is already there.');
    dir.kids[to] = dir.kids[name]; delete dir.kids[name];
    if (dir.kids[to].mime) dir.kids[to].mime = FS.mime(to, '');
    changed();
  };
  const clone = (n) => (n.type === 'dir' ? { type: 'dir', t: n.t, kids: Object.fromEntries(Object.entries(n.kids).map(([k, v]) => [k, clone(v)])) } : Object.assign({}, n));
  function into(p, toDir, keep) {
    const { dir, name, path } = split(p), dest = L.walk(D.state.disk, real(toDir));
    if (!dir || !dir.kids[name]) err('It isn\'t there any more.');
    if (!dest || dest.type !== 'dir') err('That folder isn\'t there.');
    if (real(toDir) === path || real(toDir).startsWith(path + '/')) err('A folder can\'t go inside itself.');
    if (!keep && dest === dir) return name;
    const n = keep && dest === dir ? freeName(dest, name.replace(/(\.[^.]*)?$/, ' copy$1')) : freeName(dest, name);
    dest.kids[n] = keep ? clone(dir.kids[name]) : dir.kids[name];
    if (keep) dest.kids[n].t = now();
    if (!keep) delete dir.kids[name];
    changed();
    return n;
  }
  FS.copy = (p, toDir) => into(p, toDir, true);
  FS.move = (p, toDir) => into(p, toDir, false);

  // ---- the Trash ----------------------------------------------------------------------------------
  const bin = () => { FS.tidyHome(); return L.walk(D.state.disk, home() + '/.Trash'); };
  FS.trash = function (p) {
    const { dir, name, path } = split(p);
    if (path === home() || path === home() + '/.Trash') err('Not your whole home folder.');
    if (!dir || !dir.kids[name]) err('It isn\'t there any more.');
    const b = bin(), n = freeName(b, name), node = dir.kids[name];
    node.trashed = { from: show(path), at: now() };
    b.kids[n] = node; delete dir.kids[name];
    changed();
    return n;
  };
  FS.trashList = function () {
    const b = bin();
    return Object.entries(b.kids).map(([n, k]) => ({ name: n, dir: k.type === 'dir', size: k.type === 'dir' ? total(k) : sizeOf(k), mtime: Math.round(((k.trashed && k.trashed.at) || k.t || now()) / 1000), from: k.trashed ? k.trashed.from : '', mime: k.mime || '' }))
      .sort((a, b2) => b2.mtime - a.mtime);
  };
  FS.restore = function (name) {
    const b = bin(), node = b.kids[name];
    if (!node) err('It isn\'t in the Trash any more.');
    const from = (node.trashed && node.trashed.from) || '~/' + name, sp = split(from);
    let dir = sp.dir, back = sp.name, at = sp.path.replace(/\/[^/]*$/, '') || '/';
    if (!dir || dir.type !== 'dir') { dir = L.walk(D.state.disk, home()); at = home(); } // its folder's gone: home it goes
    back = freeName(dir, back);
    delete node.trashed;
    dir.kids[back] = node; delete b.kids[name];
    changed();
    return show(at + '/' + back);
  };
  FS.forget = async function (name) { // gone for good
    const b = bin();
    if (name == null) Object.keys(b.kids).forEach((k) => delete b.kids[k]); else delete b.kids[name];
    changed();
    await FS.sweep();
  };

  // ---- how much room ------------------------------------------------------------------------------
  function total(n) { return n.type === 'dir' ? Object.values(n.kids).reduce((s, k) => s + total(k), 0) : sizeOf(n); }
  FS.usage = async function () {
    const used = total(D.state.disk);
    let quota = 0;
    try { if (navigator.storage && navigator.storage.estimate) quota = (await navigator.storage.estimate()).quota || 0; } catch (e) { /* not told */ }
    return { used, quota, trash: total(bin()) };
  };

  // ---- finding by name, everywhere --------------------------------------------------------------
  FS.find = function (q, limit) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    (function look(n, path) {
      Object.entries(n.kids).forEach(([k, v]) => {
        if (k.startsWith('.') || out.length >= (limit || 60)) return;
        const p = path + '/' + k;
        if (words.every((w) => k.toLowerCase().includes(w))) out.push({ name: k, path: show(p), dir: v.type === 'dir', size: sizeOf(v), mtime: Math.round((v.t || 0) / 1000) });
        if (v.type === 'dir') look(v, p);
      });
    })(L.walk(D.state.disk, home()) || { kids: {} }, home());
    return out;
  };

  // ---- contents nobody points at any more (emptied from the Trash, written over) -------------------
  FS.sweep = async function () {
    const keep = new Set();
    (function look(n) { if (n.type === 'dir') Object.values(n.kids).forEach(look); else if (n.blob) keep.add(n.blob); })(D.state.disk);
    const ids = await allIds().catch(() => []);
    const gone = ids.filter((id) => !keep.has(id));
    if (gone.length) await dropIds(gone);
    return gone.length;
  };

  // a "source" for Files and Code: the same few calls as the real disk on DiceOS
  FS.source = function () {
    const run = (f) => { try { return Promise.resolve(f()).then((r) => r || { ok: true }); } catch (e) { return Promise.reject(e); } };
    return {
      real: false, disk: true,
      list: (p) => FS.list(p),
      read: (p) => FS.read(p),
      upload: (p, f) => FS.upload(p, f),
      op: (b) => run(() => {
        switch (b.op) {
          case 'mkdir': return FS.mkdir(b.path);
          case 'rename': return FS.rename(b.path, b.to);
          case 'trash': return FS.trash(b.path);
          case 'text': return FS.write(b.path, String(b.text == null ? '' : b.text));
          case 'copy': return FS.copy(b.path, b.to);
          case 'move': return FS.move(b.path, b.to);
          default: throw new Error('Can\'t do that here.');
        }
      }),
      trash: () => Promise.resolve(FS.trashList()),
      restore: (name) => run(() => FS.restore(name)),
      forget: (name) => FS.forget(name),
      usage: () => FS.usage(),
      find: (q) => Promise.resolve(FS.find(q)),
    };
  };

  setTimeout(() => { try { FS.tidyHome(); } catch (e) { /* no disk yet */ } }, 0);
  setTimeout(() => FS.sweep().catch(() => {}), 8000);
})();
