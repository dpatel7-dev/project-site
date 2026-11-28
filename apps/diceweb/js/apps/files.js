// Files: your folders and files. On a computer running DiceOS, your real home folder
// and any USB stick you plug in; in a browser, the Dice disk (js/fs.js), which keeps real
// files in the browser. Dice Cloud is a place too, and so is the Trash.
//
// With a mouse: click picks, double-click opens, right-click for more, drag to move
// (hold Alt to copy), and the usual keys (Delete, F2, Ctrl+C/X/V/A). With a remote or a
// controller: A opens, X for more, B goes back up.
(function () {
  'use strict';
  const D = window.Dice, esc = D.esc, h = D.h;
  const KIND = [[/\.(png|jpe?g|gif|webp|bmp|avif|heic)$/i, 'Picture', '#f6a6b8', 'photo'], [/\.svg$/i, 'Drawing', '#f6a6b8', 'photo'],
    [/\.(mp3|m4a|wav|ogg|flac|aac|opus)$/i, 'Song', '#d39cf5', 'song'], [/\.(mp4|mkv|webm|mov|avi)$/i, 'Video', '#ff9a7a', 'video'],
    [/\.(js|mjs|ts|py|sh|html|css|json|c|cpp|h|rs|go|java|rb|lua)$/i, 'Code', '#7cc4ff', 'code'], [/\.(txt|md|csv|log|conf|cfg|ini|yaml|yml|xml)$/i, 'Text', '#8fd16a', 'doc'],
    [/\.pdf$/i, 'PDF', '#ef8a5a', 'doc'], [/\.(zip|tar|gz|xz|7z|rar|deb|flatpak|appimage)$/i, 'Archive', '#f5c431', 'box'], [/\.(docx?|odt|rtf|pages)$/i, 'Document', '#6fa8ff', 'doc'],
    [/\.(xlsx?|ods|numbers)$/i, 'Spreadsheet', '#4fc16b', 'doc'], [/\.(pptx?|odp|key)$/i, 'Slides', '#ffb14d', 'doc']];
  const kindOf = (name, dir) => {
    if (dir) return { name: 'Folder', c: '#7cc4ff', k: 'dir' };
    const m = KIND.find(([re]) => re.test(name));
    return m ? { name: m[1], c: m[2], k: m[3] } : { name: 'File', c: '#b9bcc6', k: 'file' };
  };
  const ext = (name) => (/\.([^./]{1,5})$/.exec(name) || [, ''])[1].toUpperCase();
  const size = (n) => (n < 1024 ? n + ' bytes' : n < 1048576 ? Math.round(n / 1024) + ' KB' : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB' : (n / 1073741824).toFixed(2) + ' GB');
  const when = (s) => { if (!s) return ''; const d = new Date(s * 1000), t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric' }); };
  const enc = encodeURIComponent;

  // ---- where files come from: the same few calls for each ----------------------------------------
  function sysSource() {
    const s = D.sys, ok = (r) => (r && r.ok !== false && !r.error ? r : Promise.reject(new Error((r && r.error) || 'That didn\'t work.')));
    return {
      real: true,
      list: (p) => s.get('/api/files?path=' + enc(p)).then((r) => (r.error ? Promise.reject(new Error(r.error)) : r)),
      op: (b) => s.post('/api/files', b).then(ok).then((r) => { if (D.oops) D.oops.fileOp(b, r); return r; }), // (Oops can take it back)
      read: (p) => s.blob(p),
      upload: (p, f) => s.upload(p, f).then(ok),
      trash: () => s.get('/api/trash').then((r) => (r && r.items) || []),
      restore: (name) => s.post('/api/files', { op: 'restore', name }).then(ok),
      forget: (name) => s.post('/api/files', { op: 'forget', name }).then(ok),
      usage: () => s.get('/api/files/usage').then((r) => (r && r.quota ? r : null)),
      find: (q) => s.get('/api/find?q=' + enc(q)).then((r) => (r && r.items) || []),
    };
  }
  function source() { return D.sys && !D.sys.info.emulated ? sysSource() : D.disk.source(); }
  D.fileSource = source; // Code uses the same

  // Dice Cloud, as a place like any other (paths look like cloud:/Photos)
  function cloudSource() {
    const F = D.drive;
    const dirOf = (p) => F.norm(String(p).replace(/^cloud:/, ''));
    const run = (f) => { try { return Promise.resolve(f()).then((r) => r || { ok: true }); } catch (e) { return Promise.reject(e); } };
    return {
      real: true, cloud: true,
      list: (p) => (!F || !F.on() ? Promise.reject(new Error('Dice Cloud is off here. Turn it on in the Dice Cloud app, and your files there show up here.'))
        : run(() => { const dir = dirOf(p); return { path: 'cloud:' + dir, items: F.list(dir), drives: [] }; })),
      op: (b) => run(() => {
        if (b.op === 'mkdir') return F.mkdir(dirOf(b.path));
        if (b.op === 'rename') return F.rename(dirOf(b.path), b.to);
        if (b.op === 'trash') return F.remove(dirOf(b.path)).then(() => ({ ok: true }));
        if (b.op === 'move') { const it = F.at(dirOf(b.path)); if (!it) throw new Error('Folders in Dice Cloud can be renamed, but not moved yet.'); return F.move(it.id, dirOf(b.to)); }
        throw new Error('That can\'t be done in Dice Cloud yet.');
      }),
      read: (p) => { const it = F.at(dirOf(p)); return it ? F.blob(it.id) : Promise.reject(new Error('It isn\'t in Dice Cloud any more.')); },
      upload: (p, f) => { const d = dirOf(p); return F.upload(d.split('/').slice(0, -1).join('/') || '/', f, { name: d.split('/').pop() }); },
      usage: () => F.room().catch(() => null),
      find: (q) => Promise.resolve(F.files().filter((f) => String(q).toLowerCase().split(/\s+/).every((w) => f.name.toLowerCase().includes(w))).slice(0, 60)
        .map((f) => ({ name: f.name, path: 'cloud:' + (F.norm(f.dir) === '/' ? '' : F.norm(f.dir)) + '/' + f.name, dir: false, size: f.size, mtime: Math.round((f.mod || 0) / 1000) }))),
    };
  }

  D.register({ id: 'files', mount(root, ctx) {
    const local = source(), cloud = cloudSource();
    const isCloud = (p) => String(p).startsWith('cloud:'), isTrash = (p) => p === 'trash:', isFind = (p) => String(p).startsWith('find:');
    const srcOf = (p) => (isCloud(p) ? cloud : local);
    const tv = ctx.mode === 'run';
    const pref = D.state.files || (D.state.files = { view: 'grid', sort: 'name', info: true });
    root.classList.add('fx');
    root.classList.toggle('fx-tv', tv);
    root.innerHTML =
      '<aside class="fx-side"><div class="fx-brand">' + D.icon('library', '#7cc4ff', 2) + '<b>Files</b></div><nav class="fx-places"></nav><div class="fx-room"></div></aside>' +
      '<section class="fx-main">' +
        '<header class="fx-bar">' +
          '<div class="fx-hist"><button class="fx-tb" data-nav data-key="fx:back" title="Back (Alt + Left)" aria-label="Back">‹</button><button class="fx-tb" data-nav data-key="fx:fwd" title="Forward" aria-label="Forward">›</button></div>' +
          '<div class="fx-crumbs"></div>' +
          '<label class="fx-find">' + D.glyph('search', 2) + '<input type="search" placeholder="Search" aria-label="Search" data-nav data-key="fx:find"></label>' +
          '<div class="fx-views" role="group" aria-label="View"><button class="fx-tb" data-nav data-key="fx:grid" title="Icons" aria-label="Icons">' + gridGlyph() + '</button><button class="fx-tb" data-nav data-key="fx:list" title="List" aria-label="List">' + listGlyph() + '</button></div>' +
          '<select class="fx-sort" data-nav data-key="fx:sort" aria-label="Sort by"><option value="name">Name</option><option value="date">Newest</option><option value="size">Biggest</option><option value="kind">Kind</option></select>' +
          '<button class="fx-tb" data-nav data-key="fx:infob" title="Details" aria-label="Details">i</button>' +
        '</header>' +
        '<div class="fx-up" hidden></div>' +
        '<div class="fx-body"><div class="fx-items" role="listbox" aria-multiselectable="true" data-scroll="20"></div><aside class="fx-info" hidden></aside></div>' +
        '<footer class="fx-foot"><span class="fx-count"></span><span class="fx-acts"><button class="b small" data-nav data-key="fx:new">' + D.glyph('plus', 2) + 'New folder</button>' +
          '<label class="b small" data-nav data-key="fx:add" tabindex="0">' + D.glyph('copy', 2) + 'Add files<input type="file" multiple hidden></label>' +
          '<button class="b small danger" data-nav data-key="fx:empty" hidden>' + D.glyph('trash', 2) + 'Empty Trash</button></span></footer>' +
      '</section>';
    const $ = (s) => root.querySelector(s);
    const places = $('.fx-places'), list = $('.fx-items'), crumbs = $('.fx-crumbs'), count = $('.fx-count'), info = $('.fx-info'), upBox = $('.fx-up'), roomEl = $('.fx-room'), findIn = $('.fx-find input');
    let cur = '~', items = [], drives = [], sel = new Set(), anchor = null, clip = null, filter = '', back = [], fwd = [], pending = null, trashN = 0, alive = true;
    const thumbs = new Map(), mine = new Set();

    // ---- places ------------------------------------------------------------------------------
    const PLACES = [['~', 'Home', 'home', '#ff707a'], ['~/Documents', 'Documents', 'library', '#6fa8ff'], ['~/Downloads', 'Downloads', 'box', '#4fc16b'],
      ['~/Pictures', 'Pictures', 'camera', '#f6a6b8'], ['~/Music', 'Music', 'music', '#d39cf5'], ['~/Videos', 'Videos', 'play', '#ff9a7a']];
    function paintPlaces() {
      const here = (p) => (p === '~' ? cur === '~' : p === 'cloud:/' ? isCloud(cur) : p === 'trash:' ? isTrash(cur) : cur === p || cur.startsWith(p + '/'));
      const row = ([p, n, ic, c, extra]) => '<button class="fx-pl' + (here(p) ? ' here' : '') + '" data-nav data-key="fx:pl:' + esc(p) + '" data-path="' + esc(p) + '" data-drop="' + esc(p) + '">' + D.icon(ic, c, 2) + '<span>' + esc(n) + '</span>' + (extra ? '<small>' + extra + '</small>' : '') + '</button>';
      places.innerHTML = '<div class="fx-pg">' + PLACES.map(row).join('') + '</div>' +
        '<div class="fx-pg"><h3>Elsewhere</h3>' + row(['cloud:/', 'Dice Cloud', 'cloud', '#3a9be8']) + drives.map((x) => row([x.path, x.name, 'lock', '#f5c431'])).join('') + row(['trash:', 'Trash', 'trash', '#96969f', trashN || '']) + '</div>';
      places.querySelectorAll('.fx-pl').forEach((b) => { b.onclick = () => go(b.dataset.path); dropTarget(b, b.dataset.path); });
    }
    async function paintRoom() {
      const src = isCloud(cur) ? cloud : local;
      const u = src.usage ? await src.usage().catch(() => null) : null;
      if (!alive) return;
      if (!u || !u.quota) { roomEl.innerHTML = ''; return; }
      const f = Math.min(1, u.used / u.quota);
      roomEl.innerHTML = '<div class="fx-meter"><i style="width:' + Math.max(2, f * 100).toFixed(1) + '%;--m:' + (f > 0.9 ? '#e5534b' : f > 0.7 ? '#e5b62e' : '#3a9be8') + '"></i></div><span>' +
        (src.cloud ? size(u.used) + ' of ' + size(u.quota) + ' in Dice Cloud' : local.real ? size(Math.max(0, u.quota - u.used)) + ' free of ' + size(u.quota) : size(u.used) + ' kept in this browser') + '</span>';
    }

    // ---- going places ---------------------------------------------------------------------------
    function go(p, how) {
      if (how !== 'hist' && p !== cur) { back.push(cur); fwd = []; }
      cur = p; sel.clear(); anchor = null;
      if (!isFind(p)) { filter = ''; findIn.value = ''; }
      list.innerHTML = '<p class="fx-wait">Opening…</p>';
      load();
    }
    async function load() {
      const want = cur;
      try {
        let d;
        if (isTrash(cur)) {
          // this computer's Trash, and what was taken out of Dice Cloud (for 30 days)
          const gone = D.drive && D.drive.on() ? D.drive.deleted().map((f) => ({ name: f.name, dir: false, size: f.size, mtime: Math.round(f.deleted / 1000), cloudId: f.id, from: 'Dice Cloud' + (D.drive.norm(f.dir) === '/' ? '' : D.drive.norm(f.dir)) + '/' + f.name, path: 'trash:cloud:' + f.id })) : [];
          d = { path: 'trash:', items: (await local.trash()).map((x) => Object.assign(x, { path: 'trash:' + x.name })).concat(gone) };
        }
        else if (isFind(cur)) {
          const q = cur.slice(5);
          const found = (await Promise.all([local.find ? local.find(q).catch(() => []) : [], D.drive && D.drive.on() ? cloud.find(q) : []])).flat();
          d = { path: cur, items: found.map((x) => Object.assign(x, { where: x.path.replace(/\/[^/]*$/, '') || '/' })) };
        } else {
          d = await srcOf(cur).list(cur);
          d.items.forEach((x) => { x.path = (d.path.endsWith('/') ? d.path : d.path + '/') + x.name; });
          if (d.drives) drives = d.drives;
        }
        if (want !== cur) return;
        items = d.items; cur = d.path;
        paint();
      } catch (e) {
        if (want !== cur) return;
        items = [];
        paintPlaces(); paintCrumbs();
        list.innerHTML = '<div class="fx-empty"><span class="fx-ic k-file big" style="--fc:#b9bcc6"></span><p>' + esc(e.message) + '</p>' + (isCloud(cur) && !(D.cloud && D.cloud.on()) ? '<button class="b go" data-nav data-key="fx:cloudon">' + D.glyph('cloud', 2) + 'Open Dice Cloud</button>' : '') + '</div>';
        const on = list.querySelector('[data-key="fx:cloudon"]');
        if (on) { on.onclick = () => D.launch('cloud'); if (tv) D.nav.focus(on); }
        paintFoot();
      }
      if (isTrash(cur) || !trashN) local.trash && local.trash().then((t) => { if (alive && t.length !== trashN) { trashN = t.length; paintPlaces(); } }).catch(() => {});
    }
    function crumbList() {
      if (isTrash(cur)) return [['Trash', 'trash:']];
      if (isFind(cur)) return [['Search: ' + cur.slice(5), cur]];
      if (isCloud(cur)) { const s = cur.slice(6).split('/').filter(Boolean); return [['Dice Cloud', 'cloud:/']].concat(s.map((x, i) => [x, 'cloud:/' + s.slice(0, i + 1).join('/')])); }
      const s = cur === '~' ? ['~'] : cur.split('/').filter(Boolean);
      let acc = '';
      return s.map((x, i) => { acc = i === 0 ? (x === '~' ? '~' : '/' + x) : acc + '/' + x; return [x === '~' ? 'Home' : x, acc]; });
    }
    function paintCrumbs() {
      const cs = crumbList();
      crumbs.innerHTML = cs.map(([n, p], i) => '<button class="fx-crumb" data-nav data-key="fx:c:' + esc(p) + '" data-path="' + esc(p) + '"' + (i < cs.length - 1 ? ' data-drop="' + esc(p) + '"' : '') + '>' + esc(n) + '</button>').join('<span class="fx-sep">›</span>');
      crumbs.querySelectorAll('.fx-crumb').forEach((b) => { b.onclick = () => go(b.dataset.path); if (b.dataset.drop) dropTarget(b, b.dataset.drop); });
      crumbs.scrollLeft = crumbs.scrollWidth; // the folder you're in shows, even when the path is long
      const name = cs[cs.length - 1][0];
      ctx.setTitle(name + ' – Files');
      $('[data-key="fx:back"]').disabled = !back.length;
      $('[data-key="fx:fwd"]').disabled = !fwd.length;
    }

    // ---- the files themselves ------------------------------------------------------------------
    function shown() {
      const f = filter.toLowerCase();
      const out = items.filter((x) => !f || x.name.toLowerCase().includes(f));
      const by = isTrash(cur) && pref.sort === 'name' ? 'date' : pref.sort;
      const cmp = { name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }), date: (a, b) => (b.mtime || 0) - (a.mtime || 0), size: (a, b) => (b.size || 0) - (a.size || 0), kind: (a, b) => kindOf(a.name, a.dir).name.localeCompare(kindOf(b.name, b.dir).name) || a.name.localeCompare(b.name) }[by];
      return out.sort((a, b) => (b.dir - a.dir) || cmp(a, b));
    }
    const view = () => (tv ? 'grid' : pref.view);
    function icon(x, big) {
      const k = kindOf(x.name, x.dir);
      return '<span class="fx-ic k-' + k.k + (big ? ' big' : '') + '" style="--fc:' + k.c + '">' + (x.dir ? '' : '<i>' + esc(ext(x.name) || '•') + '</i>') + '</span>';
    }
    function paint() {
      paintPlaces(); paintCrumbs();
      const keep = D.nav.el && list.contains(D.nav.el) && D.nav.el.dataset.path;
      list.className = 'fx-items fx-' + view() + (isTrash(cur) ? ' fx-trashv' : '');
      root.querySelectorAll('.fx-views .fx-tb').forEach((b) => b.classList.toggle('on', b.dataset.key === 'fx:' + view()));
      $('.fx-sort').value = pref.sort;
      $('[data-key="fx:empty"]').hidden = !isTrash(cur) || !items.length;
      $('[data-key="fx:new"]').hidden = isTrash(cur) || isFind(cur);
      $('[data-key="fx:add"]').hidden = isTrash(cur) || isFind(cur);
      const xs = shown();
      if (!xs.length) {
        list.innerHTML = '<div class="fx-empty"><span class="fx-ic k-dir big" style="--fc:#7cc4ff"></span><p>' + (filter ? 'Nothing here is called “' + esc(filter) + '”. Press Enter to look everywhere.' : isTrash(cur) ? 'The Trash is empty.' : isFind(cur) ? 'Nothing found by that name.' : isCloud(cur) ? 'Nothing here yet. Drop files here, or use Add files: they\'re locked on this computer, then kept in Dice Cloud for all your computers and your TV.' : 'This folder is empty. Drop files here, or use Add files.') + '</p></div>';
      } else {
        list.innerHTML = (view() === 'list' ? '<div class="fx-head" aria-hidden="true"><span></span><span>Name</span><span>' + (isTrash(cur) ? 'From' : isFind(cur) ? 'Where' : 'Kind') + '</span><span>Size</span><span>' + (isTrash(cur) ? 'Trashed' : 'Changed') + '</span></div>' : '') +
          xs.map((x, i) => {
            const k = kindOf(x.name, x.dir);
            const sub = isTrash(cur) ? (x.from ? 'From ' + x.from.replace(/\/[^/]*$/, '').replace(/^~$/, 'Home') : 'In the Trash') : isFind(cur) ? x.where.replace(/^~$/, 'Home') : x.dir ? (x.count != null ? x.count + (x.count === 1 ? ' thing' : ' things') : 'Folder') : size(x.size);
            return '<button class="fx-it' + (sel.has(x.path) ? ' sel' : '') + (clip && clip.cut && clip.paths.includes(x.path) ? ' cut' : '') + '" role="option" aria-selected="' + sel.has(x.path) + '" data-nav data-key="fx:i:' + esc(x.path) + '" data-path="' + esc(x.path) + '"' + (i ? '' : ' data-first') +
              (x.dir && !isTrash(cur) ? ' data-drop="' + esc(x.path) + '"' : '') + ' draggable="' + (!tv && !isTrash(cur)) + '" data-a="Open" data-x="More" title="' + esc(x.name) + '">' + icon(x) +
              '<b class="fx-nm">' + esc(x.name) + '</b>' +
              (view() === 'list' ? '<span class="fx-k">' + esc(isTrash(cur) ? (x.from || '').replace(/\/[^/]*$/, '') : isFind(cur) ? x.where : k.name) + '</span><span class="fx-s">' + (x.dir ? (x.count != null ? x.count + ' things' : '–') : size(x.size)) + '</span><span class="fx-d">' + when(x.mtime) + '</span>'
                : '<small class="fx-sub">' + esc(sub) + '</small>') + '</button>';
          }).join('');
      }
      const byPath = new Map(xs.map((x) => [x.path, x]));
      list.querySelectorAll('.fx-it').forEach((el) => {
        const x = byPath.get(el.dataset.path);
        el._x = () => more(x);
        if (x.dir && !isTrash(cur)) dropTarget(el, x.path);
        if (!x.dir && kindOf(x.name).k === 'photo') watchThumb(el, x);
      });
      const again = keep && list.querySelector('[data-path="' + CSS.escape(keep) + '"]');
      if (again) D.nav.focus(again, { scroll: false });
      else if (tv && !list.contains(D.nav.el)) { const f = list.querySelector('.fx-it'); if (f) D.nav.focus(f); }
      if (pending) { const p = pending; pending = null; const el = list.querySelector('[data-path="' + CSS.escape(p.path) + '"]'); if (el) { select([p.path]); D.nav.focus(el); if (p.rename) rename(byPath.get(p.path)); if (p.open) open(byPath.get(p.path)); } }
      paintFoot(); paintInfo(); paintRoom();
    }
    function paintFoot() {
      const xs = items.filter((x) => sel.has(x.path));
      const n = items.length;
      count.textContent = xs.length ? xs.length + ' of ' + n + ' picked' + (xs.some((x) => !x.dir) ? ', ' + size(xs.reduce((s, x) => s + (x.dir ? 0 : x.size || 0), 0)) : '')
        : n + (n === 1 ? ' thing' : ' things') + (clip ? ' · ' + clip.paths.length + (clip.cut ? ' to move' : ' to copy') + ': Ctrl + V puts ' + (clip.paths.length === 1 ? 'it' : 'them') + ' here' : '');
    }

    // small pictures, made when they scroll into view
    const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); e.target._load && e.target._load(); } }), { root: list, rootMargin: '200px' }) : null;
    let thumbBusy = 0;
    const thumbQ = [];
    function watchThumb(el, x) {
      const put = (u) => { const ic = el.querySelector('.fx-ic'); if (u && ic) { ic.classList.add('pic'); ic.style.backgroundImage = 'url("' + u + '")'; } };
      const key = x.path + '@' + x.mtime + ':' + x.size;
      if (thumbs.has(key)) return Promise.resolve(thumbs.get(key)).then(put);
      el._load = () => {
        if (isCloud(x.path)) { const it = D.drive.at(x.path.slice(6)); if (it && it.thumb) { const p = D.drive.thumbUrl(it.id); thumbs.set(key, p); p.then(put); } return; }
        if ((x.size || 0) > 25 * 1048576) return;
        thumbQ.push(() => thumbOf(x).then((u) => { thumbs.set(key, u); put(u); }).catch(() => {}).finally(() => { thumbBusy--; nextThumb(); }));
        nextThumb();
      };
      if (io) io.observe(el); else el._load();
    }
    function nextThumb() { while (thumbBusy < 3 && thumbQ.length) { thumbBusy++; thumbQ.shift()(); } }
    async function thumbOf(x) {
      const blob = await srcOf(x.path).read(x.path);
      if (/svg/.test(blob.type) || typeof createImageBitmap !== 'function') { const u = URL.createObjectURL(blob); mine.add(u); return u; }
      const bmp = await createImageBitmap(blob);
      const s = Math.min(1, 320 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      const u = URL.createObjectURL(await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8)));
      mine.add(u);
      return u;
    }

    // ---- picking ---------------------------------------------------------------------------------
    function select(paths, add) {
      if (!add) sel.clear();
      paths.forEach((p) => sel.add(p));
      list.querySelectorAll('.fx-it').forEach((el) => { const on = sel.has(el.dataset.path); el.classList.toggle('sel', on); el.setAttribute('aria-selected', on); });
      paintFoot(); paintInfo();
    }
    const picked = () => shown().filter((x) => sel.has(x.path));
    let mouseDown = false;
    list.addEventListener('pointerdown', () => { mouseDown = true; });
    list.addEventListener('click', (e) => {
      mouseDown = false;
      const el = e.target.closest('.fx-it');
      if (!el) { if (!e.ctrlKey && !e.metaKey) select([]); return; }
      const p = el.dataset.path, xs = shown().map((x) => x.path);
      if (tv) return open(shown().find((x) => x.path === p));
      if (e.shiftKey && anchor) { const a = xs.indexOf(anchor), b = xs.indexOf(p); select(xs.slice(Math.min(a, b), Math.max(a, b) + 1), e.ctrlKey || e.metaKey); return; }
      if (e.ctrlKey || e.metaKey) { if (sel.has(p)) { sel.delete(p); select([], true); } else select([p], true); anchor = p; return; }
      select([p]); anchor = p;
    });
    list.addEventListener('dblclick', (e) => { const el = e.target.closest('.fx-it'); if (el && !tv) open(shown().find((x) => x.path === el.dataset.path)); });
    list.addEventListener('focusin', (e) => { const el = e.target.closest('.fx-it'); if (el && !mouseDown && !sel.has(el.dataset.path)) { select([el.dataset.path]); anchor = el.dataset.path; } });
    list.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const el = e.target.closest('.fx-it');
      if (el && !sel.has(el.dataset.path)) { select([el.dataset.path]); anchor = el.dataset.path; }
      if (!el) select([]);
      menu(e.clientX, e.clientY, el ? actions(picked()) : actions([]));
    });

    // ---- opening ---------------------------------------------------------------------------------
    function open(x) {
      if (!x) return;
      if (isTrash(cur)) return more(x);
      if (x.dir) return go(x.path);
      const k = kindOf(x.name).k;
      if (k === 'photo' && isCloud(x.path) && D.app('photos') && tv) { const it = D.drive.at(x.path.slice(6)); if (it) return D.launch('photos', { arg: 'cloud:' + it.id }); }
      if (['photo', 'video', 'doc'].includes(k) && !/\.(docx?|odt|rtf|pages|xlsx?|ods|numbers|pptx?|odp|key)$/i.test(x.name) && (k !== 'doc' || /\.(pdf|txt|md|csv|log)$/i.test(x.name))) return look(x);
      if (k === 'code' || (k === 'doc' && !isCloud(x.path) && /\.(txt|md|csv|log|conf|cfg|ini|yaml|yml|xml)$/i.test(x.name))) { if (!isCloud(x.path) && D.app('code')) return D.launch('code', { arg: x.path }); return look(x); }
      if (k === 'song') return play(x);
      return getIt(x).then((b) => { if (b) save(x.name, b); });
    }
    function getIt(x) {
      const slow = isCloud(x.path) && x.size > 3000000;
      if (slow) D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Getting ' + x.name, text: size(x.size) + ' from Dice Cloud…' });
      return srcOf(x.path).read(x.path).catch((e) => { oops(e); return null; });
    }
    async function play(x) {
      const b = await getIt(x);
      if (!b) return;
      if (!D.M) return look(x, b);
      const f = new File([b], x.name, { type: b.type || 'audio/mpeg' });
      await D.M.add([f]);
      const i = D.M.songs.findIndex((s) => s.name === x.name.replace(/\.[^.]+$/, ''));
      D.M.play('song', i >= 0 ? i : D.M.songs.length - 1);
      D.toast({ icon: 'music', c: '#d39cf5', title: 'Playing', text: x.name });
    }
    function save(name, blob) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    }

    // quick look: a big view of one file; left and right go to the next one that can be shown
    const lookable = (x) => !x.dir && (['photo', 'video', 'song'].includes(kindOf(x.name).k) || /\.(pdf|txt|md|csv|log|json|js|py|sh|html|css|conf|ini|yaml|yml|xml)$/i.test(x.name));
    async function look(x, have) {
      closeLook();
      const k = kindOf(x.name).k;
      const box = h('<div class="fx-look" role="dialog" aria-label="' + esc(x.name) + '"><header>' + icon(x) + '<div><b>' + esc(x.name) + '</b><span>' + esc(kindOf(x.name).name) + ', ' + size(x.size || 0) + '</span></div>' +
        '<button class="b small" data-nav data-key="fx:lk:more">More</button><button class="b small" data-nav data-key="fx:lk:close">Close</button></header><div class="fx-lk"><p class="fx-wait">Opening…</p></div>' +
        '<button class="fx-lk-nav prev" data-key="fx:lk:prev" aria-label="Previous">‹</button><button class="fx-lk-nav next" data-key="fx:lk:next" aria-label="Next">›</button></div>');
      box._x = x;
      root.appendChild(box);
      box.querySelector('[data-key="fx:lk:close"]').onclick = closeLook;
      box.querySelector('[data-key="fx:lk:more"]').onclick = () => more(x);
      box.querySelector('.prev').onclick = () => step(-1);
      box.querySelector('.next').onclick = () => step(1);
      D.nav.focus(box.querySelector('[data-key="fx:lk:close"]'));
      const blob = have || (await getIt(x));
      if (!blob || !box.isConnected) return;
      const url = URL.createObjectURL(blob), pane = box.querySelector('.fx-lk');
      box._url = url;
      if (k === 'photo') pane.innerHTML = '<img alt="" src="' + url + '">';
      else if (k === 'video') pane.innerHTML = '<video controls autoplay src="' + url + '"></video>';
      else if (k === 'song') pane.innerHTML = '<div class="fx-lk-song">' + icon(x, true) + '<audio controls autoplay src="' + url + '"></audio></div>';
      else if (/\.pdf$/i.test(x.name)) pane.innerHTML = '<iframe title="' + esc(x.name) + '" src="' + url + '"></iframe>';
      else { const t = await blob.text(); pane.innerHTML = '<pre></pre>'; pane.querySelector('pre').textContent = t.slice(0, 300000) + (t.length > 300000 ? '\n…' : ''); }
    }
    function step(d) {
      const box = $('.fx-look');
      if (!box) return;
      const xs = shown().filter(lookable), i = xs.findIndex((y) => y.path === box._x.path);
      const n = xs[(i + d + xs.length) % xs.length];
      if (n && n !== box._x) { select([n.path]); look(n); }
    }
    function closeLook() {
      const box = $('.fx-look');
      if (!box) return false;
      if (box._url) URL.revokeObjectURL(box._url);
      const p = box._x.path;
      box.remove();
      const el = list.querySelector('[data-path="' + CSS.escape(p) + '"]');
      if (el) D.nav.focus(el, { scroll: false });
      return true;
    }

    // ---- the details panel -------------------------------------------------------------------
    function paintInfo() {
      const xs = picked();
      const on = !tv && pref.info && root.clientWidth > 860;
      info.hidden = !on;
      $('[data-key="fx:infob"]').classList.toggle('on', !!pref.info);
      if (!on) return;
      if (!xs.length) {
        const here = crumbList().slice(-1)[0][0];
        info.innerHTML = '<div class="fx-in-pic">' + icon({ name: here, dir: true }, true) + '</div><b class="fx-in-name">' + esc(here) + '</b><dl><dt>Things</dt><dd>' + items.length + '</dd>' +
          (isCloud(cur) ? '<dt>Kept</dt><dd>In Dice Cloud, locked</dd>' : isTrash(cur) ? '<dt>Room</dt><dd>' + size(items.reduce((s, x) => s + (x.size || 0), 0)) + '</dd>' : '') + '</dl>';
        return;
      }
      if (xs.length > 1) {
        info.innerHTML = '<div class="fx-in-pic fx-in-many">' + xs.slice(0, 3).map((x) => icon(x, true)).join('') + '</div><b class="fx-in-name">' + xs.length + ' things</b><dl><dt>Size</dt><dd>' + size(xs.reduce((s, x) => s + (x.dir ? 0 : x.size || 0), 0)) + '</dd></dl>' + actButtons(xs);
        return wireActs(xs);
      }
      const x = xs[0], k = kindOf(x.name, x.dir);
      const cl = isCloud(x.path) && D.drive.at(x.path.slice(6));
      info.innerHTML = '<div class="fx-in-pic">' + icon(x, true) + '</div><b class="fx-in-name">' + esc(x.name) + '</b><dl>' +
        '<dt>Kind</dt><dd>' + esc(k.name) + '</dd>' + (x.dir ? (x.count != null ? '<dt>Holds</dt><dd>' + x.count + ' things</dd>' : '') : '<dt>Size</dt><dd>' + size(x.size || 0) + '</dd>') +
        (x.mtime ? '<dt>' + (isTrash(cur) ? 'Trashed' : 'Changed') + '</dt><dd>' + esc(new Date(x.mtime * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })) + '</dd>' : '') +
        (x.from ? '<dt>From</dt><dd>' + esc(x.from) + '</dd>' : '') + (isFind(cur) ? '<dt>Where</dt><dd>' + esc(x.where) + '</dd>' : '') +
        (cl ? '<dt>Kept</dt><dd>Locked in Dice Cloud' + (cl.by ? ', added from ' + esc(cl.by) : '') + '</dd>' + (D.drive.sharedNow(cl) ? '<dt>Link</dt><dd>Shared until ' + esc(new Date(cl.shared).toLocaleDateString([], { month: 'short', day: 'numeric' })) + '</dd>' : '') : '') +
        '</dl>' + actButtons(xs);
      const pic = info.querySelector('.fx-in-pic .fx-ic');
      const tk = [...thumbs.keys()].find((key) => key.startsWith(x.path + '@'));
      if (tk) Promise.resolve(thumbs.get(tk)).then((u) => { if (u && pic) { pic.classList.add('pic'); pic.style.backgroundImage = 'url("' + u + '")'; } });
      else if (cl && cl.thumb) D.drive.thumbUrl(cl.id).then((u) => { if (u && pic) { pic.classList.add('pic'); pic.style.backgroundImage = 'url("' + u + '")'; } });
      wireActs(xs);
    }
    const actButtons = (xs) => '<div class="fx-in-acts">' + actions(xs).filter((a) => a.main).map((a) => '<button class="b small' + (a.danger ? ' danger' : '') + '" data-act="' + a.id + '">' + esc(a.label) + '</button>').join('') + '</div>';
    function wireActs(xs) { const as = actions(xs); info.querySelectorAll('[data-act]').forEach((b) => { const a = as.find((y) => y.id === b.dataset.act); b.onclick = () => a.run(); }); }

    // ---- what can be done ------------------------------------------------------------------------
    function actions(xs) {
      const A = [], one = xs.length === 1 ? xs[0] : null, files = xs.filter((x) => !x.dir);
      const add = (id, label, run, o) => A.push(Object.assign({ id, label, run }, o));
      if (isTrash(cur)) {
        if (xs.length) { add('restore', 'Put back', () => restore(xs), { main: true }); add('forget', 'Delete forever', () => forget(xs), { danger: true, main: true }); }
        else if (items.length) add('empty', 'Empty Trash', () => forget(null), { danger: true });
        return A;
      }
      if (!xs.length) {
        if (!isFind(cur)) { add('new', 'New folder', newFolder); add('add', 'Add files', () => $('input[type=file]').click()); }
        if (clip && !isFind(cur)) add('paste', 'Paste ' + clip.paths.length + (clip.paths.length === 1 ? ' thing' : ' things'), paste);
        if (items.length) add('all', 'Pick everything', () => select(shown().map((x) => x.path)));
        add('view', view() === 'grid' ? 'Show as a list' : 'Show as icons', () => setView(view() === 'grid' ? 'list' : 'grid'));
        return A;
      }
      if (one) add('open', one.dir ? 'Open' : 'Open', () => open(one), { main: true });
      if (one && lookable(one) && !one.dir) add('look', 'Quick look', () => look(one));
      if (isFind(cur) && one) add('show', 'Show in its folder', () => { pending = { path: one.path }; go(one.where); }, { main: true });
      if (one && !isFind(cur)) add('rename', 'Rename', () => rename(one), { main: true });
      if (!isFind(cur)) { add('copy', 'Copy', () => toClip(xs, false)); add('cut', 'Cut', () => toClip(xs, true)); }
      if (one && !one.dir && !isCloud(cur) && !isFind(cur)) add('dup', 'Make a copy', () => transfer([one.path], cur, true));
      if (files.length && !isCloud(files[0].path) && D.drive && D.drive.on()) add('cloud', 'Put in Dice Cloud', () => toCloud(files), { main: true });
      if (one && !one.dir && isCloud(one.path)) {
        add('share', 'Share a link', () => share(one), { main: true }); add('here', local.real ? 'Save to this computer' : 'Save to Downloads', () => toHere([one]));
        const it = D.drive.at(one.path.slice(6));
        if (it) {
          add('star', it.star ? 'Unstar' : 'Star', () => { D.drive.star(it.id, !it.star); load(); });
          if ((it.versions || []).length) add('vers', 'Older versions (' + it.versions.length + ')', () => versions(it));
        }
      }
      if (files.length === 1 && !isCloud(files[0].path)) add('download', 'Download', () => getIt(files[0]).then((b) => b && save(files[0].name, b)));
      if (!isFind(cur)) add('trash', isCloud(cur) ? 'Take out of Dice Cloud' : 'Move to Trash', () => trash(xs), { danger: true, main: true });
      return A;
    }
    function more(x) {
      if (x && !sel.has(x.path)) select([x.path]);
      const xs = x ? picked() : [];
      const as = actions(xs);
      if (!tv) { const el = x && list.querySelector('[data-path="' + CSS.escape(x.path) + '"]'), r = (el || list).getBoundingClientRect(); return menu(r.left + Math.min(r.width / 2, 60), r.top + Math.min(r.height, 60), as); }
      D.ask({ title: x ? (xs.length > 1 ? xs.length + ' things' : x.name) : 'This folder', text: x && xs.length === 1 ? kindOf(x.name, x.dir).name + (x.dir ? '' : ', ' + size(x.size || 0)) + (x.from ? '. From ' + x.from : '') : '',
        buttons: as.slice(0, 7).map((a, i) => ({ label: a.label, value: a.id, go: i === 0, danger: a.danger })).concat([{ label: 'Cancel', value: null }]) })
        .then((v) => { const a = as.find((y) => y.id === v); if (a) a.run(); });
    }
    // a menu where the mouse is
    function menu(x, y, as) {
      closeMenu();
      if (!as.length) return;
      const m = h('<div class="fx-menu glass" role="menu">' + as.map((a, i) => (a.danger && i && !as[i - 1].danger ? '<hr>' : '') + '<button role="menuitem" data-nav data-key="fx:m:' + a.id + '" class="' + (a.danger ? 'danger' : '') + '">' + esc(a.label) + '</button>').join('') + '</div>');
      root.appendChild(m);
      const r = root.getBoundingClientRect();
      m.style.left = Math.min(x - r.left, r.width - m.offsetWidth - 8) + 'px';
      m.style.top = Math.min(y - r.top, r.height - m.offsetHeight - 8) + 'px';
      m.querySelectorAll('button').forEach((b) => { b.onclick = () => { closeMenu(); as.find((a) => 'fx:m:' + a.id === b.dataset.key).run(); }; });
      D.nav.focus(m.querySelector('button'), { scroll: false });
      setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    }
    const outside = (e) => { if (!e.target.closest('.fx-menu')) closeMenu(); };
    function closeMenu() { const m = $('.fx-menu'); document.removeEventListener('pointerdown', outside, true); if (m) { m.remove(); return true; } return false; }

    // ---- doing it ----------------------------------------------------------------------------
    const oops = (e) => D.toast({ icon: 'help', c: '#ff4d5e', title: 'That didn\'t work', text: e.message || String(e) });
    const joinTo = (dir, name) => (dir.endsWith('/') ? dir : dir + '/') + name;
    function newFolder() {
      let n = 'New folder', i = 2;
      while (items.some((x) => x.name === n)) n = 'New folder ' + i++;
      srcOf(cur).op({ op: 'mkdir', path: joinTo(cur, n) }).then(() => { pending = { path: joinTo(cur, n), rename: true }; load(); }, oops);
    }
    function rename(x) {
      if (tv) return D.ask({ title: 'Rename “' + x.name + '”', input: { value: x.name, label: 'New name' }, buttons: [{ label: 'Rename', value: true, go: true }, { label: 'Cancel', value: false }] })
        .then((r) => { if (r && r.value && r.value.trim() !== x.name) doRename(x, r.value.trim()); });
      const el = list.querySelector('[data-path="' + CSS.escape(x.path) + '"]');
      if (!el) return;
      const nm = el.querySelector('.fx-nm'), inp = h('<input class="fx-ren" spellcheck="false">');
      inp.value = x.name;
      nm.replaceWith(inp);
      inp.focus();
      inp.setSelectionRange(0, x.dir ? x.name.length : x.name.replace(/\.[^.]+$/, '').length || x.name.length);
      let done = false;
      const finish = (ok) => { if (done) return; done = true; const v = inp.value.trim(); inp.replaceWith(nm); if (ok && v && v !== x.name) doRename(x, v); else D.nav.focus(el, { scroll: false }); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } });
      inp.addEventListener('blur', () => finish(true));
      ['click', 'dblclick', 'pointerdown'].forEach((t) => inp.addEventListener(t, (e) => e.stopPropagation()));
    }
    function doRename(x, to) { srcOf(x.path).op({ op: 'rename', path: x.path, to }).then(() => { pending = { path: joinTo(x.path.replace(/\/[^/]*$/, '') || '/', to) }; load(); }, oops); }
    async function trash(xs) {
      if (isCloud(cur)) {
        const ok = await D.ask({ title: 'Take ' + (xs.length === 1 ? xs[0].name : xs.length + ' things') + ' out of Dice Cloud?', text: 'Gone from Dice Cloud on all your computers, into the Trash for ' + D.drive.KEEP_DAYS + ' days in case you want it back.', buttons: [{ label: 'Take out', value: true, danger: true }, { label: 'Cancel', value: false, go: true }] });
        if (!ok) return;
      }
      let n = 0;
      for (const x of xs) { try { await srcOf(x.path).op({ op: 'trash', path: x.path }); n++; } catch (e) { oops(e); } }
      if (n) D.toast({ icon: 'trash', c: '#96969f', title: isCloud(cur) ? 'Out of Dice Cloud' : 'In the Trash', text: (n === 1 ? xs[0].name : n + ' things') + (isCloud(cur) ? ' gone from all your computers.' : '. Open the Trash to put ' + (n === 1 ? 'it' : 'them') + ' back.') });
      trashN += isCloud(cur) ? 0 : n;
      load();
    }
    async function versions(it) {
      const vs = D.drive.versions(it.id), when = (v) => new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const i = await D.ask({ title: 'Older versions of ' + it.name, text: 'Each time it changes, the one before is kept for ' + D.drive.KEEP_DAYS + ' days. Going back keeps the one now as an older version.', buttons: vs.slice(0, 6).map((v, j) => ({ label: 'Go back to ' + when(v) + ', ' + size(v.size), value: 'v' + j, go: j === 0 })).concat([{ label: 'Cancel', value: null }]) });
      if (!i) return;
      try { await D.drive.restoreVersion(it.id, +i.slice(1)); D.toast({ icon: 'cloud', c: '#3a9be8', title: 'Gone back', text: it.name + ' is the version from ' + when(vs[+i.slice(1)]) + ' again.' }); load(); } catch (e) { oops(e); }
    }
    async function restore(xs) {
      let last = null;
      for (const x of xs) { try { if (x.cloudId) { const w = D.drive.restore(x.cloudId); last = w && 'Dice Cloud' + w; continue; } const r = await local.restore(x.name); last = r && r.path; } catch (e) { oops(e); } }
      trashN = Math.max(0, trashN - xs.length);
      if (last) D.toast({ icon: 'library', c: '#4fc16b', title: 'Put back', text: (xs.length === 1 ? xs[0].name + ' is back in ' : xs.length + ' things are back, the last in ') + (last.replace(/\/[^/]*$/, '').replace(/^~$/, 'Home') || 'Home') + '.' });
      load();
    }
    async function forget(xs) {
      const ok = await D.ask({ title: xs ? 'Delete ' + (xs.length === 1 ? xs[0].name : xs.length + ' things') + ' forever?' : 'Empty the Trash?', text: 'This can\'t be undone.', buttons: [{ label: 'Delete forever', value: true, danger: true }, { label: 'Cancel', value: false, go: true }] });
      if (!ok) return;
      try {
        if (xs) { for (const x of xs) { if (x.cloudId) await D.drive.purge(x.cloudId); else await local.forget(x.name); } }
        else { await local.forget(null); if (D.drive && D.drive.on()) await D.drive.emptyDeleted(); }
      } catch (e) { oops(e); }
      trashN = 0;
      load();
    }
    function toClip(xs, cut) {
      clip = { paths: xs.map((x) => x.path), names: xs.map((x) => x.name), cut };
      list.querySelectorAll('.fx-it').forEach((el) => el.classList.toggle('cut', cut && clip.paths.includes(el.dataset.path)));
      paintFoot();
      D.toast({ icon: 'copy', c: '#7cc4ff', title: cut ? 'Ready to move' : 'Copied', text: (xs.length === 1 ? xs[0].name : xs.length + ' things') + '. Go where ' + (xs.length === 1 ? 'it goes' : 'they go') + ' and paste (Ctrl + V).' });
    }
    function paste() {
      if (!clip || isTrash(cur) || isFind(cur)) return;
      const c = clip;
      if (c.cut) clip = null;
      transfer(c.paths, cur, !c.cut);
    }
    // into a folder: the same disk moves (or copies); between here and Dice Cloud it copies
    async function transfer(paths, dest, copy) {
      let n = 0;
      for (const p of paths) {
        const name = p.split('/').pop(), from = srcOf(p), to = srcOf(dest);
        try {
          if (from === to) {
            if ((p.replace(/\/[^/]*$/, '') || '/') === dest && !copy) continue;
            await from.op({ op: copy ? 'copy' : 'move', path: p, to: dest });
          } else {
            const x = items.find((y) => y.path === p);
            if (x && x.dir) throw new Error('Folders can\'t go between Dice Cloud and here yet. Open ' + name + ' and pick what\'s inside.');
            const blob = await from.read(p);
            await to.upload(joinTo(dest, name), new File([blob], name, { type: blob.type || (D.drive ? D.drive.typeOf(name) : '') }));
            if (!copy) await from.op({ op: 'trash', path: p });
          }
          n++;
        } catch (e) { oops(e); }
      }
      if (n) D.toast({ icon: isCloud(dest) ? 'cloud' : 'library', c: '#4fc16b', title: copy ? 'Copied' : 'Moved', text: (n === 1 ? paths[0].split('/').pop() : n + ' things') + ' to ' + crumbName(dest) + '.' });
      load();
    }
    const crumbName = (p) => (p === '~' ? 'Home' : p === 'cloud:/' ? 'Dice Cloud' : p.split('/').filter(Boolean).pop() || p);
    async function toCloud(xs) {
      const fs = [];
      for (const x of xs) { const b = await srcOf(x.path).read(x.path).catch((e) => { oops(e); return null; }); if (b) fs.push(new File([b], x.name, { type: b.type || D.drive.typeOf(x.name) })); }
      if (fs.length) D.drive.add('/', fs);
    }
    async function toHere(xs) {
      for (const x of xs) {
        try {
          const b = await cloud.read(x.path);
          if (!local.real && !local.upload) { save(x.name, b); continue; }
          await local.op({ op: 'mkdir', path: '~/Downloads' }).catch(() => {});
          await local.upload('~/Downloads/' + x.name, new File([b], x.name, { type: b.type }));
          D.toast({ icon: 'copy', c: '#4fc16b', title: 'Saved here', text: x.name + ' is in Downloads.' });
        } catch (e) { oops(e); }
      }
    }
    async function share(x) {
      const f = D.drive.at(x.path.slice(6));
      if (!f) return;
      const was = D.drive.sharedNow(f);
      const v = await D.ask({ title: 'Share ' + x.name, text: was ? 'There\'s a link to it until ' + new Date(f.shared).toLocaleDateString([], { month: 'short', day: 'numeric' }) + '. Anyone with the link can open it.' : 'Makes a link that opens this one file, for a week. The key is in the link, so only people you give it to can open it.',
        buttons: was ? [{ label: 'Copy the link', value: 'copy', go: true }, { label: 'Send it to a computer', value: 'send' }, { label: 'Stop sharing', value: 'stop', danger: true }, { label: 'Close', value: null }] : [{ label: 'Make a link', value: 'make', go: true }, { label: 'Cancel', value: null }] });
      if (!v) return;
      try {
        if (v === 'stop') { await D.drive.unshare(f.id); return D.toast({ icon: 'link', c: '#96969f', title: 'Not shared any more', text: 'The link to ' + x.name + ' stopped working.' }); }
        const link = v === 'make' ? await D.drive.share(f.id, 7) : D.drive.link(f.id);
        if (v === 'send') return D.launch('cloud', { arg: 'send:' + enc(link) });
        let copied = false;
        try { await navigator.clipboard.writeText(link); copied = true; } catch (e) { /* no clipboard here (a TV): show it instead */ }
        if (copied) D.toast({ icon: 'link', c: '#3a9be8', title: 'Link copied', text: 'Anyone with it can open ' + x.name + ' for a week.' });
        else D.ask({ title: 'The link', text: link, buttons: [{ label: 'Send it to a computer', value: true, go: true }, { label: 'Close', value: false }] }).then((y) => { if (y) D.launch('cloud', { arg: 'send:' + enc(link) }); });
        paintInfo();
      } catch (e) { oops(e); }
    }
    async function addFiles(files, dest) {
      files = [...files];
      dest = dest || cur;
      if (!files.length || isTrash(dest) || isFind(dest)) return;
      if (isCloud(dest)) { await D.drive.add(dest.slice(6) || '/', files); return load(); }
      let n = 0;
      for (const f of files) { try { await local.upload(joinTo(dest, f.name), f); n++; } catch (e) { oops(e); } }
      if (n) D.toast({ icon: 'copy', c: '#4fc16b', title: 'Added', text: (n === 1 ? files[0].name : n + ' files') + ' to ' + crumbName(dest) + '.' });
      load();
    }

    // ---- dragging ----------------------------------------------------------------------------
    const MIME = 'application/x-dice-files';
    list.addEventListener('dragstart', (e) => {
      const el = e.target.closest('.fx-it');
      if (!el) return;
      if (!sel.has(el.dataset.path)) select([el.dataset.path]);
      e.dataTransfer.setData(MIME, JSON.stringify([...sel]));
      e.dataTransfer.effectAllowed = 'copyMove';
      root.classList.add('dragging');
    });
    list.addEventListener('dragend', () => root.classList.remove('dragging'));
    function dropTarget(el, dest) {
      el.addEventListener('dragover', (e) => {
        const ours = e.dataTransfer.types.includes(MIME);
        if (!ours && !e.dataTransfer.types.includes('Files')) return;
        if (isTrash(dest) && !ours) return;
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = isTrash(dest) ? 'move' : e.altKey || e.ctrlKey || (ours && isCloud(dest) !== isCloud(cur)) ? 'copy' : ours ? 'move' : 'copy';
        el.classList.add('drop-on');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop-on'));
      el.addEventListener('drop', (e) => {
        el.classList.remove('drop-on');
        e.preventDefault(); e.stopPropagation();
        const ours = e.dataTransfer.getData(MIME);
        if (ours) {
          const ps = JSON.parse(ours).filter((p) => p !== dest);
          if (isTrash(dest)) return trash(items.filter((x) => ps.includes(x.path)));
          return transfer(ps, dest, e.altKey || e.ctrlKey || isCloud(dest) !== isCloud(ps[0] || ''));
        }
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files, dest);
      });
    }
    list.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files') && !isTrash(cur) && !isFind(cur)) { e.preventDefault(); root.classList.add('drop'); } });
    list.addEventListener('dragleave', (e) => { if (!list.contains(e.relatedTarget)) root.classList.remove('drop'); });
    list.addEventListener('drop', (e) => { root.classList.remove('drop'); if (e.dataTransfer.files.length && !e.dataTransfer.getData(MIME)) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

    // ---- the bar and the keys ----------------------------------------------------------------
    function setView(v) { pref.view = v; D.save(); paint(); }
    $('[data-key="fx:grid"]').onclick = () => setView('grid');
    $('[data-key="fx:list"]').onclick = () => setView('list');
    $('[data-key="fx:infob"]').onclick = () => { pref.info = !pref.info; D.save(); paintInfo(); };
    $('.fx-sort').onchange = (e) => { pref.sort = e.target.value; D.save(); paint(); };
    $('[data-key="fx:back"]').onclick = () => { if (back.length) { fwd.push(cur); go(back.pop(), 'hist'); } };
    $('[data-key="fx:fwd"]').onclick = () => { if (fwd.length) { back.push(cur); go(fwd.pop(), 'hist'); } };
    $('[data-key="fx:new"]').onclick = newFolder;
    $('[data-key="fx:empty"]').onclick = () => forget(null);
    const input = $('input[type=file]');
    $('[data-key="fx:add"]').addEventListener('click', (e) => { if (e.target !== input) { e.preventDefault(); input.click(); } });
    input.onchange = () => { if (input.files.length) addFiles(input.files); input.value = ''; };
    findIn.addEventListener('input', () => { if (isFind(cur)) return; filter = findIn.value.trim(); paint(); });
    findIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && findIn.value.trim()) { e.preventDefault(); e.stopPropagation(); const q = findIn.value.trim(); filter = ''; go('find:' + q); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); findIn.value = ''; filter = ''; if (isFind(cur)) $('[data-key="fx:back"]').click(); else paint(); findIn.blur(); }
    });
    const up = () => {
      if (isFind(cur) || isTrash(cur)) { if (back.length) { fwd = []; go(back.pop(), 'hist'); return true; } go('~'); return true; }
      if (isCloud(cur)) { if (cur === 'cloud:/') return false; go('cloud:' + D.drive.norm(cur.slice(6).split('/').slice(0, -1).join('/'))); return true; }
      if (cur === '~' || cur === '/') return false;
      const p = cur.replace(/\/[^/]+$/, '');
      go(p === '' ? '/' : p);
      return true;
    };
    // the usual keys, when this window is the one in front (and nothing's being typed)
    const front = () => alive && root.isConnected && !D.$('#dialog.open') && (!D.desk.on || ((D.desk.top() || {}).el || { contains: () => false }).contains(root));
    const onKey = (e) => {
      const t = document.activeElement;
      if (!front() || (t && t.closest && t.closest('input, textarea, select, [contenteditable]')) || (t && t !== document.body && !root.contains(t))) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      const xs = picked();
      let did = true;
      if (e.key === 'Delete' && xs.length) isTrash(cur) ? forget(xs) : trash(xs);
      else if (e.key === 'F2' && xs.length === 1 && !isTrash(cur)) rename(xs[0]);
      else if (mod && k === 'a') select(shown().map((x) => x.path));
      else if (mod && k === 'c' && xs.length && !isTrash(cur)) toClip(xs, false);
      else if (mod && k === 'x' && xs.length && !isTrash(cur)) toClip(xs, true);
      else if (mod && k === 'v') paste();
      else if (mod && e.shiftKey && k === 'n') newFolder();
      else if (mod && k === 'f') findIn.focus();
      else if (e.altKey && e.key === 'ArrowLeft') $('[data-key="fx:back"]').click();
      else if (e.altKey && e.key === 'ArrowRight') $('[data-key="fx:fwd"]').click();
      else if (e.altKey && e.key === 'ArrowUp') up();
      else did = false;
      if (did) { e.preventDefault(); e.stopPropagation(); }
    };
    document.addEventListener('keydown', onKey);

    // uploads to Dice Cloud going on: a bar each
    function paintUps() {
      const ups = D.drive ? D.drive.uploads : [];
      upBox.hidden = !ups.length;
      upBox.innerHTML = ups.map((u) => '<div class="fx-upi">' + D.glyph('cloud', 2) + '<span>' + esc(u.name) + '</span><i><b style="width:' + Math.round(u.done * 100) + '%"></b></i></div>').join('');
    }
    let redraw = 0;
    const later = () => { clearTimeout(redraw); redraw = setTimeout(() => { if (alive && !root.querySelector('.fx-ren')) load(); }, 250); };
    const offs = [D.on('disk', () => { if (!local.real && !isCloud(cur)) later(); }), D.on('sysfiles', () => { if (local.real && !isCloud(cur)) later(); }),
      D.on('drive', () => { paintUps(); if (isCloud(cur) || isFind(cur)) later(); }),
      D.on('cloud', () => { if (isCloud(cur)) later(); })];
    new ResizeObserver(() => paintInfo()).observe(root);

    const arg = String(ctx.arg || '');
    if (arg.startsWith('cloud-open:')) { const it = D.drive && D.drive.item(arg.slice(11)); if (it) pending = { path: 'cloud:' + (D.drive.norm(it.dir) === '/' ? '' : D.drive.norm(it.dir)) + '/' + it.name, open: true }; go(it ? 'cloud:' + D.drive.norm(it.dir) : 'cloud:/'); }
    else go(arg || '~');
    back = [];
    ctx.legend(tv ? [['a', 'Open'], ['x', 'More'], ['b', 'Back']] : [['a', 'Open'], ['x', 'More'], ['b', 'Up']]);
    return {
      onAction(a) {
        if (a === 'b' && (closeMenu() || closeLook())) { D.S.play('back'); return true; }
        if ($('.fx-look')) {
          if (a === 'left' || a === 'lb') { step(-1); return true; }
          if (a === 'right' || a === 'rb') { step(1); return true; }
          if (a === 'x') { more($('.fx-look')._x); return true; }
          return false;
        }
        const el = D.nav.el;
        if (a === 'a' && el && el.classList.contains('fx-it') && list.contains(el)) { open(shown().find((x) => x.path === el.dataset.path)); return true; }
        if (a === 'x' && !(el && el.classList.contains('fx-it'))) { more(null); return true; }
        if (a === 'b' && up()) { D.S.play('back'); return true; }
        return false;
      },
      unmount() { alive = false; document.removeEventListener('keydown', onKey); offs.forEach((f) => f && f()); clearTimeout(redraw); closeMenu(); if (io) io.disconnect(); mine.forEach((u) => URL.revokeObjectURL(u)); },
    };
  } });

  function gridGlyph() { return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>'; }
  function listGlyph() { return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="2" y="3" width="12" height="2" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/><rect x="2" y="11" width="12" height="2" rx="1"/></svg>'; }
})();
