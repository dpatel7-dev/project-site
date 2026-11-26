// Dice Cloud on DiceOS, like Dropbox's folder:
//
//   ~/Dice Cloud   a folder in your home folder kept the same as Dice Cloud, both ways. Put a file
//                  in it (from Files, the Terminal, any app) and it's on all your computers; one
//                  added on another computer turns up in it. Change one and the old one becomes an
//                  older version; delete one and it goes to Deleted files for 30 days.
//   ~/Pictures     backed up into Dice Cloud, one way, into "Pictures from <this computer>".
//
// The locking (each file with its own key) still happens here in DiceWeb (js/drive.js); DiceOS's
// helper only reads and writes the files on the disk. It goes carefully: if lots of files vanish
// at once (a list that hasn't arrived, a disk that came out), it stops and asks.
(function () {
  'use strict';
  const D = window.Dice, F = D.drive, C = D.cloud;
  const S = D.dsync = { busy: false, last: 0, error: '', note: '', paused: '' };
  if (!F || !C) return;
  const ROOT = '~/Dice Cloud', PICS = '~/Pictures', MAX = 200 * 1048576; // (DiceOS's helper takes files up to 200 MB)
  const MEDIA = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?|raw|dng|cr2|nef|arw|mp4|mov|m4v|webm|mkv|avi|3gp)$/i;
  const cfg = () => { const c = D.state.dsync && typeof D.state.dsync === 'object' ? D.state.dsync : (D.state.dsync = { folder: false, pics: false, map: {}, pmap: {} }); c.map = c.map || {}; c.pmap = c.pmap || {}; return c; };
  S.cfg = cfg;
  S.can = () => !!(D.sys && !D.sys.info.emulated);
  const host = () => ((D.sys.status && D.sys.status.host) || D.sys.info.host || 'DiceOS').replace(/[\\/:*?"<>|]/g, ' ').trim();
  const picsDir = () => '/Pictures from ' + host();
  const relOf = (f) => (F.norm(f.dir) === '/' ? '' : F.norm(f.dir).slice(1) + '/') + f.name;
  const split = (rel) => { const i = rel.lastIndexOf('/'); return i < 0 ? ['/', rel] : ['/' + rel.slice(0, i), rel.slice(i + 1)]; };
  async function tree(path) {
    const r = await D.sys.get('/api/files/tree?path=' + encodeURIComponent(path));
    if (!r || r.ok === false) throw new Error((r && r.error) || 'Couldn\'t read ' + path + '.');
    return r.files || [];
  }
  const say = (note) => { S.note = note; D.emit('dsync'); };

  // ---- one file, up or down -------------------------------------------------------------------------------
  async function up(base, rel, L, dir, name) {
    if (L.size > MAX) { S.skipped++; return null; }
    say('Putting ' + rel + ' in Dice Cloud…');
    const blob = await D.sys.blob(base + '/' + rel);
    const id = await F.upload(dir, new File([blob], name, { lastModified: L.mtime * 1000 }), { from: host() });
    return F.item(id);
  }
  async function down(rel, R) {
    if (R.size > MAX) { S.skipped++; return null; }
    say('Getting ' + rel + '…');
    const blob = await F.blob(R.id);
    const r = await D.sys.upload(ROOT + '/' + rel, blob, { dirs: 1, mtime: Math.round((R.mod || R.at || Date.now()) / 1000) });
    if (!r || r.ok === false) throw new Error((r && r.error) || 'Couldn\'t save ' + rel + '.');
    return r;
  }

  // ---- the folder, both ways --------------------------------------------------------------------------------
  async function folder() {
    const c = cfg(), map = c.map, mine = picsDir().slice(1) + '/';
    const local = new Map((await tree(ROOT)).map((x) => [x.path, x]));
    // (this computer's own Pictures backup isn't copied back down into its folder)
    const remote = new Map(F.files().map((f) => [relOf(f), f]).filter(([rel]) => !rel.startsWith(mine)));
    const known = Object.keys(map);
    // safety: lots gone at once means something's wrong, not that you deleted them
    const goneHere = known.filter((r) => !local.has(r)).length, goneThere = known.filter((r) => !remote.has(r)).length;
    if (known.length >= 10 && (goneHere > known.length / 2 || goneThere > known.length / 2) && !S.allow) {
      S.paused = goneHere > goneThere ? 'Most of the files in your Dice Cloud folder have gone. Paused, so nothing is taken out of Dice Cloud by mistake.'
        : 'Most of your files have gone from Dice Cloud. Paused, so nothing is deleted from this computer by mistake.';
      D.emit('dsync');
      return;
    }
    S.paused = ''; S.allow = false;
    let moved = 0;
    const all = new Set([...local.keys(), ...remote.keys(), ...known]);
    for (const rel of all) {
      if (moved >= 25) break; // (a few at a time; the rest next round)
      const L = local.get(rel), R = remote.get(rel), M = map[rel];
      const lChanged = L && M && (L.mtime !== M.m || L.size !== M.s), rChanged = R && M && (R.id !== M.id || (R.at || 0) !== M.at);
      const keep = (l, r) => { map[rel] = { m: l.mtime, s: l.size, id: r.id, at: r.at || 0 }; };
      try {
        if (L && R) {
          if (!M) { // the first time both have it
            if (L.size === R.size) keep(L, R);
            else if (L.mtime * 1000 > (R.mod || R.at || 0)) { const n = await up(ROOT, rel, L, ...split(rel)); if (n) keep(L, n); moved++; }
            else { const w = await down(rel, R); if (w) keep({ mtime: w.mtime, size: w.size }, R); moved++; }
          } else if (lChanged && !rChanged) { const n = await up(ROOT, rel, L, ...split(rel)); if (n) keep(L, n); moved++; }
          else if (rChanged && !lChanged) { const w = await down(rel, R); if (w) keep({ mtime: w.mtime, size: w.size }, R); moved++; }
          else if (lChanged && rChanged) {
            // changed in both places: this computer's copy goes in beside it, so nothing's lost
            const [dir, name] = split(rel), copy = name.replace(/(\.[^.]+)?$/, ' (' + host() + '\'s copy)$1');
            await up(ROOT, rel, L, dir, copy);
            const w = await down(rel, R); if (w) keep({ mtime: w.mtime, size: w.size }, R);
            moved += 2;
          }
        } else if (L && !R) {
          if (M && !lChanged) { await D.sys.post('/api/files', { op: 'trash', path: ROOT + '/' + rel }); delete map[rel]; moved++; } // deleted elsewhere: into this computer's Trash
          else { const n = await up(ROOT, rel, L, ...split(rel)); if (n) keep(L, n); moved++; }
        } else if (!L && R) {
          if (M && !rChanged) { await F.remove(F.norm(split(rel)[0] + '/' + split(rel)[1])); delete map[rel]; moved++; } // deleted here: into Deleted files
          else { const w = await down(rel, R); if (w) keep({ mtime: w.mtime, size: w.size }, R); moved++; }
        } else delete map[rel];
      } catch (e) { S.error = rel + ': ' + e.message; if (/room|full/i.test(e.message)) break; }
    }
    D.save();
    return moved;
  }

  // ---- Pictures, one way ----------------------------------------------------------------------------------------
  async function pictures() {
    const c = cfg(), pmap = c.pmap, dir = picsDir();
    const local = (await tree(PICS)).filter((x) => MEDIA.test(x.path));
    let moved = 0;
    for (const L of local) {
      if (moved >= 15) break;
      const P = pmap[L.path];
      if (P && P.m === L.mtime && P.s === L.size) continue;
      const [sub, name] = split(L.path), there = F.norm(dir + (sub === '/' ? '' : sub));
      const R = F.find(there, name);
      if (R && R.size === L.size) { pmap[L.path] = { m: L.mtime, s: L.size }; continue; }
      try { const n = await up(PICS, L.path, L, there, name); if (n) pmap[L.path] = { m: L.mtime, s: L.size }; moved++; } catch (e) { S.error = 'Pictures: ' + e.message; if (/room|full/i.test(e.message)) break; }
    }
    D.save();
    return moved;
  }

  // ---- when it runs ---------------------------------------------------------------------------------------------
  S.run = async function () {
    const c = cfg();
    if (S.busy || !S.can() || !F.on() || (!c.folder && !c.pics)) return;
    // only with a fresh list of your files (one that hasn't arrived yet looks like everything's gone)
    const last = D.state.cloud && D.state.cloud.last;
    if (C.busy || !last || Date.now() - last > 10 * 60000) { if (!C.busy) C.sync().catch(() => {}); return; }
    S.busy = true; S.error = ''; S.skipped = 0; D.emit('dsync');
    let n = 0;
    try {
      if (c.folder) n += (await folder()) || 0;
      if (c.pics) n += (await pictures()) || 0;
      S.last = Date.now();
    } catch (e) { S.error = e.message; }
    S.busy = false; S.note = '';
    D.emit('dsync');
    if (n >= 15) setTimeout(S.run, 1500); // more to do
  };
  S.set = function (k, on) {
    const c = cfg();
    c[k] = !!on;
    if (k === 'folder' && !on) c.map = {};
    D.save(); D.emit('dsync');
    if (on) setTimeout(S.run, 300);
  };
  S.goAnyway = function () { S.allow = true; S.paused = ''; S.run(); };
  if (S.can()) {
    setInterval(S.run, 45000);
    let t = 0;
    D.on('drive', () => { clearTimeout(t); t = setTimeout(S.run, 6000); });
    setTimeout(S.run, 20000);
  }
})();
